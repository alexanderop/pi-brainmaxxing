/**
 * Rebuild `brain/index.md` from the files on disk.
 *
 * TypeScript port of brainmaxxing's `auto-index-brain.sh`. The index is a pure
 * function of the set of markdown files in the vault — no LLM involved — so it
 * stays cheap, deterministic, and safe to run on every brain write.
 *
 * `buildIndex` is pure (string-in, string-out) for easy testing. `reindexBrain`
 * wires it to the filesystem through injectable `ReindexOperations`.
 */

import * as path from "node:path";

export interface ReindexOperations {
	exists(p: string): boolean;
	/** Recursively list `.md` file paths under `dir` (absolute paths). */
	listMarkdown(dir: string): string[];
	readFile(p: string): string;
	writeFile(p: string, content: string): void;
}

/** Title-case a top-level section name: `principles` -> `Principles`. */
function header(section: string): string {
	return section.charAt(0).toUpperCase() + section.slice(1);
}

/**
 * Build the index body from vault-relative slugs (POSIX-separated, no `.md`),
 * grouped by their top-level directory. `index` itself must be excluded by the
 * caller. Output is byte-stable for a given input set.
 */
export function buildIndex(slugs: string[]): string {
	const sorted = [...new Set(slugs)].sort();

	const sections = new Map<string, string[]>();
	const standalone: string[] = [];

	for (const slug of sorted) {
		const slash = slug.indexOf("/");
		if (slash === -1) {
			standalone.push(slug);
		} else {
			const section = slug.slice(0, slash);
			const list = sections.get(section) ?? [];
			list.push(slug);
			sections.set(section, list);
		}
	}

	const lines: string[] = ["# Brain"];

	for (const section of [...sections.keys()].sort()) {
		lines.push("", `## ${header(section)}`);
		for (const slug of sections.get(section) ?? []) {
			lines.push(`- [[${slug}]]`);
		}
	}

	if (standalone.length > 0) {
		lines.push("", "## Other");
		for (const slug of standalone) {
			lines.push(`- [[${slug}]]`);
		}
	}

	lines.push("");
	return lines.join("\n");
}

/** Extract every `[[wikilink]]` target from an index file, sorted & deduped. */
function indexedSlugs(indexContent: string): string[] {
	const found = new Set<string>();
	for (const match of indexContent.matchAll(/\[\[([^\]]+)\]\]/g)) {
		const slug = (match[1] ?? "").split("#")[0]?.trim();
		if (slug) found.add(slug);
	}
	return [...found].sort();
}

/** Convert an absolute `.md` path under `brainDir` to a vault slug. */
function toSlug(brainDir: string, absPath: string): string {
	const rel = path.relative(brainDir, absPath);
	return rel.replace(/\.md$/i, "").split(path.sep).join("/");
}

export interface ReindexResult {
	/** Whether the index file was rewritten. */
	changed: boolean;
	/** Reason it was skipped, when `changed` is false. */
	reason?: "no-brain-dir" | "no-index" | "up-to-date";
}

/**
 * Regenerate `brain/index.md` if (and only if) the set of files drifted from
 * what the current index lists. Mirrors the shell hook's fast-exit behaviour so
 * the agent's own edits to index ordering/prose are preserved when nothing was
 * added or removed.
 */
export function reindexBrain(brainDir: string, ops: ReindexOperations): ReindexResult {
	if (!ops.exists(brainDir)) return { changed: false, reason: "no-brain-dir" };

	const indexFile = path.join(brainDir, "index.md");
	if (!ops.exists(indexFile)) return { changed: false, reason: "no-index" };

	const slugs = ops
		.listMarkdown(brainDir)
		.map((abs) => toSlug(brainDir, abs))
		.filter((slug) => slug !== "index")
		.sort();

	const current = indexedSlugs(ops.readFile(indexFile));

	if (slugs.length === current.length && slugs.every((s, i) => s === current[i])) {
		return { changed: false, reason: "up-to-date" };
	}

	ops.writeFile(indexFile, buildIndex(slugs));
	return { changed: true };
}
