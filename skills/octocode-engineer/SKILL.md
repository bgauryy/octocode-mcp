---
name: octocode-engineer
description: "System-aware engineering skill for code understanding, safe implementation, refactoring, architecture review, and quality analysis. Use this before planning and for general task support when an agent must start with local Octocode tools, use AST search/tree-search to prove structure, and combine those checks with LSP and scanner results to understand structure, flows, blast radius, contracts, documentation gaps, and architectural risk instead of looking only at one file. Aims to improve any system, and is especially effective for Node-based applications."
---

# Octocode Engineer

This skill helps an agent investigate, change, and verify a codebase with system awareness.

Use this skill before writing a plan. First build system understanding, then switch to plan mode once structure, flows, blast radius, and architectural risks are clear.
Use it as an organizer for agents: pick the right lens, choose the right tools, understand the system, then move into planning or implementation.
Use it with a senior-architect review posture: check whether the system is clear, modular, extensible, efficient, documented, and safe to evolve.
Start with local Octocode tools whenever they are available. Use AST to check and prove structural claims instead of trusting text search alone.

Most agents naturally zoom into the file in front of them. This skill pushes the opposite direction first:
- start with local Octocode discovery before deep reading
- use AST to check structural patterns and confirm smells
- understand the structure before editing the line
- trace flows before changing behavior
- check architecture before trusting a local fix
- validate important claims from more than one angle

## What This Skill Does

Use this skill to:
- help with almost any engineering task, especially before planning, by organizing investigation and decision-making
- understand how a feature, bug, or module really works
- trace definitions, callers, callees, imports, and shared contracts
- find architectural issues such as cycles, chokepoints, coupling, hotspots, and layer violations
- validate structural code smells with AST tools instead of weak text guesses
- push toward clean code, clean modular architecture, strong contracts, and low duplication
- check efficiency problems such as avoidable `O(n^2)` work, repeated scans, repeated queries, and wasteful flows
- flag rigid, naive, brittle, or clearly unnecessary code paths before they spread
- prevent patchy fixes that work locally but make the system harder to extend later
- improve both delivery velocity and long-term quality through smarter flows and better structure
- plan safer refactors with blast-radius awareness
- check that important critical aspects are documented when behavior, contracts, architecture, or operations depend on them
- verify that a change did not create new code-quality, architecture, or test-quality problems

This is not only a code-editing skill.
It is a structure, architecture, and flow-analysis skill that also supports coding.
It aims to make systems easier to extend, safer to evolve, and smarter to work in over time.
It applies to any system, but is especially effective for Node and TypeScript applications where module boundaries, async flows, contracts, package dependencies, and runtime edges must stay clean.

## When To Use It

Use this skill when the user asks to:
- help with almost any code or architecture task that benefits from better system understanding first
- understand code before changing it
- fix a bug in shared or unclear code
- refactor a module, package, or cross-file flow
- review code quality, architecture, or technical debt
- improve maintainability, modularity, contracts, or extensibility
- validate docs, plans, or RFCs against the real implementation
- check dead code, test gaps, security risks, or design problems
- implement a change safely in a non-trivial area
- prepare for planning by understanding the real system before switching to plan mode

## Core Mindset

1. System first, file second.
2. Root causes often live in boundaries, flows, ownership, coupling, or missing tests, not just in the visible line of code.
3. Important findings should be validated with at least 2 approaches when possible.
4. Prefer local Octocode tools first for discovery, scope, and evidence.
5. Use AST to check structural claims whenever text search may be misleading.
6. Report confidence clearly: `confirmed`, `likely`, or `uncertain`.
7. Prefer clean, modular, contract-driven solutions over local patches.
8. For medium or large changes, understand blast radius and architecture before editing.
9. Track meaningful work with tasks or todos when the runtime supports it.
10. Ask the user at the right checkpoint when scope, risk, or tradeoffs are genuinely unclear.

## The Main Problem This Skill Solves

A local code read is often not enough.
A function may look wrong, but the real issue may be:
- too many callers
- circular dependencies
- a shared module doing too much
- a weak boundary between layers
- weak or implicit contracts between modules, APIs, or types
- inefficient loops, repeated work, or avoidable `O(n^2)` logic
- rigid or brittle code that is hard to extend without patching around it
- duplicate logic spread across packages
- a hidden flow through re-exports, side effects, or orchestration code
- poor tests around a high-risk path
- a quick patch that solves today but blocks safe extension tomorrow

