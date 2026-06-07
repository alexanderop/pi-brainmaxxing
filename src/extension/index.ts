/**
 * pi-brainmaxxing — project-local persistent memory for Pi.
 *
 * A committed `brain/` vault (Obsidian-compatible) with:
 *   1. Session injection      — brain index added to the system prompt each turn
 *   2. Auto-rebuilt index      — `brain/index.md` regenerated when brain files change
 *   3. A first-class `brain` tool with secret-scanned writes
 *   4. Auto-reflection      — corrections/periodic/flush reviews update brain
 *   5. The reflect/ruminate/meditate/plan/review learning-loop skills
 *
 * The extension installs once (globally), but every brain it manages lives in
 * the project repo, not in the user's home directory.
 *
 * Inspired by poteto/brainmaxxing; optimized for Pi.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { nodeLocateOps, nodeReindexOps, nodeWatchOps } from "../brain/fs-ops.js";
import { buildBrainContext, buildUninitializedContext } from "../brain/inject.js";
import {
	type BrainSnapshot,
	getBrainSkillPaths,
	isBrainIndexPath,
	loadBrainSnapshot,
	reindexAfterBrainMutation,
} from "../brain/session-state.js";
import { watchBrainIndex } from "../brain/watch.js";
import { registerBrainCommand } from "../commands/brain-command.js";
import { registerLoopCommands } from "../commands/loop-commands.js";
import { setupAutoReflect } from "../handlers/auto-reflect.js";
import { registerBrainTool } from "../tools/brain-tool.js";
import { registerRememberTool } from "../tools/remember-tool.js";
import { registerRuminateTool } from "../tools/ruminate-tool.js";
import { bundledSkillsDir } from "./assets.js";

export default function brainmaxxing(pi: ExtensionAPI) {
	// Cached brain index content, refreshed on session start and after writes.
	let indexContent: string | null = null;
	let brainExists = false;
	let stopBrainWatcher: (() => void) | undefined;

	const ops = { locate: nodeLocateOps, reindex: nodeReindexOps };

	function refresh(cwd: string): BrainSnapshot {
		const snapshot = loadBrainSnapshot(cwd, ops);
		brainExists = snapshot.location.exists;
		indexContent = snapshot.indexContent;
		return snapshot;
	}

	// ── 1. Load the brain index on session start and watch for external edits ──
	pi.on("session_start", async (_event, ctx) => {
		stopBrainWatcher?.();
		stopBrainWatcher = undefined;
		const snapshot = refresh(ctx.cwd);
		if (snapshot.location.exists) {
			stopBrainWatcher = watchBrainIndex({
				brainDir: snapshot.location.brainDir,
				reindexOps: nodeReindexOps,
				watchOps: nodeWatchOps,
				onUpdated: () => refresh(ctx.cwd),
			});
		}
		if (ctx.hasUI && snapshot.location.exists) {
			ctx.ui.notify(`Brain loaded — ${snapshot.noteCount} notes from ${snapshot.location.brainDir}`, "info");
		}
	});

	pi.on("session_shutdown", async () => {
		stopBrainWatcher?.();
		stopBrainWatcher = undefined;
	});

	// ── 2. Contribute the learning-loop skills (bundled) plus the project's own
	//        brain/skills directory, if present. ──
	pi.on("resources_discover", async (event, _ctx) => {
		const cwd = (event as { cwd?: string }).cwd ?? process.cwd();
		return { skillPaths: getBrainSkillPaths(cwd, bundledSkillsDir(), nodeLocateOps) };
	});

	// ── 3. Inject the brain index into the system prompt every turn ──
	pi.on("before_agent_start", async (event, _ctx) => {
		const block = brainExists && indexContent ? buildBrainContext(indexContent) : buildUninitializedContext();
		return { systemPrompt: `${event.systemPrompt}\n\n${block}` };
	});

	// ── 4. Protect the generated root index, then auto-rebuild it after brain edits ──
	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "edit" && event.toolName !== "write") return;
		const target = (event.input as { path?: string } | undefined)?.path;
		const location = loadBrainSnapshot(ctx.cwd, ops).location;
		if (!isBrainIndexPath(location.brainDir, target, ctx.cwd)) return;

		const reason =
			"brain/index.md is auto-maintained by pi-brainmaxxing. " +
			"Write, edit, add, or remove normal brain notes instead; the index will be rebuilt automatically.";
		if (ctx.hasUI) ctx.ui.notify(reason, "warning");
		return { block: true, reason };
	});

	pi.on("tool_result", async (event, ctx) => {
		if (event.toolName !== "edit" && event.toolName !== "write") return;
		const target = (event.input as { path?: string } | undefined)?.path;
		const result = reindexAfterBrainMutation(ctx.cwd, target, ops);
		if (!result) return;
		refresh(ctx.cwd);
	});

	// ── 5. Background maintenance, tools & commands ──
	const memoryReview = setupAutoReflect(pi, {
		hasBrain(cwd) {
			return loadBrainSnapshot(cwd, ops).location.exists;
		},
		onUpdated: refresh,
	});
	registerBrainTool(pi);
	registerRememberTool(pi, memoryReview);
	registerRuminateTool(pi);
	registerBrainCommand(pi);
	registerLoopCommands(pi);
}
