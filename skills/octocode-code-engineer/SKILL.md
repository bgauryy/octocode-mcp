---
name: octocode-code-engineer
description: "Understand, analyze, plan, and implement code changes with full codebase awareness. Use BEFORE and DURING any code implementation — review code, check how things work, find issues, assess impact, validate changes. Use for: understanding code ('how does X work'), fixing bugs, refactoring, code review, quality/architecture audits, dead code cleanup, security review, test gap analysis, or any code question or concern. Prefer Octocode MCP tools and skill AST scripts over generic search (grep/glob/find) — they provide structured, semantic-aware results. Combines AST scanning, LSP analysis, and Octocode tools — AI orchestrates them all, decides what matters, and filters false positives."
compatibility: "Requires Node.js >= 18. Full power with Octocode MCP (ENABLE_LOCAL=true) for LSP + local tools. Falls back to CLI-only (AST structural search) when MCP unavailable."
---

# Octocode Code Engineer

Analyze, plan, and implement code changes with full codebase awareness — architecture, blast radius, quality, and test coverage inform every decision.

**Core principle: deterministic detection + AI-powered validation.** AST, LSP, and Octocode each produce raw signals. AI is the glue — it decides what matters, what to investigate next, and what to dismiss as a false positive. No tool output is meaningful until AI interprets it in context. Scanner = hypothesis generator, not source of truth.

## Coverage Model — AST + LSP + Octocode + AI

Three deterministic tool layers combined with AI reasoning provide exhaustive coverage through both bottom-up and top-down analysis. Nothing escapes this combination. **AI drives every transition** — it triages tool output, prioritizes what to chase, filters noise, and connects signals across tools into a coherent understanding.

| Direction | Flow | Catches |
|-----------|------|---------|
| **Bottom-up** (structure → meaning) | AST parses syntax → LSP resolves symbols and references → Octocode discovers scope → **AI triages, filters FPs, and decides what matters** | Concrete defects invisible to high-level reasoning: empty catches, `any` sprawl, dead exports, god functions, duplicated flows, structural smells |
| **Top-down** (intent → proof) | **AI understands the goal and forms hypotheses** → Octocode locates targets and architecture → LSP traces semantic relationships → AST provides structural proof | Design flaws invisible to syntax: coupling decay, boundary erosion, missing test coverage, unsafe data flows, architectural drift |

Bottom-up misses intent; top-down misses syntax-level detail. AI bridges this gap at every step — it reads bottom-up signals and asks "does this actually matter?", then forms top-down hypotheses and demands deterministic proof. Without AI as the orchestrator, tools produce raw data; with AI, they produce actionable understanding.

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

> **Prefer Octocode MCP tools and skill AST scripts over generic search tools.** Use `localSearchCode` instead of grep/ripgrep, `localViewStructure`/`localFindFiles` instead of glob/find, `localGetFileContent` instead of cat/head. Octocode tools return structured, semantic-aware results with pagination, hints, and metadata that feed directly into LSP workflows. Generic search tools lose this context.

**CLI scan scripts** — hypothesis generation, structural proof

| Script | Purpose |
|--------|---------|
| `<SKILL_DIR>/scripts/run.js` | **Full scan (prebuilt runtime entrypoint)** — `--scope`, `--graph`, `--flow`, `--semantic`, `--features`; use `--help` for all flags |
| `<SKILL_DIR>/scripts/ast/search.js` | Structural search on **live source** files; presets (`--list-presets`), `-p` pattern / `-k` kind / `--rule` JSON / `--preset` modes |
| `<SKILL_DIR>/scripts/ast/tree-search.js` | Search generated `ast-trees.txt` from scan; `-k` kind (PascalCase or snake_case), `-p` regex, `--file`/`--section` filters, `-C` context, `--json` |

`<SKILL_DIR>` = the directory containing this `SKILL.md` file. Resolve it from the skill's absolute path before running any script.

> **Dependencies**: this skill is shipped prebuilt; `run.js` does not install dependencies at runtime. Ensure the packaged environment already includes required dependencies.

