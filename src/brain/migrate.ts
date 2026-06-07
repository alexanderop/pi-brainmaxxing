/**
 * Adopt existing project documentation into brain without taking it over.
 *
 * The migration UX is deliberately conservative: detect common documentation
 * systems, ask the developer before creating anything, and default to a thin
 * index note that points at the docs in place instead of copying or moving them.
 */

import * as path from "node:path";

export interface DocsDiscoveryOperations {
	isDirectory(p: string): boolean;
	isFile(p: string): boolean;
}

export interface DocsIndexOperations {
	exists(p: string): boolean;
	mkdirp(dir: string): void;
	writeFile(p: string, content: string): void;
}

export interface ExistingDoc {
	/** Project-root-relative POSIX path. */
	path: string;
	kind: "file" | "directory";
}

const DOC_CANDIDATES: Array<{ path: string; kind: "file" | "directory" }> = [
	{ path: "AGENTS.md", kind: "file" },
	{ path: "CLAUDE.md", kind: "file" },
	{ path: "README.md", kind: "file" },
	{ path: "docs", kind: "directory" },
	{ path: "doc", kind: "directory" },
	{ path: "adr", kind: "directory" },
	{ path: "decisions", kind: "directory" },
	{ path: "notes", kind: "directory" },
	{ path: "knowledge", kind: "directory" },
	{ path: "ai_docs", kind: "directory" },
	{ path: "memory-bank", kind: "directory" },
	{ path: ".cursor/rules", kind: "directory" },
	{ path: ".windsurf/rules", kind: "directory" },
	{ path: "mkdocs.yml", kind: "file" },
	{ path: "docusaurus.config.js", kind: "file" },
	{ path: "docusaurus.config.ts", kind: "file" },
	{ path: ".vitepress/config.ts", kind: "file" },
	{ path: ".vitepress/config.js", kind: "file" },
];

function nativePath(root: string, rel: string): string {
	return path.join(root, ...rel.split("/"));
}

export function discoverExistingDocs(root: string, ops: DocsDiscoveryOperations): ExistingDoc[] {
	const found: ExistingDoc[] = [];
	for (const candidate of DOC_CANDIDATES) {
		const abs = nativePath(root, candidate.path);
		const exists = candidate.kind === "file" ? ops.isFile(abs) : ops.isDirectory(abs);
		if (exists) found.push(candidate);
	}
	return found;
}

function externalLink(doc: ExistingDoc): string {
	const relFromBrain = `../${doc.path}`;
	return doc.kind === "directory" ? `${relFromBrain}/` : relFromBrain;
}

export function buildExternalDocsNote(docs: ExistingDoc[]): string {
	const lines = [
		"# External Docs",
		"",
		"This project already had documentation before `brain/` was initialized.",
		"Brain should not duplicate or replace it; use this note as the agent-memory",
		"entry point for docs that stay in their existing locations.",
		"",
		"## Sources",
	];

	for (const doc of docs) lines.push(`- [${doc.path}](${externalLink(doc)})`);

	lines.push(
		"",
		"## Guidance",
		"",
		"- Read these sources before creating new brain notes that overlap them.",
		"- Prefer short summaries in `brain/` that link back to source docs.",
		"- Do not move or copy existing docs unless a developer explicitly asks.",
		"",
	);
	return lines.join("\n");
}

export interface ExternalDocsIndexResult {
	created: boolean;
	path: string;
}

export function writeExternalDocsIndex(
	brainDir: string,
	docs: ExistingDoc[],
	ops: DocsIndexOperations,
): ExternalDocsIndexResult {
	const target = path.join(brainDir, "external-docs.md");
	if (ops.exists(target)) return { created: false, path: target };
	ops.mkdirp(brainDir);
	ops.writeFile(target, buildExternalDocsNote(docs));
	return { created: true, path: target };
}
