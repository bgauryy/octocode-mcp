# Packets

Load when writing worker briefs or parsing returns. Check the host's context inheritance and provide what the worker lacks.

## Request (required)
- `goal` — one bounded objective
- `context` — decisive facts + exact anchors only
- `scope` — include / exclude / tools / stop
- `authority` — allowed effects, approval gates, and explicit prohibitions; workers cannot widen parent authority
- `budget` — worker and graph time/token/tool-call cap plus replan threshold
- `ownership` — **manager-as-tool** (parent keeps user) vs **handoff** (specialist owns next turns + return/terminal rule). Writes need disjoint paths + verify cmd
- `acceptance` — observable done criteria
- `return` — required shape (structured prefixes or schema OK)

## Result (required)
- `status` — `complete` | `partial` | `blocked`
- `result` — conclusion; no transcript
- `evidence` — ≤8 decisive anchors (`path:line`, URL, cmd, artifact)
- `verification` — check + outcome, or why not
- `confidence` — confirmed | likely | uncertain + gaps
- `next` — next action or `none`

Re-ask only when a missing return field prevents verification or the next action. Accept an equivalent clear result; do not repeat work solely to enforce a prose template.

## Message kinds
`request` · `question` · `status` · `result` · `blocker` · `approval-needed` · `cancel`

Map remote A2A `input-required` / `auth-required` to parent/user gates — do not auto-continue.

## Token / handoff filter
Pass goal, anchors, scope, acceptance, return shape. Strip transcripts, tool chatter, and unpaired tool history. Prefer a short summary over full worker history on handoff.
Give verifier workers the artifact, anchors, and acceptance contract—not the executor's reasoning transcript.

## Optional technique fields
- Rubber duck / interview / mimic → see `references/techniques.md` (`playbook`, `mimic`, interviewer `claim_table`, duck `questions`).

Next: `references/coordinate.md` · `references/synthesize.md` · `references/a2a.md` · `references/mimic-flow.md`.
