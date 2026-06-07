/**
 * Prompt builders for automatic brain maintenance.
 *
 * Pure string builders: no filesystem, process, or Pi API access here. The
 * extension/handler passes in the recent transcript and lets a child Pi run use
 * the existing `brain` tool for secret-scanned writes.
 */

import { formatMemoryCandidate, type MemoryCandidate } from "./memory-candidates.js";

export type AutoReflectReason = "periodic" | "correction" | "flush" | "remember";

export interface AutoReflectPromptInput {
	reason: AutoReflectReason;
	transcriptParts: string[];
	candidates?: MemoryCandidate[];
}

function reasonIntro(reason: AutoReflectReason): string {
	if (reason === "correction") {
		return "The user appears to have corrected the agent. Prioritize saving the corrected preference, convention, or gotcha if it is durable.";
	}
	if (reason === "flush") {
		return "The session is ending or compacting. Do one final pass for durable project knowledge before context is lost.";
	}
	if (reason === "remember") {
		return "The main agent flagged one or more possible memories. Curate them: save only if they are genuinely durable and useful.";
	}
	return "This is a periodic background review. Save only genuinely durable project knowledge.";
}

export function buildAutoReflectPrompt(input: AutoReflectPromptInput): string {
	const candidates = input.candidates ?? [];
	return [
		"You are the automatic maintenance pass for this project's `brain/` vault.",
		"",
		reasonIntro(input.reason),
		"",
		"Use the `brain` tool to write only if the candidates or transcript contain knowledge that will still help future agents working in this repository.",
		"If there is nothing durable to save, respond exactly: Nothing to save.",
		"The main agent is only a memory sensor; you are the curator. Do not trust suggestions blindly.",
		"",
		"Save:",
		"- repo-specific conventions, commands, architecture decisions, and workflows",
		"- codebase gotchas, failed approaches, tool quirks, and what worked instead",
		"- user corrections that affect future work in this repo",
		"- recurring engineering preferences that belong in this project's principles",
		"",
		"Do NOT save:",
		"- task progress, session summaries, TODO state, or 'we finished X' updates",
		"- secrets, tokens, credentials, private personal data, or pasted sensitive output",
		"- generic advice that is not specific to this project/user workflow",
		"- duplicates of existing brain content; read an existing note before updating it",
		"",
		"Where to write:",
		"- `codebase/<lowercase-hyphenated-topic>.md` for repo facts, commands, gotchas, and conventions",
		"- `principles/<lowercase-hyphenated-topic>.md` for durable engineering preferences",
		"- `plans/` only for durable plans explicitly requested by the user, not auto-reflection",
		"",
		"Write style:",
		"- one topic per file",
		"- concise markdown with concrete evidence from the transcript",
		"- include what failed and what to do instead for corrections/gotchas",
		"- never include raw secret-looking values; summarize that a secret existed instead",
		"",
		"--- Memory Candidates ---",
		candidates.length > 0 ? candidates.map(formatMemoryCandidate).join("\n\n") : "(none)",
		"",
		"--- Recent Transcript ---",
		input.transcriptParts.length > 0 ? input.transcriptParts.join("\n\n") : "(empty)",
	].join("\n");
}
