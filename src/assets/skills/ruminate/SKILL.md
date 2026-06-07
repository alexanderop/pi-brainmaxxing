---
name: ruminate
description: >-
  Mine past Pi sessions for uncaptured patterns, corrections, and knowledge.
  Cross-references with existing brain content. Triggers: "ruminate", "mine my history".
---

# Ruminate

Mine your Pi session history for brain-worthy knowledge that was never captured. Complements `reflect` (current session) and `meditate` (brain vault audit) by looking at the full archive of past sessions for *this project*.

## Process

### 1. Read the brain

Snapshot the current vault so you know what's already captured:
`sh .agents/skills/meditate/scripts/snapshot.sh brain/ /tmp/brain-snapshot-ruminate.md`.

### 2. Locate sessions

Pi stores per-project sessions under a dashed slug of the cwd:

```
~/.pi/agent/sessions/--<cwd-with-slashes-as-dashes>--/
```

The extractor resolves this for you — just pass the project's working directory.

### 3. Extract sessions

Parse the session JSONL into readable transcripts and split into batches:

```bash
SESS_DIR=$(node -e 'import("./.agents/skills/ruminate/scripts/extract-sessions.mjs").then(m=>console.log(m.sessionsDirForCwd(process.cwd())))')
node .agents/skills/ruminate/scripts/extract-sessions.mjs "$SESS_DIR" /tmp/ruminate-out --batches N
```

Choose N by volume: ~1 batch per 20 sessions, minimum 1, maximum 10.

### 4. Analyze each batch

For each `batch_K.txt` manifest, read its transcripts and extract — skipping anything the brain already covers (step 1):

- **User corrections**: where the user corrected your approach, code, or understanding
- **Recurring preferences**: things asked for or pushed back on repeatedly
- **Technical learnings**: codebase-specific knowledge, gotchas, patterns
- **Workflow patterns**: how the user prefers to work
- **Friction**: wasted effort, things that went wrong

If your harness supports parallel subagents, run one per batch and have each write structured findings to `/tmp/ruminate-out/findings_K.md`. Otherwise process batches sequentially inline.

### 5. Synthesize

Read all findings. Cross-reference with the brain. Deduplicate across batches, then **filter hard**:

- **Frequency**: did it recur across sessions, or was it a one-off? The brain captures *patterns*, not incidents.
- **Factual accuracy**: is something in the brain now wrong? Always worth fixing.
- **Impact**: would missing it cause repeated wasted effort?

Better to surface 3 high-signal findings than 9 with noise.

### 6. Present and apply

Show findings in a table: finding, frequency/evidence, proposed action. Be honest about one-offs vs. patterns and let the user decide.

Route skill-specific learnings into the relevant `SKILL.md` (read it first). Apply only approved changes, following brain conventions (one topic per file, `[[wikilinks]]`, update `brain/index.md`). Prefer updating existing notes over adding new ones.

### 7. Clean up

```bash
rm -rf /tmp/ruminate-out
```

## Guidelines

- **Filter aggressively.** Most sessions are low-signal — automated tasks, trivial exchanges, already-captured knowledge.
- **Prefer reduction.** If a finding is a special case of an existing principle, fold it into that note.
- **Quote the user.** Direct corrections carry the most signal about what matters.
