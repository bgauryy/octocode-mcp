# Tool Workflows — Research Methodology & Patterns

Complete reference for code analysis using all available tools. General approaches first, then workflows for quality audits, architecture analysis, pre-implementation checks, refactoring, interface changes, and exploration.

Target-repo behavior contracts, CLI/API safety checks, docs sync, and rollout guidance are included directly in this document (workflows 18-21).

---

## Research Primitives

Three fundamental operations. Every investigation chains them.

### SEARCH — find where things are

| Tool | Searches | Best for | Key flags |
|------|----------|----------|-----------|
| `localSearchCode` | Live source (ripgrep) | Text patterns, getting `lineHint` for LSP | `filesOnly`, `fixedString`, `filePageNumber` |
| `ast/search.js` | Live source (AST) | Structural patterns, zero false-positive proof | `--preset`, `-p`, `-k`, `--rule`, `--json`, `--limit` |
| `ast/tree-search.js` | Scan artifact `ast-trees.txt` | Fast triage before reading source | `--file`, `-k`, `-C`, `--json`, `--limit` |
| `localFindFiles` | File metadata | Files by name, size, modification time | `names`, `sortBy`, `sizeGreater`, `modifiedWithin` |
| `lspFindReferences` | Semantic symbol graph | All usages of type/var/export (definitive) | `includeDeclaration`, `includePattern`, `excludePattern` |
| `lspCallHierarchy` | Semantic call graph | Who calls a function / what it calls | `direction`, `depth=1` + chain, `fromRanges[]` |

**Rules:**
- `localSearchCode` always first → produces `lineHint` for all LSP tools
- `ast/search.js` for structural proof → confirms by AST shape, not text
- `ast/tree-search.js` for fast triage → decides where to drill before source reading
- `lspFindReferences` for types/vars/exports; `lspCallHierarchy` for functions only
- Never guess `lineHint`

### FETCH — read what you found

| Tool | Reads | Best for | Key flags |
|------|-------|----------|-----------|
| `localGetFileContent` | Any local file | Targeted or paginated reading | `matchString`, `matchStringContextLines`, `charOffset`, `charLength`, `fullContent`, `startLine`/`endLine` |
| `lspGotoDefinition` | Symbol definition | Cross-file jump to where a symbol is defined | `lineHint` (required from search) |

**Strategy by file size:**

| Size | Approach | Flags |
|------|----------|-------|
| <200 lines | Full read | `fullContent=true` |
| 200-1000 | Jump to section | `matchString="target"`, `matchStringContextLines=5` |
| 1000+ | Paginate | `charOffset=0, charLength=500` → page through |
| Unknown | Match first | `matchString` → check `totalLines` in response |

**Rules:**
- Never `fullContent` on large files — use `matchString` to land on the right section
- `charOffset=0` for imports, `charOffset=<end>` for file tail
- `lspGotoDefinition` after `localSearchCode` — jumps across files
- Read after search, never before

### STRUCTURE — see the shape

| Tool | Shows | Best for | Key flags |
|------|-------|----------|-----------|
| `localViewStructure` | Directory tree (live) | Project layout, module boundaries | `depth`, `filesOnly`, `directoriesOnly`, `extension`, `details` |
| `ast/tree-search.js` | AST tree (scan artifact) | Function spans, nesting, class shapes | `--file`, `-k function_declaration`, `-C 2` |
| `index.js --graph` | Dependency graph | Cycles, critical paths, hotspots | `--graph`, `--graph-advanced`, `--scope` |

**Rules:**
- `localViewStructure(depth=2, directoriesOnly=true)` first → project layout
- `ast/tree-search.js --file X -C 2` → AST shape before reading source
- `index.js --graph --graph-advanced` → architecture with hotFiles, cycles, chokepoints
- Structure informs which files to search and fetch — run before deep reading

---

## The Research Funnel

Chain primitives in this order. Each stage narrows scope for the next.

```
STRUCTURE → SEARCH → FETCH
 80-90%      90-99%    100%
```

