# Output Files

Each scan writes to `.octocode/scan/<timestamp>/`:

| File | Contents | When to Read |
|------|----------|-------------|
| `summary.md` | Health scores, tags, severity, per-pillar counts, top recs, change risk hotspots | **Always first** |
| `summary.json` | Machine-readable scan metadata, `agentOutput`, `analysisSummary`, `investigationPrompts`, `parseErrors[]` | Programmatic access |
| `architecture.json` | Dep graph, arch findings, `hotFiles[]`, `graphSignals[]`, chokepoints, optional advanced graph overlays | Cycles, coupling, SDP, D metric, test gaps, side-effect risk |
| `code-quality.json` | Up to 28 quality findings, severity/category breakdowns | Duplicates, complexity, perf |
| `dead-code.json` | Up to 10 hygiene findings, severity/category breakdowns | Dead code cleanup |
| `file-inventory.json` | Per-file: functions, flows, metrics, `issueIds[]` | Deep-diving a specific file |
| `findings.json` | ALL findings sorted by severity with `ruleId`, `analysisLens`, `confidence`, `impact`, `correlatedSignals[]`, `recommendedValidation`, and optional `flowTrace[]` | Complete sorted list |
| `ast-trees.txt` | `Kind[startLine:endLine]` per file (on by default, disable with `--no-tree`) | Structural overview |
| `graph.md` | Mermaid dependency graph (only with `--graph`) | Visual architecture |

---

## JSON Key Reference

### `summary.json`

```
schemaVersion, generatedAt, repoRoot, options, parser,
summary { totalPackages, totalFiles, totalNodes, totalFunctions, totalFlows, totalDependencyFiles, byPackage },
agentOutput { totalFindings, highPriority, mediumPriority, lowPriority,
              topRecommendations[] { id, file, severity, category, title, reason, suggestedFix },
              filesWithIssues[] { file, issueCount, issueIds } },
analysisSummary { graphSignals[], astSignals[], strongestGraphSignal, strongestAstSignal, combinedSignals[], recommendedValidation },
strongestGraphSignal, strongestAstSignal, combinedSignals[], recommendedValidation, investigationPrompts[],
parseErrors[] { file, message },
outputFiles { summary, architecture, codeQuality, deadCode, fileInventory, findings, ... }
```

Use `summary.json` to drive the first decision:

- Use `agentOutput.topRecommendations[]` and `filesWithIssues[]` to decide where to drill in first
- Use `summary.md` or `architecture.json` for graph-specific detail such as `cycles`, `criticalPaths`, and hotspots
- If top recommendations are mostly complexity, duplication, or side-effect findings, switch to AST-first investigation
- If graph-heavy recommendations and AST-heavy recommendations appear together, plan a combined investigation before proposing refactors

### `findings.json`

```
generatedAt,
optimizationFindings[] { id, ruleId, severity, category, analysisLens, confidence,
                         file, lineStart, lineEnd, title, reason,
                         files[], suggestedFix { strategy, steps[] }, impact, tags[],
                         correlatedSignals[], recommendedValidation, flowTrace[], lspHints[] },
totalFindings
```

Filter: `jq '.optimizationFindings[] | select(.tags | contains(["coupling"]))' findings.json`

Use `findings.json` to correlate categories:

- `feature-envy` + `low-cohesion` = likely boundary error
- `layer-violation` + `feature-envy` = likely dependency leak
- `import-side-effect-risk` + hotspot tags = likely startup risk
- `dependency-critical-path` + complexity tags = likely change chokepoint

### `architecture.json`

```
schemaVersion, generatedAt,
dependencyGraph { totalModules, totalEdges, criticalModules[], cycles[], criticalPaths[], ... },
dependencyFindings[], findings[], findingsCount,
severityBreakdown { critical, high, medium, low },
categoryBreakdown { "dependency-cycle": N, ... },
hotFiles[] { file, riskScore, fanIn, fanOut, complexityScore, exportCount, inCycle, onCriticalPath },
graphSignals[], chokepoints[], criticalHubCandidates[],
sccClusters[] (with `--graph-advanced`), packageGraphSummary (with `--graph-advanced`), packageHotspots[] (with `--graph-advanced`)
```

