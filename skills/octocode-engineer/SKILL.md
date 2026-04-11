---
name: octocode-engineer
description: "Flexible system-engineering skill for technical code understanding, project/feature deep dives, bug investigation, quality and architecture analysis, and safe delivery from research and RFC/planning through implementation and verification."
---

# Octocode Engineer

This skill helps an agent investigate, change, and verify a codebase with system awareness.

Use this skill as the main engineering organizer when you need to understand a system deeply, make safe decisions, and execute with architecture awareness.

Motivation: high-quality architectural investigation improves delivery velocity, project resilience, and long-term maintainability.

Suggested operating flow (adapt as needed):
1. Start with local Octocode tools for discovery and scope.
2. Use LSP to resolve semantics and blast radius.
3. Use scanner output for architecture, critical paths, and risk concentration.
4. Use AST to prove structural claims that matter.
5. Summarize the system, flows, features, and constraints.
6. Decide whether to ask, plan, explain, or edit.

## What This Skill Does

Use this skill to:
- organize investigation and decision-making for almost any engineering task
- map real behavior and ownership, not just file-level code snippets
- trace call flow, blast radius, and critical paths before changes
- validate contracts/protocols across APIs, events, storage, and shared DTOs
- detect code and architecture smells with structural proof
- assess modularity/layering, coupling, duplication, and change risk
- check efficiency, build/config, reliability, observability, rollout safety, and data correctness
- validate docs/RFC/design claims against real implementation behavior
- guide safe implementation and verification with clear evidence and confidence

This is not only a code-editing skill.
It is a structure, architecture, and flow-analysis skill that also supports coding.
It aims to make systems easier to extend, safer to evolve, and smarter to work in over time.
It applies to any system, and is especially effective for Node/TypeScript and Python applications where module boundaries, async flows, contracts, package dependencies, and runtime edges must stay clean.

## When To Use It

