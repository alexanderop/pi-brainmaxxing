# Pi Tool Result Shape

When implementing or updating Pi extension tools in this repo, return/update tool results with `content` and `details`; do not use a top-level `message` field.

Gotcha encountered while adding the `ruminate` tool:
- Returning `{ message: "..." }` or sending `onUpdate({ message: "..." })` failed TypeScript with `TS2353: 'message' does not exist in type 'AgentToolResult<unknown>'`.
- The working shape is:

```ts
onUpdate?.({
  content: [{ type: "text", text: "..." }],
  details: {},
});

return {
  content: [{ type: "text", text }],
  details: { /* structured metadata */ },
};
```

Evidence: the compile check caught the issue during `src/tools/ruminate-tool.ts` work; replacing `message` with `content`/`details` made `biome check --write --error-on-warnings . && tsc --noEmit` pass.
