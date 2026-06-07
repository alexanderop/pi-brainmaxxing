/**
 * The `ruminate` tool — self-contained mining of past Pi sessions.
 *
 * The original ruminate skill describes optional subagents, but Pi has no
 * built-in subagent API. This tool provides a Pi-native fallback by spawning
 * bounded child Pi workers over transcript batches and a final child synthesis
 * pass. Child runs are guarded so they do not recursively schedule auto-reflect.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { type ExtensionAPI, type ExtensionContext, truncateHead } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { AUTO_REFLECT_CHILD_ENV, childPiArgs, RUMINATE_CHILD_ENV } from "../brain/child-pi.js";
import { nodeLocateOps, nodeReindexOps } from "../brain/fs-ops.js";
import { locateBrain } from "../brain/locate.js";
import { getMessageText } from "../brain/transcript.js";

const DEFAULT_TIMEOUT_SECONDS = 180;
const DEFAULT_MAX_PARALLEL = 3;
const MAX_BATCHES = 10;

const SHARED_PROMPT_RULES = `- Do not edit the repo or brain.
- Do not include secrets, credentials, private keys, tokens, or long raw transcripts.`;

const parameters = Type.Object({
	batches: Type.Optional(
		Type.Number({ description: "Number of transcript batches to analyze. Defaults to ~1 per 20 sessions, max 10." }),
	),
	max_parallel: Type.Optional(
		Type.Number({ description: "Maximum child Pi workers to run concurrently. Defaults to 3." }),
	),
	from: Type.Optional(Type.String({ description: "Only include sessions modified on/after YYYY-MM-DD." })),
	to: Type.Optional(Type.String({ description: "Only include sessions modified on/before YYYY-MM-DD." })),
	keep_temp: Type.Optional(
		Type.Boolean({ description: "Keep the temporary ruminate output directory for inspection." }),
	),
	timeout_seconds: Type.Optional(Type.Number({ description: "Timeout per child Pi run. Defaults to 180 seconds." })),
});

interface TranscriptExtraction {
	sessionsDir: string;
	outDir: string;
	transcripts: string[];
	batchFiles: string[];
}

function sessionsDirForCwd(cwd: string): string {
	const slug = `-${cwd.replace(/\//g, "-")}-`;
	return path.join(os.homedir(), ".pi", "agent", "sessions", slug);
}

function extractSession(jsonl: string): string {
	const out: string[] = [];
	for (const line of jsonl.split("\n")) {
		if (!line.trim()) continue;
		let entry: unknown;
		try {
			entry = JSON.parse(line);
		} catch {
			continue;
		}
		if (!entry || typeof entry !== "object") continue;
		const typed = entry as { type?: unknown; message?: { role?: unknown } };
		if (typed.type !== "message" || !typed.message) continue;
		const role = typed.message.role;
		if (role !== "user" && role !== "assistant") continue;
		const text = getMessageText(typed.message);
		if (text) out.push(`### ${role}\n${text}`);
	}
	return out.join("\n\n");
}

function withinDate(mtime: number, from?: string, to?: string): boolean {
	if (from && mtime < new Date(`${from}T00:00:00Z`).getTime()) return false;
	if (to && mtime > new Date(`${to}T23:59:59Z`).getTime()) return false;
	return true;
}

function extractSessions(
	cwd: string,
	outDir: string,
	requestedBatches?: number,
	from?: string,
	to?: string,
): TranscriptExtraction {
	const sessionsDir = sessionsDirForCwd(cwd);
	if (!fs.existsSync(sessionsDir)) throw new Error(`No Pi sessions directory for this project: ${sessionsDir}`);

	const files = fs
		.readdirSync(sessionsDir)
		.filter((f) => f.endsWith(".jsonl"))
		.map((f) => path.join(sessionsDir, f))
		.filter((file) => {
			const st = fs.statSync(file);
			return st.size > 0 && withinDate(st.mtimeMs, from, to);
		})
		.sort();

	fs.mkdirSync(path.join(outDir, "batches"), { recursive: true });
	const transcripts: string[] = [];
	files.forEach((file, i) => {
		const text = extractSession(fs.readFileSync(file, "utf8"));
		if (!text.trim()) return;
		const id = path.basename(file).replace(/\.jsonl$/, "");
		const outPath = path.join(outDir, `${String(i).padStart(3, "0")}_${id}.txt`);
		fs.writeFileSync(outPath, text, "utf8");
		transcripts.push(outPath);
	});

	if (transcripts.length === 0)
		throw new Error(`No readable user/assistant session transcripts found in ${sessionsDir}`);

	const n = Math.max(1, Math.min(MAX_BATCHES, Math.floor(requestedBatches || Math.ceil(transcripts.length / 20))));
	const batchFiles: string[] = [];
	for (let b = 0; b < n; b++) {
		const batch = transcripts.filter((_, idx) => idx % n === b);
		const batchPath = path.join(outDir, "batches", `batch_${b}.txt`);
		fs.writeFileSync(batchPath, batch.join("\n"), "utf8");
		batchFiles.push(batchPath);
	}

	return { sessionsDir, outDir, transcripts, batchFiles };
}

function snapshotBrain(brainDir: string, outFile: string): void {
	const files = nodeReindexOps
		.listMarkdown(brainDir)
		.filter((file) => path.basename(file) !== "index.md")
		.sort();

	const chunks: string[] = [];
	for (const file of files) {
		const rel = path.relative(brainDir, file);
		chunks.push(`=== brain/${rel} ===\n${fs.readFileSync(file, "utf8").trimEnd()}\n`);
	}
	fs.writeFileSync(outFile, chunks.join("\n"), "utf8");
}

function workerPrompt(batchFile: string, brainSnapshot: string, outputFile: string): string {
	return `You are a read-only ruminate worker for pi-brainmaxxing.

Goal: mine one batch of past Pi sessions for uncaptured, durable, brain-worthy knowledge.

Inputs:
- Current brain snapshot: ${brainSnapshot}
- Batch manifest: ${batchFile} (newline-delimited transcript paths)

Process:
1. Read the brain snapshot first so you can skip already-captured knowledge.
2. Read the batch manifest, then read every listed transcript.
3. Extract only high-signal findings:
   - user corrections
   - recurring preferences
   - codebase-specific gotchas or patterns
   - workflow friction that would repeat
4. Filter aggressively. Prefer 0-3 strong findings over noisy completeness.

Write your structured findings to exactly this file:
${outputFile}

Output format:
# Ruminate Findings

## Finding: <short name>
- Category: correction | preference | codebase | workflow | friction
- Evidence: quote short user/session snippets; include transcript path(s)
- Frequency: one-off | repeated, with count/paths
- Already covered?: yes/no/partial, with brain note if known
- Proposed action: update existing note | create note | skill change | ignore
- Suggested text: concise durable memory, if action is not ignore

Rules:
${SHARED_PROMPT_RULES}
- If there is nothing worth saving, write: # Ruminate Findings\n\nNothing brain-worthy found.
`;
}

function synthesisPrompt(outDir: string, brainSnapshot: string, outputFile: string): string {
	return `You are synthesizing ruminate worker reports for pi-brainmaxxing.

Inputs:
- Current brain snapshot: ${brainSnapshot}
- Worker findings directory: ${outDir}

Read all files matching ${path.join(outDir, "findings_*.md")}.
Deduplicate across workers and cross-reference with the brain snapshot.
Filter hard: keep only findings that are repeated, correct stale brain content, or would prevent meaningful repeated wasted effort.

Write the final report to exactly this file:
${outputFile}

Output format:
# Ruminate Report

| Finding | Frequency/evidence | Proposed action |
|---|---|---|
| ... | ... | ... |

## Recommended changes
- For each approved-worthy item, name the target brain file or skill file and provide concise proposed text.

## Ignored / low confidence
- Briefly list noisy one-offs you discarded.

Rules:
${SHARED_PROMPT_RULES}
- If there are no strong findings, write that clearly.
`;
}

async function runLimited<T>(items: T[], limit: number, run: (item: T, index: number) => Promise<void>): Promise<void> {
	let next = 0;
	const workerCount = Math.max(1, Math.min(limit, items.length));
	await Promise.all(
		Array.from({ length: workerCount }, async () => {
			while (true) {
				const index = next++;
				const item = items[index];
				if (item === undefined) return;
				await run(item, index);
			}
		}),
	);
}

const CHILD_GUARDS = [AUTO_REFLECT_CHILD_ENV, RUMINATE_CHILD_ENV];

export function registerRuminateTool(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "ruminate",
		label: "Ruminate",
		description:
			"Mine past Pi sessions for uncaptured durable brain-worthy knowledge. Orchestrates session extraction, " +
			"batch analysis via child Pi workers, and a final synthesized report. Does not edit brain files.",
		promptSnippet: "Mine past Pi sessions for uncaptured brain-worthy patterns",
		promptGuidelines: [
			"Use ruminate to mine historical Pi sessions; it returns proposed brain/skill updates for user review.",
			"Do not apply ruminate findings without explicit user approval; prefer updating existing notes over creating new ones.",
		],
		parameters,
		async execute(_toolCallId, params, signal, onUpdate, ctx: ExtensionContext) {
			if (process.env[RUMINATE_CHILD_ENV] === "1") {
				throw new Error("Refusing to run ruminate recursively inside a ruminate child process.");
			}

			const loc = locateBrain(ctx.cwd, nodeLocateOps);
			if (!loc.exists) throw new Error(`No brain vault yet. Run /brain init to create one at ${loc.brainDir}.`);

			const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-ruminate-"));
			const brainSnapshot = path.join(outDir, "brain-snapshot.md");
			const summaryFile = path.join(outDir, "ruminate-report.md");
			const timeoutMs = Math.max(30, Math.floor(params.timeout_seconds || DEFAULT_TIMEOUT_SECONDS)) * 1000;
			const maxParallel = Math.max(1, Math.min(6, Math.floor(params.max_parallel || DEFAULT_MAX_PARALLEL)));
			const status = (text: string) => onUpdate?.({ content: [{ type: "text", text }], details: {} });

			try {
				status("Snapshotting brain and extracting session transcripts...");
				snapshotBrain(loc.brainDir, brainSnapshot);
				const extraction = extractSessions(ctx.cwd, outDir, params.batches, params.from, params.to);

				status(
					`Analyzing ${extraction.transcripts.length} transcript(s) in ${extraction.batchFiles.length} batch(es)...`,
				);
				const failures: string[] = [];
				await runLimited(extraction.batchFiles, maxParallel, async (batchFile, index) => {
					const outputFile = path.join(outDir, `findings_${index}.md`);
					const result = await pi.exec(
						"env",
						childPiArgs(workerPrompt(batchFile, brainSnapshot, outputFile), CHILD_GUARDS),
						{ cwd: ctx.cwd, signal, timeout: timeoutMs },
					);
					if (result.code !== 0)
						failures.push(`batch_${index}: ${result.stderr || result.stdout || "child failed"}`);
					if (!fs.existsSync(outputFile)) {
						fs.writeFileSync(outputFile, `# Ruminate Findings\n\nWorker failed to produce findings.\n`, "utf8");
					}
				});

				status("Synthesizing worker findings...");
				const synth = await pi.exec(
					"env",
					childPiArgs(synthesisPrompt(outDir, brainSnapshot, summaryFile), CHILD_GUARDS),
					{ cwd: ctx.cwd, signal, timeout: timeoutMs },
				);
				if (synth.code !== 0) failures.push(`synthesis: ${synth.stderr || synth.stdout || "child failed"}`);

				const rawSummary = fs.existsSync(summaryFile)
					? fs.readFileSync(summaryFile, "utf8")
					: "# Ruminate Report\n\nSynthesis failed to produce a report.";
				const footer = [
					`\n---\nRuminate artifacts: ${outDir}`,
					`Sessions dir: ${extraction.sessionsDir}`,
					`Transcripts: ${extraction.transcripts.length}`,
					`Batches: ${extraction.batchFiles.length}`,
					failures.length ? `Failures:\n${failures.map((f) => `- ${f.trim()}`).join("\n")}` : "Failures: none",
					params.keep_temp ? "Temporary files kept." : "Temporary files removed after this result.",
				].join("\n");
				const { content } = truncateHead(`${rawSummary.trimEnd()}${footer}`, { maxBytes: 50_000, maxLines: 2000 });

				return {
					content: [{ type: "text", text: content }],
					details: {
						outDir,
						sessionsDir: extraction.sessionsDir,
						transcriptCount: extraction.transcripts.length,
						batchCount: extraction.batchFiles.length,
						failures,
					},
				};
			} finally {
				if (!params.keep_temp) fs.rmSync(outDir, { recursive: true, force: true });
			}
		},
	});
}
