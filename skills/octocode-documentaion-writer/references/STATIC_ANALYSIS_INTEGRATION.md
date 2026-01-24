# Static Analysis Integration Guide

> How `static-analysis.json` (v2.0) feeds into the documentation pipeline

## Output Fields Overview

| Field | Type | Description |
|-------|------|-------------|
| `metadata` | Object | Analysis version, timing, paths |
| `package` | Object | Name, version, entry points, dependencies, scripts |
| `publicAPI` | Array | Exports from entry points with types and signatures |
| `moduleGraph` | Object | File counts, internal/external dependency edges |
| `dependencies` | Object | Declared vs used, unused, unlisted, misplaced |
| `files` | Array | All files with roles (entry, barrel, util, etc.) |
| `insights` | Object | Circular deps, orphans, unused exports, barrels |
| `exportFlows` | Object | **NEW** How symbols flow through barrel files |
| `dependencyUsage` | Object | **NEW** Which symbols from each package |
| `architecture` | Object | **NEW** Detected pattern and layer analysis |
| `exportsMap` | Object | **NEW** Package.json conditional exports analysis |

---

## Phase-by-Phase Integration

### Phase 1: Discovery+Analysis (4 parallel agents)

| Agent | Static Analysis Fields Used | How It Helps |
|-------|----------------------------|--------------|
| **1A-Language** | `package.keywords`, `files[].role`, `metadata` | Identifies tech stack, language patterns |
| **1B-Components** | `moduleGraph.internalDependencies`, `files`, `architecture.layers` | Maps component structure from layers |
| **1C-Dependencies** | `dependencies`, `dependencyUsage`, `moduleGraph.externalDependencies` | Complete dependency picture with symbol usage |
| **1D-Flows+APIs** | `publicAPI`, `exportFlows`, `exportsMap` | Entry points, public surface, export chains |

**Key Benefits:**
- Skip redundant file scanning - use `files[]` directly
- Architecture already detected - refine don't re-discover
- Entry points pre-computed - focus on analyzing behaviors
- Export flows show barrel chains - document re-export patterns

```json
// Phase 1 can directly use:
{
  "entryPoints": staticAnalysis.package.entryPoints.all,
  "publicExports": staticAnalysis.publicAPI,
  "dependencyMap": staticAnalysis.dependencyUsage,
  "fileRoles": staticAnalysis.files.map(f => ({ path: f.relativePath, role: f.role })),
  "architecturePattern": staticAnalysis.architecture.pattern,
  "layers": staticAnalysis.architecture.layers
}
```

---

### Phase 2: Engineer Questions

| Static Analysis Field | Questions It Enables |
|----------------------|---------------------|
| `publicAPI` | "What does `analyzeRepository()` return?" |
| `exportFlows` | "How does `ExportInfo` travel from types.ts to index.ts?" |
| `architecture.violations` | "Why does X import from Y (layer violation)?" |
| `insights.circularDependencies` | "How to break circular dep A→B→A?" |
| `insights.unusedExports` | "Should `findPackageJsonFiles` be removed or documented?" |
| `dependencies.unlisted` | "Why is `module` imported but not declared?" |
| `dependencyUsage` | "Which ts-morph features are actually used?" |

**Question Templates from Static Analysis:**

```json
{
  "public_api_questions": [
    // For each publicAPI entry:
    "What are the parameters and return type of {name}?",
    "What are the use cases for {name}?",
    "How does {name} handle errors?"
  ],
  "architecture_questions": [
    // If architecture.violations.length > 0:
    "Why does {from} import from {to} (violates {fromLayer}→{toLayer} rule)?",
    // If architecture.pattern == 'layered':
    "What is the responsibility of the {layer.name} layer?"
  ],
  "dependency_questions": [
    // For each dependencyUsage entry:
    "Why is {package} used? What features does it provide?",
    // For symbols used:
    "What is the purpose of importing {symbols} from {package}?"
  ],
  "insight_questions": [
    // For circularDependencies:
    "What is the root cause of the {cycle} circular dependency?",
    // For unusedExports:
    "Is {export} in {file} intentionally unused or dead code?"
  ]
}
```

---

### Phase 3: Research Agent

| Research Task | Static Analysis Fields |
|---------------|----------------------|
| Trace function calls | `moduleGraph.internalDependencies`, `files[].imports` |
| Find symbol definitions | `publicAPI[].position`, `files[].exports[].position` |
| Map data flows | `exportFlows`, `moduleGraph.internalDependencies` |
| Identify patterns | `architecture.pattern`, `architecture.layers` |
| Verify dependencies | `dependencyUsage`, `dependencies.declared` |

**Research Acceleration:**

```json
// Instead of searching, researcher can directly use:
{
  "where_is_X_defined": {
    "use": "exportFlows[X].definedIn",
    "fallback": "publicAPI.find(e => e.name === X).position"
  },
  "who_imports_X": {
    "use": "moduleGraph.internalDependencies.filter(e => e.identifiers.includes(X))"
  },
  "what_does_file_export": {
    "use": "files.find(f => f.relativePath === path).exports"
  },
  "is_X_used_anywhere": {
    "use": "insights.unusedExports.find(e => e.export === X) === undefined"
  }
}
```

---

### Phase 4: Orchestrator

| Orchestration Task | Static Analysis Fields |
|-------------------|----------------------|
| Group by file ownership | `files[].relativePath`, `files[].role` |
| Identify related files | `moduleGraph.internalDependencies` |
| Prioritize critical files | `files[].isEntryPoint`, `insights.mostImported` |
| Balance workload | `files[].exportCount`, `files[].importCount` |

**Assignment Strategy:**

