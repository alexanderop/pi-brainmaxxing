/**
 * Concrete `node:fs`-backed implementations of the operation interfaces used by
 * locate / reindex / bootstrap. Keeping the real IO here lets the pure modules
 * stay testable with in-memory fakes.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { BootstrapOperations } from "./bootstrap.js";
import type { LocateOperations } from "./locate.js";
import type { ReindexOperations } from "./reindex.js";

export function isDirectory(p: string): boolean {
	try {
		return fs.statSync(p).isDirectory();
	} catch {
		return false;
	}
}

/** Recursively collect absolute paths of `.md` files under `dir`. */
export function listMarkdown(dir: string): string[] {
	const out: string[] = [];
	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return out;
	}
	for (const entry of entries) {
		const abs = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			out.push(...listMarkdown(abs));
		} else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
			out.push(abs);
		}
	}
	return out;
}

export const nodeLocateOps: LocateOperations = { isDirectory };

export const nodeReindexOps: ReindexOperations = {
	exists: (p) => fs.existsSync(p),
	listMarkdown,
	readFile: (p) => fs.readFileSync(p, "utf8"),
	writeFile: (p, content) => fs.writeFileSync(p, content, "utf8"),
};

export const nodeBootstrapOps: BootstrapOperations = {
	exists: (p) => fs.existsSync(p),
	listMarkdown,
	readFile: (p) => fs.readFileSync(p, "utf8"),
	mkdirp: (dir) => {
		fs.mkdirSync(dir, { recursive: true });
	},
	writeFile: (p, content) => fs.writeFileSync(p, content, "utf8"),
};