Because of that, always look at:
- structure: where code lives and how modules are grouped
- architecture: dependencies, boundaries, cycles, hotspots, and ownership
- contracts: TypeScript types, interfaces, DTOs, schemas, and public module boundaries
- flows: entry points, call chains, data movement, and side effects
- quality: clean code, low duplication, CSS hygiene, and maintainable module responsibilities
- efficiency: algorithmic complexity, repeated work, repeated queries, N+1 patterns, and unnecessary orchestration
- rigidity: brittle logic, over-coupled decisions, and code that is harder than necessary to extend
- docs: whether critical setup, contracts, flows, constraints, migrations, and caveats are documented
- code: the actual implementation details

The target is not just "working code".
The target is a system that stays extendable, understandable, and fast to change.

## Investigation Lenses

| Lens | Main question | Best tools |
|------|---------------|------------|
| Layout | Where does this behavior live? | `localViewStructure`, `localFindFiles`, `localSearchCode` |
| Semantics | What symbol is this and who uses it? | `localSearchCode` -> LSP tools |
| Persistence | How is state stored and mutated? | schema files, SQL/Prisma/Mongoose definitions, migration files, repository/storage modules |
| Efficiency | Is the implementation doing avoidable work or unnecessary complexity? | scanner complexity findings, code read, query/storage access paths, tests/benchmarks when available |
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
- `any` usage
- nested ternaries
- broad exports
- repeated structural patterns
- verifying whether a smell is real or just a text coincidence

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
| contract review | TypeScript types, interfaces, DTOs, schemas, return shapes |
| duplication review | repeated logic, near-clones, copy-pasted flows, repeated CSS patterns, general redundancy |
| efficiency review | avoidable `O(n^2)` work, repeated scans, N+1 calls, wasteful transforms, unnecessary recomputation |
| rigidity review | brittle condition trees, hard-coded branching, patchy glue code, over-coupled modules, naive solutions |
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

## Default Working Order

For any non-trivial task, follow this order:

1. Clarify the behavior or question.
2. Create or update tasks/todos if the work is multi-step.
3. Map the package/module area with local tools.
4. Trace important symbols with LSP.
5. Validate and check structural claims with AST tools.
6. Check architecture, docs, and flow risk with the scanner and relevant docs.
7. Read the actual code with context.
8. Pause and ask the user if a real decision checkpoint appears.
9. Only then decide whether to explain, plan, or edit.

Short form:
`clarify -> track -> layout -> symbols -> structure -> architecture/docs -> code -> checkpoint -> action`

## How To Use This Skill

### For code understanding

1. Start with `localViewStructure` or `localFindFiles` to see the area.
2. Use `localSearchCode` to find the symbol or flow.
3. Use LSP to trace definitions, references, callers, and callees.
4. Read the relevant code only after the surrounding context is clear.
5. Check whether important contracts or critical flows are documented.
6. If the area is shared, central, or suspicious, run a scoped scanner pass.

### For bug fixing

1. Identify the failing behavior and likely entry point.
2. Trace incoming callers and outgoing callees.
3. Check adjacent risk areas: error handling, retries, side effects, tests, shared consumers, and contract mismatches.
4. Use AST tools if the bug may involve a structural smell.
5. Use the scanner if the bug points to a hotspot, cycle, or orchestration problem.
6. Fix the smallest layer that solves the root cause, not just the symptom.
7. Prefer a clean boundary or contract fix over a narrow patch if the issue is systemic.
8. Check whether the bug is caused by redundant work, inefficient flow, or rigid branching.
9. Check whether the risky behavior and fix assumptions should be documented.

### For refactors

1. Measure blast radius with `lspFindReferences` and `lspCallHierarchy`.
2. Check architecture health in the target area with `scripts/run.js --scope=...`.
3. Look for similar patterns nearby with AST or local search.
4. Check whether duplication, weak contracts, or bad boundaries are the real refactor driver.
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
6. Check whether contracts, duplication, and module boundaries support extensibility.
7. Check whether critical architectural constraints are documented.
8. Report both local code issues and system-level causes.

## Recommended Tool Combos