| Stage | Reduction | Tools |
|-------|-----------|-------|
| 1. Structure | 80-90% — know where to look | `localViewStructure`, `ast/tree-search.js`, `index.js --graph` |
| 2. Search | 90-99% — know what and where | `localSearchCode`, `ast/search.js`, `localFindFiles`, LSP search |
| 3. Fetch | 100% — read the evidence | `localGetFileContent`, `lspGotoDefinition` |

**Reverse funnel** when you have exact coordinates (e.g. `lspHints` from `findings.json`):
- `lspFindReferences(lineHint=N)` → skip to semantic proof
- `localGetFileContent(startLine, endLine)` → skip to reading

---

## Quick Decision Table

| Question | Approach | Tools |
|----------|----------|-------|
| "What does this codebase look like?" | Structure | `localViewStructure(depth=2)` → `localFindFiles(sortBy=size)` |
| "Does pattern X exist?" | Search (AST) | `ast/search.js --preset` or `-p 'pattern'` |
| "Where is X defined?" | Search → Fetch | `localSearchCode` → `lspGotoDefinition(lineHint)` |
| "Who calls function X?" | Search → Search | `localSearchCode` → `lspCallHierarchy(incoming, lineHint)` |
| "All usages of type/var X?" | Search → Search | `localSearchCode` → `lspFindReferences(lineHint)` |
| "Is export X dead?" | Search → Search | `lspFindReferences(lineHint, includeDecl=false)` → `ast/search.js -p` cross-check |
| "What's the AST shape of file X?" | Structure (AST) | `ast/tree-search.js --file X -C 2` |
| "Read this function" | Fetch | `localGetFileContent(matchString="funcName", contextLines=5)` |
| "Trace flow A → B" | Search chain | `localSearchCode` → `lspGotoDefinition` → `lspCallHierarchy` → repeat |
| "Architecture hotspots?" | Structure → Search | `index.js --graph-advanced` → `lspFindReferences` on hotFiles |
| "Structural smells?" | Search (batch) | `ast/search.js --preset` (multiple presets in parallel) |
| "Did my fix work?" | Search → Structure | `index.js --scope=<changed>` + `ast/search.js --preset` + toolchain |

---

## AST Details

For AST presets, pattern/rule syntax, and exact AST tool usage, use [ast-reference.md](./ast-reference.md).  
This document stays workflow-only.

---

## Efficiency Tips

| Pattern | DO | DON'T |
|---------|-----|-------|
| Layer order | Structure → Search → Fetch | Jump to LSP without search context |
| LSP calls | `localSearchCode` first for `lineHint` | Guess `lineHint` |
| AST search | `--json --limit 10` to start | `--limit 0` on first call |
| AST triage vs proof | `tree-search.js` to decide, `search.js` to prove | `tree-search` as proof of live behavior |
| Large results | `filesOnly=true` for discovery, then drill | Full content on first call |
| File reading | `matchString` for targeted sections | `fullContent` on files >200 lines |
| References | `lspFindReferences` for types/vars, `lspCallHierarchy` for functions | `lspCallHierarchy` on types (fails) |
| Pagination | `charOffset` for content, `filePageNumber` for lists | Skip pagination — data is lost |
| Filters | `includePattern`/`excludePattern` to scope refs | Read all refs then manually filter |
| Batching | Independent tool calls in parallel | Sequential when order doesn't matter |
| Depth | `lspCallHierarchy(depth=1)` + chain manually | `depth=3` single call (slower, noisier) |
| Re-scan | `--scope=<changed-files>` after fix batch | Full re-scan when one file changed |
| Presets | AST presets for known smells (zero false-positive) | Text grep for structural patterns |

---

## Workflows

### 1 — Full Scan → Triage → Validate

Start here for any new codebase or broad audit.

```
index.js --graph --flow                                 → scan + generate hypotheses
summary.md                                              → health scores, hotspots, top recs
findings.json | jq '.[:5]'                              → top findings with lspHints
ast/tree-search.js -k function_declaration --limit 25   → structural triage
localViewStructure(depth=2, directoriesOnly=true)       → project layout
localFindFiles(sortBy="size", sizeGreater="10k")        → hotspot files
lspFindReferences(lineHint=N, includeDeclaration=false) → validate findings via lspHints
lspCallHierarchy(incoming, depth=1)                     → confirm coupling
```

### 2 — Symbol Deep Dive

Trace a function: definition → callers → callees.

