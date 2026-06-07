/**
 * pi-brainmaxxing — project-local persistent memory for Pi.
 *
 * A committed `brain/` vault (Obsidian-compatible) with:
 *   1. Session injection      — brain index added to the system prompt each turn
 *   2. Auto-rebuilt index      — `brain/index.md` regenerated when brain files change
 *   3. A first-class `brain` tool with secret-scanned writes
 *   4. The reflect/ruminate/meditate/plan/review learning-loop skills
 *
 * The extension installs once (globally), but every brain it manages lives in
 * the project repo, not in the user's home directory.
 *
 * Inspired by poteto/brainmaxxing; optimized for Pi.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { nodeLocateOps, nodeReindexOps } from "../brain/fs-ops.js";
import { buildBrainContext, buildUninitializedContext } from "../brain/inject.js";
import { locateBrain } from "../brain/locate.js";
import { reindexBrain } from "../brain/reindex.js";
import { registerBrainCommand } from "../commands/brain-command.js";
import { registerLoopCommands } from "../commands/loop-commands.js";
import { registerBrainTool } from "../tools/brain-tool.js";

/** `src/extension` -> `src/assets/skills` (bundled learning-loop skills). */
function bundledSkillsDir(): string {
	const here = path.dirname(fileURLToPath(import.meta.url));
	return path.resolve(here, "..", "assets", "skills");
}

/** True if `target` resolves to a path inside `brainDir`. */
function isInsideBrain(brainDir: string, target: string | undefined, cwd: string): boolean {
	if (!target) return false;
	const abs = path.isAbsolute(target) ? target : path.resolve(cwd, target.replace(/^@/, ""));
	return abs === brainDir || abs.startsWith(brainDir + path.sep);
}

export default function brainmaxxing(pi: ExtensionAPI) {
	// Cached brain index content, refreshed on session start and after writes.
	let indexContent: string | null = null;
	let brainExists = false;

	function refresh(cwd: string): void {
		const loc = locateBrain(cwd, nodeLocateOps);
		brainExists = loc.exists;
		indexContent = loc.exists && fs.existsSync(loc.indexFile)
			? fs.readFileSync(loc.indexFile, "utf8")
			: null;
	}

	// ── 1. Load the brain index on session start ──
	pi.on("session_start", async (_event, ctx) => {
		refresh(ctx.cwd);
		if (ctx.hasUI && brainExists) {
			const loc = locateBrain(ctx.cwd, nodeLocateOps);
			const count = nodeReindexOps.listMarkdown(loc.brainDir).length;
			ctx.ui.notify(`Brain loaded — ${count} notes from ${loc.brainDir}`, "info");
		}
	});

	// ── 2. Contribute the learning-loop skills (bundled) plus the project's own
	//        brain/skills directory, if present. ──
	pi.on("resources_discover", async (event, _ctx) => {
		const cwd = (event as { cwd?: string }).cwd ?? process.cwd();
		const loc = locateBrain(cwd, nodeLocateOps);
		const skillPaths: string[] = [bundledSkillsDir()];
		const projectSkills = path.join(loc.brainDir, "skills");
		if (nodeLocateOps.isDirectory(projectSkills)) skillPaths.push(projectSkills);
		return { skillPaths };
	});

	// ── 3. Inject the brain index into the system prompt every turn ──
	pi.on("before_agent_start", async (event, _ctx) => {
		const block =
			brainExists && indexContent
				? buildBrainContext(indexContent)
				: buildUninitializedContext();
		return { systemPrompt: `${event.systemPrompt}\n\n${block}` };
	});

	// ── 4. Auto-rebuild the index when brain files change via edit/write ──
	pi.on("tool_result", async (event, ctx) => {
		if (event.toolName !== "edit" && event.toolName !== "write") return;
		const loc = locateBrain(ctx.cwd, nodeLocateOps);
		const target = (event.input as { path?: string } | undefined)?.path;
		if (!isInsideBrain(loc.brainDir, target, ctx.cwd)) return;

		reindexBrain(loc.brainDir, nodeReindexOps);
		refresh(ctx.cwd);
	});

	// ── 5. Tools & commands ──
	registerBrainTool(pi);
	registerBrainCommand(pi);
	registerLoopCommands(pi);
}
