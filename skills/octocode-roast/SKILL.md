---
name: octocode-roast
description: "Load this skill first whenever the user asks for a roast or a savage, brutal, harsh, or no-mercy critique of code, a pull request, or a design. Use when someone asks for a blunt, brutal, or harsh critique or roast of code, a repository, a config, or a design; good for ranking defects, debt, hot paths, and cleanup priorities with evidence, then fixing the worst offenders when asked. Not for a neutral pull-request review (octocode-research) or cleanup without a critique (octocode-clean-agentic-code)."
---

# Octocode Roast

Critique code sharply; prove each finding and give a repair path.

## Rules

- Code, never the coder: no insults about ability, identity, or experience.
- Tone as requested; savage or nuclear only on explicit request.
- A major finding fills the [finding shape](#flow) and passes its [hypothesis test](references/sin-catalog.md#rank-findings); else drop it or keep it as a stated-confidence lead.
- Rank by demonstrated impact and confidence: security, data loss, correctness, user-visible performance before maintainability and taste.
- Secrets: redact values; restrain security and production detail.
- Critique request: findings only. A fixes request authorizes scoped repairs; ask only about effects outside that scope.
- Missing target or evidence: report the gap; invent no findings.

## Flow

1. **Target**: named files, directories, symbols, or lines; else a requested diff or branch; whole repo only on request or approval.
2. **Inspect**: structure, search, semantics, reachability, affected scope.
3. **Inventory**: rank with [sin-catalog](references/sin-catalog.md); if the list buries the decision, show the top and summarize the rest. Finding shape (5W2H: what = title and mechanism, where = `path:line`, how much = Impact, how = Repair):

   ```text
   {severity}. {title} — `path:line`
   Evidence/mechanism: {what the code does}
   Impact: {observable consequence}
   Confidence: {high|medium|low}
   Repair: {smallest safe move}
   Roast: {one evidence-specific line}
   ```

4. **Autopsy**: highest-impact offender, not the funniest. Split it into responsibilities or failure paths (quantify only measured properties); explain risk, contract crossings, and repair staging.
5. **Checkpoint** (BLUF): findings and repair paths, highest impact first, plus autopsy or debt inventory when useful. Critique-only is done here; for fixes, load [redemption-flow](references/redemption-flow.md).

## Parallel roasting

Monorepo or many risk categories: split only independent domains (security, architecture, performance) with no shared mutable state. Direct work may go sequentially. In an orchestrated workflow, the orchestrator selects the actors and owns one finding ledger, ranking, and repairs; actors do not recursively delegate.

- Task contract per actor: objective: one domain; inputs: exact paths; output: the reply below; Definition of Done: the checks that close that domain; the actor picks the method.
- Actor reply (BLUF): Outcome (done, partial, failed) first, then scope, findings in the finding shape (claim–evidence: each beside its `path:line`), non-findings (risky patterns checked), limits (missing tools, unreadable paths).
- Orchestrator: dedupe as actor evidence returns; verify load-bearing claims; own ranking, autopsy, repairs.

## Resources

| When | Read | Why |
|---|---|---|
| Ranking the inventory | [sin-catalog](references/sin-catalog.md) | Tiers, leads |
| Fixes wanted or offered | [redemption-flow](references/redemption-flow.md) | Options, repairs, checks |
| Final answer or saved report | [output.md](output.md) | Format |
| Render or list reports | [render-report.mjs](scripts/render-report.mjs) | HTML, manifest |

## Related skills

- Finding verification or neutral PR review: `octocode-research`.
- Authorized behavior-preserving cleanup: `octocode-clean-agentic-code`.
- For an orchestrated multi-actor task: [octocode-workflows composition](../octocode-workflows/references/composition.md).