```
ast/tree-search.js --file 'target' -k function_declaration -C 2  → AST shape
localSearchCode(pattern="funcName", filesOnly=true)               → file + lineHint
localGetFileContent(matchString="funcName", contextLines=5)       → read context
lspGotoDefinition(lineHint=N)                                     → jump to definition
lspCallHierarchy(incoming, depth=1)                               → who calls it?
lspCallHierarchy(outgoing, depth=1)                               → what does it call?
```

### 3 — Impact Analysis (Pre-Refactor)

Assess blast radius before changing a symbol.

```
ast/search.js -p 'import { $$$NAMES } from $MOD' --json          → structural import map
localSearchCode(pattern="symbolName")                             → lineHint + text matches
lspFindReferences(includeDeclaration=false)                       → all usages
lspFindReferences(includePattern=["**/tests/**"])                 → test coverage count
lspFindReferences(excludePattern=["**/tests/**"])                 → production usages only
```

Few production refs + high test coverage = safe. Many production refs = plan carefully.

### 4 — Dead Export Validation

Fastest path from finding to verdict.

```
lspFindReferences(lineHint=N, includeDeclaration=false)           → 0 refs = dead, >0 = false positive
ast/search.js -p 'import { exportName } from $MOD' --json        → structural cross-check
ast/search.js -p 'exportName' --json --root src/                  → catch dynamic usage
localSearchCode(pattern="exportName")                             → fallback if no lspHints
```

### 5 — Code Smell Sweep (AST Presets)

Structural code smell detection — zero false positives.

```
ast/search.js --preset empty-catch --json --root src/
ast/search.js --preset any-type --json --root src/
ast/search.js --preset console-log --json --root src/
ast/search.js --preset switch-no-default --json --root src/
ast/search.js --preset nested-ternary --json --root src/
ast/search.js --preset non-null-assertion --json --root src/
ast/search.js -p 'eval($$$A)' --json --root src/                 → custom patterns
localGetFileContent(matchString="match", contextLines=5)          → read context
lspCallHierarchy(incoming, depth=1)                               → impact assessment
```

### 6 — Dependency Cycle Tracing

Validate cycles from `architecture.json`.

```
index.js --features=dependency-cycle --graph                      → cycle evidence
architecture.json | jq '.cycles'                                  → cycle paths
ast/search.js -p 'import { $$$N } from $MOD' --json --root <dir> → find back-edge imports
localSearchCode(pattern="import.*from.*moduleA", filesOnly=true)  → importing files
localGetFileContent(matchString="import")                         → read import block
lspGotoDefinition(lineHint=N)                                     → hop through chain
lspCallHierarchy(incoming, depth=1)                               → trace until cycle closes
```

### 7 — Security Sink Validation

Trace data flow from source to sink.

```
ast/search.js -p 'eval($$$A)' --json --root src/
ast/search.js -p '$OBJ.innerHTML = $VAL' --json --root src/
ast/search.js -p 'exec($$$A)' --json --root src/
ast/search.js --rule '{"rule":{"kind":"string","regex":"password|secret|token|api.?key"}}' --json
localSearchCode(pattern="validate|sanitize|normalize")            → find guards
localGetFileContent(matchString="sinkFunc", contextLines=10)      → read sink context
lspGotoDefinition(lineHint=N)                                     → locate sink
lspCallHierarchy(incoming, depth=1)                               → trace source
lspFindReferences(lineHint=N)                                     → all call sites
```

See [validation-playbooks.md](./validation-playbooks.md) for taint-tracing and false-positive dismissal.

### 8 — Scoped Deep-Dive (File or Function)

Drill into a specific flagged file or function.

```
index.js --scope=file.ts --flow --semantic                        → scoped re-scan
index.js --scope=file.ts:funcName --features=cognitive-complexity → function-level
ast/tree-search.js --file 'fileName' -C 2 --limit 50             → full AST shape
ast/search.js -k function_declaration --json --root <dir>         → function spans
localGetFileContent(matchString="export", contextLines=2)         → public surface
localGetFileContent(charOffset=0, charLength=500)                 → imports + top
localGetFileContent(matchString="target", contextLines=5)         → specific section
lspFindReferences(lineHint=N, includeDeclaration=false)           → per-export consumers
lspCallHierarchy(outgoing, depth=1)                               → per-function deps
```

