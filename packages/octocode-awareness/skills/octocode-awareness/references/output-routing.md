# Awareness output routing

Load when choosing between a live answer, shared coordination state, and an export. Keep one owner for each fact and avoid recording routine tool output in several places.

| Need | Destination |
|---|---|
| Current answer or transient explanation | The conversation |
| A peer question, blocker, decision, or handoff | A targeted signal; reply to an existing thread when applicable |
| Shared ownership or verification already being tracked | The existing work, plan, task, or verification record |
| Verified learning that can change future work | One scoped memory or reflection with evidence |
| A requested report or export | Its authorized destination; keep workspace artifacts under the workspace `.octocode/` |

The Awareness SQLite database owns shared coordination state. An export is a read-only view, not another source of truth. Preserve the host's stable identity, database, and workspace bindings.

Discover only the command needed for the next decision. Follow returned continuations and inspect actual result status; omitted fields, acknowledgement, and process completion do not establish that work succeeded. Apply the tracking and verification rules in `SKILL.md` when tracking is in use.

Do not create rows, summaries, or exports merely to close a turn. Return to the main skill flow after recording the information that changes the next action.
