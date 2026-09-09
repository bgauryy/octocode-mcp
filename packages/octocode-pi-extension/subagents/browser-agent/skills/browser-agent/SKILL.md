---
name: browser-agent
description: "Use when browser work needs multiple Chrome DevTools Protocol phases: security/cookie/storage audits, network analysis, DOM inspection, coverage, workers, device emulation, or multi-step automation. Spawn the browser profile through the unified agent tool and manage follow-ups through the same facade. For one CDP operation, call chromeDebug directly."
---

# Browser Agent

Choose the smallest workflow that can produce the required evidence. The skill owns that judgment; `agent` and `chromeDebug` own deterministic execution.

If you are already a browser worker, complete the assigned phase with chromeDebug
and return evidence to the parent. The spawn, wait, and cleanup recipes below are
for the parent; they do not grant workers delegation or direct user contact.

## Choose the execution path

| Need | Action |
|---|---|
| One screenshot, console check, DOM query, or scheme call | Call `chromeDebug` directly |
| Multiple dependent CDP phases or user-driven follow-ups | Spawn `agent` with `profile:"browser"` |

Do not spawn a worker merely to wrap one deterministic browser operation.

## Spawn

Give the browser worker a bounded packet with explicit scope, acceptance, and return requirements. The profile routes the task to relevant CDP domains, runs the configured initial analysis, and starts the worker.

```
agent({queries:[{
  reasoning: "The audit needs dependent security, storage, and network phases.",
  type: "spawn",
  profile: "browser",
  name: "browser-audit",
  goal: "Audit the login flow.",
  context: "Inspect https://example.com.",
  scope: "Security headers, cookies, storage, and login traffic only.",
  ownership: "Read-only browser inspection; no repository writes.",
  acceptance: "Evidence for every requested surface.",
  returnShape: "[FINDING], [ACTION], and one terminal state.",
  url: "https://example.com",
  port: 9222,
  launch: false,
  runNow: true
}]})
→ { agentId: "abc123…" }
```

Use `launch:true` only when the tool should start Chrome. `runNow:true` performs the routed initial analysis before the worker starts; use `runNow:false` when an existing authenticated or interactive state must be preserved for the worker.

Spawn first. Lifecycle operations that reference the returned `agentId` must be separate calls.

## Multi-turn lifecycle

```
agent({queries:[{reasoning:"Collect the current browser-worker snapshot.", type:"wait", agentId:"abc123…"}]})
agent({queries:[{reasoning:"Queue the next audit phase.", type:"message", agentId:"abc123…", delivery:"followUp", message:"Now inspect /api/login and compare its cookie behavior."}]})
agent({queries:[{reasoning:"Inspect the complete retained result.", type:"inspect", agentId:"abc123…", full:true}]})
agent({queries:[{reasoning:"Release the completed browser worker.", type:"kill", agentId:"abc123…", remove:true}]})
```

Use `inspect` without `agentId` to list workers. Use `wait` to await the current
turn; a timeout is a snapshot, not completion. Use `steer` to redirect an active
turn and `message` with `delivery:"followUp"` to queue the next phase. The footer
already delivers live state; do not poll merely to repeat it.

## Output protocol

The browser worker prefixes evidence lines:

| Prefix | Meaning |
|---|---|
| `[STATUS] …` | A meaningful activity change, when the parent needs it |
| `[FINDING] …` | Specific issue or discovery |
| `[ACTION] …` | Recommended next step |
| `[METRIC] …` | Measurement such as size, count, percentage, or duration |
| `[SCREENSHOT] path` | Absolute screenshot path |
| `[BLOCKED] reason` | Input or external state is required |
| `[FAILED] reason` | Objective cannot be completed; partial findings should follow |
| `[DONE] summary` | The bounded objective is complete |

Relay findings and actions with their evidence. A terminal prefix is a worker claim, not proof: compare it with the acceptance criteria and inspect full output when the result matters.

If the worker emits `[BLOCKED]`, resolve the missing input and send it through `agent` with `type:"message"`. Always kill and remove the worker after collecting the final result.

## Long-running work

Continue useful parent work while a browser phase runs, then wait for its result:

```
agent({queries:[{reasoning:"Collect the browser phase.", type:"wait", agentId:"abc123…", timeoutMs:60000}]})
```

If a worker is stuck well beyond the expected duration, interrupt its current turn without destroying the process, inspect the result, then either redirect or remove it:

```
agent({queries:[{reasoning:"Interrupt the unresponsive browser turn.", type:"abort", agentId:"abc123…", full:true}]})
agent({queries:[{reasoning:"Inspect the interrupted browser worker.", type:"inspect", agentId:"abc123…", full:true}]})
agent({queries:[{reasoning:"Release the interrupted browser worker.", type:"kill", agentId:"abc123…", remove:true}]})
```

## Parallel browser lanes

Parallelize only independent inspections. Use separate debugging ports and give each worker disjoint scope. Multiple spawn queries may share one call; collect and reconcile every result before finalizing.

```
agent({queries:[
  {reasoning:"Run the independent security lane.", type:"spawn", profile:"browser", name:"security-lane", goal:"Audit browser security.", context:"Inspect https://example.com.", scope:"Headers, cookies, and storage only.", ownership:"Read-only browser inspection on port 9222.", acceptance:"Evidence for each security surface.", returnShape:"Findings and terminal status.", url:"https://example.com", port:9222},
  {reasoning:"Run the independent performance lane.", type:"spawn", profile:"browser", name:"performance-lane", goal:"Audit browser performance.", context:"Inspect https://example.com.", scope:"Web vitals, heap, layout, and script metrics only.", ownership:"Read-only browser inspection on port 9223.", acceptance:"Measured evidence for each metric family.", returnShape:"Metrics, actions, and terminal status.", url:"https://example.com", port:9223}
]})
```

## `chromeDebug` scheme guide

| Scheme | Use it for |
|---|---|
| `debug` | Exceptions, HTTP errors, blocked requests, DOM state, and screenshot |
| `network` | Requests, responses, and cookie flags |
| `security` | Security headers, cookie flags, and sensitive storage keys |
| `storage` | Cookies, web storage, IndexedDB, Cache Storage, and quota |
| `accessibility` | Accessibility tree and common labeling/structure gaps |
| `workers` | Web workers and service-worker lifecycle |
| `performance` | Web vitals, heap, layout, and script metrics |
| `css-coverage` / `js-coverage` | CSS and JavaScript usage coverage |
| `emulate` | Viewport, network, geolocation, and media emulation |
| `intercept` | Request capture or mocking |
| `screenshot` | PNG, JPEG, WebP, or PDF capture |
| `raw` | A specific `Domain.Method` call |

Inspect the live `chromeDebug` tool schema before constructing a low-level call. For protocol details, use [references/CDP_QUICK_REF.md](references/CDP_QUICK_REF.md).

## Recovery

| Signal | Response |
|---|---|
| Chrome is not running | Spawn with `launch:true`, or ask the user to start Chrome |
| Authentication is required | Ask the user to log in, then send `continue` to the worker |
| Worker reports failure | Inspect full history, remove it, correct the packet, and spawn a replacement only if needed |
| Worker is unresponsive | `abort` → `inspect` → redirect or `kill` |
