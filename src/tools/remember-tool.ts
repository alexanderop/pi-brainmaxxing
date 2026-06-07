/**
 * Lightweight memory delegation tool.
 *
 * The main agent uses this as a cheap signal: "this might be worth remembering".
 * A background child Pi run then curates the candidate and writes via the existing
 * secret-scanned `brain` tool only if the learning is durable.
 */

import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { MEMORY_CANDIDATE_AREAS, MEMORY_CANDIDATE_REASONS, type MemoryCandidate } from "../brain/memory-candidates.js";
import type { MemoryReviewController } from "../handlers/auto-reflect.js";

const parameters = Type.Object({
	summary: Type.String({
		description: "Short, non-secret summary of the possible durable memory.",
	}),
	reason: StringEnum(MEMORY_CANDIDATE_REASONS),
	evidence: Type.Optional(
		Type.Array(Type.String(), {
			description: "Minimal supporting snippets. Do not include secrets or long transcripts.",
		}),
	),
	suggestedArea: Type.Optional(StringEnum(MEMORY_CANDIDATE_AREAS)),
});

export function registerRememberTool(pi: ExtensionAPI, controller: MemoryReviewController): void {
	pi.registerTool({
		name: "remember",
		label: "Remember",
		description:
			"Queue a possible durable memory for background brain review. Use this instead of direct brain writes " +
			"when something may be worth remembering but should not distract from the main task.",
		promptSnippet: "Queue possible durable memories for background brain review",
		promptGuidelines: [
			"Use remember when the user corrects you, states a durable preference, reveals a repo convention, or a codebase/tool gotcha was discovered.",
			"Keep summaries and evidence short; never include secrets, tokens, private data, or large raw outputs.",
			"Do not use remember for task progress, temporary TODOs, generic advice, or session summaries.",
			"The background curator decides whether to write to brain; continue the main task after queuing.",
		],
		parameters,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx: ExtensionContext) {
			const candidate: MemoryCandidate = {
				reason: params.reason,
				summary: params.summary.trim(),
			};
			if (params.evidence && params.evidence.length > 0) {
				candidate.evidence = params.evidence.map((item) => item.trim()).filter((item) => item.length > 0);
			}
			if (params.suggestedArea) candidate.suggestedArea = params.suggestedArea;

			controller.enqueue(candidate, ctx);

			return {
				content: [{ type: "text", text: "Queued for background memory review." }],
				details: { candidate },
			};
		},
	});
}
