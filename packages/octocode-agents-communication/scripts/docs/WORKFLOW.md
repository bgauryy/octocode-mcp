# Message and lifecycle details

Load for TTLs, topics, retry behavior, or worked examples. Message rules live in [the operating guide](../../OPERATING.md#send-and-handle-messages).

## Identity and ownership

Use `peers` for names, IDs, declared tasks, branches, worktrees, and current presence. Live peer names are unique per repository scope, so `to` takes a name (`api-reviewer`) or an exact ID. A taken name at `join` or `resume` gets the first free `-2`, `-3` suffix; a rename to a live peer's name is rejected.
Use `context` for repository-shared live notes (each carries its origin worktree and branch) and `fetch` for history. Git `activity` shows changes in the current checkout, not ownership. Statuses are `available`, `busy`, `blocked` and `unknown`. After switching branches, run `heartbeat {"branch":"new-name"}` (`null` clears it).

Use `lease.id` (`lock`) or each `leases[].id` (`lock_many`) as `leaseId` for renewal and release; a send receipt's `id` is its message ID. File leases cover exact files, tree leases a subtree in that worktree. A conflict returns `next` with the same input plus `wait:true`. Running it queues you (one wait per identity, 10 minutes) and notifies the owners. A queued wait holds no lease but reserves its paths in first-come order: a direct `lock` or a later wait on an overlapping path conflicts with it and queues behind it, so a third agent cannot take a path as it frees. When every path frees, the runtime grants the lease and sends you an action-wake `Lease granted: <path> (lease N)` message. Keep the request that needs the lease pending meanwhile. `check_paths` reads overlapping leases (not queued reservations) and acquires nothing; `check_write` verifies your coverage for concrete create, edit and delete paths and both sides of a rename.

## Presence and lease expiry

Presence and default leases last 60 seconds; lease TTL ranges from 1 second to 10 minutes.

| Owner | Presence and lease renewal |
| --- | --- |
| Managed MCP, managed `run` worker | `heartbeat {"renewLeases":true}` every 15 seconds |
| Pi inbox adapter | Targets 15 seconds; idle backoff can stretch a tick to about 25 seconds plus CLI latency. Live leases extend to at least 60 seconds from the tick |
| `listen` | Presence and delivery only; no lease renewal |
| Raw CLI | Explicit `heartbeat {"renewLeases":true}` while working; `ttlMs` (60000–600000) covers a long turn and `renewLeases` extends live leases to the same horizon |

Renew before expiry: renewal never revives an expired lease, and an expired identity must `resume` (same vendor) and reacquire leases. A custom lease TTL shorter than the owner's tick can expire before renewal. `inbox wait` (up to 60 seconds) is read-only and never renews presence: heartbeat first and keep the wait shorter than remaining presence.

## Request, progress, and final answer

The kind field sets the reply policy ([kinds](../../OPERATING.md#send-and-handle-messages)). `question`, `task`, `decision` and `handoff` are requests: they wake the recipient (`wake:"action"`) and need an answer through `complete`. `blocker` wakes without owing one; `body`, `delta`, `checkback` and `issue` are passive FYIs. Explicit `wake` overrides urgency only. Final answers from `complete` wake the asker. A recipient cannot reply to an FYI: if you need an answer, send a request. A topic request wakes every subscriber, each owing an answer.
Action schedules handling within the recipient's authorized task; it grants no new objective or permissions.
A request (or any `wake:"action"` message) that expires unacknowledged stops being offered for delivery. Submitted context may already have reached the recipient, and work may still be in progress; a late `complete` can acknowledge it and return the final answer. On your next `heartbeat` you receive an SBAR blocker whose situation reads `Request N expired before <names> acknowledged it` (once per message, naming the unacknowledged recipients); for a `decision` its assessment states that the default applies. Inspect `health` and the recipient before deciding whether to send a new request with a new key.

`Receive → retrieve full body → perform requested work → complete with outcome and reply → sender acknowledges answer`.

```sh
agent send_message '{"to":"api-reviewer","task":{"objective":"Review the src/api.ts response-type change for compatibility","inputs":["src/api.ts","clients pin v2"],"output":"List of risks","done":"Every changed export checked and risks listed","checkBack":true},"reasoning":"Resolve API review before handoff","key":"api-review-1","conversationId":"api-review"}'
agent inbox
agent fetch '{"incoming":true,"type":"message","limit":20}'
# checkBack:true: confirm understanding with the sender before completing done:
agent send_message '{"to":"coordinator","checkback":{"request":MESSAGE_ID_FROM_DATA,"objective":"Review src/api.ts compatibility","done":"Every changed export checked"},"reasoning":"Confirm the task"}'
# Use data.messageId from fetch, after checking the requested work:
agent complete '{"message":MESSAGE_ID_FROM_DATA,"outcome":"done","reply":{"conclusion":"No breaking change","evidence":[{"claim":"Exports unchanged","source":"src/api.ts:42"}],"unknowns":["Client v1 behavior"]}}'
# Acknowledge handled FYIs and answers without creating another reply:
agent complete '{"messages":[FYI_ID,ANSWER_ID]}'
```

A fetched `{recordId:16,data:{messageId:1,...}}` completes with `message:1`, never `message:16`.
Progress is a `delta` with a new send key and the same `conversationId`; a `checkback` inherits its request's conversation. Neither completes the request nor sets `replyTo`. A `task` with `checkBack:true` refuses `outcome:"done"` until its recipient has sent the check-back.
Handled FYIs use `{message}` or `{messages:[...]}`; never reply to an FYI automatically.
`outcome` (done, partial, failed, refused, canceled) needs `message` and `reply`. The reply is a BLUF: `conclusion` first, then optional claim–evidence, `assumptions`, `unknowns` and `next`; the stored body starts `BLUF\nOutcome: <value>`. `document:NAME` evidence is pinned to the document's sha256. A done `handoff` moves its leases to the recipient; RACI `informed` peers of a task or decision receive the answer as an FYI. Unfinished work or work that needs input stays pending.

## Purpose, limits, and retries

`reasoning` is the purpose, up to 512 UTF-8 bytes; it is not private reasoning.
Message bodies, including rendered protocol bodies, allow 16,384 UTF-16 units. Put larger evidence in an immutable document.
Message `ttlMs` ranges from 1 second to 1 day.
An idempotency `key` identifies unchanged input. Preserve payload, routing, and branch when retrying.
Use a new key for changed content. `conversationId` connects progress and final replies.
If Pi reports a failed/timed-out send or record, retain its exposed idempotency key and inspect history; retry unchanged input with that key only when needed.
A committed write can produce a later error. A new tool-call ID creates a different automatic key.

## Topics and shared evidence

`subscribe {"topics":["api"]}` replaces subscriptions; `[]` clears them.
Send `{topic:"api",body,reasoning}` to current subscribers.
Use `notify_all` for current active peers, excluding the sender.
Topic and broadcast defaults are passive with no required reply.
Recipients are fixed at send time. Later joiners receive no old fanout.
`share_document` accepts up to 1 MiB UTF-8; pass large JSON on stdin with `-`. Names are immutable: choose a new name for a revision; an ADR revision sets `supersedes` to the published document it replaces. Usage scopes (request, turn, cumulative) are alternatives, never summed; absent counts are unknown, not zero.

Command forms: [command reference](COMMANDS.md). Uncertain delivery and backups: [operations](OPERATIONS.md).