### 9 — Coupling Hotspot Analysis

Quantify coupling for architecture findings.

```
index.js --features=high-coupling,god-module-coupling --graph --graph-advanced
architecture.json | jq '.hotFiles[:5]'                            → top hotfiles
ast/search.js -p 'import { $$$N } from $MOD' --json --root <dir> → import density
localSearchCode(pattern="import.*from.*hotspot", filesOnly=true)  → consumer count
localViewStructure(path="hotspot/", filesOnly=true)               → module file count
localFindFiles(sortBy="size", sizeGreater="10k", path="hotspot/") → largest files
lspFindReferences(lineHint=N, includeDeclaration=false)           → consumers per export
lspCallHierarchy(incoming, depth=1)                               → callers per function
```

High fan-in + large files = decomposition candidate. Low fan-in = less urgent.

### 10 — Fix Verification Loop

Confirm fixes reduced finding count. Run after every fix batch.

```
index.js --scope=<changed-files> --features=<category>            → re-scan
ast/search.js --preset <preset> --json --root <changed-dir>       → verify smells gone
localGetFileContent(matchString="fixedCode", contextLines=3)      → spot-check fix
lspFindReferences(lineHint=N)                                     → symbols still resolve
lspCallHierarchy(incoming, depth=1)                               → callers still connected
Run project lint script (with auto-fix if supported)              → auto-fix + check
Run project test script                                          → no regressions
Run project build script                                         → compiles clean
```

---

## Extended Workflows — Architecture, Planning, Exploration

### 11 — Pre-Implementation Check ("Where should new code live?")

Before writing new code, understand the existing landscape to pick the right location and avoid coupling traps.

```
localViewStructure(depth=2, directoriesOnly=true)                 → project layout
index.js --graph --graph-advanced                                 → dependency map + hotspots
architecture.json | jq '.hotFiles[:5]'                            → avoid adding to hotspots
localSearchCode(pattern="similar-feature", filesOnly=true)        → find analogous patterns
ast/search.js -p 'export function $NAME($$$P) { $$$B }' --json --root <candidate-dir>
                                                                  → existing public API shape
lspFindReferences(lineHint=N, includeDeclaration=false)           → consumer count of candidate module
localGetFileContent(matchString="export", contextLines=2)         → public surface of target
```

**Decision**: low fan-in module with related exports = good home. High fan-in hotspot = add to a new module instead. Check for existing patterns — follow the codebase's conventions.

### 12 — Refactoring Plan (Safe Restructure)

Plan a multi-file refactor with full blast radius awareness.

```
# Step 1: Map what exists
localSearchCode(pattern="targetSymbol", filesOnly=true)           → all files containing symbol
lspFindReferences(lineHint=N, includeDeclaration=false)           → all consumers
lspFindReferences(includePattern=["**/tests/**"])                 → test coverage
lspFindReferences(excludePattern=["**/tests/**"])                 → production consumers

# Step 2: Understand dependencies
lspCallHierarchy(incoming, depth=1)                               → who calls it?
lspCallHierarchy(outgoing, depth=1)                               → what does it depend on?
ast/search.js -p 'import { $$$N } from $MOD' --json --root <dir> → import graph

# Step 3: Check for hidden coupling
index.js --scope=<target-files> --features=architecture --graph   → cycle/coupling risk
architecture.json | jq '.cycles'                                  → will refactor create/break cycles?

# Step 4: Assess safety
index.js --scope=<target-files> --features=test-quality --include-tests → test quality around target
```

**Output**: file list + consumer count + test coverage + coupling risk = refactoring confidence level.

### 13 — Codebase Exploration (New Repo Orientation)

Quickly understand an unfamiliar codebase's shape, patterns, and conventions.

