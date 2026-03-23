---
name: octocode-code-engineer
description: "Codebase-aware code engineering — understand, analyze, plan, and implement with architecture, quality, and blast radius awareness. Triggers: 'how does X work', 'implement this', 'fix this bug', 'refactor this', 'audit code quality', 'check architecture', 'find test gaps', 'security review', 'find cycles', 'dependency analysis', or any task requiring deep file-level comprehension"
compatibility: "Requires Node.js >= 18. Full power with Octocode MCP (ENABLE_LOCAL=true) for LSP + local tools. Falls back to CLI-only (AST structural search) when MCP unavailable."
---

# Octocode Code Engineer

Analyze, plan, and implement code changes with full codebase awareness — architecture, blast radius, quality, and test coverage inform every decision.

**Core principle: deterministic detection + AI-powered validation.** AST detectors flag structural candidates cheaply. The agent validates with tools, confirms or dismisses, and explains. Scanner = hypothesis generator, not source of truth.

## When NOT to Use This Skill

This skill analyzes **structure and architecture** via AST and LSP. It is the wrong tool for:

| Problem | Why not here | Better approach |
|---------|-------------|----------------|
| **Syntax errors / won't compile** | Scanner requires parseable code; broken syntax yields 0 findings or misleading results | Fix syntax first (compiler/linter errors), then scan |
| **Code style / formatting** | Style is subjective and enforced by linters, not structural analysis | Use ESLint, Prettier, or project-level lint rules |
| **Runtime debugging** (crashes, wrong output, perf profiling) | AST is static — it cannot observe runtime values, timing, or memory | Use debugger, logging, profiling tools, or browser devtools |
| **Software Composition Analysis (SCA)** | Vulnerability scanning of dependencies is a different domain | Use `npm audit`, Snyk, Dependabot, or similar SCA tools |
| **Generating boilerplate / scaffolding** | This skill analyzes existing code; it doesn't generate project templates | Use framework CLIs (`create-react-app`, `nest new`, etc.) |

If the task is **purely** one of the above, skip this skill entirely. If the task *includes* one of these alongside structural concerns (e.g., "fix this bug **and** check what else is fragile"), use this skill for the structural part.

## Task Sizing

Before starting, classify the task. This controls how many workflow steps to run and how thorough each step is.

| Size | Examples | Steps to run | Depth |
|------|----------|-------------|-------|
| **S** — focused, low-risk | Rename variable, fix typo, move constant, one-line bug fix | UNDERSTAND → RESEARCH → IMPLEMENT → VERIFY (lite) | Search target, read context, change, lint+test |
| **M** — bounded change, some consumers | Add function, fix multi-file bug, add test coverage, small refactor | UNDERSTAND → STRUCTURE (lite) → RESEARCH → IMPLEMENT → VERIFY | Check blast radius for changed symbols, run tests |
| **L** — cross-cutting, architectural | New feature, large refactor, architecture audit, full health check | All steps: UNDERSTAND → STRUCTURE → RESEARCH → SCAN → OUTPUT → PLAN → IMPLEMENT → VERIFY | Full scan, validate findings, plan with blast radius, delta verification |

**Default to M** when unsure. Upgrade to L if you discover high fan-in, cycles, or >20 consumers during research. Downgrade to S if the change is trivially scoped.

## Tools

**CLI scan scripts** — hypothesis generation, structural proof

| Script | Purpose |
|--------|---------|
| `<SKILL_DIR>/scripts/run.js` | **Full scan (auto-installs deps on first run)** — `--scope`, `--graph`, `--flow`, `--semantic`, `--features`; use `--help` for all flags |
| `<SKILL_DIR>/scripts/ast/search.js` | Structural search on **live source** files; presets (`--list-presets`), `-p` pattern / `-k` kind / `--rule` JSON / `--preset` modes |
| `<SKILL_DIR>/scripts/ast/tree-search.js` | Search generated `ast-trees.txt` from scan; `-k` kind (PascalCase or snake_case), `-p` regex, `--file`/`--section` filters, `-C` context, `--json` |

`<SKILL_DIR>` = the directory containing this `SKILL.md` file. Resolve it from the skill's absolute path before running any script.

