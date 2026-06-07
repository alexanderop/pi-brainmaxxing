import { describe, expect, it } from "vitest";
import type { MemoryCandidate } from "../src/brain/memory-candidates.ts";
import { registerRememberTool } from "../src/tools/remember-tool.ts";

interface ToolDef {
	name: string;
	execute(
		toolCallId: string,
		params: {
			summary: string;
			reason: MemoryCandidate["reason"];
			evidence?: string[];
			suggestedArea?: MemoryCandidate["suggestedArea"];
		},
		signal: AbortSignal,
		onUpdate: unknown,
		ctx: unknown,
	): Promise<{ content: Array<{ type: string; text: string }>; details: { candidate: MemoryCandidate } }>;
}

describe("remember tool", () => {
	it("queues a memory candidate without writing directly", async () => {
		let tool: ToolDef | undefined;
		const queued: Array<{ candidate: MemoryCandidate; ctx: unknown }> = [];
		const pi = {
			registerTool(def: ToolDef) {
				tool = def;
			},
		};
		const controller = {
			enqueue(candidate: MemoryCandidate, ctx: unknown) {
				queued.push({ candidate, ctx });
			},
		};
		registerRememberTool(pi as never, controller as never);

		const ctx = { cwd: "/repo" };
		const result = await tool?.execute(
			"call-1",
			{
				reason: "codebase-gotcha",
				summary: " Use pnpm verify for this repo. ",
				evidence: [" pnpm run verify passed ", ""],
				suggestedArea: "codebase",
			},
			new AbortController().signal,
			undefined,
			ctx,
		);

		expect(tool?.name).toBe("remember");
		expect(queued).toEqual([
			{
				candidate: {
					reason: "codebase-gotcha",
					summary: "Use pnpm verify for this repo.",
					evidence: ["pnpm run verify passed"],
					suggestedArea: "codebase",
				},
				ctx,
			},
		]);
		expect(result?.content[0]?.text).toBe("Queued for background memory review.");
	});
});
