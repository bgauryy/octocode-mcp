# Redemption flow

Load when fixes are wanted or offered after the autopsy.

## Checkpoint

- Critique-only request: offer options; apply nothing.

```text
Redemption options
| # | Finding | Repair | Severity |
|---|---|---|---|
| 1 | {finding} | {smallest safe fix} | {severity} |

Rows in fix order; #1 = do now.

Choose: numbers, a category, all, more critique, or stop.
```

- Fixes already authorized: map them to findings, proceed in scope; else await a selection.

## Execute selected repairs

- Re-read the evidence and current file state.
- Smallest fix for the mechanism; no drive-by cleanup.
- Targeted checks, then required package or repository checks; report failures.
- Credential-like literal: remove the value, advise rotation if real; claim exposure only with evidence.

## Report

BLUF: Outcome (done, partial, failed), repairs completed, files modified, checks (command and result), remaining high-value findings, next checkpoint (one action).

For another pass, restart the [lobby flow](../SKILL.md#flow) at Target.
