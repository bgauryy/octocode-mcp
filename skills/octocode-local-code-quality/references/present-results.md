# Present Results

Read `summary.md` first — it has everything needed for a top-level presentation. Only drill into feature JSONs for investigation.

---

## Summary Sections

Fixed order — read top-down, stop when enough:

1. **Scan Scope** — files, functions, flows, dependency files, packages
2. **Findings Overview** — severity table + truncation notice + features-filter / scope / semantic notices
3. **Health Scores** — 0-100 per pillar (Overall, Architecture, Code Quality, Dead Code) with letter grades (A-F)
4. **Top Concern Tags** — searchable tags ranked by frequency, top 12 (filter `findings.json` with `jq '.optimizationFindings[] | select(.tags | contains(["coupling"]))'`)
5. **Architecture Health** — dep graph metrics (modules, edges, cycles, critical paths, roots, leaves, test-only, unresolved) + all 19 categories with counts (0 = clean, `skipped` = filtered)
6. **Change Risk Hotspots** — top 15 riskiest files (riskScore, fanIn, fanOut, complexity, exports, cycle/critical-path flags)
7. **Code Quality** — all 22 categories with counts
8. **Dead Code & Hygiene** — all 10 categories with counts
9. **Top Recommendations** — 10 highest-severity findings (diverse by `--max-recs-per-category`)
10. **AST Trees** *(conditional — only when tree output enabled)* — format guide + grep commands for navigation
11. **Output Files** — table with file names, sizes, descriptions
12. **Parse Errors** *(conditional — only when files failed to parse)* — up to 10 parse failures with file + message

---

## Presentation Template

```markdown
## Scan Summary
- **Scope**: <n> files, <n> functions, <n> flows, <n> dependency edges
- **Health**: Overall <n>/100 (grade) | Architecture <n>/100 | Quality <n>/100 | Hygiene <n>/100
- **Findings**: <n> total — <n> critical, <n> high, <n> medium, <n> low
- **Top Tags**: `coupling` (<n>), `dead-code` (<n>), `complexity` (<n>)

## Top Findings (by severity)
### Critical
- `<file>:<line>` — <title> — <reason>
### High
- `<file>:<line>` — <title> — <reason>

## Next Step
Which findings should I investigate first?
```

Severity order: `critical` > `high` > `medium` > `low` > `info`.
