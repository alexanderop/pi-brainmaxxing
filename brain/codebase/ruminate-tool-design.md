# Ruminate Tool Design

`ruminate` is a first-class Pi tool, not only a skill that asks the main agent to follow markdown instructions.

Durable design decisions:
- The reliable default backend is self-contained child Pi workers spawned by the extension (`pi -p --no-session --no-skills ...`) with a ruminate-specific recursion guard such as `PI_BRAIN_RUMINATE_CHILD=1`.
- Child runs should also set the auto-reflect child guard (`PI_BRAIN_AUTO_REFLECT_CHILD=1`) so mining history does not recursively schedule memory maintenance.
- A Pi tool should not assume it can directly invoke another LLM-callable tool (for example a third-party `subagent` tool) from inside `execute()`. Tool-to-tool orchestration is not a stable API.
- If subagent compatibility is added later, prefer an explicit TypeScript/service contract exposed by the subagent extension; otherwise only surface instructions to the main agent.
- Normalize all backends to the same artifact contract: batch workers analyze extracted transcripts and write structured findings to temp `findings_K.md` files; the main ruminate flow then reads/synthesizes those findings.
- The tool must return proposed brain/skill updates for user review only; it should not edit `brain/` itself.

Current implementation shape:
- `src/tools/ruminate-tool.ts` contains session locating, JSONL transcript extraction, batching, child Pi worker prompts, bounded parallel execution, synthesis, and tool registration.
- Shared child-Pi spawn helpers (`childPiArgs`, `inheritedExtensionArgs`, recursion-guard env names) live in `src/brain/child-pi.ts`; transcript text flattening lives in `src/brain/transcript.ts`. Both are reused by `auto-reflect` rather than duplicated per call site.
- It is registered from `src/extension/index.ts` via `registerRuminateTool(pi)` alongside the `brain` and `remember` tools.
- Parameters include `batches`, `max_parallel`, `from`, `to`, `keep_temp`, and `timeout_seconds`. (A `backend` enum was dropped as speculative generality until a real subagent contract exists.)
- Temporary artifacts live under `os.tmpdir()` (`pi-ruminate-*`) and are removed unless `keep_temp` is true.

Evidence: the user corrected the design direction from subagent-tool delegation to “let ruminate be a tool that can do all these things” / “do that”. The implementation then added `src/tools/ruminate-tool.ts`, registered it in the extension, and verified with `biome check --write --error-on-warnings . && tsc --noEmit` plus `vitest run`.
