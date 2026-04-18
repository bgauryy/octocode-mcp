---
name: octocode-engineer
description: "Flexible system-engineering skill for technical code understanding, project/feature deep dives, bug investigation, quality and architecture analysis, and safe delivery from research and RFC/planning through implementation and verification. Enforces Clean Architecture (dependency rule, layer boundaries, stable abstractions) and Clean Code (small single-purpose functions, precise types, no silent failures, no duplication) with AST, LSP, and scanner evidence — produces a summary, flows, boundaries, and architecture-health artifact before recommending action."
---

# Octocode Engineer

Understand, change, and verify a codebase with system awareness. Single-file reading misses root causes — they live in boundaries, flow ownership, contracts, data paths, and runtime assumptions. This skill makes those visible before you act, and keeps them verified after.

## What you get (user view)

A structured **understanding artifact**, grounded in evidence, with every claim cited by `file:line`:

- **System summary** — what it does, who consumes it, invariants.
- **Control flows** — numbered call paths for the critical features.
- **Data flows** — writers, readers, transaction boundaries, caches per entity.
- **Types & protocols** — authoritative DTOs, schemas, wire contracts, compatibility posture.
- **Boundaries & ownership** — who owns what, where ports live, which tests prove contracts.
- **Duplication inventory** — top near-clones and the missing abstraction.
- **Execution profile** — hot paths, async/sync posture, retries/timeouts/lifecycles, runtime risks.
- **Architecture health** — one line per Clean-Architecture principle and per analytic dimension, with `confirmed|likely|uncertain`.
- **Clean-code hotspots** — top findings worth fixing.
- **Next step** — one sentence.

For a proposed change you also get: change flow, data-flow impact, contract impact, blast radius, risk vector.

**Safety built in.** Hard gates stop for your explicit decision before public-contract changes, cross-layer edits, destructive actions, or large blast radius.

## How to invoke (user view)

Ask in natural language. The skill activates on phrases like: *"understand this codebase"*, *"deep-dive this feature"*, *"review the architecture of X"*, *"why is this slow / flaky / coupled?"*, *"is this PR safe?"*, *"what breaks if I change Y?"*, *"prepare to refactor Z"*, *"validate this RFC against the code"*. See **When To Use It** below for the full trigger list.

## Operating contract (agent view)

Every non-trivial task MUST satisfy this contract:

1. **Scope** — restate the goal and constraints in one line before touching tools.
2. **Lenses** — apply both required lenses:
   - **Clean Architecture principles** — dependency rule, layer boundaries, stable abstractions, boundary ownership, single responsibility.
   - **Architect's six analytic dimensions** — flows, duplication, types, protocols & schemas, data flows, execution.
3. **Evidence** — prove every architectural or code-quality claim with at least one of: Octocode local tools, LSP, AST, scanner. Mark confidence (`confirmed|likely|uncertain`) with source.
4. **Artifact** — produce the understanding artifact before recommending action.
5. **Gates** — stop at every hard gate in **User-Ask Gates**. Never fall back to native Claude Code search tools while Octocode MCP is registered; a warning inside a successful response is not a failure.

## When To Use It

This is not only a code-editing skill — it is the structure, architecture, and flow-analysis skill that also supports coding. It fits any language; it fits Node/TypeScript and Python especially well, where module boundaries, async flows, contracts, dependencies, and runtime edges are the common failure surface.

Use this skill when the user asks to:

- **Understand** — a codebase, area, or feature end-to-end; code before changing it; behavior, flow, ownership, or architecture; the real system before planning.
- **Change** — fix a bug in shared/unclear code; refactor a module, package, or cross-file flow; implement a change safely in a non-trivial area; verify quality and risk after changes land.
- **Review** — code quality, architecture, technical debt; dead code, test gaps, security risks, design problems; build/runtime/packaging issues affecting delivery; maintainability, modularity, contracts, extensibility.
- **Decide** — shape architecture decisions before implementation; research implementation options; validate and re-check docs, planning docs, and RFCs against real behavior.