> **Dependencies**: `run.js` auto-installs `node_modules` on first use (requires `npm` on PATH). The AST search scripts (`ast/search.js`, `ast/tree-search.js`) need deps already installed — run the full scan once first, or run `npm install` in `<SKILL_DIR>` manually.

**Octocode MCP tools** — search, read, semantic proof

| Tool | Key params | Purpose |
|------|-----------|---------|
| `localViewStructure` | `path`, `depth`(1-5), `pattern`(glob), `directoriesOnly`, `filesOnly`, `extension`, `sortBy`(name/size/time/ext), `details` | Project layout, file/folder names, structure assessment |
| `localFindFiles` | `path`, `name`/`iname`/`names`(glob), `modifiedWithin`("7d","2h"), `sizeGreater`/`sizeLess`, `sortBy`(modified/size/name), `type`(f/d), `excludeDir` | Find files by metadata — time, size, name patterns |
| `localSearchCode` | `pattern`, `path`, `filesOnly`(fast), `type`(ts/js/py), `perlRegex`, `wholeWord`, `contextLines`, `count`, `mode`(discovery/paginated/detailed) | Text search — **always run first** to get `lineHint` for LSP calls |
| `localGetFileContent` | `path`, `matchString`+`matchStringContextLines`, `startLine`/`endLine`, `fullContent` | Targeted reading by match or range; `fullContent` for small files |
| `lspFindReferences` | `lineHint` (required), `includePattern`/`excludePattern` for test/prod split | Consumer count. Works on types, vars, exports |
| `lspCallHierarchy` | `lineHint` (required), `incoming`/`outgoing`, `depth` | Call chains. **Functions only** — fails on types/vars |
| `lspGotoDefinition` | `lineHint` (required) | Cross-file definition jump |

**MCP detection**: try `localSearchCode` on a known pattern. If it fails → MCP unavailable, fall back to CLI-only mode (AST scripts + `localGetFileContent` if available).

**CLI-only fallback**: when MCP is unavailable, use `ast/search.js` for structural checks, re-scan with `--scope` for validation, and mark confidence as lower since semantic proof is missing.

**Parallel batching**: batch independent tool calls in a single round — e.g., run `localViewStructure` + `localFindFiles` + `localSearchCode` together when they don't depend on each other's output. This cuts latency on every step.

### Tool chains — how tools feed each other

Every tool produces output that unlocks the next. Never use tools in isolation — chain them.

```
Structure ──→ Search ──→ LSP ──→ Content
    ↑            ↑         ↓         ↓
    └── Scan ────┴── AST ──┴── evidence
```

| Source | Produces | Feeds into |
|--------|----------|------------|
| `localViewStructure` | project shape, file paths | `localSearchCode` scope, `--scope` for scan |
| `localFindFiles` | file paths, sizes, hotspot candidates | `localSearchCode` scope, `--scope` for scan |
| `localSearchCode` | `lineHint`, file list | **all LSP tools** (required input), `localGetFileContent` |
| `index.js` (scan) | `findings.json` with `lspHints[]`, `architecture.json` | LSP validation calls, `ast/search.js` for structural proof |
| `ast/tree-search.js` | candidate files/functions from scan snapshot | `ast/search.js` for live proof, `localGetFileContent` for reading |
| `ast/search.js` | structural matches + locations (zero false-positive) | `localGetFileContent` for context, `lspFindReferences` for semantic reach |
| `lspGotoDefinition` | definition location (cross-file) | `lspCallHierarchy` at that location, `lspFindReferences`, `localGetFileContent` |
| `lspFindReferences` | consumer list + count | `ast/search.js` to check import patterns, `localGetFileContent` to read consumers |
| `lspCallHierarchy` | call chain (incoming/outgoing) | `lspGotoDefinition` for next hop, `lspCallHierarchy` to keep chaining |
| `localGetFileContent` | code content | **final evidence** — confirms or dismisses |

