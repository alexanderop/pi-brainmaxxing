# Brain Index Watcher

The generated root index (`brain/index.md`) is auto-maintained; agents should write, edit, add, or remove normal brain notes instead of touching the index directly.

The auto-index path has three layers:

- Guard rail before writes: `src/extension/index.ts` listens for `tool_call` from built-in `edit`/`write` and blocks attempts targeting `brain/index.md` before execution.
- Precise Pi-tool path: `src/extension/index.ts` listens for `tool_result` from built-in `edit`/`write` touching `brain/` and reindexes after successful mutations.
- Brain-tool path: `src/tools/brain-tool.ts` rejects `action:write` to `index.md`; successful writes are secret-scanned and then reindex the vault.
- External-change safety net: `src/brain/watch.ts` implements `watchBrainIndex`, started on `session_start` and stopped on `session_shutdown`; session start also closes any previous watcher before creating a new one.

Implementation details/gotchas:
- `watchBrainIndex` debounces filesystem events, calls `reindexBrain(...)`, then refreshes cached `indexContent` via `onUpdated`.
- Uses Node `fs.watch` through `nodeWatchOps` in `src/brain/fs-ops.ts`; no `chokidar` dependency yet.
- Avoids platform-dependent `fs.watch({ recursive: true })` by watching every directory under `brain/` and resyncing watcher registrations on each debounce pass.
- Watchers/timers use `persistent: false` and `unref()` so they should not keep Pi processes alive.
- Keep the `tool_result` hook; the watcher complements it for editor saves, shell scripts, and git checkouts rather than replacing precise Pi tool handling.
- If cross-platform watcher reliability becomes a problem, consider `chokidar` as the next step.
