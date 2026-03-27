---
name: octocode-code-engineer
description: "Codebase-aware engineering: analysis, planning, implementation. For code understanding, bug fixes, refactors, audits, architecture/security/test-quality reviews. AST/graph/LSP scanning + AI validation."
compatibility: "Node.js >= 18. Full capability with Octocode MCP (ENABLE_LOCAL=true). Falls back to CLI-only AST mode without MCP."
---

# Octocode Code Engineer

Detectors produce hypotheses. AI validates, reasons, and prioritizes. Never present raw findings as facts. Always tell user what you found with evidence, ask before acting on M/L changes.

`<SKILL_DIR>` = directory containing this SKILL.md.

## Tools

| Tool | Purpose |
|------|---------|
| `localSearchCode` | text search + `lineHint` for LSP |
| `localViewStructure` | directory layout, hotspots |
| `localFindFiles` | find by size/time/type/name |
| `localGetFileContent` | read code at evidence location |
| `lspGotoDefinition` | cross-file jump |
| `lspFindReferences` | consumer count (types/vars/functions) |
| `lspCallHierarchy` | function call chains only |
| `<SKILL_DIR>/scripts/run.js` | full deterministic scan |
| `<SKILL_DIR>/scripts/ast/search.js` | live-source AST structural proof |
| `<SKILL_DIR>/scripts/ast/tree-search.js` | scan-artifact AST triage |

MCP check: run `localSearchCode`. If unavailable → CLI-only mode, reduce confidence on semantic claims.

## Discovery flow

Tools chain: each stage output feeds the next. STRUCTURE → SEARCH → AST → LSP → SCAN → VALIDATE.

### Stage 1: Map (structure + candidates)

Batch in parallel:
- `localViewStructure(directoriesOnly=true, depth=3)` → layout
- `localViewStructure(filesOnly=true, extension=.ts)` → source spread
- `localFindFiles(sortBy=size, limit=20)` → largest files (god file candidates)
- `localFindFiles(modifiedWithin=7d)` → recent churn = risk

From results, identify candidate areas: large modules, recent churn, test gaps, shared contract patterns.

### Stage 2: Search (targets + lineHints)

`localSearchCode` for specific targets from Stage 1 candidates:
- Key symbols, patterns, imports, error handling
- Each result provides `lineHint` (required for all LSP calls)
- `filesOnly=true` for fast discovery, then drill into matches

Identify: central symbols (appear in many files), risk patterns (large switches, deep nesting, many params).

### Stage 3: AST proof (structural evidence)

Text search finds strings. AST search proves **structure** — empty catch blocks, nested ternaries, unsafe patterns, `any` types — things regex cannot reliably detect. AST results are facts, not guesses.

```bash
node <SKILL_DIR>/scripts/ast/search.js --preset empty-catch --root <target> --json
node <SKILL_DIR>/scripts/ast/search.js -p 'console.$METHOD($$$ARGS)' --root <target> --json
node <SKILL_DIR>/scripts/ast/search.js --kind function_declaration --root <target> --json
```

See [AST reference](./references/ast-reference.md) for all 16 presets, pattern wildcards (`$X`, `$$$X`), and options.

**Feed forward**: AST match locations become inputs for Stage 4. For each AST finding, use its `file:lineStart` as `lineHint` for `lspFindReferences` to measure blast radius, or `lspCallHierarchy` to trace call chains. Files appearing in both text search AND AST findings are highest-confidence targets.

### Stage 4: LSP semantic analysis

Feed `lineHint` from Stage 2 into LSP:
- `lspGotoDefinition(lineHint=N)` → where symbols originate
- `lspFindReferences(lineHint=N)` → real consumer count = blast radius
- `lspCallHierarchy(lineHint=N, direction=incoming)` → who calls this?
- `lspCallHierarchy(lineHint=N, direction=outgoing)` → what does it call?

Rules: never guess `lineHint`. `lspFindReferences` for types/vars/exports. `lspCallHierarchy` for functions only.

High fan-in = shared contract = high risk. No refs = dead code candidate. Call chains reveal hidden coupling.

### Stage 5: Deep scan (`run.js`)

Full deterministic analysis across 5 pillars (architecture, code-quality, dead-code, security, test-quality) with 86 detector categories. Run from target repo root:

`node <SKILL_DIR>/scripts/run.js [flags]`

