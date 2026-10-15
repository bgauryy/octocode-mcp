# Message and lifecycle details

Load for TTLs, topics, retry behavior, or worked examples. Message rules live in [the operating guide](../../OPERATING.md#send-and-handle-messages).

## Identity and ownership

Use `peers` for names, IDs, declared tasks, branches, worktrees, and current presence. Live peer names are unique per repository scope, so `to` takes a name (`api-reviewer`) or an exact ID. A taken name at `join` or `resume` gets the first free `-2`, `-3` suffix; a rename to a live peer's name is rejected.
Use `context` for repository-shared live notes, or `fetch` for historical findings.
Each note carries its origin worktree and branch; matching relative paths do not imply identical checkout contents.
Git `activity` shows changes in the current checkout, not ownership.
Statuses are `available`, `busy`, `blocked`, and `unknown`.
After switching branches, use `heartbeat {"branch":"new-name"}`; use `{"branch":null}` to clear it.
Use `lease.id` (`lock`) or each `leases[].id` (`lock_many`) as `leaseId` for renewal and release. A send receipt's `id` is its message ID.
File leases cover exact files. Tree leases cover a subtree in that worktree.
A conflict returns `next` with the same input plus `wait:true`. Running it queues you (one wait per identity, 10 minutes) and notifies the owners. A queued wait holds no lease but reserves its paths in first-come order: a direct `lock` or a later wait on an overlapping path conflicts with it and queues behind it, so a third agent cannot take a path as it frees. When every path frees, the runtime grants the lease and sends you an action-wake `Lease granted: <path> (lease N)` message. Keep the request that needs the lease pending meanwhile. `check_paths` reports leases only, not queued reservations.
`check_paths` reads overlap candidates without acquiring ownership.
`check_write` verifies concrete create/edit/delete paths and both sides of a rename.

## Presence and lease expiry

Presence and default leases last 60 seconds. Lease TTL ranges from 1 second to 10 minutes.
Managed MCP and managed workers renew presence and live leases about every 15 seconds.
Pi targets 15 seconds; idle backoff can delay a tick to about 25 seconds plus CLI latency.
Raw CLI agents maintain presence explicitly with `heartbeat {"renewLeases":true}` while working. Presence lasts 60s by default; pass `ttlMs` (60000–600000, the lease cap) to cover a long turn. `renewLeases` extends live leases to the same horizon.
A listener maintains presence and delivery; it does not promise lease renewal.
Renew before expiry. Renewal never revives an expired lease.
If identity expires, resume the same vendor identity and reacquire fresh leases.
`inbox wait` is read-only and never renews presence.
Heartbeat before a raw wait, then keep the wait shorter than remaining presence.
Use a maintained binding for longer waits.

## Request, progress, and final answer

`send_message` is an FYI by default (`replyRequired:false`, `wake:"passive"`). A request (a question or task you need answered) sets `replyRequired:true`, which wakes the recipient (`wake:"action"`) and needs an answer through `complete`. Final answers from `complete` wake the asker. A recipient cannot reply to an FYI: if you need an answer, ask again with `replyRequired:true`. A topic request wakes every subscriber, each owing an answer.
Action schedules handling within the recipient's authorized task; it grants no new objective or permissions.
A request (`replyRequired:true` or `wake:"action"`) that expires unacknowledged stops being offered for delivery. Submitted context may already have reached the recipient, and work may still be in progress; a late `complete` can acknowledge it and return the final answer. On your next `heartbeat` you receive an action-wake notice `Request N expired before <names> acknowledged it` (once per message, naming the unacknowledged recipients). Inspect `health` and the recipient before deciding whether to send a new request with a new key.

`Receive → retrieve full body → perform requested work → complete with outcome and reply → sender acknowledges answer`.

```sh
agent send_message '{"to":"api-reviewer","body":"Situation: src/api.ts changed the response type. Background: clients pin v2. Assessment: compatibility unverified. Request: review and list risks.","reasoning":"Resolve API review before handoff; done when risks are listed","key":"api-review-1","conversationId":"api-review"}'
agent inbox
agent fetch '{"incoming":true,"type":"message","limit":20}'
# Use data.messageId from fetch, after checking the requested work:
agent complete '{"message":MESSAGE_ID_FROM_DATA,"outcome":"done","reply":"Reviewed src/api.ts; no breaking change. Evidence: ..."}'
# Acknowledge handled FYIs and answers without creating another reply:
agent complete '{"messages":[FYI_ID,ANSWER_ID]}'
```

A fetched `{recordId:16,data:{messageId:1,...}}` completes with `message:1`, never `message:16`.
Progress, including a readback, uses a new send key, the same `conversationId`, and `replyRequired:false`; it neither completes the request nor sets `replyTo`.
Handled FYIs use `{message}` or `{messages:[...]}`; never reply to an FYI automatically.
`outcome` (done, partial, failed, refused, canceled) needs `message` and `reply`; the reply stays the exact answer and the stored `reasoning` starts with `Outcome: <value>`. Unfinished work or work that needs input stays pending.

## Intent, limits, and retries

`reasoning` is intent (purpose and done-when), up to 512 UTF-8 bytes; it is not private reasoning.
Message bodies allow 16,384 UTF-16 units. Put larger evidence in an immutable document.
Message `ttlMs` ranges from 1 second to 1 day.
A retry `key` identifies unchanged input. Preserve payload, routing, and branch when retrying.
Use a new key for changed content. `conversationId` connects progress and final replies.
If Pi reports a failed/timed-out send or record, retain its exposed retry key and inspect history; retry unchanged input with that key only when needed.
A committed write can produce a later error. A new tool-call ID creates a different automatic key.

## Topics and shared evidence

`subscribe {"topics":["api"]}` replaces subscriptions; `[]` clears them.
Send `{topic:"api",body,reasoning}` to current subscribers.
Use `notify_all` for current active peers, excluding the sender.
Topic and broadcast defaults are passive with no required reply.
Recipients are fixed at send time. Later joiners receive no old fanout.
`share_document` accepts up to 1 MiB UTF-8. Use `-` for large stdin JSON.
Names are immutable. Choose a new name for a revision; retain the name and verify read pages.
If migrated documents share a name, pass `read_document.workspace` to select the original worktree.
Use the returned continuation unchanged so later pages retain that origin.
Usage scopes are alternatives: do not sum overlapping request, turn, or cumulative counts.
Absent usage counts are unknown, not zero.

For all command forms, read [the command reference](COMMANDS.md).
For uncertain delivery or backups, read [operations](OPERATIONS.md).
