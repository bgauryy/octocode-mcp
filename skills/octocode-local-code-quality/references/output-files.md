# Output Files

Each scan writes to `.octocode/scan/<timestamp>/`:

| File | Contents | When to Read |
|------|----------|-------------|
| `summary.md` | Health scores, tags, severity, per-pillar counts, top recs, change risk hotspots | **Always first** |
| `summary.json` | Machine-readable scan metadata, `agentOutput`, `parseErrors[]` | Programmatic access |
| `architecture.json` | Dep graph, up to 19 arch findings, `hotFiles[]`, severity/category breakdowns | Cycles, coupling, SDP, D metric, test gaps |
| `code-quality.json` | Up to 22 quality findings, severity/category breakdowns | Duplicates, complexity |
| `dead-code.json` | Up to 10 hygiene findings, severity/category breakdowns | Dead code cleanup |
| `file-inventory.json` | Per-file: functions, flows, metrics, `issueIds[]` | Deep-diving a specific file |
| `findings.json` | ALL findings sorted by severity across all 51 categories with `tags[]` and `lspHints[]` | Complete sorted list |
| `ast-trees.txt` | `Kind[startLine:endLine]` per file (on by default, disable with `--no-tree`) | Structural overview |
| `graph.md` | Mermaid dependency graph (only with `--graph`) | Visual architecture |

---

## JSON Key Reference

### `summary.json`

```
generatedAt, repoRoot, options, parser,
summary { totalPackages, totalFiles, totalNodes, totalFunctions, totalFlows, totalDependencyFiles, byPackage },
agentOutput { totalFindings, highPriority, mediumPriority, lowPriority,
              topRecommendations[] { id, file, severity, category, title, reason, suggestedFix },
              filesWithIssues[] { file, issueCount, issueIds } },
parseErrors[] { file, message },
outputFiles { summary, architecture, codeQuality, deadCode, fileInventory, findings, ... }
```

### `findings.json`

```
generatedAt,
optimizationFindings[] { id, severity, category, file, lineStart, lineEnd, title, reason,
                         files[], suggestedFix { strategy, steps[] }, tags[], lspHints[] },
totalFindings
```

Filter: `jq '.optimizationFindings[] | select(.tags | contains(["coupling"]))' findings.json`

### `architecture.json`

```
generatedAt, dependencyGraph { totalModules, totalEdges, cycles[], criticalPaths[], ... },
dependencyFindings[], findings[], findingsCount,
severityBreakdown { critical, high, medium, low },
categoryBreakdown { "dependency-cycle": N, ... },
hotFiles[] { file, riskScore, fanIn, fanOut, complexityScore, exportCount, inCycle, onCriticalPath }
```

### `code-quality.json`

```
generatedAt, duplicateFlows { duplicateFunctions[], redundantFlows[] },
optimizationOpportunities[] { type, message, file, lineStart, lineEnd, details },
findings[], findingsCount, severityBreakdown, categoryBreakdown
```

### `dead-code.json`

```
generatedAt, findings[], findingsCount, severityBreakdown, categoryBreakdown
```

### `file-inventory.json`

```
generatedAt, fileCount,
fileInventory[] { package, file, parseEngine, nodeCount, kindCounts,
                  functions[] { name, lineStart, lineEnd, complexity, cognitiveComplexity, ... },
                  flows[], dependencyProfile { internalDependencies[], externalDependencies[],
                  declaredExports[], importedSymbols[], reExports[] },
                  emptyCatches[], switchesWithoutDefault[], anyCount, magicNumbers[],
                  issueIds[] }
```

---

## Reading `ast-trees.txt`

Compact indented text — one file per `## package — path` header, each node is `Kind[startLine:endLine]`, nesting depth = indentation level. Truncated subtrees end with `...`.

```
## octocode-shared — packages/octocode-shared/src/credentials/storage.ts
SourceFile[18:426]
  ImportDeclaration[18:23]
  FunctionDeclaration[50:80]
    Block[51:79]
      IfStatement[52:55] ...
      ReturnStatement[78]
```

### Navigation Commands

| Goal | Command |
|------|---------|
| List all files | `grep "^##" ast-trees.txt` |
| Find functions | `grep -E "FunctionDeclaration\|function_declaration\|ArrowFunction\|arrow_function" ast-trees.txt` |
| Find classes | `grep -E "ClassDeclaration\|class_declaration" ast-trees.txt` |
| Find control flow | `grep -E "IfStatement\|SwitchStatement\|ForStatement\|WhileStatement" ast-trees.txt` |
| Deep nesting (>3 levels) | `grep -E "^\s{8,}" ast-trees.txt` |
| Truncated subtrees | `grep "\.\.\.$" ast-trees.txt` |
| Large spans | Pattern `\[(\d+):(\d+)\]` — subtract start from end for line count |

### CLI Control

- On by default (`--emit-tree`). Suppress with `--no-tree`.
- Tree depth controlled by `--tree-depth N` (default: 4).

---

## Legacy Single-File Mode (`--out path/to/file.json`)

Keys: `summary`, `fileInventory[]`, `duplicateFlows`, `dependencyGraph`, `dependencyFindings[]`, `optimizationFindings[]`, `agentOutput`, `parseErrors[]`.