| Profile | Flags | What it checks |
|---------|-------|----------------|
| general audit | `--graph --flow` | all pillars + dependency graph + flow evidence |
| architecture | `--features=architecture --graph --graph-advanced` | coupling, cycles, god modules, SDP, cohesion, chokepoints |
| code quality | `--features=code-quality --flow` | complexity, duplicates, halstead, maintainability, async patterns |
| dead code | `--features=dead-code` | dead exports, dead files, unused deps, barrel explosions |
| security | `--features=security --flow` | secrets, injection, eval, XSS, prototype pollution, path traversal |
| test quality | `--features=test-quality --include-tests` | assertion density, mocking, cleanup, focused tests |
| deep dive | `--scope=<path> --graph --flow --semantic` | all + semantic analysis on a focused area |
| full analysis | `--all --graph --graph-advanced --flow` | everything including semantic + advanced graph overlays |
| post-change verify | `--scope=<changed-paths> --no-cache` | re-scan changed files, skip cache |

Key flags: `--exclude=<pillar>` to skip pillars. `--scope=file:functionName` to drill into specific functions. `--semantic` for TypeChecker-powered analysis (12 additional categories). `--graph-advanced` for SCC clusters, package hotspots, chokepoints.

Outputs to `.octocode/scan/<timestamp>/`: `summary.json`, `summary.md`, `findings.json`, pillar files (`architecture.json`, `code-quality.json`, `dead-code.json`, `security.json`, `test-quality.json`), `file-inventory.json`, `ast-trees.txt`, `graph.md`.

See [CLI reference](./references/cli-reference.md) for all flags and thresholds.

Scan output = hypotheses. Validate in Stage 6.

### Stage 6: Validate + score

Read scan output in order:
1. `summary.json` → `featureScores[]` (per-category score/grade), `qualityRating`, `recommendedValidation`, `investigationPrompts[]`
2. `summary.md` → formatted health scores, severity breakdown, top recommendations
3. `findings.json` → `optimizationFindings[]` with per-finding detail
4. Pillar files: `architecture.json`, `code-quality.json`, `dead-code.json`, `security.json`, `test-quality.json`
5. `file-inventory.json` → per-file metrics

**Per finding** — key fields to use:
- `recommendedValidation.tools[]` → which tools to run for confirmation
- `evidence.location` → exact file:line to inspect
- `correlatedSignals[]` → related findings to check together
- `confidence` → scanner's own confidence level
- `suggestedFix.strategy` + `suggestedFix.steps` → actionable fix

**Follow `investigationPrompts[]`** from `summary.json` — these are ready-made next steps.

**Validation chain** per finding:
1. Follow `recommendedValidation.tools[]` instructions
2. `localGetFileContent` at `evidence.location` — read actual code
3. `lspFindReferences` / `lspCallHierarchy` — verify blast radius
4. `ast/search.js` — confirm pattern exists in live source
5. Check `correlatedSignals[]` — validate related findings together

Rate each: `confirmed` (2+ tools agree) | `uncertain` (partial evidence) | `dismissed` (code contradicts finding).

**Scoring**: compare `featureScores[]` grades across pillars. Worst-scoring categories crossed with Stage 1 large/churned files = highest priority targets.

## Candidate discovery

Don't just search for what was asked. Reason about related risks:
- Fixing a function → check callers, tests, sibling functions
- Refactoring a module → check dependency cycles, consumers, barrel re-exports
- Auditing security → check input sources, data flows, output sinks
- Reviewing tests → check untested production code, mock quality, assertion density

## Task sizing

| Size | Scope | Steps |
|------|-------|-------|
| S | single-file, low-risk | UNDERSTAND → stages 2-4 → IMPLEMENT → VERIFY(lite) |
| M | multi-file with consumers | UNDERSTAND → all stages → PLAN → IMPLEMENT → VERIFY |
| L | cross-cutting / architectural | all stages + full validation + improvement plan |

Upgrade to L if: fan-in >20, cycle/hotspot, or unclear contract risk.

## Improvement plan (M/L)

Generate structured plan. Per item:
- **Target**: file:symbol path
- **Issue**: what's wrong + evidence (`tool` + `file:line`)
- **Impact**: consumer count (from `lspFindReferences`), severity, pillar
- **Fix**: strategy + steps (from `suggestedFix` or AI-derived)
- **Test**: tests to add/update
- **Risk**: low/medium/high + mitigation
- **Order**: dependency-aware sequencing (foundations first)

Quality gates: every item has tool-backed evidence, blast radius checked for shared symbols, test coverage verified for changed behavior, no circular execution order.

Present plan to user. Ask before proceeding.

## Verify

S: lint + tests. M: lint + tests + build. L: lint + tests + build + scoped `--no-cache` re-scan.

L tasks: provide before/after finding count and severity delta.

## Hard rules