```
# Step 1: Layout
localViewStructure(depth=2, directoriesOnly=true)                 → top-level structure
localViewStructure(depth=1, path="src/", details=true)            → source root shape + sizes

# Step 2: Scale and hotspots
localFindFiles(sortBy="size", sizeGreater="10k")                  → largest files = architectural hotspots
localFindFiles(modifiedWithin="7d", sortBy="modified")            → recently active areas
localFindFiles(names=["index.ts", "index.js"])                    → barrel files = module boundaries

# Step 3: API surface
localSearchCode(pattern="export", filesOnly=true, filesPerPage=5) → public API breadth
ast/search.js -k class_declaration --json --root src/             → class-based patterns?
ast/search.js -p 'export default' --json --root src/              → default export patterns?

# Step 4: Architecture shape
index.js --graph --flow                                           → dependency graph + flow
summary.md                                                        → health scores overview

# Step 5: Conventions
ast/search.js -p 'import { $$$N } from $MOD' --json --limit 20 --root src/  → import style
localSearchCode(pattern="describe\\(|it\\(", filesOnly=true)      → test patterns
localFindFiles(names=["*.test.ts", "*.spec.ts"])                  → test file locations
```

### 14 — Test Strategy Analysis

Map test coverage gaps and test quality issues.

```
# Step 1: Test landscape
localFindFiles(names=["*.test.ts", "*.spec.ts", "*.test.js"])    → all test files
localViewStructure(path="tests/", depth=2, directoriesOnly=true)  → test structure
localSearchCode(pattern="describe\\(", filesOnly=true)            → test file density

# Step 2: Coverage gaps — find untested exports
localSearchCode(pattern="export function", filesOnly=true, path="src/")
lspFindReferences(lineHint=N, includePattern=["**/tests/**"])     → per-export test refs
                                                                  → 0 test refs = coverage gap

# Step 3: Test quality
index.js --features=test-quality --include-tests                  → flaky patterns, mock abuse
ast/search.js --preset empty-catch --json --include-tests         → swallowed errors in tests
ast/search.js -p 'vi.mock($$$A)' --json --include-tests          → mock density
ast/search.js -p 'expect($$$A)' --json --include-tests           → assertion density

# Step 4: Critical untested code
index.js --graph --features=architecture                          → identify critical paths
architecture.json | jq '.hotFiles[:5]'                            → high-risk files
lspFindReferences(lineHint=N, includePattern=["**/tests/**"])     → test coverage per hotfile
```

**Output**: untested exports list + test quality findings + critical untested hotspots = test priority plan.

### 15 — Code Review Support (Change Impact Analysis)

Assess the architectural impact of a set of changed files.

```
# Step 1: Understand the changes
localGetFileContent(matchString="changed-function", contextLines=5) → read changed code

# Step 2: Blast radius per changed symbol
localSearchCode(pattern="changedSymbol")                          → lineHint
lspFindReferences(lineHint=N, includeDeclaration=false)           → all consumers affected
lspFindReferences(excludePattern=["**/tests/**"])                 → production impact only
lspCallHierarchy(incoming, depth=1)                               → direct callers

# Step 3: Architecture effect
index.js --scope=<changed-files> --features=architecture --graph  → coupling/cycle delta
ast/search.js -p 'import { $$$N } from $MOD' --json --root <dir> → new import patterns

# Step 4: Quality check on changed code
index.js --scope=<changed-files> --features=code-quality,security → new quality issues?
ast/search.js --preset any-type --json --root <changed-dir>       → new `: any` introduced?
ast/search.js --preset empty-catch --json --root <changed-dir>    → new empty catches?

# Step 5: Test coverage of changes
lspFindReferences(lineHint=N, includePattern=["**/tests/**"])     → are changes tested?
```

**Output**: consumer impact count + architecture delta + new quality issues + test coverage = review verdict.

### 16 — Code Quality Review (Module or File)

Focused quality review of a specific module, file, or directory — smells, complexity, dead code, type safety, and maintainability.

