/**
 * Automatic brain maintenance.
 *
 * Steals the useful Hermes idea: periodically (or immediately after a likely
 * correction) spawn a tiny child Pi run to review recent conversation and use
 * the existing `brain` tool for durable, secret-scanned writes. The child is
 * marked with an env guard so it does not recursively schedule its own review.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { type AutoReflectReason, buildAutoReflectPrompt } from "../brain/auto-prompts.js";
import { AUTO_REFLECT_CHILD_ENV, childPiArgs } from "../brain/child-pi.js";
import type { MemoryCandidate } from "../brain/memory-candidates.js";
import { getMessageText } from "../brain/transcript.js";

export { AUTO_REFLECT_CHILD_ENV };

const AUTO_REFLECT_TURN_INTERVAL = 10;
const AUTO_REFLECT_TOOL_CALL_INTERVAL = 15;
const AUTO_REFLECT_MIN_USER_TURNS = 3;
const AUTO_REFLECT_RECENT_MESSAGES = 24;
const CORRECTION_RATE_LIMIT_TURNS = 3;

const CORRECTION_STRONG_PATTERNS: RegExp[] = [
	/don'?t do that/i,
	/not like that/i,
	/^I said\b/i,
	/^I told you\b/i,
	/we already discussed/i,
	/^please don'?t/i,
	/^that'?s not what I/i,
];

const CORRECTION_WEAK_PATTERNS: RegExp[] = [/^no[,.\s!]/i, /^wrong[,.\s!]/i, /^actually[,.\s]/i, /^stop[,.\s!]/i];

const CORRECTION_NEGATIVE_PATTERNS: RegExp[] = [
	/^no worries/i,
	/^no problem/i,
	/^no thanks/i,
	/^no need/i,
	/^actually.{0,10}(looks? great|perfect|good|correct|right)/i,
	/^stop.{0,5}(there|here|for now)/i,
];

const CORRECTION_DIRECTIVE_WORDS = [
	"use",
	"don't",
	"dont",
	"do",
	"try",
	"make",
	"run",
	"install",
	"add",
	"remove",
	"delete",
	"change",
	"fix",
	"put",
	"set",
	"write",
	"go",
	"stop",
	"start",
	"the",
	"that",
	"this",
	"it",
];

export interface AutoReflectOptions {
	/** True only when this cwd has an initialized brain/ vault. */
	hasBrain(cwd: string): boolean;
	/** Refresh parent-process cached index after a child writes. */
	onUpdated?(cwd: string): void;
}

export interface MemoryReviewController {
	/** Queue a lightweight candidate and let a child Pi curator decide whether to persist it. */
	enqueue(candidate: MemoryCandidate, ctx: ExtensionContext): void;
}

