<div align="center">
  <img src="https://github.com/bgauryy/octocode-mcp/raw/main/packages/octocode-mcp/assets/logo_white.png" width="400px" alt="Octocode Logo">

  <h1>Octocode Local Code Scan — AST Quality Analysis</h1>

  <p><strong>Repo-wide code quality scanning powered by AST analysis</strong></p>
  <p>Duplicate detection • Complexity analysis • Dependency graph intelligence • Actionable findings</p>

  [![Skill](https://img.shields.io/badge/skill-agentskills.io-purple)](https://agentskills.io/what-are-skills)
  [![License](https://img.shields.io/badge/license-MIT-blue)](https://github.com/bgauryy/octocode-mcp/blob/main/LICENSE)

</div>

---

## What It Does

This skill runs a full AST-based code quality scan across your monorepo and produces a machine-readable report with prioritizedactionable findings. It analyzes **every TypeScript/JavaScript file** in your `packages/` directory and delivers:

| Analysis | What It Finds |
|----------|---------------|
| **Duplicate Function Bodies** | Identical function implementations across files — extract to shared helpers |
| **Repeated Control Flow** | Same if/switch/try patterns duplicated — normalize into reusable logic |
| **Function Complexity** | High cyclomatic complexitydeep nesting, oversized functions — refactor targets |
| **Dependency Cycles** | Circular import chains — architectural coupling risks |
| **Critical Dependency Paths** | High-weight transitive chains — blast radius of change |
| **Test-Only Modules** | Production modules imported only from tests — dead code candidates |
| **Dependency Hubs** | Modules with excessive inbound/outbound imports — coupling hotspots |

---

## Quick Start

### Build (first time)

```bash
cd skills/octocode-local-code-scan && npm run build
```

### Run with defaults

```bash
node skills/octocode-local-code-scan/scripts/index.js
```

### Common usage patterns

```bash
# Default output + full JSON report
node skills/octocode-local-code-scan/scripts/index.js --out .octocode/scan/scan.json

# Include test files in the scan
node skills/octocode-local-code-scan/scripts/index.js --include-tests --findings-limit 500

# Use tree-sitter for richer metadata (when installed)
node skills/octocode-local-code-scan/scripts/index.js --parser tree-sitter --no-tree

# Stricter complexity threshold
node skills/octocode-local-code-scan/scripts/index.js --critical-complexity-threshold 25

# Report more critical dependency chains
node skills/octocode-local-code-scan/scripts/index.js --deep-link-topn 30

# Raw JSON to stdout
node skills/octocode-local-code-scan/scripts/index.js --json
```

---

## Requirements

- **Node.js** (v18+)
- **TypeScript** npm package (`typescript`) — used as the default parser
- A monorepo with a `packages/` directory containing packages with `package.json` files
- **Optional**: `tree-sitter` + `tree-sitter-typescript` for enhanced AST metadata

### Octocode MCP Integration (Recommended)

The scan runs standalonebut for **deeper investigation** of findings (tracing duplicates, verifying dependency chains, exploring refactor targets), Octocode MCP local + LSP tools are recommended.

**Enable local tools:**

```bash
# Option 1: Environment variable
export ENABLE_LOCAL=true

# Option 2: In your MCP server config
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["-y""octocode-mcp"],
      "env": {"ENABLE_LOCAL": "true"}
    }
  }
}
```

**What `ENABLE_LOCAL` unlocks for investigation:**

| Tool Category | Tools | Use After Scan |
|---------------|-------|----------------|
| **Local Filesystem** | `localSearchCode``localViewStructure`, `localFindFiles`, `localGetFileContent` | Search for duplicates, explore flagged modules |
| **LSP Semantic** | `lspGotoDefinition``lspFindReferences`, `lspCallHierarchy` | Trace dependency chains, find all callers before refactoring |

> **Full documentation:** [Local Tools Reference](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/docs/LOCAL_TOOLS_REFERENCE.md) | [Configuration Reference](https://github.com/bgauryy/octocode-mcp/blob/main/docs/CONFIGURATION_REFERENCE.md)

---

## What Gets Scanned

| Included | Excluded |
|----------|----------|
| `.ts``.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs` | `.d.ts` declaration files |
| All files in `packages/*/` | `node_modules/`, `dist/`, `.git/`, `.next/`, `.yarn/`, `.cache/`, `.octocode/`, `coverage/`, `out/` |
| Production code (default) | Test files (unless `--include-tests`) |

---

## Report Structure

The JSON report written to `--out` (or stdout with `--json`) contains:

```
{
  summary                 // Total filesfunctions, flows, per-package stats
  fileInventory[]         // Per-file: functionsflows, dependency profile, linked issues
  duplicateFlows          // Duplicate function-body groups + repeated control-flow
  dependencyGraph         // Modulesedges, roots, leaves, cycles, critical paths
  dependencyFindings[]    // Cyclecritical-path, test-only findings
  optimizationFindings[]  // ALL findings sorted by severity
  agentOutput             // Summary counters + top recommendations + per-file issues
  astTrees[]              // AST tree snapshots (when --emit-tree)
  parseErrors[]           // Files that failed to parse
}
```

### Finding Categories

| Category | Severity Range | Description |
|----------|---------------|-------------|
| `duplicate-function-body` | low — high | Identical function implementations across files |
| `duplicate-flow-structure` | medium — high | Repeated control-flow patterns (if/switch/try) |
| `function-optimization` | medium — high | Complexdeeply nested, or oversized functions |
| `dependency-cycle` | high | Circular import chains |
| `dependency-critical-path` | high — critical | High-weight transitive dependency chains |
| `dependency-test-only` | medium | Production modules imported only from tests |

### Each Finding Includes

- **`id`**: Unique identifier (e.g.`AST-ISSUE-0001`)
- **`severity`**: `critical``high`, `medium`, or `low`
- **`file`** + **`lineStart`/`lineEnd`**: Exact location
- **`title`**: Human-readable summary
- **`reason`**: Why this was flagged
- **`suggestedFix`**: Strategy + ordered remediation steps
- **`impact`**: Why fixing this matters

---

## Dependency Graph Intelligence

The `dependencyGraph` section provides a complete picture of your module relationships:

```
dependencyGraph: {
  totalModules        // Number of analyzed modules
  totalEdges          // Total import edges
  unresolvedEdgeCount // Imports that couldn't be resolved

  roots[]             // Modules with no inbound imports (entry points)
  leaves[]            // Modules with no outbound imports (leaf nodes)

  cycles[]            // Circular dependency chains with path + node count
  criticalPaths[]     // Highest-weight transitive chains (score + length)
  criticalModules[]   // Hub modules ranked by score + connectivity

  testOnlyModules[]   // Production files imported only from tests
  outgoingTop[]       // Modules with most outbound imports
  inboundTop[]        // Modules with most inbound imports
  unresolvedSample[]  // Sample of unresolved import paths
}
```

---

## CLI Reference

```
node scripts/index.js [options]

Options:
  --root <path>                      Repo root directory (default: cwd)
  --out <path>                       Write JSON report to file
  --json                             Print JSON report to stdout
  --include-tests                    Include *.test* and *.spec* files in scan
  --parser <auto|typescript|tree-sitter>
                                     Parser engine (default: auto)
  --no-tree                          Skip AST tree snapshots in report
  --emit-tree                        Force include AST tree snapshots
  --min-function-statements N        Min body statements for duplicate matching (default: 6)
  --min-flow-statements N            Min control-flow statements for matching (default: 6)
  --critical-complexity-threshold N  Complexity threshold for HIGH findings (default: 30)
  --findings-limit N                 Max findings in report (default: 250)
  --deep-link-topn N                 Max critical dependency paths reported (default: 12)
  --tree-depth N                     AST tree snapshot depth (default: 4)
  --help                             Show help message
```

---

## Sample Output

```text
AST analysis complete: 564 files9145 functions, 6775 flow nodes
Dependency scan analyzed 620 files (including tests where present).
Duplicate function bodies: 28
- ArrowFunction "handleError" occurs 4x in 3 file(s)
- FunctionDeclaration "validateInput" occurs 3x in 2 file(s)

Repeated control-flow structures: 15
- IfStatement appears 12x across 8 file(s)
- TryStatement appears 6x across 4 file(s)

Dependency graph: 564 modules1800 import edges
- Critical chains: 30 (showing top 12)
- Root modules: 190Leaf modules: 95
- Test-only modules: 10
- Cycles: 20

Agent Findings: 125
- [CRITICAL] Critical dependency chain risk: 8 files
  - Potentially high-change surface: src/core/index.ts -> ... (420 weight)
  - fix: Reduce chain length and isolate high-complexity hotspots.
- [HIGH] Dependency cycle detected (4 node cycle)
  - Import cycle exists across: src/a.ts -> src/b.ts -> src/c.ts -> src/a.ts
  - fix: Break the cycle with a lower-level abstraction or interface module.
- [HIGH] Deduplicate function body: handleError
  - Same ArrowFunction body shape appears in 4 places (3 files).
  - fix: Create a shared helper function once and replace duplicate call sites.

Parser engine used: auto(tree-sitter metadata + typescript analysis)
Full report written to .octocode/scan/scan-2026-03-17T10-30-00-000Z.json
```

---

## How It Works

```
┌─────────────────────────────────────────────────────────────────────┐
│                         index.ts (src)                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. DISCOVER           Scan packages/ for valid packages            │
│       │                                                             │
│       ▼                                                             │
│  2. PARSE              TypeScript compiler API parses each file     │
│       │                + optional tree-sitter for extra metadata     │
│       ▼                                                             │
│  3. EXTRACT            Functions: namecomplexity, nesting, size   │
│       │                Control flow: if/switch/try/for patterns     │
│       │                Dependencies: internal/external/unresolved   │
│       ▼                                                             │
│  4. FINGERPRINT        Hash function bodies + control structures    │
│       │                Group identical shapes across files           │
│       ▼                                                             │
│  5. GRAPH              Build dependency graph from import/require   │
│       │                Detect cycles (DFS)critical paths (DAG)    │
│       │                Identify rootsleaves, hubs, test-only      │
│       ▼                                                             │
│  6. CATALOG            Generate prioritized findings with fixes     │
│       │                Sort by severitycap at --findings-limit    │
│       ▼                                                             │
│  7. REPORT             Write JSON to --outprint summary to CLI    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## References

| Document | Description |
|----------|-------------|
| [SKILL.md](./SKILL.md) | Agent workflow protocol for using this skill |
| [src/](./src/) | TypeScript source modules for the analysis script |
| [Troubleshooting](https://github.com/bgauryy/octocode-mcp/blob/main/docs/TROUBLESHOOTING.md) | Common issues and solutions |

---

## License

MIT License © 2026 Octocode

See [LICENSE](https://github.com/bgauryy/octocode-mcp/blob/main/LICENSE) for details.
