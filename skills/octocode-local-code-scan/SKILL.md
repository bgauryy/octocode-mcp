---
name: octocode-local-code-scan
description: This skill should be used when the user asks to "analyze code quality", "find duplicates", "check complexity", "scan for tech debt", "find dependency cycles", "show critical paths", "AST analysis", "code health check", "find repeated code", "detect dead modules", or wants a repo-wide quality scan with duplicate detection, complexity analysis, and dependency graph intelligence. Runs scripts/index.js and delivers prioritized, actionable findings.
---

# Octocode Local Code Scan — AST Quality Analysis

**Repo-wide code quality scanning via AST-based duplication, complexity, and dependency-graph analysis.**

## Prime Directive

```
SCAN → ANALYZE → PRIORITIZE → FIX
```

**Three Laws**:
1. **Data-Driven**: Every finding has a file, line range, severity, and suggested fix. No vague warnings.
2. **Prioritized**: Findings are ranked by severity (critical > high > medium > low). Address highest impact first.
3. **Actionable**: Every issue includes a concrete fix strategy and step-by-step remediation.

## MCP Discovery

<mcp_discovery>
Before starting, detect available research tools.

**Check**: Is `octocode-mcp` available as an MCP server?
Look for Octocode MCP tools (e.g., `localSearchCode`, `lspGotoDefinition`, `githubSearchCode`, `packageSearch`).

**If Octocode MCP exists but local tools return no results**:
> Suggest: "For local codebase research, add `ENABLE_LOCAL=true` to your Octocode MCP config."

**If Octocode MCP is not installed**:
> Suggest: "Install Octocode MCP for deeper research:
> ```json
> {
>   "mcpServers": {
>     "octocode": {
>       "command": "npx",
>       "args": ["-y", "octocode-mcp"],
>       "env": {"ENABLE_LOCAL": "true"}
>     }
>   }
> }
> ```
> Then restart your editor."

Proceed with whatever tools are available — do not block on setup.
</mcp_discovery>

## Architecture

The analysis engine is a modular TypeScript project compiled to `scripts/`. Entry point: **`scripts/index.js`**.

```
scripts/
├── index.js                  # Entry point — orchestrator, graph analysis, issue catalog, reporting
├── cli.js                    # Argument parsing (parseArgs, printHelp)
├── types.js                  # All interfaces, constants, type exports
├── utils.js                  # Hashing, fingerprinting, path utils, import resolution
├── dependencies.js           # Dependency collection, tracking, profiling
├── discovery.js              # File/package discovery, workspace scanning
├── ts-analyzer.js            # TypeScript compiler API analysis (functions, metrics, flows)
└── tree-sitter-analyzer.js   # Tree-sitter analysis (dual parser, official types)
```

**Why modular**: Each module has a single responsibility. The entry point (`index.js`) orchestrates everything — you only ever run `index.js`. The other files are internal modules imported by `index.js`.

## Tools

### Scan Tool (standalone)

| Tool | Purpose |
|------|---------|
| `scripts/index.js` | AST-based quality scan — runs standalone via Node.js, no MCP required |

**Entry point**: Always run `scripts/index.js`. This is the only file you execute directly. All other files in `scripts/` are internal modules.

### Octocode MCP Tools (for verification & deep investigation)

After the scan produces findings, use Octocode MCP local + LSP tools to **verify** findings, **investigate** root causes, and **guide** fixes with full semantic context.

**REQUIRED**: Always `localSearchCode` first to get `lineHint`, then LSP tools with that `lineHint`.

#### Investigation Playbook by Finding Category

**`duplicate-function-body`** — Verify duplicates, find all callers, assess extraction safety:
1. `localSearchCode(pattern="functionName")` → get `lineHint` for each duplicate location
2. `lspFindReferences(lineHint=N)` on each location → find all callers of each copy
3. `lspCallHierarchy(direction="incoming", lineHint=N)` → understand who depends on each copy
4. `localGetFileContent(matchString="functionName")` → read the actual implementations side by side
5. **Decide**: If callers overlap, extract to shared module. If callers are isolated, consider if duplication is intentional.

**`duplicate-flow-structure`** — Confirm patterns match, check if abstraction is safe:
1. `localGetFileContent(path="file", startLine=X, endLine=Y)` → read each duplicate control flow block
2. `localSearchCode(pattern="key expression from the flow")` → find all instances beyond what the scan found
3. Compare the flows manually — if they differ only in variable names, a shared helper with parameters works.

