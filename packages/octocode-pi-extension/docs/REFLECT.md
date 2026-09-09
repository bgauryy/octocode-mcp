# Awareness learning in Pi

Pi uses the native `awareness` tool for memory, reflection, refinements, and maintenance. The tool imports the Awareness package API directly and supplies the session's database, workspace, and participant identity. Discover an unfamiliar route with `action: "describe"`; do not add shell bindings or host identity fields to `params`.

Learning is conditional. After substantial work or a meaningful event, save a concise lesson only if verified evidence makes it useful for future work. Pi does not automatically run a reflection workflow at every turn end.

## Recall when it can change the approach

Recall before unfamiliar or risky work only when earlier learning could affect the decision. For example, call `awareness` with:

```json
{
  "queries": [{
    "reasoning": "Check whether prior parser findings affect this change",
    "action": "call",
    "command": "memory recall",
    "params": { "query": "tokenization", "limit": 3 }
  }]
}
```

Treat each result as a lead. Re-read cited source and rerun relevant checks before relying on it. Follow returned native continuations when needed; request full rows only for selected evidence.

## Record one reusable lesson

Useful candidates include a recurring root cause, a verified workaround, a repository constraint, or a decision with supporting evidence. Skip routine status, raw logs, obvious edits, secrets, and facts already authoritative in source or docs.

After verifying the observation, an example `awareness` call is:

```json
{
  "queries": [{
    "reasoning": "Retain the verified parser decision for future work",
    "action": "call",
    "command": "memory record",
    "params": {
      "label": "DECISION",
      "task_context": "parser validation",
      "importance": 7,
      "observation": "Malformed escapes are rejected before tokenization; cite the actual source and observed check here."
    }
  }]
}
```

Replace the example observation with the actual result and evidence. Use `reflect record` when an outcome also needs a lesson or owned improvement follow-up; do not write duplicate memory and reflection rows for the same learning. Its required `outcome` is `worked`, `partial`, or `failed`.

## Follow-up and cleanup

Use `action: "describe"` for the selected command before a broader workflow:

| Need | Command |
|---|---|
| Record an outcome and route a reusable improvement | `reflect record` |
| Inspect recurring failure signatures | `reflect mine-weakness` |
| Export a harness proposal for review | `reflect export-harness` |
| Inspect instruction improvements | `reflect developer-review` |
| Track owned improvement work | `refinement set` |
| Preview removal of one stale memory | `memory forget` with `dry_run: true` |

Use the existing plan/task for implementation work and a handoff for actual continuation. Reflection and exported proposals do not authorize harness changes or prove that checks passed. Cleanup remains explicit and item-scoped; inspect the preview before applying an authorized removal.

Authored proposals can live in workspace-root `.octocode/REFLECT.md`, normal docs, issues, or reviewed plans. Keep them concise and non-binding. Pi's local session memory is a separate projection, not a replacement for the shared Awareness ledger.

See [agent flow](AWARENESS_AGENT_FLOW.md), the [Awareness API reference](../../octocode-awareness/docs/API.md), and the package's [reflection guide](../../octocode-awareness/docs/REFLECTION.md). External hosts can use the CLI against the same physical store with distinct stable identities; Pi uses the native tool.
