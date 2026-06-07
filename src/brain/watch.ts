/**
 * Filesystem watcher for external `brain/` mutations.
 *
 * Pi tool writes are handled precisely by the `tool_result` hook. This watcher is
 * a safety net for changes made outside Pi's tools: editor saves, git checkout,
 * shell scripts, etc. It watches every directory under the vault instead of using
 * `fs.watch({ recursive: true })`, whose support is platform-dependent.
 */

import type { ReindexOperations, ReindexResult } from "./reindex.js";
import { reindexBrain } from "./reindex.js";

export interface DirectoryWatcher {
	close(): void;
}

export interface BrainWatchOperations {
	/** Recursively list absolute directory paths under `dir`, including `dir` itself. */
	listDirectories(dir: string): string[];
	watchDirectory(dir: string, onChange: () => void): DirectoryWatcher;
	setTimeout(callback: () => void, ms: number): unknown;
	clearTimeout(timer: unknown): void;
}

export interface BrainIndexWatcherOptions {
	brainDir: string;
	reindexOps: ReindexOperations;
	watchOps: BrainWatchOperations;
	debounceMs?: number;
	/** Called after each debounced external-change pass, even when the index was already up to date. */
	onUpdated?: (result: ReindexResult) => void;
}

/**
 * Watch a brain vault and debounce all external changes into an index rebuild.
 * Returns an idempotent stop function.
 */
export function watchBrainIndex(options: BrainIndexWatcherOptions): () => void {
	const { brainDir, reindexOps, watchOps, onUpdated, debounceMs = 150 } = options;
	if (!reindexOps.exists(brainDir)) return () => {};

	let stopped = false;
	let timer: unknown | undefined;
	const watchers = new Map<string, DirectoryWatcher>();

	function closeRemoved(liveDirs: Set<string>) {
		for (const [dir, watcher] of watchers) {
			if (!liveDirs.has(dir)) {
				watcher.close();
				watchers.delete(dir);
			}
		}
	}

	function syncWatchers() {
		if (stopped || !reindexOps.exists(brainDir)) return;
		const dirs = new Set(watchOps.listDirectories(brainDir));
		closeRemoved(dirs);
		for (const dir of dirs) {
			if (watchers.has(dir)) continue;
			try {
				watchers.set(dir, watchOps.watchDirectory(dir, schedule));
			} catch {
				// A directory can disappear between listing and watch registration.
				// The next event/debounce pass will rescan from the remaining watchers.
			}
		}
	}

	function run() {
		timer = undefined;
		if (stopped) return;
		syncWatchers();
		const result = reindexBrain(brainDir, reindexOps);
		onUpdated?.(result);
	}

	function schedule() {
		if (stopped) return;
		if (timer !== undefined) watchOps.clearTimeout(timer);
		timer = watchOps.setTimeout(run, debounceMs);
	}

	syncWatchers();

	return () => {
		if (stopped) return;
		stopped = true;
		if (timer !== undefined) watchOps.clearTimeout(timer);
		timer = undefined;
		for (const watcher of watchers.values()) watcher.close();
		watchers.clear();
	};
}
