import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import brainmaxxing from "../src/extension/index.ts";

/**
 * Minimal ExtensionAPI mock that records registrations and lets the test fire
 * lifecycle events. Exercises the real extension wiring offline.
 */
interface Recorder {
	handlers: Map<string, Array<(event: unknown, ctx: unknown) => unknown>>;
	tools: string[];
	commands: Map<string, (args: string, ctx: unknown) => unknown>;
	sentUserMessages: string[];
	fire(event: string, payload: unknown, ctx: unknown): Promise<unknown[]>;
}

function makeMockPi(): { pi: unknown; rec: Recorder } {
	const handlers = new Map<string, Array<(event: unknown, ctx: unknown) => unknown>>();
	const rec: Recorder = {
		handlers,
		tools: [],
		commands: new Map(),
		sentUserMessages: [],
		async fire(event, payload, ctx) {
			const out: unknown[] = [];
			for (const h of handlers.get(event) ?? []) out.push(await h(payload, ctx));
			return out;
		},
	};
	const pi = {
		on(event: string, handler: (e: unknown, c: unknown) => unknown) {
			const list = handlers.get(event) ?? [];
			list.push(handler);
			handlers.set(event, list);
		},
		registerTool(def: { name: string }) {
			rec.tools.push(def.name);
		},
		registerCommand(name: string, opts: { handler: (args: string, ctx: unknown) => unknown }) {
			rec.commands.set(name, opts.handler);
		},
		sendUserMessage(msg: string) {
			rec.sentUserMessages.push(msg);
		},
	};
	return { pi, rec };
}

function ctxFor(cwd: string) {
	const notes: string[] = [];
	return {
		cwd,
		hasUI: false,
		ui: { notify: (m: string) => notes.push(m) },
		_notes: notes,
	};
}

describe("brainmaxxing extension wiring", () => {
	let tmp: string;

	beforeEach(() => {
		tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bmx-ext-"));
	});
	afterEach(() => {
		fs.rmSync(tmp, { recursive: true, force: true });
	});

	it("registers the brain and remember tools and loop commands", () => {
		const { pi, rec } = makeMockPi();
		brainmaxxing(pi as never);
		expect(rec.tools).toContain("brain");
		expect(rec.tools).toContain("remember");
		expect([...rec.commands.keys()]).toEqual(
			expect.arrayContaining(["brain", "reflect", "ruminate", "meditate", "plan", "review"]),
		);
	});

	it("injects the brain index into the system prompt when a brain exists", async () => {
		fs.mkdirSync(path.join(tmp, "brain"), { recursive: true });
		fs.writeFileSync(path.join(tmp, "brain", "index.md"), "# Brain\n- [[principles/x]]\n");

		const { pi, rec } = makeMockPi();
		brainmaxxing(pi as never);

		await rec.fire("session_start", { reason: "startup" }, ctxFor(tmp));
		const result = (
			(await rec.fire("before_agent_start", { systemPrompt: "BASE" }, ctxFor(tmp))) as Array<{
				systemPrompt: string;
			}>
		)[0] as { systemPrompt: string };

		expect(result.systemPrompt).toContain("BASE");
		expect(result.systemPrompt).toContain("<brain-context>");
		expect(result.systemPrompt).toContain("[[principles/x]]");
	});

	it("nudges toward /brain init when there is no brain", async () => {
		const { pi, rec } = makeMockPi();
		brainmaxxing(pi as never);

		await rec.fire("session_start", { reason: "startup" }, ctxFor(tmp));
		const result = (
			(await rec.fire("before_agent_start", { systemPrompt: "BASE" }, ctxFor(tmp))) as Array<{
				systemPrompt: string;
			}>
		)[0] as { systemPrompt: string };

		expect(result.systemPrompt).toContain("/brain init");
	});

	it("contributes bundled skills and project brain skills", async () => {
		fs.mkdirSync(path.join(tmp, "brain", "skills"), { recursive: true });
		const { pi, rec } = makeMockPi();
		brainmaxxing(pi as never);

		const result = (await rec.fire("resources_discover", { reason: "startup", cwd: tmp }, ctxFor(tmp)))[0] as {
			skillPaths: string[];
		};

		expect(result.skillPaths.some((skillPath) => skillPath.endsWith(path.join("assets", "skills")))).toBe(true);
		expect(result.skillPaths).toContain(path.join(tmp, "brain", "skills"));
	});

	it("rebuilds the index when an edit adds a brain file", async () => {
		const brainDir = path.join(tmp, "brain");
		fs.mkdirSync(path.join(brainDir, "codebase"), { recursive: true });
		fs.writeFileSync(path.join(brainDir, "index.md"), "# Brain\n");
		const note = path.join(brainDir, "codebase", "gotcha.md");
		fs.writeFileSync(note, "watch out");

		const { pi, rec } = makeMockPi();
		brainmaxxing(pi as never);

		await rec.fire("tool_result", { toolName: "edit", input: { path: note } }, ctxFor(tmp));

		const index = fs.readFileSync(path.join(brainDir, "index.md"), "utf8");
		expect(index).toContain("[[codebase/gotcha]]");
	});

	it("forwards /reflect to the skill command, passing args through", async () => {
		const { pi, rec } = makeMockPi();
		brainmaxxing(pi as never);

		const reflect = rec.commands.get("reflect");
		expect(reflect).toBeDefined();
		await reflect?.("focus on the deploy bug", ctxFor(tmp));

		expect(rec.sentUserMessages).toEqual(["/skill:reflect focus on the deploy bug"]);
	});
});