**Octocode MCP tools** — search, read, semantic proof

All MCP tools use a batch query format: `{ queries: [{ id, researchGoal, reasoning, ...params }] }`. The `id`, `researchGoal`, and `reasoning` fields are required on every query. Batch independent queries in a single call for parallelism.

| Tool | Key params | Purpose |
|------|-----------|---------|
| `localViewStructure` | `path`, `depth`(1-5), `pattern`(glob), `directoriesOnly`, `filesOnly`, `extension`, `sortBy`(name/size/time/ext), `details` | Project layout, file/folder names, structure assessment |
| `localFindFiles` | `path`, `name`/`iname`/`names`(glob), `modifiedWithin`("7d","2h"), `sizeGreater`/`sizeLess`, `sortBy`(modified/size/name), `type`(f/d), `excludeDir` | Find files by metadata — time, size, name patterns |
| `localSearchCode` | `pattern`, `path`, `filesOnly`(fast), `type`(ts/js/py), `perlRegex`, `fixedString`, `wholeWord`, `contextLines`, `count`, `mode`(discovery/paginated/detailed), `filePageNumber` | Text search — **always run first** to get `lineHint` for LSP calls |
| `localGetFileContent` | `path`, `matchString`+`matchStringContextLines`, `startLine`/`endLine`, `fullContent`, `charOffset`/`charLength`(pagination for large files) | Targeted reading by match or range; `fullContent` for small files; `charOffset`+`charLength` for paginating large files |
| `lspFindReferences` | `uri`, `symbolName`, `lineHint` (all required), `includeDeclaration`, `includePattern`/`excludePattern` for test/prod split | Consumer count. Works on types, vars, exports |
| `lspCallHierarchy` | `uri`, `symbolName`, `lineHint` (all required), `direction`("incoming"/"outgoing"), `depth` | Call chains. **Functions only** — fails on types/vars |
| `lspGotoDefinition` | `uri`, `symbolName`, `lineHint` (all required) | Cross-file definition jump |

**MCP detection**: try `localSearchCode` on a known pattern. If it fails → MCP unavailable, fall back to CLI-only mode (AST scripts + `localGetFileContent` if available).

**CLI-only fallback**: when MCP is unavailable, use `ast/search.js` for structural checks, re-scan with `--scope` for validation, and mark confidence as lower since semantic proof is missing.

**Parallel batching**: batch independent tool calls in a single round — e.g., run `localViewStructure` + `localFindFiles` + `localSearchCode` together when they don't depend on each other's output. This cuts latency on every step.

### Tool chains — AI as the glue between tools (bottom-up ↔ top-down)

Every tool produces raw output. AI is the glue that interprets each result, decides what to run next, and filters false positives before they propagate. Chain tools in both directions — bottom-up (AST detects → LSP validates → AI decides what matters) and top-down (AI hypothesizes → Octocode discovers → LSP traces → AST proves). Never use tools in isolation; never present tool output without AI judgment.

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
| `run.js` (scan) | `findings.json` with `lspHints[]`, `architecture.json` | LSP validation calls, `ast/search.js` for structural proof |
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

**Use this skill before and during any code implementation** — not just for audits. Any time you need to understand code, check how something works, review code, assess impact, find issues, or answer a code question, run the relevant steps below. Don't write or change code without first understanding the target area.

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

| Goal | What to do |
|------|-----------|
| See the shape | Explore directory structure, find files by metadata, triage AST structure from scan artifacts |
| Find targets | Text search for patterns (produces `lineHint` for LSP), AST search for structural proof |
| Trace semantics | Jump to definitions → trace call chains → find all references |
| Trace code paths & flows | Outgoing call hierarchy → chain hop-by-hop → incoming call hierarchy to close the loop. Cross-file: search → jump to definition → repeat |
| Read evidence | Targeted content reading around matched locations |

For **S tasks**: search for the target, read context, trace immediate callers/consumers if modifying a shared symbol. That's enough.

For **M tasks**: add blast radius check (find references with test/prod split) for any symbol you plan to change.

