# Output

Follow the [shared visual-first, content-only rules](references/presentation.md) when presenting results; retain this skill’s artifact format.

## Response

BLUF in chat: always-loaded totals against their budgets and the count of `high` findings first, then each `high` finding in 5W2H: what (the flag), where (file, skill or server), when (always loaded, on start, on call), who it affects (every session, one client), why (the measured cause), how (the fix from "Act on the report"), how much (chars, ≈ tokens, or error rate). Write "unknown" in a slot the report does not show. A re-run reports a Delta update: totals before and after, and each fix kept or reverted.

## Saved result

One report in `<workspace>/.octocode/context-audit/` (the script's default `--out`; a re-run for comparison takes another `--out`). `context-audit.html` is the document a person reads. `context-audit.json` sits beside it because an agent reads the json. Do not add a third file.

Protocol definitions: [shared catalog](references/protocol-catalog.md#catalog).
