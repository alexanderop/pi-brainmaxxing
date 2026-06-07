export const MEMORY_CANDIDATE_REASONS = [
	"correction",
	"user-preference",
	"codebase-gotcha",
	"workflow",
	"decision",
	"tool-quirk",
] as const;

export const MEMORY_CANDIDATE_AREAS = ["codebase", "principles", "plans"] as const;

export type MemoryCandidateReason = (typeof MEMORY_CANDIDATE_REASONS)[number];
export type MemoryCandidateArea = (typeof MEMORY_CANDIDATE_AREAS)[number];

export interface MemoryCandidate {
	/** Why the main agent believes this might be worth persisting. */
	reason: MemoryCandidateReason;
	/** Short, non-secret summary of the possible learning. */
	summary: string;
	/** Minimal supporting snippets; never include raw secrets. */
	evidence?: string[];
	/** Optional hint only. The curator child makes the final placement decision. */
	suggestedArea?: MemoryCandidateArea;
}

export function formatMemoryCandidate(candidate: MemoryCandidate, index: number): string {
	const lines = [`Candidate ${index + 1}:`, `- reason: ${candidate.reason}`, `- summary: ${candidate.summary}`];
	if (candidate.suggestedArea) lines.push(`- suggested area: ${candidate.suggestedArea}`);
	if (candidate.evidence && candidate.evidence.length > 0) {
		lines.push("- evidence:");
		for (const item of candidate.evidence) lines.push(`  - ${item}`);
	}
	return lines.join("\n");
}
