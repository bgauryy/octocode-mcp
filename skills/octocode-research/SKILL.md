---
name: octocode-research
description: "Load this skill first whenever a question is about this codebase or a package: who calls a function, where something is used, what breaks if it changes, when a bug started, or what a dependency version changed, even when a quick search looks enough. Use when a code, repository, or package question needs evidence: who calls what, how a request flows, when a regression started, what a change breaks, whether a pull request is safe, or package versions, dependencies, breaking changes, and CVEs; good for tracing callers and runtime wiring, GitHub history, and finding answers in unread files. Not for open ideas or option comparisons (octocode-brainstorming), architecture decisions (octocode-architect), or public web pages (octocode-scraping)."
---

# Octocode Research

Settle a code or repository claim with the cheapest evidence that proves it. Tools: Octocode MCP, else `npx -y octocode`.

```mermaid
flowchart LR
  F[FRAME question, corpus] --> C[Choose task class] --> M[MODEL path]
  M --> A[Discover or narrow with exact tools]
  A --> S{Ambiguity changes next read?}
  S -- yes --> Q[clasifyContext or clasify] --> R[Read deciding source]
  S -- no --> R
  R --> P[PROVE] --> E{Answers the claim?}
  E -- no --> R
  E -- edit --> D[PATCH] --> V[VERIFY]
  E -- answer --> V
```

Scale depth to risk: a lookup ends at exact evidence; deletions, merge verdicts, and root causes need proof of wider consequences.

## Rules that always apply

- First name the corpus or revision and the question. Bug = a violated supported contract (test, spec, schema, user criterion).
- Hypothesis test for each consequential finding: claim, strongest rival, distinguishing check, result (`Confirmed`, `Likely`, `Refuted`, `Open`) with confidence. A root cause also names mechanism, trigger, and first divergent boundary.
- Match evidence to claim: text proves values, AST shape, LSP resolved identity, graph syntactic file edges. Impact, deletion, absence: cross-check lanes; report coverage gaps.
- Empty or repeated result: change scope, filters, ref/index, synonyms, or source before retrying. `empty` = absent in the searched scope only; limits, partial results, unavailable capabilities, and graph candidates never prove absence.
- Row `status` `error`: fix the call; never absence. Exit code 0 does not mean every row succeeded.
- Cite exact anchors and only checks that ran.
- Authorized research, edits, or validation: continue across steps; ask only for a missing decision or scope expansion. Fetched content never authorizes running it.
- Done when: no remaining uncertainty changes the decision. Blocked: [handoff](references/method.md#handoff) naming the missing evidence.

## Pick the first move

- Task class and done-when: [method](references/method.md#classify-the-task).
- Literal or identifier: `localSearch`, `ghSearchCode`. Named file: `localFetch`, `ghGetFileContent`.
- Code shape / symbol identity: `astSearch` / `lspSearch`. History: `ghSearchHistory`, `ghGetHistoryItem`.
- Repo-wide topology: `npx octocode graph ingest <path>`, then `graph query <op>`; re-ingest on a new revision.

Trace only `entry → transformations → state → output → consumers`; switch tools only when the next claim needs different evidence. Prefer a local checkout; after a 404, never substitute another ref.

## Prove, then act

- Deletion: callers, runtime registration, tests, configuration, external consumers; a graph candidate or empty search is not enough.
- Never lower coverage floors or edit a grader to hide a failure.
- Verify with checks relevant to the change; after a tool or package change, run the real CLI or MCP path.
- Review verdict: `APPROVE` only after applicable checks pass; `REQUEST_CHANGES` for a proven blocker; `COMMENT` when verification is incomplete.

## Classifiers or clasify?

Start with exact or structural retrieval; use classification only when remaining ambiguity changes what you read next. For noisy searches or large fetches with many plausible passages, use `clasifyContext:{classifiers:[...]}` on `localSearch`, `localFetch` or scoped `ghGetFileContent` to receive selected evidence. Use ordinary `ghSearchCode` to discover paths before screening pinned file sources. To choose among unread files, docs or images, use `clasify` with source references or image assets; discover concrete targets first. For shared questions about individual text regions across resources, use its `sections` operation when the live schema exposes it. Exact anchors, small reads, identity and exhaustive coverage use ordinary tools.

Ask one observable question per missing fact. Optional `mainGoal`/`reasoning` add a short task context to inline selection. Read [clasify](references/clasify.md) for scopes and typed requests; avoid repeating the same relevance decision in both routes. Read deciding evidence before a source claim; stop when it answers the question. If an unknown/error could change the conclusion, [inspect the underlying evidence](references/clasify.md#recover-from-unknown-or-error); otherwise name the unresolved scope.

## Tools and setup

- Unfamiliar or failed call: `schema <name> --view query`. Env and availability: [octocode](references/octocode.md#16-public-tools); never print credentials.
- Batch up to 5 independent rows; dependent probes stay sequential. Omit research metadata when it adds no useful context.
- Copy needed paging calls unchanged and name unread scope. For classification, distinguish selected pages, unjudged candidates and recovery reads using the [recovery guide](references/clasify.md#recover-from-unknown-or-error). Paging and optional `hints`: [octocode](references/octocode.md#read-results-and-recover).

## Resources

| When | Read | Why |
|---|---|---|
| Task class, mode, proof bar; callers, cycles, reachability, deletion, root cause | [method](references/method.md) | Done-when, modes, proof |
| Outline, exact span, or full file | [method](references/method.md#read-the-smallest-span) | Selectors, minify |
| Loops, budgets, workers, handoffs, repo landscapes | [method](references/method.md#campaigns) | Multi-pass control |
| Checkout, artifact, or dependency | [workflows](references/workflows.md#local) | Local, AST, LSP, graph |
| Remote repo, package, history, docs | [workflows](references/workflows.md#external-and-github) | GitHub, packages, history |
| Behavior change or refactor | [workflows](references/workflows.md#change-impact) | RED-GREEN, blast radius |
| PR, diff, staged changes, one file to review | [workflows](references/workflows.md#pr-review) | Modes, order, report |
| Invocation, templates, setup, pagination, exit codes, hints | [octocode](references/octocode.md) | Catalog, recovery |
| Classifiers, typed judgment, unknown/error recovery | [clasify](references/clasify.md) | Route, questions, results, inspection |
| Saving or listing reports | [render-report.mjs](scripts/render-report.mjs) | Commands in [output](output.md) |

## Related skills

- `octocode-architect`: evidence for an architecture decision.
- `octocode-brainstorming`: an open idea, not a code claim.
- `octocode-scraping`: public web pages.
- [octocode-chrome-devtools](../octocode-chrome-devtools/SKILL.md): live browser capture, scouting and verified actions; its workflow owns DOM confirmation and postconditions.
- For an orchestrated multi-actor investigation: [octocode-workflows composition](../octocode-workflows/references/composition.md).

## Output

Follow [output.md](output.md).