Use `architecture.json` as the graph lens:

- `criticalModules[]` = hub nodes already surfaced by the dependency summary
- `cycles[]` = immediate structural loops
- `criticalPaths[]` = long change propagation chains
- `hotFiles[]` = current approximation of graph chokepoints
- `graphSignals[]` = already-interpreted graph narratives for triage
- `chokepoints[]` = broker and articulation-style structural pressure points
- `categoryBreakdown` = whether the repo’s architecture risk is mostly cycles, layering, cohesion, or side effects

Good investigation prompts:

- "Do critical hub modules also appear in hotFiles or critical paths?"
- "Which files are both hot and on a critical path?"
- "Which layer violations cluster around the same folder?"
- "Do side-effectful modules also have high fan-in?"

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
                  topLevelEffects[], effectProfile, symbolUsageSummary, boundaryRoleHints[], cfgFlags,
                  prototypePollutionSites[], issueIds[] }
```

Use `file-inventory.json` as the AST lens:

- `functions[]` = shape and complexity of orchestration
- `flows[]` = repeated control structures
- `dependencyProfile` = exported/imported symbol detail for cohesion and feature-envy follow-up
- `topLevelEffects[]` = hidden initialization / import-time work
- `effectProfile` = summarized import-time risk
- `symbolUsageSummary` = compact symbol/import/export shape for boundary follow-up
- `boundaryRoleHints[]` = lightweight role inference for the file
- `cfgFlags` = lightweight flow clues for validation, cleanup, exit behavior, and async boundaries (with `--flow`)

If `architecture.json` names a hotspot, use `file-inventory.json` to explain why that hotspot is structurally hard to change.

---

## Reading `ast-trees.txt`

Compact indented text — one file per `## package — path` header, each node is `Kind[startLine:endLine]`, nesting depth = indentation level. Truncated subtrees end with `...`.

```
## my-package — packages/my-package/src/services/storage.ts
SourceFile[18:426]
  ImportDeclaration[18:23]
  FunctionDeclaration[50:80]
    Block[51:79]
      IfStatement[52:55] ...
      ReturnStatement[78]
```

### Navigation Commands

Use the dedicated CLI against the exact scan artifact you are reading. Replace `<CURRENT_SCAN>` with the timestamped scan directory from `summary.md`.

- Find functions: `node scripts/ast-tree-search.js -i <CURRENT_SCAN>/ast-trees.txt -k function_declaration --limit 25`
- Find classes: `node scripts/ast-tree-search.js -i <CURRENT_SCAN>/ast-trees.txt -k class_declaration --limit 25`
- Find control flow: `node scripts/ast-tree-search.js -i <CURRENT_SCAN>/ast-trees.txt -p 'IfStatement|SwitchStatement|ForStatement|WhileStatement' --limit 25`
- Narrow to one file: `node scripts/ast-tree-search.js -i <CURRENT_SCAN>/ast-trees.txt --file "src/index" -k function_declaration --limit 10`
- Raw text fallback: `rg 'FunctionDeclaration|IfStatement' <CURRENT_SCAN>/ast-trees.txt`

See [ast-tree-search.md](./ast-tree-search.md) for the full CLI surface, including `--section`, `--context`, and JSON output.

### CLI Control

- On by default (`--emit-tree`). Suppress with `--no-tree`.
- Tree depth controlled by `--tree-depth N` (default: 4).

Use `ast-trees.txt` when you need to design or validate structural rules:

- draft new architecture-smell searches for `ast-search`
- confirm whether a code smell is a repeated shape or a one-off implementation
- compare two suspicious files without reading full source first

---

## Legacy Single-File Mode (`--out path/to/file.json`)

Keys: `summary`, `fileInventory[]`, `duplicateFlows`, `dependencyGraph`, `dependencyFindings[]`, `optimizationFindings[]`, `agentOutput`, `parseErrors[]`.
