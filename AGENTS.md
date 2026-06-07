# AGENTS.md — pi-brainmaxxing

Project rules for agents (and humans) working on this repo.

## What this is

A standalone Pi extension package that gives any project a committed `brain/` memory
vault. The extension installs globally; the brain it manages lives inside each *target*
project. Do not confuse the two: this repo is the **tool**; `brain/` directories it
creates elsewhere are the **data**.

## Architecture

- `src/extension/index.ts` — thin entry. Default-exports `(pi: ExtensionAPI) => void`,
  wires events, and delegates everything else. Keep it thin.
- `src/brain/` — the core logic, each piece **pure** over an injected operations
  interface:
  - `locate.ts` — resolve the brain root (nested brain > git root > cwd).
  - `reindex.ts` — rebuild `index.md` from the file set (port of brainmaxxing's
    `auto-index-brain.sh`). `buildIndex` is string-in/string-out.
  - `bootstrap.ts` — copy the starter vault, non-destructively.
  - `inject.ts` — build the `<brain-context>`-fenced system-prompt block.
  - `fs-ops.ts` — the **only** place `node:fs` is touched for the above.
- `src/scan/secrets.ts` — pre-write secret scan (pure).
- `src/tools/brain-tool.ts` — the LLM-callable `brain` tool.
- `src/commands/` — `/brain` and the loop-skill forwarders.
- `src/assets/brain/` — starter vault. `src/assets/skills/` — the six skills.

## Rules

- **Side effects behind injectable operations.** Anything touching the filesystem,
  process, or network takes an `*Operations` interface so tests run offline with fakes.
  New IO → add it to `fs-ops.ts` (or a sibling), not inline in logic modules.
- **Keep the pure modules pure.** `locate`/`reindex`/`bootstrap`/`inject`/`secrets`
  must not import `node:fs` directly.
- **`.js` import specifiers in `src/`.** NodeNext requires extensions on relative
  imports; jiti resolves them to the `.ts` files at runtime. Tests in `test/` import
  `.ts` directly (allowed via `allowImportingTsExtensions`).
- **Secret-scan every brain write.** The vault is committed to git; never weaken the
  scan without a deliberate `allow_secrets` escape hatch.
- **Don't double-register skills.** Skills load via the `resources_discover` handler
  only. Do not re-add a `pi.skills` entry to `package.json`.
- **`src/assets/**` is shipped verbatim** and excluded from lint/typecheck. Skill
  markdown should stay harness-neutral (no Claude/`CLAUDE.md` references — use
  `AGENTS.md`, Pi session paths, etc.).

## Verify

```bash
pnpm run verify   # tsc --noEmit && biome lint src test && vitest run
```

Always green before commit. To exercise the real extension end-to-end:

```bash
pi -p --model openai-codex/gpt-5.5 -e ./src/extension/index.ts --no-skills \
  "Use the brain tool to write a note at codebase/test.md saying hello"
```