For formal architecture proposals with trade-offs and migration strategy, pair with [octocode-rfc-generator](https://skills.sh/bgauryy/octocode-mcp/octocode-rfc-generator).

## Core Mindset

1. System first, file second.
2. Prove behavior and blast radius before proposing changes.
3. Use local Octocode discovery first; then LSP/scanner; then AST for structural proof.
4. Validate every architectural or code-quality claim with at least 2 evidence sources; single-source claims are marked `likely` at best.
5. Choose the boundary/contract fix over a local patch when the issue is structural (see Smallest-fix vs. safest-fix gate).
6. Apply the Clean Architecture and Clean Code lenses on every non-trivial task.
7. Attach an explicit confidence marker (`confirmed` / `likely` / `uncertain`) to every conclusion that informs a decision.
8. Treat the skill prompt as operational policy, not advice.
9. Stop at every hard gate in **User-Ask Gates**; do not ask outside of gates.

## Trivial vs. non-trivial — when the contract binds

The operating contract, both lenses, and the understanding artifact apply to **non-trivial** tasks. A task is **trivial** only when all of these hold:

- Single file, no public API or exported symbol touched.
- No consumers (0 references from `lspFindReferences`) or the change is behavior-preserving for every consumer.
- No contract, schema, protocol, config, or migration touched.
- ≤ ~20 lines changed.
- No cross-layer or cross-package edit.

If any of those is false, treat the task as non-trivial. For trivial tasks, produce only the final one-line next step and the verification you ran — skip the rest of the artifact. Default assumption when in doubt: non-trivial.

## Clean Architecture & Clean Code (Required Lenses)

Every non-trivial investigation MUST be read through these two lenses. They are not optional reviews — they shape how the system is understood, summarized, and changed. Use the tools listed to *prove* each claim; do not assert architectural or code-quality facts without evidence from at least one of them.

### Clean Architecture — what to enforce, how to verify

Principles (enforce, do not merely note):
1. **Dependency rule** — source code dependencies point inward. Domain never imports infrastructure/UI; use cases never import frameworks.
2. **Layer boundaries** — entities → use cases → interface adapters → frameworks & drivers. Concerns stay in their layer.
3. **Stable abstractions** — volatile details depend on stable policy, never the reverse.
4. **Boundary ownership** — every cross-boundary call goes through an explicit port (interface/DTO). Implementation types do not leak.
5. **Single responsibility per module** — one reason to change; one axis of volatility.

| Principle | Tool | Evidence to collect |
|-----------|------|---------------------|
| Dependency rule | `scripts/run.js --graph` + `lspFindReferences` | layer-violation / SDP findings; inward-pointing edges only |
| Layer boundaries | `localSearchCode` on import lines + scanner layer output | UI→DB, domain→HTTP, adapter→framework leaks |
| Stable abstractions | scanner `distance-from-main-sequence` | concrete high-fan-in modules, unstable abstractions |
| Boundary ownership | `lspGotoDefinition` across package boundaries | types crossing boundaries without a port |
| Single responsibility | scanner + `scripts/ast/search.js` (`--preset class-declaration`, `god-function`) | god modules, multi-purpose classes, wide exports |

### Architect's analytic dimensions

Six dimensions, each with its own failure modes, tools, and questions. For a full system review, cover all six. For a scoped task (bug fix, small feature, targeted refactor), cover the dimensions the change touches and mark the rest `N/A` with a one-line reason in the **Architecture health** section. Never silently skip a dimension — `N/A` is a claim, not an absence.

#### 1. Flows — control flow end-to-end

Trace entry → collaborators → side effects → return/emit.

- **Verify:** `localSearchCode` (entry + `lineHint`) → `lspCallHierarchy(incoming)` → `lspCallHierarchy(outgoing)` → `scripts/run.js` flow/graph output for hot paths.
- **Anti-patterns:** hidden jumps (events without a subscriber map), middleware chains nobody can enumerate, untested error branches.

#### 2. Duplication — structural and behavioral repetition

Same logic in two places drifts. Duplication encodes an unnamed abstraction.

- **Verify:** scanner (`duplicate-function-body`, `duplicate-flow-structure`, `similar-function-body`) → `scripts/ast/search.js --pattern` on the suspect shape → `lspFindReferences` on the canonical version to check adoption.
- **Anti-patterns:** two sources of truth, copies that drift, per-caller reinvention of a shared concern.

#### 3. Types — in-process contracts

- **Verify:** `lspGotoDefinition` on boundary parameters → `lspFindReferences` on the type → `scripts/ast/search.js` presets (`any-type`, `type-assertion`, `non-null-assertion`) → scanner `unsafe-any`, `type-assertion-escape`, `narrowable-type`.
- **Anti-patterns:** `any`/`unknown` at a public boundary, casts to silence the compiler, optional fields the caller must always populate.

#### 4. Protocols & schemas — wire-level contracts

HTTP/gRPC/GraphQL shapes, event envelopes, message headers, SQL/Prisma/Mongo schemas, config files. Breaking a schema breaks consumers you cannot always see.

- **Verify:** `localFindFiles` on `*.proto`, `*.graphql`, `*.sql`, `openapi*`, `schema*`, `migrations/*` → `localGetFileContent` on each authoritative schema → `lspFindReferences` on generated types → `githubSearchPullRequests` for recent schema changes (when external).
- **Anti-patterns:** schema drift across services, implicit required fields, defaults set in code instead of schema, version bumps without compatibility windows, undefined null vs missing vs empty semantics.

#### 5. Data flows — state, ownership, mutation

Follow the data: where it lives, who writes it, who reads it, what the transaction boundaries are.

- **Verify:** schema files + repository/DAO modules → `lspFindReferences` on write functions (`save`, `update`, `insert`, `publish`) → `scripts/run.js` graph/flow modes for modules on a write path → `scripts/ast/search.js --kind` on mutation patterns.
- **Anti-patterns:** multiple writers to one field, read-your-writes across async boundaries, cache updates racing with writes, write paths skipping the canonical validator, projections read without consistency guarantees.

#### 6. Execution — runtime behavior

Sync vs async, serial vs concurrent, blocking I/O, retries, timeouts, startup/shutdown order, background loops, resource lifecycle.

- **Verify:** `scripts/ast/search.js` presets (`async-function`, `await-in-loop`, `sync-io`, `promise-all`) → scanner (`await-in-loop`, `sync-io`, `uncleared-timer`, `unbounded-collection`, `startup-risk-hub`, `listener-leak-risk`) → `lspCallHierarchy` along the hot path → tests/benchmarks in the repo.
- **Anti-patterns:** `await` inside a tight loop, sync I/O on a request path, timers/listeners without lifecycle, startup ordering that assumes initialization, retries without backoff or idempotency.

---

These dimensions compose the understanding artifact: **Flows + Data flows** feed the "Key flows" section; **Types + Protocols** feed "Boundaries & ownership"; **Duplication + Execution** surface in "Clean-code hotspots" and "Architecture health". On a change, state which dimensions the change stresses — that is your risk vector.

### Clean Code — what to enforce, how to verify

Rules (enforce, do not merely note):
1. **Names reveal intent** — symbols describe what, not how.
2. **Small, single-purpose functions** — one level of abstraction; short; ≤ ~3 params.
3. **No dead or duplicated logic** — every branch reachable; each pattern lives in one place.
4. **Fail loudly, never silently** — no empty catches, no swallowed errors, no bare `except`.
5. **Types are precise at boundaries** — no `any` / no bare `except` / no unchecked casts at contracts.
6. **Comments explain *why*, not *what*** — if the comment restates the code, delete one.

| Rule | Tool | Preset / signal |
|------|------|-----------------|
| Small functions | `scripts/run.js` | `god-function`, `cognitive-complexity`, `halstead-effort`, `excessive-parameters` |
| Duplication | `scripts/run.js` | `duplicate-function-body`, `duplicate-flow-structure`, `similar-function-body` |
| Silent failures | `scripts/ast/search.js` | `--preset empty-catch`, `--preset py-bare-except`, `--preset py-pass-except`, `--preset catch-rethrow` |
| Loose types | `scripts/ast/search.js` | `--preset any-type`, `--preset type-assertion`, `--preset non-null-assertion` |
| Intent-revealing names | code read + `lspFindReferences` | widely-used cryptic symbols, abbreviations that spread |
| Dead / unreachable | scanner + `knip` | `dead-export`, `dead-file`, `unused-import`, `unused-npm-dependency` |

### Required output: understanding artifact

Before concluding any non-trivial investigation, produce a compact artifact. Keep each section tight — a reviewer with no prior context should follow it in under two minutes. Each section maps to the six analytic dimensions. Sections tagged **required** always appear (write `N/A` with a one-line reason if not applicable); sections tagged **applicable** appear only when the task touches that surface.

| # | Section | When | Source dimensions |
|---|---------|------|-------------------|
| 1 | **System summary** — what it does, who consumes it, invariants | required | — |
| 2 | **Control flows** — numbered call paths, each step cited `file:line` | required | Flows |
| 3 | **Data flows** — writers, readers, transaction boundaries, caches per entity | applicable (stateful tasks) | Data flows |
| 4 | **Types & protocols** — boundary DTOs/schemas/wire contracts, compatibility posture | applicable (contract tasks) | Types, Protocols & schemas |
| 5 | **Boundaries & ownership** — module ownership, ports, contract tests | required | — |
| 6 | **Duplication inventory** — top near-clones and the missing abstraction | applicable (refactor / quality) | Duplication |
| 7 | **Execution profile** — hot paths, async/sync posture, retry/timeout/lifecycle, runtime risks | applicable (perf / reliability) | Execution |
| 8 | **Architecture health** — one line per principle and per dimension, with `confirmed|likely|uncertain` + source | required | all |
| 9 | **Clean-code hotspots** — top AST/scanner findings worth fixing, cited `file:line` | applicable (quality work) | — |
| 10 | **Next step** — one sentence | required | — |

For trivial tasks (see "Trivial vs. non-trivial" above), produce only sections 10 and the verification you ran.

If the task involves a change, also include:
- **Change flow** — the specific call path the change traverses. *(required for any change)*
- **Data-flow impact** — entities read/written and how transaction/cache semantics are preserved. *(required if section 3 applied)*
- **Contract impact** — types/schemas/protocols touched and compatibility posture (backwards-compatible / breaking-with-migration / additive-only). *(required if section 4 applied)*
- **Blast radius** — callers and consumers touched, from `lspFindReferences`, labeled by layer. *(required for any change with consumers)*
- **Risk vector** — which clean-architecture principles and which analytic dimensions the change stresses, and how each is preserved. *(required for any change)*

## Investigation Lenses

Investigations are structured by two stacked lenses, both defined above in the **Clean Architecture & Clean Code** section:

- **Clean-Architecture principles** — dependency rule, layer boundaries, stable abstractions, boundary ownership, single responsibility.
- **Architect's analytic dimensions** — flows, duplication, types, protocols & schemas, data flows, execution.

Cross-cutting concerns (reliability, observability, rollout/migration, build & config, docs) surface as sub-questions inside those dimensions; do not treat them as a separate lens stack. Tool routing for each is listed in **Tool Families** below.

## Tool Families And Their Jobs

### 1. Local Octocode tools

Use local tools first to map the workspace. These are the default first tools, not a fallback.

| Tool | Use it for |
|------|------------|
| `localViewStructure` | Package/module layout, folder depth, source spread |
| `localFindFiles` | Large files, recent churn, suspicious filenames, likely hotspots |
| `localSearchCode` | Fast discovery, symbol search, text patterns, and `lineHint` for LSP |
| `localGetFileContent` | Final code reading after you know what you are looking at |

Rules:
- Do not start with a full-file read when discovery tools can narrow the target first.
- When `localSearchCode` returns zero matches: (1) widen the pattern (drop regex meta-chars, try a substring), (2) fall back to `localFindFiles` on likely filename patterns, (3) retry with the literal symbol name. Only after that may you broaden to `localViewStructure` for layout reconnaissance. **Never** guess a `lineHint` for LSP.

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

### 3. AST tools — structural proof

Use AST when text search is too weak. AST is the authoritative proof layer for code-shape, redundancy, and smell claims.

| Script | Role | Example invocation |
|--------|------|--------------------|
| `scripts/ast/search.js` | Live ast-grep search on current source — authoritative | `node scripts/ast/search.js --preset empty-catch --root ./src` |
| `scripts/ast/search.js` | Project-specific structural claim | `node scripts/ast/search.js --pattern 'if ($C) { return $V }' --json` |
| `scripts/ast/tree-search.js` | Fast triage over cached AST trees from a prior scan | `node scripts/ast/tree-search.js -i .octocode/scan -k function_declaration --limit 25` |

Conventions:
- Presets cover the common clean-code rules; list them with `node scripts/ast/search.js --list-presets`.
- Python presets are prefixed `py-` (e.g. `py-bare-except`, `py-mutable-default`).
- Pair every match with its `file:line` in the summary.

Rules:
- Use `tree-search.js` first to narrow, then `search.js` to confirm on live code.
- If a structural claim matters to a decision, confirm it with AST before presenting it as fact.
- For preset catalog, pattern syntax, and Python node kinds, see [AST reference](./references/ast-reference.md).

### 4. Scanner — architecture and flow

Use `scripts/run.js` when the question is bigger than one symbol or one file. It surfaces dependency cycles, chokepoints, coupling pressure, layer violations, dead-code clusters, security sinks, test gaps, and hot paths — the issues local reading misses.

| Script | Role | Example invocation |
|--------|------|--------------------|
| `scripts/run.js` | Default scoped scan | `node scripts/run.js --scope=packages/my-pkg` |
| `scripts/run.js --graph` | Architecture graph (cycles, SDP, coupling) | `node scripts/run.js --graph --out .octocode/scan/scan.json` |
| `scripts/run.js --json` | Machine-readable findings | `node scripts/run.js --json --out .octocode/scan/scan.json` |

Use scanner output to reason about: where change risk concentrates, whether a module is structurally unhealthy, whether a local fix ignores a broader architectural problem, which area to refactor first. Flags, thresholds, and scope syntax: see [CLI reference](./references/cli-reference.md). Reading the scan artifacts: see [Output files](./references/output-files.md).

**First-run install.** The three scripts (`run.js`, `ast/search.js`, `ast/tree-search.js` — the last one needs no natives) verify their native deps on startup. If `node_modules/` is missing them, they detect the user's package manager (pnpm-lock.yaml → pnpm, yarn.lock → yarn, else npm) and install into the skill directory automatically, printing:

```
[octocode-scan] Missing runtime dependencies: …
[octocode-scan] Skill directory: …
[octocode-scan] Detected package manager: …
[octocode-scan] Installing now: …
```

If auto-install fails (offline, wrong PM on PATH, etc.), the script exits non-zero with the exact manual command. Users can opt out of auto-install with `OCTOCODE_NO_AUTO_INSTALL=1`, in which case the script prints the command and exits without running it.

### 5. Quality and hygiene checks

The Clean-Architecture principles and the six analytic dimensions already cover naming, cohesion, duplication, layering, contracts, types, data flow, and execution. Use this section only for cross-cutting concerns **not** directly named there:

| Check | Focus |
|------|------|
| Reliability & resilience | retry policy, timeout handling, failure isolation, idempotency, fallback behavior |
| Observability & operability | logging quality, metric/tracing coverage, diagnosability, alert/runbook readiness |
| Rollout & migration | feature flags, backward-compatibility windows, rollback path, migration sequencing |
| Build & config | ESM/CJS mismatch, module resolution, script wiring, runtime assumptions |
| Docs | whether critical assumptions, contracts, flows, setup, migrations, and risks are documented |
| CSS hygiene | selector scope, token reuse, naming clarity, dead styles (when frontend styling is touched) |
| `knip` | unused exports, files, dependencies, dead integration edges (run on refactors) |

Skip items that do not apply to the current task.

### 6. Task and user checkpoints

Use task or todo tracking when the work has multiple steps, risks, or follow-ups.
Track at least:
- investigation
- decision or plan
- implementation
- verification
- docs follow-up when needed

For when to stop and ask, see the **User-Ask Gates** section below. Hard gates are non-negotiable stops (ambiguous scope, public contract change, cross-layer edits, destructive actions, large blast radius). Soft gates are ask-if-material.

Use task tracking whenever the work spans research -> planning -> implementation -> verification -> docs/RFC sync.

### 7. Agent execution rules

Complements the Operating Contract at the top of this file with reliability rules for how the agent emits reasoning and updates.

Per-step:
- Declare the next tool step and why it is the cheapest proof available.
- Separate facts from inference in every checkpoint.
- Carry forward concrete identifiers from tools (`lineHint`, paths, symbols, artifact names).
- Run explicit verification after edits; do not assume success from static reading.

Status updates:
- Every update names what was checked and what remains. No vague progress.
- No broad claims ("looks fine", "should be ok") without at least one concrete evidence source.
- No switching from investigation to edits without a short system/flow summary.

Depth control:
- Skip irrelevant checks when they clearly do not apply (mark `N/A` in the artifact).
- Go deeper only where risk or uncertainty is meaningful.
- Choose the lightest evidence path that proves the conclusion.

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

Tool-selection rules for scripts are in §3 (AST) and §4 (Scanner). Additional cost rules:

- Scope scan runs (`--scope=...`) before full-repo scans.
- Do not re-run a scan when the existing artifact already answers the current question.
- When scan output is stale relative to current edits, re-run only the minimal necessary scope.

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
10. Apply the Clean Architecture and Clean Code lenses; record each principle as `confirmed|likely|uncertain` with evidence.
11. Produce the understanding artifact (system summary, key flows, boundaries, architecture health, clean-code hotspots, next step).
12. Pause and ask the user if a real decision checkpoint appears.
13. Decide whether to explain, plan, or edit.

Short form:
`clarify -> track -> layout -> symbols -> structure -> architecture/build/docs -> code -> docs/RFC reality check -> clean-arch/clean-code lenses -> summarize (artifact) -> checkpoint -> action`

## How To Use This Skill

All tasks follow the **Default Working Order** above; these task-shaped adjustments say which steps carry the most weight and where to slot extra emphasis.

- **Code understanding** — emphasize steps 3–8 (layout → LSP → AST → scoped scanner → read). The deliverable is the understanding artifact.
- **Bug fixing** — start from the failing behavior, follow the Flows + Execution dimensions to the entry point, check adjacent error/retry/contract risk. Fix the smallest layer that solves the root cause; escalate to a boundary/contract fix when the bug is systemic (hit the **Smallest-fix vs. safest-fix** gate).
- **Refactor** — steps 4–7 carry the weight: blast radius (`lspFindReferences`), scoped architecture scan, duplication inventory, then plan. Prefer extracting modules, clarifying contracts, simplifying flows over cosmetic reshuffling. Verify after each incremental batch.
- **Architecture review** — start with the scanner (`--graph`), then use LSP to verify dependency pressure around candidate modules, then read representatives. Report both local and system-level causes.
- **RFC / design validation** — map each claim to code ownership; verify flow, contract, and architecture alignment; mark each claim `confirmed|likely|uncertain` with evidence; report mismatches as concrete doc or code follow-ups.
- **Implementation duty cycle** — before coding, state root cause + blast radius + target contract; during coding, keep edits in the smallest responsible layer and run narrow checks per batch; after coding, re-sync docs/RFCs and close with residual risk + confidence.

## Before / During / After A Change

Investigation substance is covered by the Clean-Architecture principles, the six analytic dimensions, and the understanding artifact. This section lists only the **operational actions** unique to each phase.

### Before
- Produce the understanding artifact (covers flows, data flows, types, protocols, duplication, execution, boundaries).
- Map design-doc / RFC claims to concrete code ownership when one exists.
- Look for an existing local pattern before inventing a new one.

### During
- Keep edits in the smallest responsible layer; preserve boundaries unless the plan intentionally changes them.
- Maintain contract/protocol compatibility unless an explicit migration is in scope.
- Flag any mid-task drift: if root cause turns out structural, hit the **Smallest-fix vs. safest-fix** gate instead of continuing with a cosmetic patch.

### After
- Run tests, lint, and build/type-check.
- Re-check changed symbols with LSP after renames/moves; run a scoped scanner pass for non-trivial changes.
- Run `knip` when the refactor may leave dead artifacts; CSS checks when styles changed.
- Re-validate the artifact's dimensions against the final implementation; note any remaining architectural risk even if the code now works.
- Sync docs / RFC sections touched by the change.

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

### Evidence conflict resolution

When sources disagree on a claim that affects a decision, prefer the source whose domain it is, then re-verify the weaker source:

| Claim type | Authoritative source | Corroborator |
|-----------|----------------------|--------------|
| Symbol identity, references, callers/callees | LSP (`lspGotoDefinition`, `lspFindReferences`, `lspCallHierarchy`) | AST + code read |
| Structural shape (empty catch, `any` usage, nested ternary, preset match) | AST (`scripts/ast/search.js`) | scanner + code read |
| Runtime behavior and side effects | targeted code read + tests | AST + scanner |
| Architecture pressure (coupling, cycles, SDP, hot paths) | scanner (`scripts/run.js`) | LSP references + code read |
| Contract/schema shape at a boundary | the schema/IDL file itself + `lspGotoDefinition` | references to generated types |

If the authoritative source contradicts a weaker one, mark the weaker one as "re-verify" in the artifact and note the resolution. Never present conflicting evidence as resolved without a recorded tiebreak.

## User-Ask Gates

A gate is a **hard stop**: do not proceed past it without the user's explicit decision. Gates protect the user from silent drift, unsafe changes, and wasted work.

### Hard gates (always stop and ask)

Stop and ask before any of these. State the situation in ≤3 lines, list the viable options, name the tradeoff, and recommend one.

1. **Ambiguous scope** — the task has more than one reasonable interpretation and the right one changes the plan.
   _Ambiguous:_ "fix the login bug". _Unambiguous:_ "fix 500 on /api/login when password field is empty".
2. **Public contract change** — a public API, exported symbol, event schema, DB schema, CLI flag, or wire protocol would change.
   _Fires:_ renaming an exported function with external consumers. _Does not fire:_ renaming a private helper with no references.
3. **Cross-layer/cross-package change** — the fix requires editing more than one layer (domain + adapter, package A + package B) or crosses a workspace boundary.
   _Fires:_ bug fix needs changes in `packages/domain` AND `packages/http-adapter`. _Does not fire:_ edit contained in one package.
4. **Dependency-rule violation required** — the cleanest fix would break the dependency rule (inner layer importing outer), break a boundary, or introduce a new cycle.
   _Fires:_ domain module would need to import the HTTP adapter to access a helper. _Does not fire:_ adapter importing domain (that's the correct direction).
5. **Destructive or irreversible action** — delete/rename shared files, drop tables, reset branches, force-push, publish packages, send messages/PRs on the user's behalf.
   _Fires:_ `git reset --hard`, `rm -rf`, publishing an npm version. _Does not fire:_ local file edits on a feature branch.
6. **Blast radius > ~5 consumers** — `lspFindReferences` returns many callers and the change alters their behavior.
   _Fires:_ changing a utility called by 20 files. _Does not fire:_ changing a helper with 2 callers, both of which are co-edited.
7. **Two refinement attempts failed** — same approach tried twice and the evidence still doesn't line up.
   _Fires:_ two different search patterns both return empty for a symbol you expected. _Does not fire:_ one failed attempt with a clear next angle.
8. **Missing gate prerequisite** — no tests exist for the area, no owner documented, no schema available, and the change needs one.
   _Fires:_ user asks for a refactor of untested legacy code. _Does not fire:_ tests exist and cover the change surface.
9. **Conflicting evidence** — authoritative and corroborating sources (see **Evidence conflict resolution**) disagree on a claim that matters to the decision.
   _Fires:_ LSP says 0 references, AST shows an import of the symbol. _Does not fire:_ scanner is noisy but LSP is clear.
10. **Smallest-fix vs. safest-fix conflict** — a narrow patch would work but the root cause is structural.
    _Fires:_ bug can be fixed by adding a null check but the real cause is a missing contract between two layers. _Does not fire:_ the narrow patch IS the right layer.

### Soft gates (ask if uncertainty is material)

Ask when the decision materially changes the outcome; otherwise proceed and note the assumption.

- Multiple reasonable architectures exist for a greenfield area.
- Framework / library choice where the project has no established pattern.
- Rollout strategy (feature flag vs direct deploy) for a behavior change.
- Migration sequencing when old and new consumers coexist.
- Whether to fix adjacent smells discovered mid-task or log them as follow-ups.

### Ask template

When you hit a gate, use this shape:

> **Gate:** <what triggered it, 1 line>
> **Options:**
> 1. <option A> — tradeoff
> 2. <option B> — tradeoff
> **Recommendation:** <A or B, 1 line why>
> **Blocking:** <what I will not do until you decide>

Keep it short. The user should be able to respond in one sentence.

If the user picks an option you did not recommend (including a riskier one), record the decision and the stated reason in the **Architecture health** / **Risk vector** sections of the artifact and proceed without re-asking. Do not argue against a decided option — raise residual risks once, then execute.

### Gate discipline

- Do not ask when the answer is obvious from the code, CLAUDE.md, or prior context. Gates exist to reduce irreversible mistakes, not to offload decisions.
- Do not silently continue past a hard gate because "it seemed fine" — that is the failure mode gates prevent.
- If a gate fires mid-implementation, stop at a clean checkpoint (commit if appropriate, revert if not) and ask.
- After the user decides, record the decision in the understanding artifact so future steps carry it forward.
- Gates bind regardless of fallback state. If an Octocode tool is unavailable and you are in **Fallback Mode**, gates still fire on the same conditions; lower confidence does not weaken the rule.

## Hard Rules

Core guardrails:
- Do not present raw detector output as unquestioned fact.
- Do not guess `lineHint` (see Tool Families §2).
- Do not use `lspCallHierarchy` on non-function symbols.
- Do not judge shared modules from one file read alone.
- Do not claim design/RFC compliance without claim-by-claim evidence.
- Do not ignore build/config evidence when runtime behavior may depend on it.
- Do not apply a quick patch when the real issue is contracts, boundaries, duplication, or architecture — hit the **Smallest-fix vs. safest-fix** gate.
- Check blast radius before changing shared symbols.
- Re-sync docs/RFCs when implementation changes architecture, contracts, rollout assumptions, or constraints.
- Stop at every hard gate in the **User-Ask Gates** section; do not proceed without an explicit user decision.
- Do not switch to native Claude Code search tools (`Grep`, `Glob`, `Read`) while Octocode MCP is registered (see **Fallback Mode** for the full rule).

## Fallback Mode

Fallback applies only when an Octocode tool is truly **unavailable** (not registered, unreachable, or returning hard errors). A warning inside a successful response is not a failure.

If Octocode tools or LSP are unavailable:
- continue with AST tools and the scanner
- rely more on local search and direct code reading within this skill's tool universe
- reduce confidence on semantic claims
- say clearly which parts were proven and which parts were inferred

If an Octocode tool returns a degradation notice but completed the call:
- treat the response as valid and use its results
- if the results are empty or clearly wrong, retry with a simpler input (drop regex meta-characters, switch to literal search, narrow the path)
- do not switch to native Claude Code tools — that would leave the skill's evidence model

## Outcome Standard

A good result answers all of these:
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
