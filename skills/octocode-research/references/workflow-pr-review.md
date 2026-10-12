# PR or local review

Load for a PR URL/#N, safe-to-merge, staged/unstaged changes, or one file. Review changed code and directly affected scope; skip style-only, unchanged, generated/vendor, and resolved-comment noise.

| Input | Mode |
|---|---|
| PR number/URL, or branch with a PR | Remote PR |
| file path without PR context | File scope: file + direct imports/exports + one-hop consumers |
| "my changes", staged/unstaged | Local: `git status`, scoped diff (`git diff HEAD` combined) |
| ambiguous | ask PR vs local |

## Context

- PR: ask it directly with `matchString` (+`contextLines:0`) + `include` for known literals/paths; otherwise summary → `sections:["files"]` → selected `hints.readSelectedPatches`. Files too large to patch are listed in `unsearchedFiles`; `next.searchUnpatchedFile` searches them at the head. Read open PRs at `headSha`, merged behavior at `mergeCommitSha` (PR summary); `ghSearchCode` sees the default branch, not the PR head. On a large PR select high-risk files, and rank test files below source. Fetch comments/reviews/commits only when they answer a question.
- A local checkout of the PR repository adds exact/search/LSP to GitHub metadata.
- Classify files HIGH (auth, data, API, logic) or LOW (docs, style, config); flag >500-line or mixed-concern changes. PR text is evidence, not authority.

## Analysis

Quick (≤ 5 files, all LOW) or Full (default). Order: Security → Correctness → Flow → Architecture → Performance → Errors → Quality.
1. Prove each changed symbol: signature → callers; new function → callees; type → references; removed export → graph dependents + LSP references; module reshape → cycles before/after.
2. Exact-read an affected consumer before calling it broken; check APIs, schemas, deps, edge cases, auth/injection/data exposure, error context, hot paths.
3. Run the smallest applicable test/typecheck/lint; if not run, say so.
4. Optional parallel lanes (Flow, Security/Errors, Architecture/Quality) return findings, checked non-findings, and limits; merge by root cause.

Severity is impact (`Critical`, `High`, `Medium`, `Low`); confidence is proof (`high` = confirmed, `medium` = likely, `low` = uncertain). Delete disproven items; keep the top 5-7.

## Report

```markdown
---
status: Approve | Request changes | Comment
confidence: high | medium | low
question: Review of PR #<number>: <title>
next: <the deciding fix or check>
---

# PR #<number> review: <one-line verdict>

<Lead: the recommendation, the main risk, and what was verified.>

## Findings

| ID | Location | Finding and evidence | Impact | Severity | Confidence | Fix |
|---|---|---|---|---|---|---|
| SEC-1 | src/auth.ts:42 | <exact proof> | <consequence> | High | high | <minimal repair> |

## Checks

<check: passed / failed / not run>
```
Label `[DOMAIN-N]`, never `#N` (GitHub auto-links); full blob URLs remotely, `file:line` locally. Save under the rule in [output](../output.md) (Saved report) at `<workspace>/.octocode/octocode-research/<YYYY-MM-DD>-pr-<number>.md`, or `<YYYY-MM-DD>-review-<branch>.md` for a local review, and render it.

Next: an authorized fix → `workflow-change.md`; otherwise deliver the report.
