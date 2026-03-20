# Present Results

Read `summary.md` first — it has everything needed for a top-level presentation. Only drill into feature JSONs for investigation.

For confidence tiers and how to label findings, see the **Confidence Tiers** table in [SKILL.md](../SKILL.md).

---

## Summary Sections

Fixed order — read top-down, stop when enough:

1. **Scan Scope** — files, functions, flows, dependency files, packages
2. **Findings Overview** — severity table + truncation notice + features-filter / scope / semantic notices
3. **Health Scores** — 0-100 per pillar (Overall, Architecture, Code Quality, Dead Code, and conditionally Security, Test Quality) with letter grades (A-F)
4. **Top Concern Tags** — searchable tags ranked by frequency, top 12 (filter `findings.json` with `jq '.optimizationFindings[] | select(.tags | contains(["coupling"]))'`)
5. **Analysis Signals** — strongest graph signal, strongest AST signal, combined interpretation, confidence, recommended validation
6. **Architecture Health** — dep graph metrics (modules, edges, cycles, critical paths, roots, leaves, test-only, unresolved) + all architecture categories with counts (0 = clean, `skipped` = filtered)
7. **Change Risk Hotspots** — top 15 riskiest files (riskScore, fanIn, fanOut, complexity, exports, cycle/critical-path flags)
8. **Code Quality** — all code-quality categories with counts
9. **Dead Code & Hygiene** — all dead-code categories with counts
10. **Security** *(conditional — only when security findings exist)* — all security categories with counts
11. **Test Quality** *(conditional — only when test quality findings exist)* — all test-quality categories with counts
12. **Top Recommendations** — 10 highest-severity findings (diverse by `--max-recs-per-category`)
13. **AST Trees** *(conditional — only when tree output enabled)* — format guide + grep commands for navigation
14. **Output Files** — table with file names, sizes, descriptions
15. **Parse Errors** *(conditional — only when files failed to parse)* — up to 10 parse failures with file + message

---

## Decision Heuristics

The summary is not just a list of findings. Use it to choose the right investigation path.

When the summary is ambiguous:

- rerun with `--graph --graph-advanced` if the question is about cycles, chokepoints, package chatter, or startup risk
- rerun with `--flow` if the question is about validation paths, cleanup behavior, or path-sensitive evidence
- if graph and AST signals conflict, present that conflict and recommend a hybrid investigation instead of forcing one explanation

### Graph-first signals

Use graph-first language when the summary shows:

- non-trivial `dependency-cycle` counts
- multiple `criticalPaths`
- high-risk entries in **Change Risk Hotspots**
- `layer-violation`, `inferred-layer-violation`, or `distance-from-main-sequence`
- `import-side-effect-risk` on high fan-in modules

Good phrases:

- "The architecture risk is concentrated around a small set of chokepoint modules."
- "The dependency graph suggests a boundary leak between layers."
- "The import graph shows startup risk because a high fan-in module performs work at import time."

### AST-first signals

Use AST-first language when the summary shows:

- `low-cohesion` paired with `feature-envy`
- duplicate flow or similar-function findings
- large top-level side effects in `file-inventory.json`
- structurally repeated orchestration or control-flow complexity

Good phrases:

- "The code shape suggests this module is doing multiple unrelated jobs."
- "The repeated control-flow structure suggests orchestration duplication rather than an isolated bug."
- "The AST evidence points to hidden initialization logic at module scope."

### Combined signals

Escalate when graph and AST signals align:

- `critical-path` + `low-maintainability`
- `feature-envy` + `layer-violation`
- `import-side-effect-risk` + high `fanIn`
- `low-cohesion` + many exports + disjoint consumers

When they align, say so explicitly. That helps the user prioritize architectural work over local cleanup.

---

## Presentation Template

```markdown
## Scan Summary
- **Scope**: <n> files, <n> functions, <n> flows, <n> dependency edges
- **Health**: Overall <n>/100 (grade) | Architecture <n>/100 | Quality <n>/100 | Hygiene <n>/100
- **Findings**: <n> total — <n> critical, <n> high, <n> medium, <n> low
- **Top Tags**: `coupling` (<n>), `dead-code` (<n>), `complexity` (<n>)
- **Graph Signal**: <highest-signal graph interpretation backed by summary/architecture.json>
- **AST Signal**: <highest-signal structural interpretation backed by findings/file-inventory>
- **Combined Interpretation**: <how the graph and AST signals align or conflict>
- **Confidence**: <high|medium|low>
- **Recommended Validation**: <next Octocode local-tool step>

## Top Findings (by severity)
### Critical
- `<file>:<line>` — <title> — <reason>
### High
- `<file>:<line>` — <title> — <reason>

## Next Step
Which findings should I investigate first?
```

Severity order: `critical` > `high` > `medium` > `low` > `info`.

---

## Example Output

A condensed real scan result for reference:

```markdown
## Scan Summary
- **Scope**: 47 files, 312 functions, 89 flows, 186 dependency edges across 1 package
- **Health**: Overall 61/100 (D) | Architecture 54/100 | Quality 72/100 | Hygiene 58/100
- **Findings**: 83 total — 2 critical, 14 high, 41 medium, 26 low (capped to 50 by --findings-limit)
- **Top Tags**: `coupling` (12), `dead-code` (9), `complexity` (8), `change-risk` (6), `duplication` (5)

## Top Findings (by severity)
### Critical
- `src/tools/toolsManager.ts:45` — Critical dependency chain risk: 27 files — Break chain at `src/providers/factory.ts` (fan-out: 12, fan-in: 8) *(dependency-critical-path)*
- `src/server.ts:12` — Dependency cycle detected (4 node cycle) — src/server.ts -> src/session.ts -> src/config.ts -> src/server.ts *(dependency-cycle)*

### High
- `src/utils/helpers.ts:1` — 6 unused exports — Exported symbols have no observed import usage *(dead-export)*
- `src/providers/github.ts:89` — Potential function refactor: fetchWithRetries — Cyclomatic-like complexity is high (>=30). Branch depth is very deep. *(function-optimization)*
- `src/tools/localSearch.ts:142` — Input passthrough without validation — Parameter `query` flows to child_process.spawn without sanitization *(input-passthrough-risk)*

## Next Step
Which findings should I investigate first?
```
