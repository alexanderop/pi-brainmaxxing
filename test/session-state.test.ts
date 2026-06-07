import { describe, expect, it } from "vitest";
import type { LocateOperations } from "../src/brain/locate.ts";
import type { ReindexOperations } from "../src/brain/reindex.ts";
import {
	getBrainSkillPaths,
	isInsideBrainPath,
	loadBrainSnapshot,
	reindexAfterBrainMutation,
} from "../src/brain/session-state.ts";

function locateOps(dirs: string[]): LocateOperations {
	const set = new Set(dirs);
	return { isDirectory: (p) => set.has(p) };
}

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

describe("brain session state", () => {
	it("loads the current brain index and note count through injected operations", () => {
		const files = {
			"/repo/brain/index.md": "# Brain\n- [[codebase/foo]]\n",
			"/repo/brain/codebase/foo.md": "note",
		};
		const snapshot = loadBrainSnapshot("/repo/src", {
			locate: locateOps(["/repo/brain"]),
			reindex: reindexOps(files),
		});

		expect(snapshot.location.brainDir).toBe("/repo/brain");
		expect(snapshot.indexContent).toBe(files["/repo/brain/index.md"]);
		expect(snapshot.noteCount).toBe(2);
	});

	it("returns bundled skills plus project brain skills when present", () => {
		const skills = getBrainSkillPaths("/repo", "/extension/skills", locateOps(["/repo/brain", "/repo/brain/skills"]));

		expect(skills).toEqual(["/extension/skills", "/repo/brain/skills"]);
	});

	it("recognizes absolute, relative, and @-prefixed paths inside the brain", () => {
		expect(isInsideBrainPath("/repo/brain", "/repo/brain/codebase/foo.md", "/repo")).toBe(true);
		expect(isInsideBrainPath("/repo/brain", "brain/codebase/foo.md", "/repo")).toBe(true);
		expect(isInsideBrainPath("/repo/brain", "@brain/codebase/foo.md", "/repo")).toBe(true);
		expect(isInsideBrainPath("/repo/brain", "src/foo.ts", "/repo")).toBe(false);
	});

	it("reindexes only when a mutation touched the brain", () => {
		const files = {
			"/repo/brain/index.md": "# Brain\n",
			"/repo/brain/codebase/foo.md": "note",
		};
		const ops = {
			locate: locateOps(["/repo/brain"]),
			reindex: reindexOps(files),
		};

		expect(reindexAfterBrainMutation("/repo", "src/foo.ts", ops)).toBeUndefined();
		expect(reindexAfterBrainMutation("/repo", "brain/codebase/foo.md", ops)).toEqual({ changed: true });
		expect(files["/repo/brain/index.md"]).toContain("[[codebase/foo]]");
	});
});
