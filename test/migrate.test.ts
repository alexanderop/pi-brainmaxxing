import * as path from "node:path";
import { describe, expect, it } from "vitest";
import {
	buildExternalDocsNote,
	type DocsDiscoveryOperations,
	type DocsIndexOperations,
	discoverExistingDocs,
	writeExternalDocsIndex,
} from "../src/brain/migrate.ts";

function discoveryOps(paths: Record<string, "file" | "directory">): DocsDiscoveryOperations {
	return {
		isDirectory: (p) => paths[p] === "directory",
		isFile: (p) => paths[p] === "file",
	};
}

describe("docs migration helpers", () => {
	it("detects common existing documentation systems", () => {
		const root = "/repo";
		const docs = discoverExistingDocs(
			root,
			discoveryOps({
				[path.join(root, "AGENTS.md")]: "file",
				[path.join(root, "docs")]: "directory",
				[path.join(root, ".cursor", "rules")]: "directory",
			}),
		);

		expect(docs).toEqual([
			{ path: "AGENTS.md", kind: "file" },
			{ path: "docs", kind: "directory" },
			{ path: ".cursor/rules", kind: "directory" },
		]);
	});

	it("builds a non-invasive external docs note", () => {
		const note = buildExternalDocsNote([
			{ path: "AGENTS.md", kind: "file" },
			{ path: "docs", kind: "directory" },
		]);

		expect(note).toContain("# External Docs");
		expect(note).toContain("[AGENTS.md](../AGENTS.md)");
		expect(note).toContain("[docs](../docs/)");
		expect(note).toContain("Do not move or copy existing docs");
	});

	it("writes external-docs.md without overwriting existing content", () => {
		const files: Record<string, string> = {};
		const ops: DocsIndexOperations = {
			exists: (p) => p in files,
			mkdirp: () => {},
			writeFile: (p, content) => {
				files[p] = content;
			},
		};

		const first = writeExternalDocsIndex("/repo/brain", [{ path: "docs", kind: "directory" }], ops);
		const second = writeExternalDocsIndex("/repo/brain", [{ path: "AGENTS.md", kind: "file" }], ops);

		expect(first.created).toBe(true);
		expect(second.created).toBe(false);
		expect(files["/repo/brain/external-docs.md"]).toContain("[docs](../docs/)");
		expect(files["/repo/brain/external-docs.md"]).not.toContain("AGENTS.md");
	});
});
