/**
 * Locate the project-local brain vault.
 *
 * The brain belongs to the *project*, not the user. We resolve it to the
 * project root so it is committed to git alongside the code — the core
 * difference from user-scoped memory extensions.
 *
 * Resolution, starting from `cwd` and walking up:
 *   1. The nearest ancestor that already contains a `brain/` directory wins.
 *   2. Otherwise the git repository root (nearest ancestor with `.git`).
 *   3. Otherwise `cwd` itself.
 *
 * All filesystem access goes through `LocateOperations` so tests run offline
 * with an in-memory fake.
 */

import * as path from "node:path";

export interface LocateOperations {
	/** True if `p` exists and is a directory. */
	isDirectory(p: string): boolean;
}

export interface BrainLocation {
	/** Absolute path to the project root that owns (or would own) the brain. */
	root: string;
	/** Absolute path to the `brain/` directory (may not exist yet). */
	brainDir: string;
	/** Absolute path to `brain/index.md`. */
	indexFile: string;
	/** Whether the `brain/` directory currently exists on disk. */
	exists: boolean;
}

function ancestors(start: string): string[] {
	const result: string[] = [];
	let current = path.resolve(start);
	while (true) {
		result.push(current);
		const parent = path.dirname(current);
		if (parent === current) break;
		current = parent;
	}
	return result;
}

/**
 * Resolve where the brain lives for a given working directory.
 * Pure given `ops`; performs no IO of its own beyond `ops` calls.
 */
export function locateBrain(cwd: string, ops: LocateOperations): BrainLocation {
	const chain = ancestors(cwd);

	// 1. Nearest existing brain/ wins.
	for (const dir of chain) {
		const candidate = path.join(dir, "brain");
		if (ops.isDirectory(candidate)) {
			return makeLocation(dir, true);
		}
	}

	// 2. Git root.
	for (const dir of chain) {
		if (ops.isDirectory(path.join(dir, ".git"))) {
			return makeLocation(dir, false);
		}
	}

	// 3. Fall back to cwd.
	return makeLocation(path.resolve(cwd), false);
}

function makeLocation(root: string, exists: boolean): BrainLocation {
	const brainDir = path.join(root, "brain");
	return {
		root,
		brainDir,
		indexFile: path.join(brainDir, "index.md"),
		exists,
	};
}
