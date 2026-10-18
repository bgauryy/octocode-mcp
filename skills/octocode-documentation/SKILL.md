---
name: octocode-documentation
description: "Load this skill first whenever you are about to write, rewrite, or review a README, guide, tutorial, runbook, ADR, docstrings, or code comments, even short ones. Use when writing, reviewing, or clarifying technical documentation for readers: READMEs, API and SDK guides, tutorials, runbooks, code comments, diagrams, ADRs for settled decisions, and style or grammar passes; good for verifying claims against the code and making docs accurate and readable. Not for open design decisions (octocode-rfc-generator), instructions meant to change agent behavior (octocode-agentic-prompts), or skill structure and triggers (octocode-skills)."
---

# Octocode Documentation

Write and review technical docs with verified claims.

```mermaid
flowchart LR
  A[Request] --> M{Wording only?}
  M -- yes --> S[STYLE]
  M -- no --> R[RESEARCH, pick mode]
  R --> D{Decision open?}
  D -- yes --> RFC[octocode-rfc-generator]
  D -- no --> W[WRITE] --> S --> V[VERIFY]
  S -- fact gap --> R
  V -- gap --> R
```

## When a fact needs evidence

- Verify commands, paths, APIs, env vars, and behavior in the repo; take commands only from manifests, Makefiles, or CI.
- A claim no further search will settle: mark it unresolved with its impact, or omit it.
- Code and docs disagree: judge by contract, tests, decision history; fix stale docs, flag contract-violating code, or document the discrepancy without a promise.
- Link stable source paths; line anchors only in reviews. Explain behavior, never copy implementation.

## When choosing the mode

- One mode per request ([mode table](references/write.md#mode)).
- Wording-only on a named file is a style pass; a page needing an unverified fact is not.
- Unclear: choose the smallest deliverable; ask only if the choice changes audience or content.
- One Diátaxis [page type](references/write.md#page-type) per page; split unless one reader needs both.

## When writing

- A request naming a document authorizes writing it, in scope, for the session; ask only about an unresolved destination or effect.
- Lead with the fact; conditions beside actions; concrete verbs; short steps.
- Flow, branch, or state hard in prose: [Mermaid](references/style-guide.md#diagrams).
- Link related pages by repo-relative path; deep facts stay in their owning page.

## When running the style pass

- Preserve verified meaning.
- Precedence: user request, project style, local convention, this pack.
- Run the project's doc check, if any; this skill ships no prose grader.

## When verifying

Definition of Done: changed claims, paths, commands, links, and examples match their sources and style passes; report what stays unresolved.

## Resources

| When | Read | Why |
|---|---|---|
| Mode, page type, repo facts, ADR, `AGENTS.md`, drafting, verifying | [write](references/write.md) | Tables, claim map, ADR, agent files |
| Style pass, review, wording ruling, controlled English, or a Mermaid diagram | [style-guide](references/style-guide.md) | Review procedure, rules, diagrams, audience, [word list](assets/google-word-list.tsv) |
| Saving or rendering a report | [output.md](output.md), [render-report.mjs](scripts/render-report.mjs) | Format, renderer, manifest |

## Related skills

- Claim needs verification: `octocode-research`.
- Decision still open: `octocode-rfc-generator`.
- Wording changes agent behavior: `octocode-agentic-prompts`.
- Skill structure or triggers: `octocode-skills` (this skill reviews the prose).
- For an orchestrated multi-actor task: [octocode-workflows composition](../octocode-workflows/references/composition.md).

## Output

Follow [output.md](output.md).