**`function-optimization`** (high complexity) — Understand what the function does before splitting:
1. `localSearchCode(pattern="functionName")` → get `lineHint`
2. `lspCallHierarchy(direction="incoming", lineHint=N)` → who calls this function?
3. `lspCallHierarchy(direction="outgoing", lineHint=N)` → what does it call?
4. `localGetFileContent(path="file", startLine=X, endLine=Y)` → read the full function body
5. **Decide**: Identify logical sub-responsibilities. Split into helpers only if callers use distinct subsets of the logic.

**`dependency-cycle`** — Trace the circular imports and find the break point:
1. For each file in the cycle path, `localSearchCode(pattern="import.*from.*otherFileInCycle")` → find the exact import lines
2. `lspGotoDefinition(lineHint=importLine)` → confirm what symbols are imported from each direction
3. `lspFindReferences(lineHint=N)` on shared symbols → find what actually uses them
4. `localViewStructure(path="directory containing cycle")` → understand the module layout
5. **Decide**: Extract shared types/interfaces to a separate file that breaks the cycle. Move implementation in one direction.

**`dependency-critical-path`** — Understand why the chain is heavy:
1. For the highest-score module in the path, `localSearchCode(pattern="export")` → see what it exports
2. `lspCallHierarchy(direction="incoming", lineHint=N)` → who depends on this hub?
3. `lspFindReferences(lineHint=N)` on key exports → how widely used are they?
4. `localViewStructure(path="package containing the chain")` → see if the chain crosses package boundaries
5. **Decide**: Split hub modules into focused sub-modules. Add interfaces at boundaries.

**`dependency-test-only`** — Verify the module is truly dead in production:
1. `lspFindReferences(lineHint=1)` on the module's main export → confirm zero production imports
2. `localSearchCode(pattern="from.*moduleName", filesOnly=true)` → double-check with text search
3. `localGetFileContent(path="module")` → read the module to understand what it does
4. **Decide**: If genuinely unused in production, move to test fixtures. If it should be used, add the missing production import.

#### Tool Quick Reference

| Tool | When to Use | Key Parameters |
|------|-------------|----------------|
| `localSearchCode` | **Always first** — find symbols, get `lineHint` for LSP | `pattern`, `path`, `filesOnly` |
| `lspGotoDefinition` | Jump to where a symbol is defined | `lineHint` (from search) |
| `lspFindReferences` | Find ALL usages of a symbol (types, vars, functions) | `lineHint`, `includeDecl` |
| `lspCallHierarchy` | Trace call chains (incoming callers / outgoing callees) | `lineHint`, `direction` |
| `localGetFileContent` | Read implementation details with context | `path`, `startLine`, `endLine`, `matchString` |
| `localViewStructure` | Understand directory layout around flagged files | `path`, `depth` |
| `localFindFiles` | Find related files by name/metadata pattern | `path`, `name` |

---

## When to Use

| User Says | Action |
|-----------|--------|
| "Analyze code quality" | Full scan with defaults |
| "Find duplicate code" | Focus on `duplicate-function-body` and `duplicate-flow-structure` findings |
| "Check complexity" | Focus on `function-optimization` findings |
| "Find dependency cycles" | Focus on `dependency-cycle` findings |
| "Show critical paths" | Focus on `dependency-critical-path` findings |
| "Scan for tech debt" | Full scan, present `agentOutput.topRecommendations` |
| "Find dead modules" | Focus on `dependency-test-only` findings |
| "Code health check" | Full scan, present summary + top findings |

## Execution Flow

```
DISCOVER → RUN SCAN → PARSE REPORT → PRESENT FINDINGS → [USER PICKS] → INVESTIGATE (MCP) → GUIDE FIXES
```

### Phase 1: Discover Workspace

1. Identify the workspace root (must contain a `packages/` directory with valid package.json files).
2. Confirm the entry point is available: `<SKILL_BASE_DIRECTORY>/scripts/index.js`.
3. Determine parser availability — tree-sitter provides richer metadata when installed.

### Phase 2: Run the Scan

Execute the analysis from the **workspace root** (the monorepo root, NOT the skill directory):

```bash
node <SKILL_BASE_DIRECTORY>/scripts/index.js --out .octocode/scan/scan.json
```

Or via package scripts (from the skill directory):

```bash
npm run analyze           # default console output
npm run analyze:json      # JSON + file output
npm run analyze:full      # include tests, more findings, more chains
npm run analyze:graph     # generate Mermaid dependency graph
```

Common option combinations:

| Goal | Flag |
|------|------|
| Default scan | `--out .octocode/scan/scan.json` |
| Include test files | `--include-tests` |
| Tree-sitter as primary parser | `--parser tree-sitter` |
| Stricter complexity | `--critical-complexity-threshold 20` |
| More critical chains | `--deep-link-topn 30` |
| More findings | `--findings-limit 500` |
| Skip AST tree snapshots | `--no-tree` |
| Mermaid dependency graph | `--graph` |
| Custom repo root | `--root /path/to/repo` |