**Key chains:**
- **AST → LSP**: `ast/search.js` finds structural candidate → `localSearchCode` for `lineHint` → `lspFindReferences` for semantic reach
- **LSP → AST**: `lspCallHierarchy` finds hotspot function → `ast/tree-search.js` checks its nesting/complexity shape
- **Scanner → LSP → AST**: `findings.json` `lspHints[]` → LSP validates → `ast/search.js --preset` confirms pattern
- **Graph → LSP → Content**: `architecture.json` `hotFiles[]` → `lspFindReferences` for real fanIn → `localGetFileContent` to read why

## Workflow

```
UNDERSTAND → STRUCTURE → RESEARCH → SCAN → OUTPUT → PLAN → IMPLEMENT → VERIFY
```

Skip steps based on task size (see Task Sizing above). S tasks skip STRUCTURE, SCAN, OUTPUT, PLAN. M tasks skip SCAN and OUTPUT. L tasks run all steps.

---

### Step 1: UNDERSTAND

Clarify scope before touching tools.

| Task type | What to capture |
|-----------|----------------|
| Explore | What to learn, which modules, depth |
| Implement / fix | Current vs desired behavior, acceptance criteria, edge cases |
| Audit / review | Scope, which pillars (quality, security, architecture) |
| Architecture | Which concerns (cycles, coupling, hotspots, layers) |

> **GATEWAY** — Only ask the user for clarification when the request is genuinely ambiguous (missing target, conflicting requirements, unclear scope). If the intent and target are clear, proceed directly.

---

### Step 2: STRUCTURE — Layout, names, scale

**Skip for S tasks.** For M tasks, run only Skeleton + the queries relevant to your target area.

Build a mental model before searching code. Pick queries based on what you need to know:

| What | Query | Flags | When needed |
|------|-------|-------|-------------|
| Skeleton | `localViewStructure` | `directoriesOnly=true, depth=3` | Always (M and L) |
| Source files | `localViewStructure` | `extension=".ts", filesOnly=true` | When you need to find relevant files |
| God files | `localFindFiles` | `sizeGreater="50K", sortBy=size` | L tasks, audit, architecture review |
| Active areas | `localFindFiles` | `modifiedWithin="7d", sortBy=modified` | When investigating recent changes |
| Entry points | `localFindFiles` | `name="index.*"` | When understanding module boundaries |
| Test shape | `localViewStructure` | `pattern="*.test.*"` | When assessing test coverage |
| Vague dirs | `localFindFiles` | `type="d", name="*util*"` | During audit/architecture tasks |

Batch the queries you need in parallel.

**Structure → Scan decision table** (L tasks only — use what you find here to pick scan flags in Step 4):

| Structure signal | Recommended scan flags |
|-----------------|----------------------|
| Files > 50K, deep nesting | `--features=code-quality --scope=<file>` |
| `utils/` sprawl, unclear module boundaries | `--features=architecture --graph` |
| No test dirs, sparse test files | `--features=test-quality --include-tests` |
| Many config files, env handling | `--features=security` |
| High file count, complex imports | `--graph --graph-advanced --features=architecture` |
| Recently active hotspot cluster | `--scope=<hotspot-dir> --flow --semantic` |

> **GATEWAY** — For L tasks: flag unusual or disorganized structure — this context shapes how you interpret findings later. For M tasks: proceed to RESEARCH.

---

### Step 3: RESEARCH

Funnel: **Search → Trace → Read** — each stage narrows scope.

| Goal | Tools |
|------|-------|
| See the shape | `localViewStructure`, `localFindFiles`, `ast/tree-search.js` |
| Find targets | `localSearchCode` (produces `lineHint`) + `ast/search.js` for structural proof |
| Trace semantics | `lspGotoDefinition` → `lspCallHierarchy` → `lspFindReferences` |
| Trace code paths & flows | `lspCallHierarchy(outgoing)` → chain hop-by-hop → `lspCallHierarchy(incoming)` to close the loop. Use `localSearchCode` → `lspGotoDefinition` → repeat for cross-file tracing |
| Read evidence | `localGetFileContent(matchString=...)` |

For **S tasks**: search for the target, read context, trace immediate callers/consumers if modifying a shared symbol. That's enough.

For **M tasks**: add blast radius check (`lspFindReferences` with test/prod split) for any symbol you plan to change.