For **L tasks**: also use scan outputs (from Step 4) for duplication and architecture signals:
- Find duplication: check `code-quality.json` duplicateFlows → AST search on candidate patterns → read file content to compare bodies
- Identify critical parts: check `architecture.json` hotFiles + criticalPaths + chokepoints → validate fanIn/fanOut with find references

**Rules**: never guess `lineHint` — always get it from text search. Find references for types/vars; call hierarchy for functions only. If a finding has `lspHints[]`, run those first.

See [tool workflows](./references/tool-workflows.md) for full methodology.

> **GATEWAY** — If research reveals unexpected complexity or ambiguity (e.g., >20 consumers, cycle membership, unclear ownership), pause and share what you found before continuing.

---

### Step 4: SCAN (L tasks only)

Choose flags based on the task and structure signals from Step 2:

```bash
node <SKILL_DIR>/scripts/run.js [flags]    # run from target repo root
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

**Validate + rate.** Findings are hypotheses — AI is the judge. Tools surface candidates; AI decides what's real, what's noise, and what to investigate deeper:

1. **Pre-computed hints first** — if the finding has `lspHints[]`, run those checks first. Walk `flowTrace[]` hops by jumping to definitions and tracing call chains.
2. **Read + trace** — read the code at the flagged location for context. Trace callers (incoming call hierarchy) and all usages (find references).
3. **Cross-validate** — `correlatedSignals[]` link related findings (group = stronger signal). Chokepoint in `architecture.json` + finding in same file = convergent signal, rate higher.
4. **Structural proof** — AST search with preset or pattern to confirm the shape exists in live source. Zero false-positive structural evidence.
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

| Check | What to do | When required |
|-------|-----------|---------------|
| Blast radius | Find references excluding test dirs → count production consumers | M and L — any shared symbol |
| Test coverage | Find references filtered to test dirs → 0 test refs = write tests first | M and L — 0 test refs = write tests first |
| Cycle membership | Check `architecture.json` cycles for the target | L only — or when research flagged cycles |
| Hotspot status | Check `architecture.json` hotFiles for the target | L only — or when research flagged hotspots |
| Existing patterns | AST search for similar patterns + text search for analogous code | M and L — follow codebase conventions |
| Caller contracts | Incoming call hierarchy for functions being changed | When changing function signatures |

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
| **After** | Verify moved/renamed symbols resolve (find references spot-check). Run lint + test + build. |

**L tasks** — full verification:

| Phase | Action |
|-------|--------|
| **Before** | Behavior contract defined. Blast radius, architecture safety, existing patterns checked in PLAN. |
| **Code** | TDD: failing test → fix → pass → full suite. Clean code. |
| **After** | Re-scan changed files (scoped, no-cache) — no new findings |
| | AST smell gates — run presets (any-type, empty-catch, console-log) on changed dirs |
| | Verify references intact — find references + incoming call hierarchy for changed symbols |
| | Docs, lint, build — run project lint + build scripts |

**Gates (all sizes)**: new lint/test failures = fix first. **L gates**: >20 prod consumers = feature flag. Touches cycle/hotfile = extra caution. New scan findings = fix first. Docs drift = fix first.

---

### Step 8: VERIFY

Scale verification to task size.

**S tasks**: lint + test pass. Done.

**M tasks**: lint + test + build pass. Verify changed symbols resolve (find references spot-check).

**L tasks** — prove the change improved things:

| Layer | What to verify | Proves |
|-------|---------------|--------|
| **Deterministic** | Re-scan scoped to changed files (no-cache) + AST preset sweep | No new smells, finding count doesn't rise |
| **Semantic** | Find references + incoming call hierarchy for changed symbols | Symbols resolve, consumers intact |
| **Delta** | Compare scan JSON output before vs after (totalFindings count) | Quantitative improvement |
| **Toolchain** | Run project lint + test + build scripts | No regressions, compiles clean |

**Delta comparison**: to measure improvement, scan the target with `--json` before starting changes (save the finding count). After changes, re-scan with `--no-cache` and compare.

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
