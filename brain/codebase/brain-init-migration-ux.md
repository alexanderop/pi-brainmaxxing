# Brain Init Migration UX

When `/brain init` detects existing project knowledge/docs (for example `AGENTS.md`, `docs/`, `.cursor/rules`, ADRs, README-heavy repos), it should **ask the user what they want** instead of auto-migrating or assuming `brain/` should take over.

Preferred flow:
- Detect existing docs first, then present clear choices.
- Recommend the least-invasive default: index/link existing docs and keep them in place.
- Offer alternatives such as starting empty or explicitly indexing existing docs.
- Avoid automatic moving/copying of existing docs; Brain should be an adapter/agent-memory layer over project knowledge, not a competing docs system.

Implemented shape:
- `src/brain/migrate.ts` handles docs discovery and external-docs note generation through injected operations.
- `/brain init --mode=index` creates the starter vault plus `brain/external-docs.md` linking to existing docs.
- `/brain init --mode=empty` creates the starter vault and ignores existing docs.
- `/brain migrate --mode=index` creates/keeps `brain/external-docs.md` without moving docs.

Correction evidence: the user explicitly corrected the proposed migration UX with “should ask the user what he wants”; preserve that expectation for future `/brain init` and migration work.