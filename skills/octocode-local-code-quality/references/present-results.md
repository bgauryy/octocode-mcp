# Present Results

Read `summary.md` first — it has everything needed for a top-level presentation. Only drill into feature JSONs for investigation.

---

## Summary Sections

Fixed order — read top-down, stop when enough:

1. **Scan Scope** — files, functions, flows, packages
2. **Findings Overview** — severity table + truncation/features-filter notices
3. **Health Scores** — 0-100 per pillar (Overall, Architecture, Code Quality, Dead Code) with letter grades
4. **Top Concern Tags** — searchable tags ranked by frequency (filter with `jq '.optimizationFindings[] | select(.tags | contains(["coupling"]))'`)
5. **Architecture Health** — dep graph metrics + all 19 categories with counts (0 = clean, `skipped` = filtered by `--features`/`--exclude`)
6. **Change Risk Hotspots** — top 15 riskiest files (riskScore, fanIn, fanOut, complexity, cycle/critical-path flags)
7. **Code Quality** — all 22 categories with counts
8. **Dead Code & Hygiene** — all 10 categories with counts
9. **Top Recommendations** — 10 highest-severity findings (diverse by default)
10. **Output Files** — table with sizes

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
