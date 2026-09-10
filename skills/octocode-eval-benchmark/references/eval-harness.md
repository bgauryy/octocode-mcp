# Eval Harness
Load when adding or extending machine-checkable suites in this monorepo. Why: deterministic floors beat prose claims.

## Octocode pattern
```text
evals/cases.json          # tasks + required/forbidden + optional binaryQuestions
evals/kpi-contract.json   # optional: goal, primary, guardrails, decision rule (rich suites)
evals/fixtures/           # optional: inputs for live/script runners
scripts/eval-*.mjs        # grader: patterns, citations, self-test, live invokes
```
Worked example — this folder's own suite: `evals/cases.json` + `evals/trigger-cases.json` + `evals/kpi-contract.json`, graded by `scripts/eval-skill.mjs`.

## Case shape (minimum)
- `id`, `prompt` or mode, `minScore`
- `required[]` / `forbidden[]` with named regex checks
- Optional `binaryQuestions[]`: `id`, `dimension`, `question`, `passPattern`, `failureSignature`, `suggestedLesson`
- Optional `--agentic` path: emit advisory questions without changing pass/fail
- Optional live/script kinds (local-worker style): `kind`, `cmd`/`model`/`grade`, `heldOut`

## Rules
1. Cases come from **real failures** and manual release checks (20–50 is enough to start). Write the failing case **before** the subject patch (TDD).
2. Two experts must agree on pass/fail; include a **reference solution** that passes.
3. Do not edit cases to make a bad change pass — fix the subject or discard.
4. Keep CI floor deterministic; put semantic/LLM layers above it as advisory or calibrated judges.
5. Isolate trials; same command for baseline and candidate.
6. Run artifacts → `.octocode/` (temp). Keep `evals/` suite files permanent.

For tool-calling evals, export input schemas so defaulted fields stay optional;
use the actual host envelope. Grade tool choice, semantic arguments, schema and
transport validity, and runtime completion separately. Include negative grader
tests for wrong scope/ref, irrelevant search terms, and unnecessary calls. Freeze
the executable validator and model/runtime identity alongside prompts and cases.
Report sensor failures separately. Native calls, JSON emulation, first attempts,
and repair attempts are distinct measurements; give repairs actual errors without
reference answers. A revised grader starts a new version and preserves old results.
Verify the rendered prompt fits the host's actual context window. Prefer disabling
silent truncation; otherwise check scoped server diagnostics. Request options,
raw schema bytes, and post-truncation token counters alone do not prove fidelity.

## This skill’s scripts
- `scripts/eval-skill.mjs` — grade answers for this skill’s cases (`--case <id>`, `--batch <dir>` for one-command answer-set grading, `--self-test`)
- `scripts/loop-report.mjs` — structural check that a loop report is complete

Next: held-out split → `held-out-and-guards.md`; close improve cycle → `improve-loop.md`.