For **L tasks**: also use scan outputs (from Step 4) for duplication and architecture signals:
- Find duplication: `code-quality.json` `duplicateFlows` → `ast/search.js -p` on candidate patterns → `localGetFileContent` to compare bodies
- Identify critical parts: `architecture.json` `hotFiles[]` + `criticalPaths[]` + `chokepoints[]` → `lspFindReferences` to validate fanIn/fanOut

**Rules**: never guess `lineHint`. `lspFindReferences` for types/vars; `lspCallHierarchy` for functions only. If a finding has `lspHints[]`, run those first.

See [tool workflows](./references/tool-workflows.md) for full methodology.

> **GATEWAY** — If research reveals unexpected complexity or ambiguity (e.g., >20 consumers, cycle membership, unclear ownership), pause and share what you found before continuing.

---

### Step 4: SCAN (L tasks only)

Choose flags based on the task and structure signals from Step 2:

```bash
node <SKILL_DIR>/scripts/index.js [flags]    # run from target repo root
```

**Note:** AST tree output (`ast-trees.txt`) is generated by default. Use `--no-tree` to suppress it. No need to add `--emit-tree` unless it was previously suppressed.

| Task | Recommended flags |
|------|-------------------|
| **Default / general audit** | `--graph --flow` |
| Architecture review | `--graph --graph-advanced --features=architecture` |
| Code quality audit | `--features=code-quality --flow` |
| Find duplicated code | `--features=code-quality --flow --similarity-threshold 0.8` |
| Dead code cleanup | `--features=dead-code` |
| Security review | `--flow --features=security` |
| Test quality check | `--features=test-quality --include-tests` |
| Type-aware design signals | `--semantic` (adds ~3-5s) |
| Full health check | `--graph --flow --all --graph-advanced` |
| Scoped deep-dive | `--scope=<path> --graph --flow --semantic` |
| Post-fix verification | `--scope=<changed-files> --no-cache --features=code-quality,architecture` |

Additional useful flags:

| Flag | When |
|------|------|
| `--scope=<path>` | Narrow to path, file, or `file:symbol` |
| `--exclude=X,Y` | Run everything EXCEPT given pillars/categories. Mutually exclusive with `--features` |
| `--similarity-threshold 0.8` | Tune near-clone detection sensitivity (default 0.85) |
| `--flow-dup-threshold 2` | Lower bar for repeated flow patterns (default 3) |
| `--no-cache` | Force re-parse all files (useful after changes) |
| `--json` | Print report JSON to stdout |
| `--layer-order ui,service,repo` | Layer violation detection |

**AST search** — two tools, different inputs:

`ast/search.js` searches **live source** (zero false positives, always current):
```bash
node <SKILL_DIR>/scripts/ast/search.js -p 'console.log($$$ARGS)' --root ./src --json
node <SKILL_DIR>/scripts/ast/search.js --preset empty-catch --root ./src
node <SKILL_DIR>/scripts/ast/search.js -k function_declaration --root ./src
node <SKILL_DIR>/scripts/ast/search.js --list-presets
```

`ast/tree-search.js` searches **scan artifacts** (`ast-trees.txt`). Fast triage of structure without re-parsing:
```bash
node <SKILL_DIR>/scripts/ast/tree-search.js -i .octocode/scan -k ClassDeclaration
node <SKILL_DIR>/scripts/ast/tree-search.js -i .octocode/scan -p 'IfStatement|ForOfStatement' --file 'src/api'
node <SKILL_DIR>/scripts/ast/tree-search.js -i .octocode/scan -k MethodDeclaration -C 2 --json
```

When `-i` points to `.octocode/scan`, it auto-picks the latest scan by modification time. Point to a specific scan dir to avoid picking a shallow rescan.

See [CLI reference](./references/cli-reference.md) and [AST reference](./references/ast-reference.md) for all flags and presets.

---

### Step 5: OUTPUT — Read, validate, rate (L tasks only)

Read scan outputs in priority order — stop when you have enough context:

| File | Content | Read when |
|------|---------|-----------|
| `summary.md` | Health scores, pillar grades, top recommendations, investigation prompts | **Always first** — drives triage |
| `findings.json` | Prioritized queue with `lspHints[]`, `flowTrace[]`, `correlatedSignals[]`, `impact`, `suggestedFix` | Drill into specific categories |
| `architecture.json` | Cycles, `criticalPaths[]`, `hotFiles[]` (riskScore/fanIn/fanOut/inCycle/onCriticalPath), `chokepoints[]`, `sccClusters[]` | Architecture, critical paths, coupling |
| `code-quality.json` | Quality findings + `duplicateFlows { duplicateFunctions[], redundantFlows[] }` | Duplication, complexity, performance |
| `dead-code.json`, `security.json`, `test-quality.json` | Pillar-specific findings | Targeted pillar drill-down |
| `file-inventory.json` | Per-file: functions, `flows[]`, `cfgFlags`, `effectProfile`, `topLevelEffects[]`, `dependencyProfile`, `issueIds[]` | Deep file investigation, flow behavior, side-effect risk |

See [output files](./references/output-files.md) for schemas. Start with `summary.md` — use it to decide which JSONs to open. Filter large `findings.json`: `jq '.optimizationFindings[:10]'` or `select(.severity == "high")`.

**Validate + rate.** Findings are hypotheses. Chain tools to confirm or dismiss:

1. **`lspHints[]` + `flowTrace[]`** — run pre-computed LSP calls first. Walk `flowTrace[]` hops with `lspGotoDefinition` → `lspCallHierarchy` to confirm paths.
2. **Read + trace** — `localGetFileContent(matchString=...)` for code context. `lspCallHierarchy(incoming)` for callers, `lspFindReferences` for all usages.
3. **Cross-validate** — `correlatedSignals[]` link related findings (group = stronger signal). Chokepoint in `architecture.json` + finding in same file = convergent signal, rate higher.
4. **Structural proof** — `ast/search.js --preset` or `-p` to confirm the pattern exists in live source. Zero false-positive structural evidence.
5. **Rate**: `confirmed` / `dismissed` (explain why) / `uncertain` (say what's missing).

See [validation playbooks](./references/validation-playbooks.md) for per-category validation tactics and convergent signal patterns.

When MCP is unavailable: use `ast/search.js` for structural checks and re-scan with `--scope`. Mark confidence accordingly.

> **GATEWAY** — Present validated + rated findings. For audit/review tasks, ask before planning. For implementation tasks where the user already specified what to do, proceed to PLAN.

---

### Step 6: PLAN

**Skip for S tasks** — go straight to IMPLEMENT.

Architecture-first, quality-aware planning. Every plan must answer: what changes, what breaks, what tests cover it.

**Priority order**: confirmed critical fixes → architecture improvements → quality cleanup → docs/contract work.

**Pre-change checks** — scale to risk:

| Check | Tools | When required |
|-------|-------|---------------|
| Blast radius | `lspFindReferences(excludePattern=["**/tests/**"])` | M and L — any shared symbol |
| Test coverage | `lspFindReferences(includePattern=["**/tests/**"])` | M and L — 0 test refs = write tests first |
| Cycle membership | `architecture.json` cycles | L only — or when research flagged cycles |
| Hotspot status | `architecture.json` hotFiles | L only — or when research flagged hotspots |
| Existing patterns | `ast/search.js -p 'pattern'` + `localSearchCode` | M and L — follow codebase conventions |
| Caller contracts | `lspCallHierarchy(incoming, depth=1)` | When changing function signatures |

**Decision gates**: >20 production consumers = high-risk, consider feature flag or incremental migration. 0 test refs = write tests before changing. Target in cycle = plan carefully to avoid deepening it.

**Plan format**: for each change, state the target file, what changes, blast radius (consumer count), test coverage status, and risk level.

> **GATEWAY** — Present the plan. For L tasks or high-risk changes, ask before applying. For M tasks with clear user intent, proceed.

---

### Step 7: IMPLEMENT

Scale effort to task size. For the full command sequence, see [Workflow 18 — Smart Coding](./references/tool-workflows.md).

**S tasks** — minimal ceremony:
1. Make the change
2. Run lint + test
3. Verify changed symbols still resolve if renamed/moved

**M tasks** — impact-aware:

| Phase | Action |
|-------|--------|
| **Before** | Blast radius + test coverage already checked in PLAN. Define current → desired behavior. |
| **Code** | Write tests for changed behavior → implement → pass → full suite. Clean code: no `any`, no empty catches, no console.log. |
| **After** | `lspFindReferences` to verify moved/renamed symbols resolve. Run lint + test + build. |

**L tasks** — full verification:

| Phase | Action | Tools |
|-------|--------|-------|
| **Before** | Behavior contract defined. Blast radius, architecture safety, existing patterns checked in PLAN. | — |
| **Code** | TDD: failing test → fix → pass → full suite. Clean code. | project test script |
| **After** | Re-scan changed files — no new findings | `index.js --scope=<changed> --no-cache --features=code-quality,architecture` |
| | AST smell gates | `ast/search.js --preset any-type,empty-catch,console-log --root <changed>` |
| | References intact | `lspFindReferences` + `lspCallHierarchy(incoming)` |
| | Docs, lint, build | project lint + build scripts |

**Gates (all sizes)**: new lint/test failures = fix first. **L gates**: >20 prod consumers = feature flag. Touches cycle/hotfile = extra caution. New scan findings = fix first. Docs drift = fix first.

---

### Step 8: VERIFY

Scale verification to task size.

**S tasks**: lint + test pass. Done.

**M tasks**: lint + test + build pass. Verify changed symbols resolve (`lspFindReferences` spot-check).

**L tasks** — prove the change improved things:

| Layer | Tools | Proves |
|-------|-------|--------|
| **Deterministic** | `index.js --scope=<changed> --no-cache` + `ast/search.js --preset` | No new smells, finding count doesn't rise |
| **Semantic** | `lspFindReferences` + `lspCallHierarchy` | Symbols resolve, consumers intact |
| **Delta** | Compare scan `--json` output before vs after (`jq '.totalFindings'`) | Quantitative improvement |
| **Toolchain** | project lint + test + build scripts | No regressions, compiles clean |

**Delta comparison**: to measure improvement, run `index.js --scope=<target> --json` before starting changes (save the finding count). After changes, re-scan with `--no-cache` and compare.

For public-facing changes: also verify CLI help/flags, API schemas, docs are updated.

> **GATEWAY** — Present what changed, verification results. For L tasks, include before/after delta (finding counts, severity breakdown). Report any new issues.

---

## FORBIDDEN

- Present scanner findings as facts without validation.
- Guess `lineHint` — always from `localSearchCode`.
- Use `lspCallHierarchy` on types/variables — use `lspFindReferences`.
- Point `ast/search.js` at `.octocode/scan/` — it searches live source only.
- Fix code without explicit user approval.
- Use relative paths with MCP/LSP tools.
- Broad refactors from a single noisy finding.
- Skip blast radius check before modifying high-consumer symbols (M and L tasks).
- Introduce `any`, empty catches, or console.log in production code.

## Error Recovery

| Failure | Action |
|---------|--------|
| 0 findings | Check `--scope`/`--features`. Try without scope. Read `summary.md` for parse errors. Verify scope contains `.ts`/`.js` files. |
| LSP empty/error | Health-check MCP with `localSearchCode`. If down → CLI-only mode. |
| `ast/search.js` 0 matches | Check `--root`. Try broader pattern or `-k` instead of `-p`. Run `--list-presets` to verify preset name. |
| Scan vs LSP disagree | Report both. Lower confidence. Let user decide. |
| Large `findings.json` | Filter: `jq '.optimizationFindings[] | select(.severity == "high")'`. Read `summary.md` first. |
| `<SKILL_DIR>` path wrong | Resolve from the absolute path of this SKILL.md file. The scripts directory is a sibling. |

## References

| Reference | When to read |
|-----------|-------------|
| [Tool workflows](./references/tool-workflows.md) | End-to-end command sequences, **Workflow 18 for smart coding** |
| [CLI reference](./references/cli-reference.md) | Scanner flags, presets, scope |
| [Output files](./references/output-files.md) | Artifact schemas, read order |
| [AST reference](./references/ast-reference.md) | AST triage + structural proof |
| [Validation playbooks](./references/validation-playbooks.md) | Per-category validation + fix tactics |