- Never present unvalidated findings as facts
- Never guess `lineHint`
- Never use `lspCallHierarchy` for non-function symbols
- Never run broad refactors from one noisy signal
- Never skip blast-radius checks on shared symbols (M/L)
- Never implement without presenting plan to user first (M/L)

## Error recovery

| Problem | Recovery |
|---------|----------|
| 0 findings | relax scope/features; check `parseErrors` in `summary.json` |
| LSP unavailable | CLI-only mode; reduce confidence claims |
| AST no matches | widen root/pattern or switch kind/preset |
| scan vs LSP mismatch | report both; treat as uncertain |
| huge findings | triage via `featureScores[]` grades first, filter by severity |

## Tool integration — Octocode + AST + AI

No single tool gives a complete answer. The power is in **chaining Octocode tools with AST scripts and AI reasoning**. Each tool provides a unique evidence type that the others cannot.

### Octocode local tools — what each gives you and why it matters

**`localViewStructure`** — maps the codebase shape: directories, file counts, extensions. Use it first. It tells you *where to look* — large folders, test gaps, unexpected nesting. Without this you're searching blind.

**`localFindFiles`** — finds files by size, modification time, name pattern. Surfaces god files (size), recent churn (time), and naming anomalies. Feeds candidate list to every other tool.

**`localSearchCode`** — text search across the codebase. Its most critical output is `lineHint` — the exact line number that **every LSP tool requires**. Also reveals how symbols spread across files (fan-out). Without `localSearchCode`, LSP tools cannot be called. This is the bridge between text and semantics.

**`localGetFileContent`** — reads actual source code at a specific location. The final verification step: after search/AST/LSP identify *where* and *what*, this tool lets AI *read and reason about* the real code. Use `matchString` to jump to the right section in large files.

**`lspGotoDefinition`** — jumps from a usage to its definition. Answers "what is this symbol actually?" Requires `lineHint` from `localSearchCode`. Resolves ambiguity when search returns multiple candidates.

**`lspFindReferences`** — counts all consumers of a symbol (types, vars, exports, functions). This is **blast radius** — the most important metric for risk assessment. 0 refs = dead code. 50 refs = do not touch without a plan.

**`lspCallHierarchy`** — traces function call chains (incoming: who calls this? outgoing: what does it call?). Functions only. Reveals hidden coupling — a "simple" utility function called transitively by the entire app.

### AST scripts — structural proof that text search cannot provide

**`ast/search.js`** — parses live source files and matches structural patterns (empty catch blocks, `any` types, nested ternaries). Text search finds the string `catch`; AST search proves the catch block is *empty*. AST matches are facts. Use for validation and proof.

**`ast/tree-search.js`** — queries cached `ast-trees.txt` from a prior scan. Fast triage: find all functions, control flow, classes without re-parsing. Use to narrow targets before deeper investigation.

**`run.js`** — full deterministic scan engine. This is the heaviest tool — runs both TypeScript Compiler and tree-sitter parsers across the entire codebase (or a scoped subset). What it produces:

- **5 analysis pillars** with 93 detector categories:
  - **Architecture** (28 categories): dependency cycles, critical paths, SDP violations, high coupling, god modules, orphan/unreachable modules, layer violations, feature envy, untested critical code, import side effects, namespace imports, barrel explosions, export-star leaks, and more
  - **Code quality** (26 categories): duplicate function bodies/flows, cognitive complexity, god functions, halstead effort, low maintainability, excessive parameters, unsafe `any`, empty catch, type assertion escapes, promise misuse, await-in-loop, sync I/O, memory leaks (timers/listeners/collections), message chains, similar function bodies
  - **Dead code** (12 categories): dead exports, dead re-exports, dead files, unused npm deps, barrel explosions, unused imports, orphan implementations, semantic dead exports
  - **Security** (12 categories): hardcoded secrets, eval, unsafe HTML, SQL injection, unsafe regex, prototype pollution, unvalidated input sinks, path traversal, command injection, debug log leakage, sensitive data logging
  - **Test quality** (8 categories): low assertion density, no-assertion tests, excessive mocking, shared mutable state, missing cleanup, focused tests, fake timers without restore, missing mock restoration