```
# Step 1: Scoped scan with all quality signals
index.js --scope=<target> --features=code-quality,dead-code --flow --semantic
summary.md                                                        → health scores for target
findings.json | jq '.[:10]'                                       → top findings

# Step 2: AST smell sweep (zero false-positive structural checks)
ast/search.js --preset empty-catch --json --root <target>
ast/search.js --preset any-type --json --root <target>
ast/search.js --preset type-assertion --json --root <target>
ast/search.js --preset non-null-assertion --json --root <target>
ast/search.js --preset console-log --json --root <target>
ast/search.js --preset nested-ternary --json --root <target>
ast/search.js --preset switch-no-default --json --root <target>

# Step 3: Complexity and god-module check
ast/tree-search.js --file '<target>' -k function_declaration -C 2 → function spans + nesting
index.js --scope=<target> --features=cognitive-complexity,god-module,god-function

# Step 4: Dead code in target
lspFindReferences(lineHint=N, includeDeclaration=false)           → per-export consumer count
                                                                  → 0 refs = dead export
ast/search.js -p 'import { $$$N } from $MOD' --json              → structural cross-check

# Step 5: Maintainability assessment
localGetFileContent(matchString="export", contextLines=2)         → public surface size
lspCallHierarchy(outgoing, depth=1)                               → dependency count per function
lspCallHierarchy(incoming, depth=1)                               → fan-in per export
```

**Output**: smell count + complexity scores + dead exports + fan-in/fan-out + maintainability = quality verdict with file:line evidence.

### 17 — Full Architecture Analysis

Complete architecture health assessment: dependency graph, cycles, coupling, boundaries, critical paths.

```
# Step 1: Full architecture scan
index.js --graph --graph-advanced --flow --features=architecture
summary.md                                                        → architecture health score
architecture.json | jq '.cycles'                                  → all dependency cycles
architecture.json | jq '.hotFiles[:10]'                           → top risk files (fan-in + complexity + cycle membership)
architecture.json | jq '.sccClusters'                             → strongly connected components
architecture.json | jq '.chokepoints'                             → architectural bottlenecks
graph.md                                                          → Mermaid dependency visualization

# Step 2: Validate top hotspots with LSP
localSearchCode(pattern="hotFileName", filesOnly=true)            → lineHint
lspFindReferences(lineHint=N, includeDeclaration=false)           → fan-in (consumer count)
lspCallHierarchy(outgoing, depth=1)                               → fan-out (dependency count)
lspCallHierarchy(incoming, depth=1)                               → direct callers

# Step 3: Module boundary analysis
ast/search.js -p 'import { $$$N } from $MOD' --json --root src/  → cross-module imports
localSearchCode(pattern="export \\* from", filesOnly=true)        → barrel re-exports
index.js --features=package-boundary-violation,layer-violation     → boundary violations

# Step 4: Cycle deep-dive (per cycle)
ast/search.js -p 'import { $$$N } from $MOD' --json --root <cycle-dir>
lspGotoDefinition(lineHint=N)                                     → hop through cycle
localGetFileContent(matchString="import")                         → confirm back-edge

# Step 5: Critical path analysis
architecture.json | jq '.criticalPaths'                           → longest dependency chains
lspCallHierarchy(incoming, depth=1)                               → who depends on each hub?
```

**Output**: cycle list + SCC clusters + chokepoints + hotfiles (ranked) + boundary violations + critical paths + fan-in/fan-out per module = full architecture health report.

### 18 — Smart Coding (Impact-Aware Changes)

Before and after making code changes, check blast radius and verify safety. Use this whenever implementing features, fixing bugs, or modifying existing code.

```
# === BEFORE CODING ===

# Step 0: Define the behavior contract
# current behavior, desired behavior, invariants, non-goals, user-facing contract

# Step 1: Understand the target area
localViewStructure(path="target/dir", depth=2)                    → module layout
localGetFileContent(matchString="targetFunction", contextLines=10) → read current code
lspGotoDefinition(lineHint=N)                                     → understand definitions

# Step 2: Blast radius check
localSearchCode(pattern="targetSymbol")                           → lineHint
lspFindReferences(lineHint=N, includeDeclaration=false)           → total consumers
lspFindReferences(excludePattern=["**/tests/**"])                 → production consumers
lspFindReferences(includePattern=["**/tests/**"])                 → test coverage
lspCallHierarchy(incoming, depth=1)                               → direct callers

# Step 3: Architecture safety
index.js --scope=<target-files> --features=architecture --graph   → coupling/cycle risk
architecture.json | jq '.cycles'                                  → will change create new cycles?

# Step 4: Existing patterns (follow conventions)
ast/search.js -p 'similar-pattern' --json --root <nearby-dir>    → how does the codebase do this?
localSearchCode(pattern="similar-feature", filesOnly=true)        → analogous implementations

# === MAKE THE CHANGE ===

# Step 5: Implement the code change
# ... (apply edits) ...

# === AFTER CODING ===

# Step 6: Verify the behavior
Run project test script                                           → happy path + regression coverage

# Step 7: Verify no new issues
index.js --scope=<changed-files> --features=code-quality,architecture
ast/search.js --preset any-type --json --root <changed-dir>       → no new `: any`?
ast/search.js --preset empty-catch --json --root <changed-dir>    → no new swallowed errors?

# Step 8: Verify references intact
lspFindReferences(lineHint=N)                                     → moved/renamed symbols resolve
lspCallHierarchy(incoming, depth=1)                               → callers still connected

# Step 9: User-facing contract and docs
# run CLI / API / integration / contract checks when relevant
# update docs, examples, help output, and migration notes when behavior changed

# Step 10: Project toolchain
Run project lint script (with auto-fix if supported)
Run project build script
```

