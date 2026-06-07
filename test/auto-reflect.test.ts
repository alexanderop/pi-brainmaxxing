import { describe, expect, it } from "vitest";
import { collectTranscriptParts, isCorrection, setupAutoReflect } from "../src/handlers/auto-reflect.ts";

type Handler = (event: unknown, ctx: unknown) => unknown;

interface Recorder {
	handlers: Map<string, Handler[]>;
	execs: Array<{ command: string; args: string[]; options: unknown }>;
	fire(event: string, payload: unknown, ctx: unknown): Promise<void>;
}

function makeMockPi(stdout = "Wrote brain/codebase/x.md. Index rebuilt."): { pi: unknown; rec: Recorder } {
	const handlers = new Map<string, Handler[]>();
	const rec: Recorder = {
		handlers,
		execs: [],
		async fire(event, payload, ctx) {
			for (const h of handlers.get(event) ?? []) await h(payload, ctx);
		},
	};
	const pi = {
		on(event: string, handler: Handler) {
			const list = handlers.get(event) ?? [];
			list.push(handler);
			handlers.set(event, list);
		},
		async exec(command: string, args: string[], options: unknown) {
			rec.execs.push({ command, args, options });
			return { code: 0, stdout, stderr: "", killed: false };
		},
	};
	return { pi, rec };
}

function ctx() {
	const notifications: string[] = [];
	return {
		cwd: "/repo",
		hasUI: true,
		ui: { notify: (message: string) => notifications.push(message) },
		sessionManager: {
			getBranch() {
				return [
					{ type: "message", message: { role: "user", content: "No, use pnpm instead" } },
					{ type: "message", message: { role: "assistant", content: "Got it, I will use pnpm." } },
				];
			},
		},
		_notifications: notifications,
	};
}

async function tick(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("auto-reflect helpers", () => {
	it("detects correction-shaped user messages without matching polite negatives", () => {
		expect(isCorrection("No, use pnpm instead")).toBe(true);
		expect(isCorrection("Actually, change that to the repo root")).toBe(true);
		expect(isCorrection("Please don't do that again")).toBe(true);
		expect(isCorrection("No worries, that is fine")).toBe(false);
	});

	it("collects recent transcript text from session entries", () => {
		const parts = collectTranscriptParts([
			{ type: "message", message: { role: "user", content: "hello" } },
			{ type: "tool", result: "ignored" },
			{ type: "message", message: { role: "assistant", content: [{ type: "text", text: "hi" }] } },
		]);

		expect(parts).toEqual(["[USER]: hello", "[ASSISTANT]: hi"]);
	});
});

describe("setupAutoReflect", () => {
	it("spawns a guarded child Pi review immediately after a correction", async () => {
		const { pi, rec } = makeMockPi();
		let refreshed = 0;
		setupAutoReflect(pi as never, { hasBrain: () => true, onUpdated: () => refreshed++ });

		const context = ctx();
		await rec.fire("message_end", { message: { role: "user", content: "No, use pnpm instead" } }, context);
		await rec.fire("turn_end", { message: { role: "assistant", content: "ok" } }, context);
		await tick();

		expect(rec.execs).toHaveLength(1);
		expect(rec.execs[0]?.command).toBe("env");
		expect(rec.execs[0]?.args.slice(0, 5)).toEqual([
			"PI_BRAIN_AUTO_REFLECT_CHILD=1",
			"pi",
			"-p",
			"--no-session",
			"--no-skills",
		]);
		expect(rec.execs[0]?.args.at(-1)).toContain("Recent Transcript");
		expect(rec.execs[0]?.args.at(-1)).toContain("Memory Candidates");
		expect(refreshed).toBe(1);
		expect(context._notifications).toEqual(["🧠 Brain auto-reviewed and updated"]);
	});

	it("queues explicit memory candidates for a child curator without transcript bloat", async () => {
		const { pi, rec } = makeMockPi();
		let refreshed = 0;
		const controller = setupAutoReflect(pi as never, { hasBrain: () => true, onUpdated: () => refreshed++ });

		const context = ctx();
		controller.enqueue(
			{
				reason: "workflow",
				summary: "Use pnpm run verify before commit.",
				evidence: ["package.json defines verify"],
				suggestedArea: "codebase",
			},
			context as never,
		);
		await tick();

		expect(rec.execs).toHaveLength(1);
		const prompt = rec.execs[0]?.args.at(-1) ?? "";
		expect(prompt).toContain("Candidate 1");
		expect(prompt).toContain("Use pnpm run verify before commit.");
		expect(prompt).toContain("--- Recent Transcript ---\n(empty)");
		expect(refreshed).toBe(1);
	});

	it("does not spawn auto-review before a brain vault exists", async () => {
		const { pi, rec } = makeMockPi();
		setupAutoReflect(pi as never, { hasBrain: () => false });

		const context = ctx();
		await rec.fire("message_end", { message: { role: "user", content: "No, use pnpm instead" } }, context);
		await rec.fire("turn_end", { message: { role: "assistant", content: "ok" } }, context);
		await tick();

		expect(rec.execs).toHaveLength(0);
	});

	it("periodically reviews after enough user turns and tool calls", async () => {
		const { pi, rec } = makeMockPi("Nothing to save.");
		let refreshed = 0;
		setupAutoReflect(pi as never, { hasBrain: () => true, onUpdated: () => refreshed++ });

		const context = ctx();
		for (let i = 0; i < 3; i++) {
			await rec.fire("message_end", { message: { role: "user", content: `work turn ${i}` } }, context);
		}
		for (let i = 0; i < 15; i++) {
			await rec.fire("tool_call", { toolName: "bash" }, context);
		}
		await rec.fire("turn_end", { message: { role: "assistant", content: "done" } }, context);
		await tick();

		expect(rec.execs).toHaveLength(1);
		expect(refreshed).toBe(0);
		expect(context._notifications).toEqual([]);
	});
});
