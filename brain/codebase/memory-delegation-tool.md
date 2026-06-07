# Memory Delegation Tool

`remember` is the lightweight main-agent memory signal. It queues a `MemoryCandidate` and returns immediately; it must not write the vault directly.

The background auto-reflect controller drains queued candidates into a guarded child Pi run (`PI_BRAIN_AUTO_REFLECT_CHILD=1`). The child curator decides whether the candidate is durable, reads existing notes if needed, and writes through the existing secret-scanned `brain` tool.

For explicit `remember` reviews, keep the child prompt candidate-focused rather than dumping the full transcript; this avoids context bloat and reinforces that the main agent is only a sensor while the child is the curator.

Keep this split intact:
- main agent/tool = cheap sensor and queue
- child Pi = curator and duplicate/usefulness filter
- `brain` tool = safe writer and reindexer
