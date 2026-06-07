# pi-brainmaxxing

🧠 **Project-local persistent memory for [Pi](https://pi.dev).**

Your agent keeps a `brain/` — a folder of markdown notes committed to your repo. It
reads the brain at the start of every turn and writes to it when it learns something.
Because the brain lives in the project (not your home directory), it's reviewed in
PRs, shared with your team, and travels with the code.

Inspired by [poteto/brainmaxxing](https://github.com/poteto/brainmaxxing) (for Claude
Code), rebuilt as a native Pi extension.

```
   ┌─────────────────────────────────────────────────────────────┐
   │  your repo/                                                   │
   │  ├── src/ …                                                   │
   │  └── brain/                ◀── committed to git, in every PR  │
   │      ├── index.md          ◀── auto-maintained link index     │
   │      ├── principles/       ◀── how you like to build          │
   │      ├── codebase/         ◀── gotchas the agent learned      │
   │      └── plans/                                               │
   └─────────────────────────────────────────────────────────────┘
```

---

## Table of contents

- [Install](#install)
- [Using it (day to day)](#using-it-day-to-day)
- [What happens under the hood](#what-happens-under-the-hood)
  - [Where the brain lives](#1-where-the-brain-lives)
  - [The session lifecycle](#2-the-session-lifecycle)
  - [Anatomy of a single turn](#3-anatomy-of-a-single-turn)
  - [A write, step by step](#4-a-write-step-by-step)
  - [The auto-index](#5-the-auto-index)
  - [The learning loop](#6-the-learning-loop)
- [Commands](#commands)
- [How it maps to Pi](#how-it-maps-to-pi)
- [Development](#development)
- [Release](#release)

---

## Install

Install once, globally — it then works in **every** project.

From a tagged GitHub release:

```bash
pi install git:github.com/alexanderop/pi-brainmaxxing@v0.1.1
```

Or from npm:

```bash
pi install npm:pi-brainmaxxing
```

To pin it in `~/.pi/agent/settings.json`:

```json
{ "packages": ["git:github.com/alexanderop/pi-brainmaxxing@v0.1.1"] }
```

To try it from source without installing:

```bash
pi -e /path/to/pi-brainmaxxing/src/extension/index.ts
```

---

## Using it (day to day)

### 1. Create the brain (once per project)

```
you ▸  /brain init
pi  ▸  Initialized brain/ at /repo — 18 starter notes. Commit it to share.

you ▸  git add brain && git commit -m "add brain"
```

`/brain init` drops a starter vault (16 engineering principles + an index) into your
repo root. Commit it like any other code.

### 2. Just work — the agent reads the brain automatically

Every time you send a message, the brain's index is already in the agent's context.
It reads the relevant notes before acting. You don't do anything.

```
you ▸  add retry logic to the uploader
pi  ▸  (sees brain/index.md lists codebase/upload-gotchas → reads it →
        learns the S3 client already retries → writes the smaller fix)
```

### 3. It teaches itself — and you can still force a reflection

When `brain/` exists, the extension automatically reviews the conversation in the
background: after likely corrections, every few turns/tool calls, and before
compaction/shutdown. It only asks the child agent to write durable project knowledge.

You can still force the same loop explicitly:

```
you ▸  /reflect
pi  ▸  Wrote brain/codebase/upload-retries.md. Index rebuilt.
```

The agent can also write directly via its `brain` tool mid-task. Either way,
`brain/index.md` updates itself.

### 4. Keep it healthy (occasionally)

```
you ▸  /meditate      # prune stale notes, surface cross-cutting principles
you ▸  /ruminate      # mine past sessions for lessons reflect missed
```

That's the whole loop. **`/reflect` alone gets you most of the value.**

---

## What happens under the hood

The extension is a TypeScript module Pi loads at startup. It subscribes to Pi
lifecycle events and registers one tool + a handful of commands. No daemon, no
database — just markdown files and Pi events.

### 1. Where the brain lives

On every turn the extension resolves *which* `brain/` to use, walking up from your
working directory:

```
   cwd = /repo/packages/api/src
    │
    │  walk upward …
    ▼
   ┌── /repo/packages/api/src ─┐   brain/ here?  .git here?
   ├── /repo/packages/api      │        no            no
   ├── /repo/packages          │        no            no
   └── /repo                   │        no           YES ──┐
                               └──────────────────────────┘ │
                                                            ▼
   ① nearest existing brain/   ──▶ use it                   │
   ② else the git root         ──▶ brain/ goes here  ◀──────┘
   ③ else the cwd              ──▶ fallback
```

So a monorepo can keep one brain at the root, or a package can have its own — the
**nearest existing `brain/` wins**, otherwise it defaults to the git root.

### 2. The session lifecycle

```
  pi starts in your project
        │
        ▼
  ┌──────────────────┐   reads brain/index.md from disk into memory
  │  session_start   │   (and notifies "Brain loaded — N notes")
  └──────────────────┘
        │
        ▼
  ┌────────────────────┐ tells Pi where the learning-loop skills live, so
  │ resources_discover │ /reflect /meditate /ruminate /plan /review exist
  └────────────────────┘ in this project
        │
        ▼
  ════════ now you chat; each prompt runs a turn ════════
```

### 3. Anatomy of a single turn

This is the heart of it. Two hooks fire around the LLM:

```
  you send a prompt
        │
        ▼
  ┌──────────────────────┐   appends the brain index to the system prompt,
  │  before_agent_start  │   fenced so it's treated as data, not instructions:
  └──────────────────────┘
        │                    ┌─────────────────────────────────────────┐
        │   system prompt += │ ## Brain (project memory)               │
        │                    │ - Read first.  - Write after mistakes.  │
        │                    │ <brain-context>                         │
        │                    │   # Brain                               │
        │                    │   ## Principles                         │
        │                    │   - [[principles/fix-root-causes]]      │
        │                    │   ## Codebase                           │
        │                    │   - [[codebase/upload-gotchas]]         │
        │                    │ </brain-context>                        │
        │                    └─────────────────────────────────────────┘
        ▼
   ┌─────────┐   LLM now KNOWS what the brain holds. It uses `read` or the
   │   LLM   │   `brain` tool to pull in the notes it actually needs, then acts.
   └─────────┘
        │  …calls tools (edit, write, brain, bash) …
        ▼
  ┌───────────────┐   after every edit/write: did it touch brain/ ?
  │  tool_result  │        yes ─▶ rebuild brain/index.md   (see §5)
  └───────────────┘        no  ─▶ ignore
        │
        │         external editor / git / shell changes are also caught by a
        │         debounced filesystem watcher while the session is running
        │
        ▼
  turn ends
        │
        ▼
  ┌───────────────┐   every 10 turns / 15 tool calls, after likely corrections,
  │  auto-reflect │   or before compaction/shutdown: spawn a guarded child Pi
  └───────────────┘   review that writes durable learnings via the `brain` tool
```

Key idea: the agent never gets the *whole* brain dumped into context — only the
**index** (the table of contents). It reads individual notes on demand. That keeps
context lean even as the brain grows large.

### 4. A write, step by step

When the LLM calls the `brain` tool to save a note:

```
  brain(action:"write", path:"codebase/deploy.md", content:"…")
        │
        ▼
  ┌────────────────────┐   regexes for AWS keys, GitHub/OpenAI/Anthropic
  │  scan for secrets  │   tokens, private keys, JWTs, `api_key = …` …
  └────────────────────┘
        │
   found a secret?
        │
    ┌───┴───────────────────────────┐
    │ yes                           │ no
    ▼                               ▼
  ┌───────────────────────┐   ┌──────────────────────────────┐
  │ BLOCK the write,      │   │ write the file (via Pi's      │
  │ tell the LLM why      │   │ per-file mutation queue, so a │
  │ (vault is in git!)    │   │ concurrent edit can't clobber)│
  └───────────────────────┘   └──────────────┬───────────────┘
                                              ▼
                              ┌──────────────────────────────┐
                              │ rebuild brain/index.md (§5)   │
                              └──────────────────────────────┘
```

Writing via the plain `edit`/`write` tools works too — the secret scan is skipped, but
the `tool_result` hook still rebuilds the index.

### 5. The auto-index

`brain/index.md` is a pure function of the files on disk — **no LLM involved**, so it's
cheap and deterministic. It only rewrites when the *set* of files actually changed, so
your own curated ordering survives edits that don't add or remove notes. Pi tool writes
trigger a precise post-tool reindex; external editor/git/shell changes are caught by a
debounced filesystem watcher while the session is running.

```
  brain/ on disk                          brain/index.md (generated)
  ├── index.md         (skipped)          ┌──────────────────────────────┐
  ├── principles/                         │ # Brain                      │
  │   ├── fix-root-causes.md   ──────────▶│                              │
  │   └── subtract.md          ──────────▶│ ## Codebase                  │
  ├── codebase/                           │ - [[codebase/deploy]]        │
  │   └── deploy.md            ──────────▶│                              │
  └── plans/                              │ ## Plans                     │
      └── index.md             ──────────▶│ - [[plans/index]]            │
                                          │                              │
       group by top-level dir,            │ ## Principles                │
       title-case the headers,            │ - [[principles/fix-root-…]]  │
       emit one [[wikilink]] per file     │ - [[principles/subtract]]    │
                                          └──────────────────────────────┘
```

### 6. The learning loop

The six skills form a loop that keeps the brain sharp over time:

```
        ┌──────────────────────── you work with pi ───────────────────────┐
        │                                                                  │
        ▼                                                                  │
   /reflect ──▶  writes this session's lessons to  brain/                  │
                                                     │                      │
   /ruminate ─▶  mines PAST pi sessions ────────────▶│                      │
                 (~/.pi/agent/sessions/…)            │                      │
                                                     ▼                      │
   /meditate ─▶  audits brain/ ──▶ prunes stale notes, promotes recurring  │
                 lessons into principles, sharpens skill descriptions ─────┘

   /plan   ──▶  break a task into phased plans, grounded in your principles
   /review ──▶  review code or a plan against those same principles
```

`/reflect` is the workhorse (current session). `/ruminate` backfills from history.
`/meditate` is the gardener.

---

## Commands

| Command       | What it does |
|---------------|--------------|
| `/brain`      | Show where the brain lives and how many notes it holds |
| `/brain init` | Bootstrap the starter vault into the project (idempotent — never overwrites) |
| `/reflect`    | Review this session and persist learnings to the brain |
| `/ruminate`   | Mine past Pi sessions for patterns `reflect` missed |
| `/meditate`   | Audit and prune the brain; evolve principles and skills |
| `/plan`       | Break a task into phased plans grounded in your principles |
| `/review`     | Principle-grounded review of code or a plan |

The agent can also call the **`brain` tool** itself (`list` / `read` / `write`) without
you typing a command.

---

## How it maps to Pi

If you know the original brainmaxxing (Claude Code hooks), here's the translation:

| Brainmaxxing (Claude Code)             | This extension (Pi)                         |
|----------------------------------------|---------------------------------------------|
| `SessionStart` hook injects the index  | `session_start` + `before_agent_start`      |
| `PostToolUse` hook rebuilds the index  | `tool_result` event plus a filesystem watcher for `brain/` changes |
| `.agents/skills/` learning loop        | skills exposed via `resources_discover`     |
| starter vault + `CLAUDE.md` guidance   | `/brain init` + injected guidance           |
| (none)                                 | `brain` tool with **secret-scanned** writes |

---

## Development

```bash
pnpm install
pnpm run verify   # tsc --noEmit && biome lint src test && vitest run
```

All tests run **offline**. Filesystem and other side effects go through injectable
operations, so the pure logic (`locate`, `reindex`, `bootstrap`, `secrets`) is tested
with in-memory fakes, and `test/extension.test.ts` loads the *real* extension against a
mock `ExtensionAPI`.

End-to-end against a real model:

```bash
pi -p --model openai-codex/gpt-5.5 -e ./src/extension/index.ts --no-skills \
  "Use the brain tool to write a note at codebase/test.md saying hello"
```

Layout:

```
  src/
  ├── extension/index.ts   thin entry — wires the 4 events, registers tool+commands
  ├── brain/
  │   ├── locate.ts         resolve the brain root (nested > git root > cwd)
  │   ├── reindex.ts        rebuild index.md from the file set        (pure)
  │   ├── bootstrap.ts      copy the starter vault, non-destructively (pure)
  │   ├── inject.ts         build the <brain-context> prompt block    (pure)
  │   └── fs-ops.ts         the ONLY place node:fs is touched
  ├── scan/secrets.ts       pre-write secret scan                     (pure)
  ├── tools/brain-tool.ts   the LLM-callable `brain` tool
  ├── commands/             /brain + the loop-skill forwarders
  └── assets/
      ├── brain/            starter vault (principles + index)
      └── skills/           reflect · ruminate · meditate · plan · review · brain
```

---

## Release

Before tagging a release:

```bash
pnpm run verify
npm pack --dry-run
pnpm publish --dry-run --access public --no-git-checks
```

Release flow:

```bash
git status --porcelain=v1 -b
git add .
git commit -m "chore: prepare v0.1.1 release"
git tag -a v0.1.1 -m "v0.1.1"
git push origin main --tags
```

Then create a GitHub Release from the tag and paste the matching `CHANGELOG.md`
entry. If publishing to npm too, run:

```bash
pnpm publish --access public
```

---

## License

MIT. Starter vault and skills adapted from
[poteto/brainmaxxing](https://github.com/poteto/brainmaxxing) (also MIT).