**Decision gates**:
- Step 2: >20 production consumers = high-risk change, consider feature flag or incremental migration
- Step 3: change touches cycle member or hotfile = extra caution, verify with re-scan after
- Step 7: new findings = fix before committing
- Step 9: docs or contract drift = fix before committing
- Step 10: any failure = investigate before proceeding

### 19 — CLI Change Safety

Use when changing commands, flags, help text, output, or exit behavior.

```
# Step 1: Find the CLI entry and surface
localSearchCode(pattern="process.argv|commander|yargs|cac|clipanion|bin", filesOnly=true)
localFindFiles(names=["*cli*", "bin", "*.command.*"])             → likely entry points
localGetFileContent(matchString="command", contextLines=8)         → commands / options / defaults

# Step 2: Find affected tests and docs
localSearchCode(pattern="--flag-name|command-name", filesOnly=true) → tests, scripts, docs using it
localFindFiles(names=["README.md", "*.md"])                        → user docs and examples

# Step 3: Verify behavior
node <entry> --help                                                → help / usage output
node <entry> <happy-path>                                          → stdout + exit code
node <entry> <bad-input>                                           → stderr + exit code
Run CLI test script if the project has one                         → if present
Run e2e test script if the project has one                         → if present
```

**Checklist**: names, aliases, defaults, positional args, stdout/stderr, exit codes, env/config inputs, machine-readable output, backward compatibility.

### 20 — API Contract Safety

Use when changing handlers, endpoints, schemas, DTOs, or serialized responses.

```
# Step 1: Find the public surface
localSearchCode(pattern="router\\.|app\\.|handler|endpoint|resolver|mutation|query", filesOnly=true)
localSearchCode(pattern="zod|joi|schema|OpenAPI|response", filesOnly=true) → contract files
localGetFileContent(matchString="route", contextLines=8)           → request / response code

# Step 2: Trace affected internals
localSearchCode(pattern="type Response|interface Response|Dto|DTO", filesOnly=true)
lspFindReferences(lineHint=N, includeDeclaration=false)            → shared type consumers
lspCallHierarchy(outgoing, depth=1)                                → handler -> service flow

# Step 3: Verify the contract
Run integration test script if the project has one                 → if present
Run contract test script if the project has one                    → if present
Run project test script                                            → fallback regression coverage
```

**Checklist**: request schema, response shape, status codes, error bodies, auth, pagination, idempotency, versioning, deprecation, migration notes.

### 21 — Docs and Rollout Sync

Use when public behavior changed or a risky change needs an operational plan.

```
# Step 1: Find docs and examples
localFindFiles(names=["README.md", "*.md", "openapi*.yaml", "openapi*.json", ".env.example"])
localSearchCode(pattern="flag-name|endpoint-name|env-var-name", filesOnly=true) → docs/examples using old behavior

# Step 2: Update completion criteria
# docs/help/examples/migration notes updated
# feature flag / rollout / telemetry / rollback decided when needed

# Step 3: Verify docs-specific tooling
Run docs build script if the project has one                       → if present
Run docs check script if the project has one                       → if present
```

**Output**: updated docs list + compatibility note + rollout / rollback plan, or an explicit statement that no public docs or rollout work was needed.