| Question | Recommended approach |
|----------|----------------------|
| Where should I start? | `localViewStructure` + `localFindFiles` |
| What is this symbol? | `localSearchCode` -> `lspGotoDefinition` |
| Who uses this shared function/type/export? | `localSearchCode` -> `lspFindReferences` |
| What is the runtime path? | `localSearchCode` -> `lspCallHierarchy` |
| Is this smell real? | AST search + targeted code read |
| Can I prove this structural claim? | AST search/tree-search + targeted code read |
| Are contracts weak or inconsistent? | LSP on public symbols + code read + scanner/AST signals |
| Is this implementation inefficient? | scanner complexity signals + code read + persistence/query path review |
| Is this dead code? | `lspFindReferences` + AST import/export check + scanner dead-code signals |
| Is this module risky to change? | scanner scope + LSP references/call flow + code read |
| Is the problem architectural? | scanner graph/flow + local structure + LSP on chokepoints |
| Are important critical aspects documented? | docs/readmes + code boundaries + config/schema/migration docs |
| Is the codebase losing velocity? | scanner hotspots + duplication/redundancy checks + boundary/contract review |
| Did the fix actually improve things? | tests + lint/build + scoped scanner + targeted LSP re-check |

## Before / During / After A Change

### Before
- understand current behavior and invariants
- find consumers and callers
- inspect tests around the changed path
- check whether the area is a hotspot, cycle member, or shared boundary
- check contracts: types, inputs, outputs, schemas, and public APIs
- check whether critical behavior and constraints are documented
- check for duplication before adding another branch or helper
- check for unnecessary complexity or repeated work before accepting the current shape
- look for an existing local pattern before inventing a new one

### During
- keep edits focused
- preserve boundaries unless the plan intentionally changes them
- prefer the smallest change that fixes the real issue
- prefer the cleanest modular fix that keeps the system extendable
- maintain clear contracts, especially in TypeScript-heavy code
- reduce redundancy and avoid layering new logic on top of rigid or naive code when a cleaner simplification is possible
- improve inefficient flows when they are part of the real problem
- keep CSS clean and scoped if the task touches frontend styling
- update or flag docs when critical behavior, contracts, setup, migration, or architecture understanding changed
- if the root cause is structural, say so instead of hiding it behind a cosmetic patch

### After
- run the relevant tests
- run lint and build or type-check as appropriate
- run CSS checks when styles changed
- run `knip` when refactors may have left dead exports, files, or deps behind
- re-check changed symbols with LSP after renames or moves
- run a scoped scanner pass for non-trivial changes
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

- Never present raw detector output as unquestioned fact.
- Never guess `lineHint`; get it from `localSearchCode`.
- Never use `lspCallHierarchy` on non-function symbols.
- Never judge a shared module by one file read alone.
- Never skip local Octocode discovery when those tools are available.
- Never present an important structural claim without checking it with AST when AST can prove it.
- Never stop at code style if the deeper issue is structure or flow.
- Never prefer a quick patch when the real issue is contracts, boundaries, duplication, or architecture.
- Never ignore obvious inefficiency, redundancy, or rigid code if it materially hurts extensibility or clarity.
- Never add new duplication if an existing abstraction or module should be improved instead.
- Never leave critical contract, flow, setup, or migration changes undocumented when documentation is needed.
- Always check blast radius before changing shared symbols.
- Always mention architecture, flow, or boundary impact when it matters.
- Always consider whether the change improves or hurts extensibility and team velocity.
- Always use task tracking for meaningful multi-step work when the runtime supports it.
- Always ask the user when a real decision or ambiguity checkpoint blocks safe progress.
- For medium or large changes, present a plan before making the edit.

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
- Is the implementation efficient enough, or is avoidable complexity hurting it?
- Is the system becoming cleaner, more modular, and easier to extend?
- Are important critical aspects documented?
- What is the safest next move?

If the answer only explains one file, it is usually incomplete.

## References

Use these only when needed:
- [Tool workflows](./references/tool-workflows.md)
- [CLI reference](./references/cli-reference.md)
- [Output files](./references/output-files.md)
- [AST reference](./references/ast-reference.md)
- [Validation playbooks](./references/validation-playbooks.md)
- [Quality indicators](./references/quality-indicators.md)
- [External tools](./references/externals.md)
