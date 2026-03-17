<div align="center">
  <img src="https://github.com/bgauryy/octocode-mcp/raw/main/packages/octocode-mcp/assets/logo_white.png" width="400px" alt="Octocode Logo">

  <h1>Octocode Local Code Scan — AST Quality Analysis</h1>

  <p><strong>Repo-wide code quality scanning powered by AST analysis</strong></p>
  <p>Architecture metrics • Dead code hygiene • Complexity analysis • Dependency graph intelligence • Actionable findings</p>

  [![Skill](https://img.shields.io/badge/skill-agentskills.io-purple)](https://agentskills.io/what-are-skills)
  [![License](https://img.shields.io/badge/license-MIT-blue)](https://github.com/bgauryy/octocode-mcp/blob/main/LICENSE)

</div>

---

## Why This Exists

AI agents write a lot of code, fast. That's the point. But speed makes it easy to accumulate architectural debt without noticing — circular dependencies creep in, duplicated logic spreads across packages, dead exports pile up, and coupling quietly grows until a small change breaks something unexpected.

Humans catch these things during code review, but agents don't stop to review their own work. They need a concrete signal — not opinions, not vibes — actual metrics extracted from the AST that say "this module has 12 inbound dependents and imports an unstable helper" or "this function body is copy-pasted in 4 files."

This skill gives agents (and humans) a single command that surfaces those problems with file paths, line numbers, severity, and fix suggestions. Run it after a big refactor, before a PR, or on a schedule. The goal: keep the codebase honest as it scales.

---

## What It Does

This skill runs a full AST-based code quality scan across your monorepo and produces a machine-readable report with prioritizedactionable findings. It analyzes **every TypeScript/JavaScript file** in your `packages/` directory and delivers:

| Analysis | What It Finds |
|----------|---------------|
| **Duplicate Function Bodies** | Identical function implementations across files — extract to shared helpers |
| **Repeated Control Flow** | Same if/switch/try patterns duplicated — normalize into reusable logic |
| **Function Complexity** | High cyclomatic complexity, deep nesting, oversized functions — refactor targets |
| **Cognitive Complexity** | Nesting-aware complexity scoring — hard-to-read functions |
| **Dependency Cycles** | Circular import chains — architectural coupling risks |
| **Critical Dependency Paths** | High-weight transitive chains — blast radius of change |
| **SDP Violations** | Stable modules depending on unstable ones (instability metric) |
| **High Coupling** | Modules with excessive afferent + efferent coupling |
| **Fan-In / Fan-Out** | Bottleneck hubs and modules that know too much |
| **Orphan Modules** | Completely disconnected files — no imports in or out |
| **Unreachable Modules** | Modules not reachable from any entrypoint via BFS |
| **Dead Files / Exports / Re-exports** | Unused files, symbols, and barrel re-exports |
| **Unused npm Dependencies** | Dependencies in package.json with no observed imports |
| **Package Boundary Violations** | Cross-package imports bypassing public API |
| **Barrel Explosion** | Barrels with too many re-exports or deep chains |
| **God Modules / Functions** | Oversized modules (>500 stmts / >20 exports) and functions (>100 stmts) |
| **Layer Violations** | Imports going backwards in configurable layer order |
| **Test-Only Modules** | Production modules imported only from tests — dead code candidates |

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
| `function-optimization` | medium — high | Complex, deeply nested, or oversized functions |
| `cognitive-complexity` | medium — high | Nesting-aware cognitive complexity exceeding threshold |
| `dependency-cycle` | high | Circular import chains |
| `dependency-critical-path` | high — critical | High-weight transitive dependency chains |
| `dependency-test-only` | medium | Production modules imported only from tests |
| `architecture-sdp-violation` | medium — high | Stable module depends on unstable module (SDP) |
| `high-coupling` | medium — high | Module with excessive afferent + efferent coupling |
| `god-module-coupling` | medium — high | Module with high fan-in (bottleneck) or fan-out (knows too much) |
| `orphan-module` | medium | Module with no inbound or outbound dependencies |
| `unreachable-module` | high | Module not reachable from any entrypoint via import graph |
| `dead-file` | medium | Non-test files with no inbound references and no dependency role |
| `dead-export` | medium — high | Exported symbols with no observed production consumers |
| `dead-re-export` | medium | Barrel re-exports with no downstream usage |
| `re-export-duplication` | medium | Same symbol re-exported through multiple competing paths |
| `re-export-shadowed` | high | Local export and re-export collide on same symbol name |
| `unused-npm-dependency` | low — medium | Dependencies in package.json with no observed imports |
| `package-boundary-violation` | medium — high | Cross-package imports bypassing public API entry |
| `barrel-explosion` | medium — high | Barrel with too many re-exports or deep chain |
| `god-module` | high | Module exceeding statement or export threshold |
| `god-function` | high | Function exceeding statement threshold |
| `layer-violation` | high | Import going backwards in configured layer order |

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
  --coupling-threshold N             Ca+Ce threshold for high-coupling (default: 15)
  --fan-in-threshold N               Fan-in threshold for god-module-coupling (default: 20)
  --fan-out-threshold N              Fan-out threshold for god-module-coupling (default: 15)
  --god-module-statements N          Statement threshold for god-module (default: 500)
  --god-module-exports N             Export threshold for god-module (default: 20)
  --god-function-statements N        Statement threshold for god-function (default: 100)
  --cognitive-complexity-threshold N Cognitive complexity threshold (default: 15)
  --barrel-symbol-threshold N        Re-export count threshold for barrel-explosion (default: 30)
  --layer-order <layers>             Comma-separated layers for violation detection
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

### Phase 1 — Scan (automated)

```
┌─────────────────────────────────────────────────────────────────────┐
│                       Scan Engine (index.ts)                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. DISCOVER           Scan packages/ for valid packages            │
│       │                Read package.json deps for unused-npm check  │
│       ▼                                                             │
│  2. PARSE              TypeScript compiler API parses each file     │
│       │                + optional tree-sitter for extra metadata     │
│       ▼                                                             │
│  3. EXTRACT            Functions: name, complexity, nesting, size   │
│       │                Cognitive complexity (nesting-aware scoring) │
│       │                Control flow: if/switch/try/for patterns     │
│       │                Exports, imports, re-exports (symbol-level)  │
│       │                Dependencies: internal/external/unresolved   │
│       ▼                                                             │
│  4. FINGERPRINT        Hash function bodies + control structures    │
│       │                Group identical shapes across files           │
│       ▼                                                             │
│  5. GRAPH              Build dependency graph from import/require   │
│       │                Detect cycles (DFS), critical paths (DAG)    │
│       │                Identify roots, leaves, hubs, test-only      │
│       ▼                                                             │
│  6. ARCHITECTURE       Instability (SDP), coupling, fan-in/out     │
│       │                Orphan detection, reachability analysis (BFS)│
│       │                Layer violation checks, boundary violations  │
│       ▼                                                             │
│  7. HYGIENE            Dead files, dead exports, dead re-exports   │
│       │                Unused npm deps, barrel explosion detection  │
│       │                God module/function, re-export conflicts     │
│       ▼                                                             │
│  8. CATALOG            Generate prioritized findings with fixes     │
│       │                23 categories, severity-sorted, capped       │
│       ▼                                                             │
│  9. REPORT             Write JSON to --out, print summary to CLI    │
│                        Optional: Mermaid dependency graph (--graph) │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Phase 2 — Research & Investigate (with Octocode MCP)

After the scan produces findings, use **Octocode local + LSP tools** to investigate before making changes. This is the recommended workflow — never fix blindly from scan output alone.

```
┌─────────────────────────────────────────────────────────────────────┐
│              Research Loop (Octocode MCP Local + LSP)               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. PICK FINDING       Choose highest-severity finding from report  │
│       │                Read file, lineStart, category, reason       │
│       ▼                                                             │
│  2. SEARCH             localSearchCode(pattern="symbolName")        │
│       │                Get lineHint for LSP tools                   │
│       │                localSearchCode(filesOnly=true) for scope    │
│       ▼                                                             │
│  3. LOCATE             lspGotoDefinition(lineHint=N)                │
│       │                Jump to the exact definition                  │
│       ▼                                                             │
│  4. ANALYZE USAGE      lspFindReferences(lineHint=N)                │
│       │                See every consumer of the symbol              │
│       │                lspCallHierarchy(incoming, lineHint=N)       │
│       │                See who calls this function                   │
│       │                lspCallHierarchy(outgoing, lineHint=N)       │
│       │                See what this function calls                  │
│       ▼                                                             │
│  5. READ CONTEXT       localGetFileContent(path, startLine, endLine)│
│       │                Read the actual code with surrounding context │
│       │                localViewStructure(path) for directory layout │
│       ▼                                                             │
│  6. DECIDE & FIX       Follow suggestedFix.steps from finding       │
│       │                Make minimal, safe changes                    │
│       ▼                                                             │
│  7. VERIFY             Re-run scan → compare finding counts          │
│                        Confirm no regressions introduced             │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Example: Investigating an SDP Violation

```
Scan finding:
  [HIGH] SDP violation: stable module depends on unstable module
  "packages/core/src/auth.ts" (I=0.15) depends on
  "packages/core/src/helpers/format.ts" (I=0.80). Delta=0.65.

Research steps:
  1. localSearchCode(pattern="auth", path="packages/core/src")
     → Found at line 1, get lineHint

  2. lspCallHierarchy(direction="incoming", lineHint=1)
     → auth.ts is depended on by 12 modules (very stable)

  3. lspCallHierarchy(direction="outgoing", lineHint=1)
     → auth.ts imports format.ts (which only 1 module depends on)

  4. localGetFileContent(path="packages/core/src/helpers/format.ts")
     → Read the unstable module to understand what auth.ts needs

  5. Decision: extract the shared formatting logic into a stable
     utility that both can depend on, breaking the SDP violation.

  6. Re-run scan → SDP violation gone, no new findings introduced.
```

### Example: Investigating a Dead Export

```
Scan finding:
  [HIGH] Unused export: processPayment
  "packages/billing/src/processor.ts:45-60"

Research steps:
  1. localSearchCode(pattern="processPayment")
     → Found at line 45, get lineHint

  2. lspFindReferences(lineHint=45)
     → Zero references found outside the declaring file

  3. localSearchCode(pattern="processPayment", filesOnly=true)
     → No other file mentions this symbol at all

  4. Decision: remove the export keyword (keep function if used
     internally) or delete entirely if dead. Re-run scan to confirm.
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
