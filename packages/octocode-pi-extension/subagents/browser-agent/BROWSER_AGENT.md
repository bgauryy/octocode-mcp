# Browser worker

Use `chromeDebug` for one browser operation. Use `agent` with
`profile:"browser"` for bounded phases that benefit from an independent worker.
The parent owns authorization, integration, and cleanup; the worker returns
evidence for its assigned phase.

The [browser skill](skills/browser-agent/SKILL.md) owns the operating recipes.
[SYSTEM_PROMPT.md](SYSTEM_PROMPT.md) adds role boundaries; shared worker and host
prompts supply research routing, ownership, and handback rules once.

## Start a phase

Pass this envelope to `agent` after the requested scope authorizes the target
navigation. The example uses an existing debugging port.

```json
{
  "queries": [{
    "reasoning": "Inspect an independent security phase.",
    "type": "spawn",
    "profile": "browser",
    "goal": "Inspect security headers on example.com.",
    "context": "Chrome is available on port 9222.",
    "scope": "Navigate to the supplied URL and inspect security headers only.",
    "ownership": "Read-only browser evidence; no repository writes.",
    "acceptance": "Report observed headers and their implications.",
    "returnShape": "[FINDING], [EVIDENCE], and one terminal state.",
    "url": "https://example.com",
    "port": 9222,
    "launch": false,
    "runNow": true
  }]
}
```

Set `runNow:false` when the worker must preserve an existing authenticated or
interactive page. Passing `url` to a CDP operation navigates first. Launch,
injection, interception, emulation, and user-data changes require authorization
for that effect; a debugging request does not grant every browser operation.

## Continue and finish

Use the returned `agentId` in a later call. Continue non-overlapping parent work,
then use `type:"wait"`; a timeout does not establish completion. The footer shows
live updates, so repeated `inspect` polling is unnecessary.

- `message` with `delivery:"followUp"` queues the next assigned phase.
- `steer` redirects an active turn; `abort` interrupts it without killing the process.
- `inspect` with `full:true` retrieves retained evidence when needed.
- Verify the handback, then `kill` with `remove:true` when no further turn is owed.

[DONE] means the worker claims its bounded acceptance was met. [BLOCKED] means
input or external state is needed; [FAILED] means the attempt did not complete.
The parent verifies those claims. Report measured findings, relevant screenshots,
and meaningful changes; do not emit a status line for every operation.

## Protocol reference

The live `chromeDebug` schema owns supported schemes and fields. Use
[CDP_QUICK_REF.md](skills/browser-agent/references/CDP_QUICK_REF.md) for selected
protocol recipes. Prefer the smallest scheme that answers the question; use
`scheme:"raw"` with `method:"Domain.Method"` only when a named scheme does not fit.
Do not assume a fixed Chrome version or copied domain count.

Report cookie names and security metadata without secret values. The parent owns
local artifact servers and visible browser opening. Independent browser lanes
need disjoint scope and separate debugging ports.