Use this skill when the user asks to:
- understand a technical codebase, project area, or feature end-to-end
- understand code before changing it
- do a deep dive into behavior, flow, ownership, or architecture
- fix a bug in shared or unclear code
- refactor a module, package, or cross-file flow
- review code quality, architecture, or technical debt
- shape architecture decisions before implementation and prepare a strong RFC (https://skills.sh/bgauryy/octocode-mcp/octocode-rfc-generator)
- research implementation options and produce planning artifacts or design notes
- validate docs, planning docs, and RFCs against real implementation behavior
- check docs before planning and re-check docs after implementation
- investigate build, runtime, package, or configuration issues when they affect behavior or delivery
- improve maintainability, modularity, contracts, or extensibility
- check dead code, test gaps, security risks, or design problems
- implement a change safely in a non-trivial area
- prepare for planning by understanding the real system first
- verify implementation quality and risk after changes land

## Core Mindset

1. System first, file second.
2. Prove behavior and blast radius before proposing changes.
3. Prefer local Octocode discovery, then LSP/scanner, then AST proof.
4. Validate important claims with at least 2 evidence sources.
5. Prefer clean modular boundary/contract fixes over local patches.
6. Use explicit confidence (`confirmed`, `likely`, `uncertain`) for conclusions.
7. Treat prompt steps as practical checkpoints, not optional suggestions.
8. Ask the user only at real decision checkpoints.

## The Main Problem This Skill Solves

Single-file reading is often misleading. Root causes usually live in boundaries, flow ownership, contracts, architecture pressure, or rollout/runtime assumptions.

Use this skill to produce architecture-safe outcomes, not just passing patches:
- verify real ownership, dependencies, and call flow
- verify contracts/protocols, build/runtime assumptions, and migrations
- verify quality dimensions (efficiency, reliability, observability, data correctness)
- verify docs/RFC/design claims against implementation

## Investigation Lenses

| Lens | Main question | Best tools |
|------|---------------|------------|
| Layout | Where does this behavior live? | `localViewStructure`, `localFindFiles`, `localSearchCode` |
| Semantics | What symbol is this and who uses it? | `localSearchCode` -> LSP tools |
| Critical path | Which execution paths dominate risk, latency, and business impact? | `lspCallHierarchy`, scanner flow output, targeted code read |
| Contracts & protocols | Are type contracts, API/event schemas, and protocol rules explicit and stable? | `lspGotoDefinition`, `lspFindReferences`, schema/code read, tests |
| Layering & modularity | Are dependency directions, boundaries, and module responsibilities clean? | scanner graph/architecture output, LSP references, AST checks |
| Persistence | How is state stored and mutated? | schema files, SQL/Prisma/Mongoose definitions, migration files, repository/storage modules |
| Efficiency | Is the implementation doing avoidable work or unnecessary complexity? | scanner complexity findings, code read, query/storage access paths, tests/benchmarks when available |
| Reliability & resilience | Will this hold under failures, retries, partial outages, and retries of retries? | call flow + error handling read + tests + scanner risk signals |
| Observability & operability | Can operators detect, explain, and recover from failures quickly? | logs/metrics/traces checks, runbook/docs checks, boundary instrumentation read |
| Rollout & migration safety | Can this ship safely without breaking old producers/consumers? | migration docs, versioned contracts, compatibility checks, feature-flag/release-path review |
| Data correctness | Are invariants and consistency rules preserved across writes and side effects? | schema + storage logic + transaction/idempotency read + contract tests |
| Build & Config | Is runtime/build setup correct for this feature or environment? | package/module config, tsconfig, bundler config, scripts, import/export patterns, build errors |
| Docs | Are critical behaviors, contracts, flows, and operational constraints documented? | docs/readmes, API docs, config docs, migration notes, code comments near boundaries |
| Structure | Does this pattern really exist? | `scripts/ast/search.js`, `scripts/ast/tree-search.js` |
| Architecture | Is this area hard or risky to change? | `scripts/run.js`, graph and flow modes |
| Behavior | What does the code actually do? | `localGetFileContent`, tests |

## Tool Families And Their Jobs

### 1. Local Octocode tools

Use local tools first to map the workspace.
These are the default first tools for this skill, not a fallback.

| Tool | Use it for |
|------|------------|
| `localViewStructure` | Package/module layout, folder depth, source spread |
| `localFindFiles` | Large files, recent churn, suspicious filenames, likely hotspots |
| `localSearchCode` | Fast discovery, symbol search, text patterns, and `lineHint` for LSP |
| `localGetFileContent` | Final code reading after you know what you are looking at |

Rule: do not start with a random full-file read if discovery tools can narrow the target first.

### 2. LSP tools

Use LSP tools to understand real semantic relationships.

Critical rule: every LSP tool needs `lineHint` from `localSearchCode`.
Never guess it.

| Tool | Use it for |
|------|------------|
| `lspGotoDefinition` | What symbol is this really? |
| `lspFindReferences` | Blast radius, all usages, dead-code checks |
| `lspCallHierarchy` | Function call flow only: incoming callers and outgoing callees |

LSP is the main way to answer:
- who depends on this?
- what will break if we change it?
- what path does execution follow?

### 3. AST tools

Use AST tools when text search is too weak and you need structural proof.
AST is a primary checking tool in this skill, especially for validating smells, redundancy, and code-shape claims.

| Tool | Use it for |
|------|------------|
| `scripts/ast/search.js` | Live source analysis and structural pattern matching |
| `scripts/ast/tree-search.js` | Fast triage over cached AST trees from a previous scan |

Use AST tools for things like:
- empty catch blocks
- `any` usage (TS) / bare except (Python)
- nested ternaries (TS) / mutable defaults (Python)
- broad exports / wildcard imports
- repeated structural patterns
- verifying whether a smell is real or just a text coincidence

Python presets are prefixed with `py-` (e.g. `--preset py-bare-except`). Use `--list-presets` to see all available presets for both JS/TS and Python.

Rule: `tree-search.js` is for fast narrowing. `search.js` is the authoritative proof on live code.
Rule: if a structural claim matters, check it with AST before presenting it as fact.

### 4. Scanner

Use `scripts/run.js` when the question is bigger than one symbol or one file.

The scanner is especially important for this skill because it surfaces the issues agents often miss when they focus too narrowly on code:
- dependency cycles
- chokepoints and broker modules
- coupling and fan-in/fan-out pressure
- layer violations
- dead code clusters
- security sinks and risky flows
- test-quality gaps
- hotspots and critical paths

Use scanner output to reason about:
- where change risk is concentrated
- whether a module is structurally unhealthy
- whether a local fix ignores a broader architectural problem
- which area should be refactored first
- where duplication, weak contracts, or poor boundaries are slowing future velocity
- where complexity, repeated work, or inefficient flows are wasting performance or developer time

### 5. Quality and hygiene checks

Use supporting quality checks when the task touches the relevant surface area.

| Check | Use it for |
|------|------------|
| clean code review | naming, cohesion, responsibility split, readability |
| code smell review | long methods, primitive obsession, shotgun surgery, feature envy, deep nesting, boolean flag clusters |
| architecture smell review | god module, cycle-prone broker, unstable abstraction, boundary leakage, sink module, layering drift |
| contract review | TypeScript types, interfaces, DTOs, schemas, return shapes |
| type/protocol review | API/event versioning, backward compatibility, serialization safety, optional/null semantics, schema drift |
| duplication review | repeated logic, near-clones, copy-pasted flows, repeated CSS patterns, general redundancy |
| modularity/layer review | dependency direction, boundary ownership, cohesion vs coupling, module replaceability, cross-layer imports |
| efficiency review | avoidable `O(n^2)` work, repeated scans, N+1 calls, wasteful transforms, unnecessary recomputation |
| reliability/resilience review | retry policy, timeout handling, failure isolation, idempotency, fallback behavior |
| observability/operability review | logging quality, metric/tracing coverage, diagnosability, alert/runbook readiness |
| rollout/migration review | feature flags, backwards compatibility windows, rollback path, migration sequencing |
| data correctness review | invariants, transaction boundaries, consistency model assumptions, duplicate-write safety |
| rigidity review | brittle condition trees, hard-coded branching, patchy glue code, over-coupled modules, naive solutions |
| build/config review | ESM/CJS mismatch, bad module resolution, wrong script wiring, incompatible runtime assumptions, broken package setup |
| docs review | whether critical assumptions, contracts, flows, setup, migrations, and risks are documented where they should be |
| clean CSS review | selector scope, token reuse, naming clarity, dead styles, layout consistency |
| `knip` | unused exports, unused files, unused dependencies, dead integration edges |

These checks matter because quality and velocity support each other.
Messy structure slows teams down. Clear structure speeds them up.

### 6. Task and user checkpoints

Use task or todo tracking when the work has multiple steps, risks, or follow-ups.
Track at least:
- investigation
- decision or plan
- implementation
- verification
- docs follow-up when needed

Ask the user when needed at a real checkpoint, especially if:
- requirements are ambiguous
- multiple reasonable architectures exist
- a public contract or persistence model may change
- the safest fix conflicts with the smallest fix
- the work may have migration, rollout, or compatibility impact

When asking, be concise and specific. Ask only what is needed to move forward safely.

Use task tracking whenever the work spans research -> planning -> implementation -> verification -> docs/RFC sync.

### 7. Prompt execution contract

Treat the skill prompt as operational policy, not advice.

Use this minimum execution contract:
- restate the concrete goal and constraints in one short line before doing deep work
- declare the next tool step and why it is the cheapest proof step
- separate facts from inference in every checkpoint
- carry forward concrete identifiers from tools (`lineHint`, paths, symbols, artifact names)
- run explicit verification after edits; do not assume success from static reading
- if a gate cannot be satisfied (missing tests, missing schema, missing ownership), report it as a blocker, not a silent skip

Prompt reliability checks:
- avoid vague status updates; every update should include what was checked and what remains
- avoid broad claims like "looks fine" without at least one concrete evidence source
- avoid switching from investigation to edits without a short system/flow summary
- if 2 refinement attempts fail, stop and ask the user for a decision

Keep this flexible:
- skip irrelevant checks when they clearly do not apply
- go deeper only where risk or uncertainty is meaningful
- choose the lightest evidence path that can prove the conclusion

### 8. Token-efficient execution mode

Default to evidence-rich but compact execution.

Token efficiency rules:
- use one investigation thread at a time unless independent questions can be batched
- avoid restating the same evidence in multiple sections; reference the prior checkpoint instead
- prefer short, structured status updates over long narrative blocks
- cap optional examples unless they materially change the decision
- stop research when confidence is sufficient for safe action (`confirmed` or clearly bounded `likely`)
- when uncertainty remains, ask one precise checkpoint question instead of writing long speculation

Output compression rules:
- summarize findings as: issue -> evidence -> impact -> action
- keep confidence markers terse (`confirmed` / `likely` / `uncertain`)
- report only residual risks that affect implementation, rollout, or contracts
- avoid duplicating tool command details unless reproducibility is needed

### 9. Script usage policy (cost-aware)

Use scripts as proof tools, not as default heavy steps.

- prefer local/LSP narrowing before broad scanner runs
- run `scripts/run.js` broad scans for architecture/risk questions, not for single-symbol trivia
- use scoped scan options when possible before full-repo scans
- use `scripts/ast/tree-search.js` for fast triage, then `scripts/ast/search.js` only for authoritative confirmation
- avoid repeating the same scan when the artifact already answers the current question
- if scan output is stale relative to current edits, re-run only the minimal necessary scope

## Default Working Order

For non-trivial tasks, this order is recommended (not mandatory):

1. Clarify the behavior or question.
2. Create or update tasks/todos if the work is multi-step.
3. Map the package/module area with local tools.
4. Trace important symbols with LSP.
5. Identify critical paths and failure paths (latency/business-risk/error fanout).
6. Validate and check structural claims with AST tools.
7. Check architecture, layering/modularity, contracts/protocols, reliability/observability/rollout/data correctness, build/configuration, docs, and flow risk with the scanner and relevant project files.
8. Read the actual code with context.
9. If the task touches design docs or RFCs, validate them against current flows, contracts, and boundaries.
10. Summarize the current system, flows, feature surface, and critical paths before deciding on action.
11. Pause and ask the user if a real decision checkpoint appears.
12. Decide whether to explain, plan, or edit.

Short form:
`clarify -> track -> layout -> symbols -> structure -> architecture/build/docs -> code -> docs/RFC reality check -> summarize -> checkpoint -> action`

## How To Use This Skill

Use these flows as templates, not rigid scripts.

### For code understanding

1. Start with `localViewStructure` or `localFindFiles` to see the area.
2. Use `localSearchCode` to find the symbol or flow.
3. Use LSP to trace definitions, references, callers, and callees.
4. Read the relevant code only after the surrounding context is clear.
5. Summarize the key flows, feature surface, and boundaries in your own reasoning.
6. Check whether important contracts or critical flows are documented.
7. If build or runtime behavior is involved, inspect build/config assumptions.
8. If the area is shared, central, or suspicious, run a scoped scanner pass.

### For bug fixing

1. Identify the failing behavior and likely entry point.
2. Trace incoming callers and outgoing callees.
3. Check adjacent risk areas: error handling, retries, side effects, tests, shared consumers, and contract mismatches.
4. Use AST tools if the bug may involve a structural smell.
5. Check build/configuration if module format, runtime wiring, or packaging may be involved.
6. Use the scanner if the bug points to a hotspot, cycle, or orchestration problem.
7. Fix the smallest layer that solves the root cause, not just the symptom.
8. Prefer a clean boundary or contract fix over a narrow patch if the issue is systemic.
9. Check whether the bug is caused by redundant work, inefficient flow, or rigid branching.
10. Check whether the risky behavior and fix assumptions should be documented.

### For refactors

1. Measure blast radius with `lspFindReferences` and `lspCallHierarchy`.
2. Check architecture health in the target area with `scripts/run.js --scope=...`.
3. Look for similar patterns nearby with AST or local search.
4. Check whether duplication, weak contracts, bad boundaries, or build/config friction are the real refactor driver.
5. Plan the change if multiple files, packages, or shared symbols are involved.
6. Prefer extracting modules, clarifying contracts, simplifying flows, and removing redundant work over cosmetic reshuffling.
7. Implement incrementally.
8. Re-run verification after each batch.
9. Update or propose docs when the refactor changes important usage, contracts, or constraints.

### For architecture review

1. Start broad with the scanner, especially graph and flow output.
2. Identify hotspots, cycles, chokepoints, and suspicious shared modules.
3. Use local tools to understand the folder and package layout.
4. Use LSP to verify the real dependency pressure around candidate modules.
5. Read representative files to explain why the structure is problematic.
6. Check whether contracts, duplication, module boundaries, and build/runtime setup support extensibility.
7. Check whether critical architectural constraints are documented.
8. Report both local code issues and system-level causes.

### For design and RFC validation

1. Identify the claims made by the design doc or RFC (scope, boundaries, contracts, rollout, invariants).
2. Map each claim to real code ownership (modules, entry points, storage, events, APIs).
3. Verify runtime flow alignment using LSP call flow + scanner flow/graph outputs.
4. Verify contract alignment (types/schemas/protocol versions/nullability/error semantics).
5. Verify architecture alignment (layer boundaries, dependency direction, shared module pressure).
6. Mark each claim as `confirmed`, `likely`, or `uncertain` with evidence.
7. Report mismatches clearly: missing implementation, divergence, undocumented behavior, risky assumptions.
8. Propose minimal doc/RFC corrections or implementation follow-ups to restore alignment.

### For implementation duty cycle

1. Before coding: state root cause, blast radius, and target contract/boundary.
2. During coding: keep changes in the smallest responsible layer; avoid cross-layer leakage.
3. During coding: run narrow checks per batch (tests/types/lint or focused scanner slice).
4. After coding: run full relevant verification and re-check affected critical paths.
5. After coding: re-open docs/RFC sections touched by the change and sync them with reality.
6. Close with residual risk, follow-ups, and confidence level.

## Quick Tool Routing

Use this compact routing table first; use detailed playbooks in [Tool workflows](./references/tool-workflows.md).

| Question | Route |
|----------|-------|
| symbol/ownership | `localSearchCode` -> LSP (`gotoDefinition` / `findReferences`) |
| callers/callees/critical path | `localSearchCode` -> `lspCallHierarchy` -> targeted read |
| architecture risk/hotspots | `scripts/run.js` (scoped first, broad when needed) |
| structural smells/claims | `scripts/ast/tree-search.js` -> `scripts/ast/search.js` |
| RFC/design/docs alignment | claim-by-claim mapping -> flow/contract/architecture validation |

## Before / During / After A Change

### Before
- understand current behavior and invariants
- find consumers and callers
- identify entry paths, error paths, and critical business/runtime paths
- inspect tests and scanner signals for hotspot/cycle/shared-boundary risk
- check contracts/protocols (types, schemas, compatibility, nullability, serialization)
- check reliability/observability/rollout assumptions (retries, telemetry, migration, rollback)
- check build/config assumptions that affect runtime behavior
- check whether critical behavior, constraints, and migration notes are documented
- if a design doc or RFC exists, map its claims to concrete code ownership before editing
- check for duplication before adding another branch or helper
- check for unnecessary complexity and nearby code/architecture smells, not only the target line
- look for an existing local pattern before inventing a new one

### During
- keep edits focused
- preserve boundaries unless the plan intentionally changes them
- prefer the smallest change that fixes the real issue
- prefer the cleanest modular fix that keeps the system extendable
- maintain clear contracts/protocol compatibility unless an explicit migration is in scope
- preserve or improve reliability behavior under failure, retries, and partial success
- keep build/configuration consistent with runtime expectations, especially around ESM/CJS boundaries
- reduce redundancy and avoid layering new logic on rigid code when simplification is possible
- avoid introducing new smells (deep nesting, flag-parameter branching, over-centralized modules)
- improve inefficient flows when they are part of the real problem
- keep CSS clean/scoped when frontend styling is touched
- update or flag docs when behavior, contracts, setup, migration, or architecture understanding changed
- if design/RFC assumptions were invalid, record the exact mismatch and corrective update
- if the root cause is structural, say so instead of hiding it behind a cosmetic patch

### After
- run the relevant tests
- run lint and build or type-check as appropriate
- run CSS checks when styles changed; run `knip` when refactors may leave dead artifacts
- verify build/config still match runtime/module expectations
- re-check changed symbols with LSP after renames/moves
- run a scoped scanner pass for non-trivial changes
- re-check critical paths for regressions in behavior, cost, and failure handling
- verify changed type/protocol contracts with consumers and boundary tests
- verify reliability/observability/rollout assumptions still hold after the change
- re-validate relevant design/RFC claims against final implementation behavior
- verify important critical aspects are documented if the task changed them
- mention any remaining architectural risk even if the code now works

## Confidence Rules

Use these confidence levels in your reasoning and user-facing output:

| Level | Meaning |
|-------|---------|
| `confirmed` | 2 or more approaches agree, or one source is clearly authoritative |
| `likely` | good evidence exists, but one important angle is still missing |
| `uncertain` | signals conflict, context is incomplete, or only one weak source exists |

Examples:
- `confirmed`: AST proves an empty catch, and LSP shows the function is widely used
- `likely`: scanner reports a hotspot and code shape agrees, but blast radius is still unverified
- `uncertain`: text search suggests dead code, but LSP is unavailable

## Hard Rules

Core guardrails:
- Do not present raw detector output as unquestioned fact.
- Do not guess `lineHint`; obtain it from `localSearchCode`.
- Do not use `lspCallHierarchy` on non-function symbols.
- Do not judge shared modules from one file read alone.
- Do not claim design/RFC compliance without claim-by-claim evidence.
- Do not ignore build/config evidence when runtime behavior may depend on it.
- Avoid quick patches when the real issue is contracts, boundaries, duplication, or architecture.
- Check blast radius before changing shared symbols.
- Re-sync docs/RFCs when implementation changes architecture, contracts, rollout assumptions, or constraints.
- Ask the user when a real ambiguity or decision checkpoint blocks safe progress.

## Fallback Mode

If local Octocode tools or LSP are unavailable:
- continue with AST tools and the scanner
- rely more on local search and direct code reading
- reduce confidence on semantic claims
- say clearly which parts were proven and which parts were inferred

## Outcome Standard

A good result from this skill should answer all of these:
- What is happening?
- Where is the real ownership or boundary?
- What is the blast radius?
- Are the contracts clear and safe?
- Is the problem local, structural, or architectural?
- Is build/configuration part of the issue?
- Is the implementation efficient enough, or is avoidable complexity hurting it?
- Is reliability acceptable under failure and retry conditions?
- Is observability sufficient to debug and operate this path?
- Is rollout/migration safety clear and reversible?
- Is the system becoming cleaner, more modular, and easier to extend?
- Are important critical aspects documented?
- What is the safest next move?

If the answer only explains one file, it is usually incomplete.

## Companion Skill

Use this with the RFC skill when architecture options, trade-offs, or migration strategy need a formal proposal before coding:
- [octocode-rfc-generator](https://skills.sh/bgauryy/octocode-mcp/octocode-rfc-generator) — generate a smart RFC from validated system evidence.

## References

Use these only when needed. Pick the right reference for the situation:

| Situation | Reference |
|-----------|-----------|
| Which tool to use, what order | [Tool workflows](./references/tool-workflows.md) |
| Scanner flags, thresholds, scope syntax | [CLI reference](./references/cli-reference.md) |
| Reading scan artifacts (summary.json, findings.json, etc.) | [Output files](./references/output-files.md) |
| AST presets, pattern syntax, Python node kinds | [AST reference](./references/ast-reference.md) |
| Confirming or dismissing a finding | [Validation playbooks](./references/validation-playbooks.md) |
| Detector catalog, metrics, severity thresholds | [Quality indicators](./references/quality-indicators.md) |
| How to present findings to the user | [Output format](./references/output-format.md) |
| eslint, tsc, knip, ruff, mypy, and other external tools | [External tools](./references/externals.md) |
