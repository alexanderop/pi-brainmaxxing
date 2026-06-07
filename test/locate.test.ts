import { describe, expect, it } from "vitest";
import { type LocateOperations, locateBrain } from "../src/brain/locate.ts";

function ops(dirs: string[]): LocateOperations {
	const set = new Set(dirs);
	return { isDirectory: (p) => set.has(p) };
}

describe("locateBrain", () => {
	it("prefers the nearest existing brain/ walking up", () => {
		const loc = locateBrain("/repo/packages/app/src", ops(["/repo/brain"]));
		expect(loc.root).toBe("/repo");
		expect(loc.brainDir).toBe("/repo/brain");
		expect(loc.exists).toBe(true);
	});

	it("falls back to the git root when no brain exists yet", () => {
		const loc = locateBrain("/repo/packages/app", ops(["/repo/.git"]));
		expect(loc.root).toBe("/repo");
		expect(loc.exists).toBe(false);
		expect(loc.indexFile).toBe("/repo/brain/index.md");
	});

	it("prefers a nested brain/ over a higher git root", () => {
		const loc = locateBrain("/repo/packages/app", ops(["/repo/.git", "/repo/packages/app/brain"]));
		expect(loc.root).toBe("/repo/packages/app");
		expect(loc.exists).toBe(true);
	});

	it("falls back to cwd when neither brain nor git is found", () => {
		const loc = locateBrain("/tmp/scratch", ops([]));
		expect(loc.root).toBe("/tmp/scratch");
		expect(loc.exists).toBe(false);
	});
});
