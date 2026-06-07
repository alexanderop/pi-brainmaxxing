import { describe, expect, it } from "vitest";
import type { ReindexOperations } from "../src/brain/reindex.ts";
import { type BrainWatchOperations, watchBrainIndex } from "../src/brain/watch.ts";

function reindexOps(files: Record<string, string>): ReindexOperations {
	return {
		exists: (p) => Object.hasOwn(files, p) || Object.keys(files).some((file) => file.startsWith(`${p}/`)),
		listMarkdown: (dir) => Object.keys(files).filter((file) => file.startsWith(`${dir}/`) && file.endsWith(".md")),
		readFile: (p) => files[p] ?? "",
		writeFile: (p, content) => {
			files[p] = content;
		},
	};
}

function fakeWatchOps(dirs: string[]) {
	const callbacks = new Map<string, () => void>();
	const timers = new Map<number, () => void>();
	let nextTimer = 1;
	const closed: string[] = [];

	const ops: BrainWatchOperations = {
		listDirectories: () => dirs,
		watchDirectory(dir, onChange) {
			callbacks.set(dir, onChange);
			return { close: () => closed.push(dir) };
		},
		setTimeout(callback) {
			const id = nextTimer++;
			timers.set(id, callback);
			return id;
		},
		clearTimeout(timer) {
			timers.delete(timer as number);
		},
	};

	return {
		ops,
		closed,
		trigger(dir: string) {
			callbacks.get(dir)?.();
		},
		runTimers() {
			const pending = [...timers.values()];
			timers.clear();
			for (const callback of pending) callback();
		},
	};
}

describe("watchBrainIndex", () => {
	it("debounces brain directory changes into an index rebuild and refresh callback", () => {
		const files = {
			"/repo/brain/index.md": "# Brain\n",
			"/repo/brain/codebase/gotcha.md": "note",
		};
		const watch = fakeWatchOps(["/repo/brain", "/repo/brain/codebase"]);
		const updates: string[] = [];

		const stop = watchBrainIndex({
			brainDir: "/repo/brain",
			reindexOps: reindexOps(files),
			watchOps: watch.ops,
			onUpdated: (result) => updates.push(result.changed ? "changed" : (result.reason ?? "unchanged")),
		});

		watch.trigger("/repo/brain/codebase");
		watch.runTimers();

		expect(files["/repo/brain/index.md"]).toContain("[[codebase/gotcha]]");
		expect(updates).toEqual(["changed"]);

		stop();
		expect(watch.closed).toEqual(expect.arrayContaining(["/repo/brain", "/repo/brain/codebase"]));
	});
});
