/**
 * Bootstrap a starter `brain/` vault into a project.
 *
 * Copies the bundled starter vault (engineering principles + index) from the
 * package's `assets/brain` into `<root>/brain`. Idempotent and non-destructive:
 * existing files are never overwritten, so re-running only fills gaps.
 */

import * as path from "node:path";

export interface BootstrapOperations {
	exists(p: string): boolean;
	/** List `.md` file paths under `dir`, recursively (absolute). */
	listMarkdown(dir: string): string[];
	readFile(p: string): string;
	mkdirp(dir: string): void;
	writeFile(p: string, content: string): void;
}

export interface BootstrapResult {
	created: string[];
	skipped: string[];
}

/**
 * Copy every starter file from `assetsBrainDir` into `targetBrainDir`,
 * preserving relative layout. Returns which vault-relative paths were created
 * vs skipped (already present).
 */
export function bootstrapBrain(
	assetsBrainDir: string,
	targetBrainDir: string,
	ops: BootstrapOperations,
): BootstrapResult {
	const created: string[] = [];
	const skipped: string[] = [];

	for (const srcAbs of ops.listMarkdown(assetsBrainDir)) {
		const rel = path.relative(assetsBrainDir, srcAbs);
		const destAbs = path.join(targetBrainDir, rel);

		if (ops.exists(destAbs)) {
			skipped.push(rel);
			continue;
		}

		ops.mkdirp(path.dirname(destAbs));
		ops.writeFile(destAbs, ops.readFile(srcAbs));
		created.push(rel);
	}

	return { created, skipped };
}