```json
{
  "writer_assignment_hints": {
    "high_priority": "files.filter(f => f.isEntryPoint || f.role === 'entry')",
    "group_by_layer": "architecture.layers.map(l => l.files)",
    "complexity_score": "files.map(f => f.exportCount + f.importCount)",
    "dependency_clusters": "moduleGraph.internalDependencies grouped by from"
  }
}
```

---

### Phase 5: Documentation Writers

| Doc Section | Static Analysis Fields |
|-------------|----------------------|
| Getting Started | `package.scripts`, `package.entryPoints` |
| API Reference | `publicAPI`, `exportFlows` |
| Architecture | `architecture`, `moduleGraph` |
| Dependencies | `dependencies`, `dependencyUsage` |
| Internal Modules | `files[].exports`, `files[].role` |

**Writer Templates:**

```markdown
<!-- API Reference template, fed from publicAPI -->
## {entry.name}

**Type:** {entry.type}
**Signature:** `{entry.signature}`

{entry.jsDoc || "No description available."}

<!-- If entry has members -->
### Members
{entry.members.map(m => `- \`${m.name}\` (${m.type})`)}
```

```markdown
<!-- Architecture template, fed from architecture -->
## Architecture: {architecture.pattern}

{patternDescription[architecture.pattern]}

### Layers
{architecture.layers.map(l => `
#### ${l.name}
${l.description}

**Files:** ${l.files.length}
**Depends on:** ${l.dependsOn.join(', ') || 'none'}
`)}
```

---

### Phase 6: QA Validator

| Validation Check | Static Analysis Fields |
|-----------------|----------------------|
| API coverage | `publicAPI` vs documented exports |
| Dead links | `files[].relativePath` for valid paths |
| Missing docs for public API | `publicAPI` cross-referenced |
| Architecture accuracy | `architecture` vs documented |
| Dependency accuracy | `dependencies`, `dependencyUsage` |

**Validation Rules:**

```json
{
  "coverage_checks": {
    "all_public_exports_documented": {
      "source": "publicAPI",
      "check": "each export appears in API.md"
    },
    "entry_points_documented": {
      "source": "package.entryPoints.all",
      "check": "each entry point has docs"
    },
    "unused_exports_noted": {
      "source": "insights.unusedExports",
      "check": "unused exports flagged or explained"
    }
  },
  "accuracy_checks": {
    "export_signatures_match": {
      "source": "publicAPI[].signature",
      "check": "documented signatures match static analysis"
    },
    "dependency_list_matches": {
      "source": "dependencies.declared",
      "check": "documented deps match package.json"
    }
  }
}
```

---

## Field-to-Phase Matrix

| Field | P1 | P2 | P3 | P4 | P5 | P6 |
|-------|:--:|:--:|:--:|:--:|:--:|:--:|
| `metadata` | ✓ | | | | ✓ | ✓ |
| `package` | ✓ | ✓ | | ✓ | ✓ | ✓ |
| `publicAPI` | ✓ | ✓ | ✓ | | ✓ | ✓ |
| `moduleGraph` | ✓ | | ✓ | ✓ | ✓ | |
| `dependencies` | ✓ | ✓ | ✓ | | ✓ | ✓ |
| `files` | ✓ | | ✓ | ✓ | ✓ | ✓ |
| `insights` | | ✓ | ✓ | ✓ | ✓ | ✓ |
| `exportFlows` | ✓ | ✓ | ✓ | | ✓ | |
| `dependencyUsage` | ✓ | ✓ | ✓ | | ✓ | ✓ |
| `architecture` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `exportsMap` | ✓ | | | | ✓ | |

---

## Efficiency Gains

| Without Static Analysis | With Static Analysis |
|------------------------|---------------------|
| Phase 1 scans all files | Uses pre-computed `files[]` |
| Discovers entry points via grep | Uses `package.entryPoints.all` |
| Traces exports manually | Uses `exportFlows` directly |
| Guesses architecture pattern | Uses `architecture.pattern` |
| Research finds definitions via LSP | Position hints from `publicAPI` |
| Writers check dependencies manually | Uses `dependencyUsage` |
| QA validates from scratch | Cross-references static analysis |

**Estimated time savings per phase:**
- Phase 1: ~40% (pre-computed file roles + architecture)
- Phase 2: ~20% (export flows inform questions)
- Phase 3: ~50% (positions + dependency map = fewer LSP calls)
- Phase 4: ~30% (file complexity + layers for grouping)
- Phase 5: ~25% (structured API data ready to use)
- Phase 6: ~60% (automated coverage checks)

---

## Example: Using Static Analysis in Agent Prompts

### Phase 1 Agent Prompt Enhancement

```markdown
You have access to pre-computed static analysis:

**Entry Points:** {staticAnalysis.package.entryPoints.all}
**File Roles:** {staticAnalysis.files.map(f => f.role).unique()}
**Architecture:** {staticAnalysis.architecture.pattern}
**Layers:** {staticAnalysis.architecture.layers.map(l => l.name)}

Use this data directly. Do NOT re-scan for:
- Entry point discovery (already computed)
- File role classification (already computed)
- Import/export relationships (see moduleGraph)
- Circular dependencies (see insights)

Focus your analysis on BEHAVIORS and PATTERNS that static analysis cannot detect.
```

### Phase 3 Research Agent Enhancement

```markdown
Before using LSP tools, check static analysis:

**Export Flows:** Symbol "{X}" is defined in "{exportFlows[X].definedIn}"
**Position:** Line {publicAPI.find(e => e.name === X).position.line}
**Re-export Chain:** {exportFlows[X].reExportChain.join(' → ')}

Only use lspGotoDefinition if the position is ambiguous.
Use localSearchCode only for implementation details not in static analysis.
```

---

*Generated by Octocode Documentation Writer v2.0*
