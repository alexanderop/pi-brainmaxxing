# Memory Delegation

Automatic memory should use a two-tier model: the main agent is only a memory sensor, while a child Pi run is the memory curator and the existing `brain` tool remains the safe writer.

Durable design decisions from the extension discussion:
- Add a lightweight `remember` tool for the main agent to queue possible durable memories; it should return immediately and must not write `brain/` directly.
- The child review process decides whether the candidate is useful, non-duplicate, non-secret, and where it belongs, then writes via the existing secret-scanned `brain` tool.
- Keep passive `auto-reflect` as a safety net for corrections, periodic review, and flush/compact review.
- Prefer candidate-first prompts (`summary`, `reason`, `evidence`) over sending a large transcript slice; include recent transcript only for periodic/flush or when evidence is insufficient.
- Maintain the recursion guard (`PI_BRAIN_AUTO_REFLECT_CHILD=1`), concurrency guard, rate limits, and non-blocking behavior except where flush/compact must await.

Implementation should preserve the thin extension entry point: event wiring in `src/handlers/auto-reflect.ts`, pure candidate/prompt helpers under `src/brain/`, and safe disk writes only through the existing brain tool path.