import { describe, expect, it } from "vitest";
import { buildIndex, type ReindexOperations, reindexBrain } from "../src/brain/reindex.ts";

describe("buildIndex", () => {
	it("groups slugs by top-level dir with title-cased headers", () => {
		const out = buildIndex([
			"principles/fix-root-causes",
			"principles/subtract-before-you-add",
			"codebase/deploy-gotchas",
		]);
		expect(out).toBe(
			[
				"# Brain",
				"",
				"## Codebase",
				"- [[codebase/deploy-gotchas]]",
				"",
				"## Principles",
				"- [[principles/fix-root-causes]]",
				"- [[principles/subtract-before-you-add]]",
				"",
			].join("\n"),
		);
	});

	it("puts top-level files under an Other section", () => {
		const out = buildIndex(["principles", "readme"]);
		expect(out).toContain("## Other");
		expect(out).toContain("- [[principles]]");
		expect(out).toContain("- [[readme]]");
	});

	it("is deterministic and deduped regardless of input order", () => {
		const a = buildIndex(["b/two", "a/one", "b/two"]);
		const b = buildIndex(["a/one", "b/two"]);
		expect(a).toBe(b);
	});
});

/** In-memory ReindexOperations over a path->content map. */
function fakeOps(files: Record<string, string>): {
	ops: ReindexOperations;
	written: Record<string, string>;
} {
	const written: Record<string, string> = {};
	const ops: ReindexOperations = {
		exists: (p) => p in files || p.endsWith("/brain"),
		listMarkdown: (dir) => Object.keys(files).filter((p) => p.startsWith(`${dir}/`)),
		readFile: (p) => files[p] ?? "",
		writeFile: (p, content) => {
			written[p] = content;
			files[p] = content;
		},
	};
	return { ops, written };
}

describe("reindexBrain", () => {
	it("rewrites the index when files drift from what it lists", () => {
		const files: Record<string, string> = {
			"/repo/brain/index.md": "# Brain\n",
			"/repo/brain/principles/fix-root-causes.md": "x",
		};
		const { ops, written } = fakeOps(files);
		const result = reindexBrain("/repo/brain", ops);
		expect(result.changed).toBe(true);
		expect(written["/repo/brain/index.md"]).toContain("[[principles/fix-root-causes]]");
	});

	it("is a no-op when the index already matches disk", () => {
		const files: Record<string, string> = {
			"/repo/brain/index.md": "# Brain\n\n## Principles\n- [[principles/x]]\n",
			"/repo/brain/principles/x.md": "x",
		};
		const { ops, written } = fakeOps(files);
		const result = reindexBrain("/repo/brain", ops);
		expect(result.changed).toBe(false);
		expect(result.reason).toBe("up-to-date");
		expect(written).toEqual({});
	});

	it("skips when there is no index file", () => {
		const files: Record<string, string> = { "/repo/brain/principles/x.md": "x" };
		const { ops } = fakeOps(files);
		expect(reindexBrain("/repo/brain", ops).reason).toBe("no-index");
	});
});
