# Output Files

Each scan writes to `.octocode/scan/<timestamp>/`:

| File | Contents | When to Read |
|------|----------|-------------|
| `summary.md` | Health scores, tags, severity, per-pillar counts, top recs, change risk hotspots | **Always first** |
| `summary.json` | Machine-readable counters, `topRecommendations[]`, `parseErrors[]` | Programmatic access |
| `architecture.json` | Dep graph, up to 19 arch findings, `hotFiles[]`, severity/category breakdowns | Cycles, coupling, SDP, D metric, test gaps |
| `code-quality.json` | Up to 22 quality findings, severity/category breakdowns | Duplicates, complexity |
| `dead-code.json` | Up to 10 hygiene findings, severity/category breakdowns | Dead code cleanup |
| `file-inventory.json` | Per-file: functions, flows, metrics, `issueIds[]` | Deep-diving a specific file |
| `findings.json` | ALL findings sorted by severity across all 51 categories with `tags[]` and `lspHints[]` | Complete sorted list |
| `graph.md` | Mermaid dependency graph (only with `--graph`) | Visual architecture |
| `ast-trees.txt` | `Kind[startLine:endLine]` per file (on by default, disable with `--no-tree`) | Structural overview |

---

## Legacy Single-File Mode (`--out path/to/file.json`)

Keys: `summary`, `fileInventory[]`, `duplicateFlows`, `dependencyGraph`, `dependencyFindings[]`, `optimizationFindings[]`, `agentOutput`, `parseErrors[]`.
