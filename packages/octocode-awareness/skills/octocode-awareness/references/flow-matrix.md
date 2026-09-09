# Shared Awareness Flow

Use the live schema for exact flags: `schema commands --compact` and
`schema command <noun> [action]`. Reads are observational; mutations require
the caller's existing authorization and scope.

| Need | Routine route | Boundary |
|---|---|---|
| Orient | `attend` or targeted `status`/`query` | Read only what can change the next action. |
| Coordinate | `agent list`, `signal list/publish/reply` | Send only a decision-changing question, request, blocker, or handoff. |
| Continue unfinished work | `handoff add`, `handoff list`, `handoff clear` | Keep one concise summary and file pointers; clear only after acting. |
| Plan/protect | `task ready/claim`, `work list/show`, `lock acquire/wait` | Plans and locks are opt in; presence is advisory. |
| Finish tracked work | `task submit/release`, `work end`, `verify audit`, `verify mark` | Run the declared check; only an observed receipt proves success. |
| Learn | `memory recall/record`, `reflect record` | Record reusable verified lessons, not routine status. |

Specialist routes remain available by exact schema/help lookup: refinements are
owned follow-up records, `session capture` is hook-driven, and reflection is
optional challenge or learning. They are not prerequisites for an ordinary
request or a routine continuation.
