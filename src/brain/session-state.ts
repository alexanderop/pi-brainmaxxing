/**
 * Runtime brain state helpers.
 *
 * The extension entry point should only wire Pi events. This module translates
 * those events into brain operations while keeping filesystem access behind the
 * injected locate/reindex operation interfaces.
 */

import * as path from "node:path";
import type { LocateOperations } from "./locate.js";
import { type BrainLocation, locateBrain } from "./locate.js";
import { type ReindexOperations, type ReindexResult, reindexBrain } from "./reindex.js";

export interface BrainSnapshot {
	location: BrainLocation;
	indexContent: string | null;
	noteCount: number;
}

export interface BrainRuntimeOperations {
	locate: LocateOperations;
	reindex: ReindexOperations;
}

/** Load the current brain location plus the cached index content used for prompt injection. */
export function loadBrainSnapshot(cwd: string, ops: BrainRuntimeOperations): BrainSnapshot {
	const location = locateBrain(cwd, ops.locate);
	const indexContent =
		location.exists && ops.reindex.exists(location.indexFile) ? ops.reindex.readFile(location.indexFile) : null;
	const noteCount = location.exists ? ops.reindex.listMarkdown(location.brainDir).length : 0;

	return { location, indexContent, noteCount };
}

/** True if a tool input path resolves to a path inside the current brain vault. */
export function isInsideBrainPath(brainDir: string, target: string | undefined, cwd: string): boolean {
	if (!target) return false;
	const normalized = target.replace(/^@/, "");
	const abs = path.isAbsolute(normalized) ? normalized : path.resolve(cwd, normalized);
	return abs === brainDir || abs.startsWith(brainDir + path.sep);
}

/** Skill paths contributed by this extension for the current project. */
export function getBrainSkillPaths(cwd: string, bundledSkillsDir: string, locateOps: LocateOperations): string[] {
	const location = locateBrain(cwd, locateOps);
	const skillPaths = [bundledSkillsDir];
	const projectSkills = path.join(location.brainDir, "skills");
	if (locateOps.isDirectory(projectSkills)) skillPaths.push(projectSkills);
	return skillPaths;
}

/** Rebuild the brain index when a built-in edit/write touched the vault. */
export function reindexAfterBrainMutation(
	cwd: string,
	target: string | undefined,
	ops: BrainRuntimeOperations,
): ReindexResult | undefined {
	const location = locateBrain(cwd, ops.locate);
	if (!isInsideBrainPath(location.brainDir, target, cwd)) return undefined;
	return reindexBrain(location.brainDir, ops.reindex);
}