### Phase 3: Parse the Report

The JSON report at `.octocode/scan/scan.json` contains:

| Section | Contents |
|---------|----------|
| `summary` | Total files, nodes, functions, flows, per-package breakdown |
| `fileInventory` | Per-file function list, flow list, dependency profile, linked issue IDs |
| `duplicateFlows` | Duplicate function-body groups and repeated control-flow structures |
| `dependencyGraph` | Module count, import edges, roots, leaves, cycles, critical paths, test-only modules, unresolved imports |
| `dependencyFindings` | Cycle, critical-path, and test-only module findings with severity |
| `optimizationFindings` | All findings sorted by severity with suggested fixes |
| `agentOutput` | Summary counters (high/medium/low priority), top recommendations, per-file issue map |
| `parseErrors` | Files that failed to parse |

### Phase 4: Present Findings

**REQUIRED output structure:**

1. **Summary**: File count, function count, flow nodes, dependency edge count.
2. **Top Findings**: Present the highest-severity findings first. Group by category:
   - `duplicate-function-body` — identical function bodies across files
   - `duplicate-flow-structure` — repeated control-flow patterns
   - `function-optimization` — high complexity, deep nesting, oversized functions
   - `dependency-cycle` — circular import chains
   - `dependency-critical-path` — high-risk transitive dependency chains
   - `dependency-test-only` — modules imported only from tests
3. **Dependency Graph Highlights**: Cycles, critical chains, root/leaf counts, test-only modules.
4. **Next Step**: Ask the user which findings to address first.

**Severity Legend:**

| Severity | Meaning |
|----------|---------|
| `critical` | Dependency chains with extremely high cumulative complexity — architectural risk |
| `high` | Dependency cycles, high-complexity functions, heavily duplicated code |
| `medium` | Moderate duplication, test-only modules, moderately complex functions |
| `low` | Minor duplication below threshold |

### Phase 5: Investigate with MCP (when available)

Before making any code changes, use Octocode MCP tools to validate findings and gather full context. This prevents false-positive fixes and ensures changes are safe.

**Investigation loop for each selected finding:**

```
1. READ finding → extract file, lineStart, lineEnd, category
2. localSearchCode(pattern="symbol from finding") → get lineHint
3. LSP deep dive (see Investigation Playbook above for category-specific steps)
4. Cross-reference with fileInventory → check related issues in same file
5. DECIDE: Is the finding valid? What's the safest fix? What's the blast radius?
```

**Example — investigating a duplicate function finding:**
```
Finding: "Identical function body: parseConfig" in packages/foo/src/config.ts:42-88 and packages/bar/src/setup.ts:15-61

Step 1: localSearchCode(pattern="parseConfig") → found at foo/config.ts line 42, bar/setup.ts line 15
Step 2: lspCallHierarchy(direction="incoming", file="foo/config.ts", lineHint=42) → called by 3 modules in foo/
Step 3: lspCallHierarchy(direction="incoming", file="bar/setup.ts", lineHint=15) → called by 2 modules in bar/
Step 4: lspFindReferences(file="foo/config.ts", lineHint=42) → 5 total references
Step 5: Decision: Both copies are used. Extract to packages/shared/src/parseConfig.ts, update imports in both packages.
```

### Phase 6: Guide Fixes

When the user selects findings to fix, use the `suggestedFix` from each finding:

- **strategy**: High-level approach
- **steps**: Ordered remediation steps

Cross-reference with `fileInventory` to understand the file's full function list, dependency profile, and related issues before making changes.

**After applying fixes**, re-run the scan to verify the findings are resolved:
```bash
node <SKILL_BASE_DIRECTORY>/scripts/index.js --out .octocode/scan/scan-after.json
```

## Report Sections Reference

### `optimizationFindings[]`

Each finding contains:

```
{
  id: "AST-ISSUE-0001",
  severity: "high" | "critical" | "medium" | "low",
  category: "duplicate-function-body" | "duplicate-flow-structure" | "function-optimization" | "dependency-cycle" | "dependency-critical-path" | "dependency-test-only",
  file: "packages/foo/src/bar.ts",
  lineStart: 42,
  lineEnd: 88,
  title: "Human-readable title",
  reason: "Why this is flagged",
  files: ["packages/foo/src/bar.ts:42-88", ...],
  suggestedFix: {
    strategy: "What to do",
    steps: ["Step 1", "Step 2", ...]
  },
  impact: "Why fixing matters"
}
```