- **Semantic phase** (`--semantic`): adds 12 advanced categories using TypeScript TypeChecker + LanguageService — over-abstraction, concrete dependency, circular type dependency, unused parameters, deep override chains, interface compliance, shotgun surgery, narrowable types, semantic dead exports
- **Graph analytics** (`--graph`, `--graph-advanced`): dependency graph with Mermaid visualization, chokepoints, SCC clusters, package boundary analysis, critical hub detection
- **Per-function metrics**: complexity, cognitive complexity, halstead (effort/volume/difficulty/bugs), maintainability index, branch depth, loop depth, params, awaits, calls, returns, statement count
- **Per-file profiles**: empty catches, `any`/assertion counts, magic numbers, async hygiene, security profile, input sources, message chains, performance data, test profile, top-level effects, prototype pollution sites
- **AST fingerprinting**: SHA1 structural hash (ignoring identifiers/literals) for duplicate function body and control flow detection
- **AST tree snapshots**: `ast-trees.txt` for post-scan triage via `ast/tree-search.js`
- **Incremental caching**: only re-parses changed files (by mtime+size). Use `--no-cache` to force full re-scan, `--clear-cache` to reset
- **Scope filtering**: `--scope=path` limits to files/dirs, `--scope=file:functionName` drills into specific functions
- **Output files** (to `.octocode/scan/<timestamp>/`): `summary.json`, `summary.md`, `findings.json`, `architecture.json`, `code-quality.json`, `dead-code.json`, `security.json`, `test-quality.json`, `file-inventory.json`, `ast-trees.txt`, `graph.md`

Findings are hypotheses — validate with Octocode tools + AST search before presenting as facts.

### How they chain together

```
localViewStructure → identifies candidate areas
localFindFiles     → surfaces risky files (large, churned)
localSearchCode    → finds targets + produces lineHint
         ↓
    ast/search.js  → proves structural pattern on live source
         ↓
    lspFindReferences(lineHint) → measures blast radius
    lspCallHierarchy(lineHint)  → traces coupling
         ↓
    localGetFileContent → reads actual code for AI reasoning
         ↓
       AI reasons: "confirmed finding, N consumers affected,
                    severity = X, recommended action = Y"
```

### Decision: what tool next?

| I have... | I need... | Reach for | Why |
|-----------|-----------|-----------|-----|
| Nothing yet | Where to start | `localViewStructure` + `localFindFiles` | Map before you search |
| Candidate files | Specific targets | `localSearchCode` | Get `lineHint` for everything downstream |
| Text match | Is it a real pattern? | `ast/search.js -p` or `--preset` | Text is ambiguous, AST is structural proof |
| AST match at file:line | Who is affected? | `lspFindReferences(lineHint)` | Blast radius = risk |
| AST match on function | What's the call chain? | `lspCallHierarchy(lineHint)` | Hidden coupling |
| Scan finding | Still true in live code? | `ast/search.js --preset` | Scan cache may be stale |
| Confirmed finding | What does the code actually do? | `localGetFileContent` | AI needs to read to reason |
| High fan-in from LSP | What smells cluster here? | `ast/search.js` multiple presets | Hotspot analysis |
| Multiple signals | Full module health? | `run.js --scope=<file>` | Focused scan + AI synthesis |

### Combined patterns

**Validate a smell**: `localSearchCode("catch")` → `ast/search.js --preset empty-catch` proves structure → `lspFindReferences` counts 15 callers → AI: "critical — silent error swallowing in high-traffic function."

**Trace unsafe input**: `ast/search.js --preset any-type` finds untyped param → `localSearchCode` traces the variable → `lspCallHierarchy(outgoing)` shows it reaches a DB call → AI: "injection risk — untyped input flows to data sink in 3 hops."

**Confirm dead code**: scan flags dead-export → `ast/search.js --kind export_statement` confirms export exists → `lspFindReferences` returns 0 → AI: "safe to remove."

**Assess duplication**: scan fingerprints flag duplicate bodies → `localGetFileContent` reads both → `lspFindReferences` checks callers → AI: "shared callers = extract to module; disjoint = tolerable."

### AST engines (reference)

| Engine | Runs when | Produces |
|--------|-----------|----------|
| **ast-grep** (`ast/search.js`) | On-demand | structural matches with file:line |
| **tree-sitter** (inside `run.js`) | During scan | `ast-trees.txt`, function metrics, fingerprints |
| **TypeScript Compiler** (inside `run.js`) | During scan | halstead, cognitive complexity, security, async patterns |

**Triage** with `ast/tree-search.js` (cached, fast). **Prove** with `ast/search.js` (live source, authoritative).

Full syntax, presets, options: [AST reference](./references/ast-reference.md).

## References
- [Tool workflows](./references/tool-workflows.md)
- [CLI reference](./references/cli-reference.md)
- [Output files](./references/output-files.md)
- [AST reference](./references/ast-reference.md)
- [Validation playbooks](./references/validation-playbooks.md)
