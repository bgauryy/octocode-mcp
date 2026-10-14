Load when measuring whether a host loads the right skill.

## Build the request sets

- A measured claim needs host runs; description-only routing (a model picks from names and descriptions) only shows whether descriptions separate skills, and scores far higher.
- Write requests before editing any description: implicit intent, missing details ("why is this page slow?" with no URL), near-misses owned by a neighbor skill, requests that need no skill.
- Tuning set inspected while editing; held-out set written before tuning results open, run once on final descriptions.
- Run from a small representative project, not an empty folder.

## Run through the host

```bash
claude -p "<request>" --model <model> --output-format stream-json --verbose --max-turns 8 --allowedTools Skill
```

- Run each request headless, in parallel; record the first `Skill` tool call (`input.skill`) or none, plus host version, model, and cost.

## Score

| Outcome | Counts as |
|---|---|
| The expected skill loads first | correct |
| Another skill loads | wrong route; name the winner |
| No skill loads: the agent answers, asks a clarifying question, or works with other tools | miss |
| A skill loads for a no-skill request | false trigger |

- Report correct, misses, wrong routes, and false triggers per set, with run counts.
- Repeat runs before claiming a few-point difference.

## When skills under-trigger

- Misses outnumbering wrong routes mean the agent used its own tools; fix the description via `octocode-skills`.
- Retest on the held-out set; check no-skill requests for new false triggers.