### `dependencyGraph`

```
{
  totalModules, totalEdges, unresolvedEdgeCount,
  roots: [],          // modules with no inbound imports
  leaves: [],         // modules with no outbound imports
  cycles: [],         // circular dependency chains
  criticalPaths: [],  // highest-weight transitive chains
  criticalModules: [],// hub modules with high score + connectivity
  testOnlyModules: [],// production modules imported only from tests
  outgoingTop: [],    // modules with most outbound imports
  inboundTop: [],     // modules with most inbound imports
}
```

## Parser Modes

| Mode | Behavior | When to Use |
|------|----------|-------------|
| `auto` (default) | TypeScript compiler API for full analysis (functions, flows, metrics, dependencies). Tree-sitter adds supplementary node counts when available. | General use — best accuracy for dependency and duplicate detection. |
| `typescript` | TypeScript compiler API only. No tree-sitter at all. | When tree-sitter is not installed or causes issues. |
| `tree-sitter` | Tree-sitter as **primary** parser for functions, flows, complexity, and duplicate detection. TypeScript used only for dependency collection (imports/exports). Falls back to TypeScript if tree-sitter is unavailable. | When you want tree-sitter's richer function detection (catches more function expressions, arrow functions in object literals, etc.). |

**How tree-sitter works internally**:
- Two pre-configured parser instances: one for TypeScript (`.ts`, `.js`, `.mjs`, `.cjs`), one for TSX (`.tsx`, `.jsx`). No per-file language swapping.
- Uses official `Parser.SyntaxNode` types from `tree-sitter` package — zero custom type wrappers.
- Direct property access: `node.text`, `node.children`, `node.namedChildren`, `node.childForFieldName()` — no wrapper helpers.
- Complexity counting: Each `binary_expression` with a logical operator (`&&`, `||`) adds exactly 1 to complexity — no double-counting from nested expressions.

Tree-sitter requires `tree-sitter` and `tree-sitter-typescript` packages (included in the skill's `package.json`). Install with `npm install` from the skill directory.

## Graph Output

When `--graph` is passed, a Mermaid markdown file is generated alongside the JSON report (same path with `-graph.md` suffix). It contains:

- **Module Dependency Map**: Top hub modules with edges, cycle markers (red), critical module markers (warning)
- **Dependency Cycles**: Dedicated diagram showing all detected circular chains
- **Critical Dependency Chains**: Heaviest transitive paths visualized
- **Summary Table**: Module count, edges, roots, leaves, cycles, critical paths, test-only modules
- **Critical Modules Table**: Hub nodes ranked by score, risk band, connectivity
- **Test-Only Modules**: List of production files only imported from tests

The `.md` file renders in any Mermaid-compatible viewer (GitHub, VS Code, etc.).

## CLI Reference

```
node scripts/index.js [options]

Options:
  --root <path>                      Repo root (default: cwd)
  --out <path>                       Write JSON report to path
  --json                             Print report to stdout
  --include-tests                    Include *.test* / *.spec* files
  --parser <auto|typescript|tree-sitter>  Parser engine (default: auto)
  --no-tree                          Skip AST tree snapshots
  --emit-tree                        Force include tree snapshots
  --graph                            Emit Mermaid dependency graph alongside JSON
  --min-function-statements N        Min statements for duplicate matching (default: 6)
  --min-flow-statements N            Min control-flow statements for matching (default: 6)
  --critical-complexity-threshold N  Complexity threshold for HIGH findings (default: 30)
  --findings-limit N                 Max findings in report (default: 250)
  --deep-link-topn N                 Max critical dependency paths (default: 12)
  --tree-depth N                     AST tree snapshot depth (default: 4)
  --help                             Show help
```

## Constraints

- **FORBIDDEN**: Modifying the analysis script during a scan session.
- **FORBIDDEN**: Presenting findings without file:line references.
- **FORBIDDEN**: Skipping the summary before diving into individual findings.
- **FORBIDDEN**: Running any file in `scripts/` other than `index.js` — all other files are internal modules.
- **FORBIDDEN**: Making code fixes without first investigating via MCP tools (when Octocode MCP is available).
- **FORBIDDEN**: Using `lspGotoDefinition`, `lspFindReferences`, or `lspCallHierarchy` without a `lineHint` from `localSearchCode`.
- **REQUIRED**: Always present severity alongside each finding.
- **REQUIRED**: Let the user choose which findings to act on before making code changes.
- **REQUIRED**: When Octocode MCP local tools are available, use them to validate findings before applying fixes (see Phase 5: Investigation Playbook).
