# Redemption flow

Load when fixes are wanted or offered after the autopsy.

## Checkpoint

| Request | Action |
|---|---|
| Critique-only | Decision request below; apply nothing |
| Fixes already authorized | Map them to findings; proceed in scope |
| Fixes offered | Decision request below; await a selection |

Decision request: options are the rows (finding, smallest safe fix, severity); recommendation: the fix order shown below; default if no answer: apply nothing.

```text
Redemption options
| # | Finding | Repair | Severity |
|---|---|---|---|
| 1 | {finding} | {smallest safe fix} | {severity} |

Rows in fix order; #1 = do now.

Choose: numbers, a category, all, more critique, or stop.
```

## Execute selected repairs

- Re-read the evidence and current file state.
- Smallest fix for the mechanism; no drive-by cleanup.
- Targeted checks, then required package or repository checks; report failures.
- Credential-like literal: remove the value, advise rotation if real; claim exposure only with evidence.

## Report

BLUF: Outcome (done, partial, failed), repairs completed, files modified, checks (command and result), remaining high-value findings, next checkpoint (one action).

For another pass, restart the [lobby flow](../SKILL.md#flow) at Target.
