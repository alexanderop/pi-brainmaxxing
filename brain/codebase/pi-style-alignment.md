# Pi Style Alignment

Pi's own repo keeps extension entry points thin: event wiring in the entry, with path/state logic extracted into small modules and filesystem effects behind operation interfaces. Its root check is strict and formatting-aware (`biome check --write --error-on-warnings .` plus typecheck), with exact direct dev dependency versions.

For this extension, keep `src/extension/index.ts` as wiring only. Put runtime brain state helpers in `src/brain/session-state.ts`, asset path helpers in `src/extension/assets.ts`, and concrete filesystem reads/writes in `src/brain/fs-ops.ts` or modules that depend on injected ops. Add integration-style wiring tests alongside pure module tests when changing event behavior.