function escapeRegexLiteral(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasDirectiveWord(remainder: string): boolean {
	const source = CORRECTION_DIRECTIVE_WORDS.map(escapeRegexLiteral).join("|");
	return new RegExp(`\\b(${source})\\b`, "i").test(remainder);
}

export function isCorrection(text: string): boolean {
	for (const pattern of CORRECTION_NEGATIVE_PATTERNS) {
		if (pattern.test(text)) return false;
	}

	for (const pattern of CORRECTION_STRONG_PATTERNS) {
		if (pattern.test(text)) return true;
	}

	for (const pattern of CORRECTION_WEAK_PATTERNS) {
		const match = pattern.exec(text);
		if (!match || match.index !== 0) continue;
		const remainder = text.slice(match[0].length).trim();
		if (hasDirectiveWord(remainder)) return true;
	}

	return false;
}

export function collectTranscriptParts(entries: unknown[], recentMessages = AUTO_REFLECT_RECENT_MESSAGES): string[] {
	const parts: string[] = [];

	for (const entry of entries) {
		if (typeof entry !== "object" || entry === null) continue;
		if ((entry as { type?: unknown }).type !== "message") continue;
		const message = (entry as { message?: unknown }).message;
		const text = getMessageText(message);
		if (!text) continue;
		const role = (message as { role?: unknown } | null)?.role;
		const prefix = role === "user" ? "[USER]" : "[ASSISTANT]";
		parts.push(`${prefix}: ${text}`);
	}

	return recentMessages > 0 ? parts.slice(-recentMessages) : parts;
}

async function runChildReview(
	pi: Pick<ExtensionAPI, "exec">,
	ctx: ExtensionContext,
	reason: AutoReflectReason,
	timeoutMs: number,
	signal?: AbortSignal,
	candidates: MemoryCandidate[] = [],
): Promise<boolean> {
	let transcriptParts: string[] = [];
	try {
		transcriptParts = reason === "remember" ? [] : collectTranscriptParts(ctx.sessionManager.getBranch());
	} catch {
		if (candidates.length === 0) return false;
	}
	if (transcriptParts.length === 0 && candidates.length === 0) return false;

	const prompt = buildAutoReflectPrompt({ reason, transcriptParts, candidates });
	const result = await pi.exec("env", childPiArgs(prompt, [AUTO_REFLECT_CHILD_ENV]), {
		cwd: ctx.cwd,
		signal,
		timeout: timeoutMs,
	});

	return result.code === 0 && !result.stdout.trim().toLowerCase().includes("nothing to save");
}

export function setupAutoReflect(pi: ExtensionAPI, options: AutoReflectOptions): MemoryReviewController {
	const noopController: MemoryReviewController = { enqueue: () => {} };
	if (process.env[AUTO_REFLECT_CHILD_ENV] === "1") return noopController;

	let userTurnCount = 0;
	let turnsSinceReview = 0;
	let toolCallsSinceReview = 0;
	let turnsSinceCorrectionReview = CORRECTION_RATE_LIMIT_TURNS;
	let pendingCorrection = false;
	let reviewInProgress = false;
	let pendingCandidates: MemoryCandidate[] = [];

	function triggerReview(
		ctx: ExtensionContext,
		reason: AutoReflectReason,
		timeoutMs: number,
		signal?: AbortSignal,
	): Promise<void> {
		if (reviewInProgress) return Promise.resolve();
		if (!options.hasBrain(ctx.cwd)) return Promise.resolve();

		const candidates = pendingCandidates;
		pendingCandidates = [];
		reviewInProgress = true;
		return runChildReview(pi, ctx, reason, timeoutMs, signal, candidates)
			.then((changed) => {
				if (changed) {
					options.onUpdated?.(ctx.cwd);
					if (ctx.hasUI) ctx.ui.notify("🧠 Brain auto-reviewed and updated", "info");
				}
			})
			.catch(() => {
				// Best-effort only. A failed background review must never disturb the user turn.
			})
			.finally(() => {
				reviewInProgress = false;
			});
	}

	pi.on("message_end", async (event, _ctx) => {
		if (event.message.role !== "user") return;
		userTurnCount++;
		const text = getMessageText(event.message);
		if (text && isCorrection(text)) pendingCorrection = true;
	});

	pi.on("tool_call", async (event, _ctx) => {
		if (event.toolName !== "brain") toolCallsSinceReview++;
	});

	pi.on("turn_end", async (_event, ctx) => {
		turnsSinceReview++;

		if (pendingCorrection) {
			pendingCorrection = false;
			if (turnsSinceCorrectionReview >= CORRECTION_RATE_LIMIT_TURNS) {
				turnsSinceCorrectionReview = 0;
				turnsSinceReview = 0;
				toolCallsSinceReview = 0;
				void triggerReview(ctx, "correction", 30_000);
				return;
			}
		} else {
			turnsSinceCorrectionReview++;
		}

		const turnThresholdMet = turnsSinceReview >= AUTO_REFLECT_TURN_INTERVAL;
		const toolThresholdMet = toolCallsSinceReview >= AUTO_REFLECT_TOOL_CALL_INTERVAL;
		if (!turnThresholdMet && !toolThresholdMet) return;
		if (userTurnCount < AUTO_REFLECT_MIN_USER_TURNS) return;

		turnsSinceReview = 0;
		toolCallsSinceReview = 0;
		void triggerReview(ctx, "periodic", 120_000);
	});

	pi.on("session_before_compact", async (event, ctx) => {
		if (userTurnCount < AUTO_REFLECT_MIN_USER_TURNS) return;
		await triggerReview(ctx, "flush", 30_000, event.signal);
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		if (userTurnCount < AUTO_REFLECT_MIN_USER_TURNS) return;
		void triggerReview(ctx, "flush", 10_000);
	});

	return {
		enqueue(candidate, ctx) {
			pendingCandidates.push(candidate);
			void triggerReview(ctx, "remember", 30_000);
		},
	};
}
