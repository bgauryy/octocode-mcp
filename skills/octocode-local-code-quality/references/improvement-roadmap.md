# Improvement Roadmap

Research-backed upgrade plan for the weakest parts of the skill: security analysis, test-quality analysis, semantic analysis, output/reporting, and test-suite quality.

---

## Validation Policy

When Octocode MCP local tools are available, every statement about live code must be validated with them before it is presented as fact.

- Start with `localSearchCode` to anchor the statement to a concrete file and `lineHint`.
- Use one semantic check next: `lspGotoDefinition`, `lspFindReferences`, or `lspCallHierarchy`.
- Use `localGetFileContent` only after the location is known and the exact statement to validate is clear.
- If Octocode local tools are unavailable, fall back to CLI validation and mark the confidence level.

This rule applies to:
- statements about whether code is dead, reachable, validated, or unused
- statements about whether user input reaches a sink
- statements about whether tests clean up, isolate state, or assert behavior
- statements about module boundaries, dependency direction, and exported API usage

---

## 1. Security Analysis

### Current weakness

The current security layer is strong on breadth but still depends heavily on single-file heuristics. That creates false positives for patterns that look dangerous but are not proven dangerous in context.

### Target architecture

Move from isolated pattern detection to a lightweight taint model:

`sources -> propagators -> sanitizers -> sinks -> evidence trace`

Keep cheap AST rules for obvious cases:
- `eval`
- `new Function`
- direct `innerHTML`
- hardcoded secrets

Upgrade the noisier rules to dataflow-backed analysis:
- `prototype-pollution-risk`
- `sql-injection-risk`
- `unsafe-html`
- `unvalidated-input-sink`
- `input-passthrough-risk`

### Concrete upgrades

- Add sink-specific rule models for SQL, HTML, command execution, file writes, path joins, and object merge/write sites.
- Add sanitizer catalogs for common validation and encoding patterns.
- Add confidence scoring per rule: `high`, `medium`, `low`.
- Add finding evidence: source parameter, propagation steps, sink call, sanitizer status.
- Suppress structural false positives where the dynamic key is synthesized locally and never user-controlled.

### P0 work

- Split current security detectors into `pattern` rules and `flow` rules.
- Add fixture tests for true positive and false positive pairs.
- Add `confidence` and `evidence` fields to security findings.

### P1 work

- Build intra-procedural taint tracking inside a function body.
- Add reusable source/sink/sanitizer definitions.
- Add validation playbooks for each security category using Octocode local tools.

---

## 2. Test-Quality Analysis

### Current weakness

The current test-quality pass mostly counts assertions, mocks, and setup hooks. That is helpful, but still shallow for real flakiness and false-confidence detection.

### Target architecture

Extend test analysis from simple counters to behavior-aware checks:

- assertion presence
- assertion reachability on all paths
- cleanup and restore behavior
- deterministic execution
- framework misuse

### Concrete upgrades

- Detect async tests that neither `await` nor return a promise.
- Detect `test.only`, `describe.only`, `skip`, and `todo`.
- Detect fake timers without restore and mock/spy state not reset or restored.
- Detect time, randomness, environment, and global-state coupling.
- Detect snapshot-only tests and interaction-only tests with no outcome assertions.
- Detect cleanup that exists on one path but not all paths.

### P0 work

- Add dedicated detector tests for test-quality rules.
- Add rules for focused tests, fake timers without restore, and missing mock restoration.
- Add a richer `testProfile` summary for timers, mocks, async patterns, and cleanup hooks.

### P1 work

- Add code-path-aware assertion and cleanup checks.
- Add framework-specific adapters for Vitest/Jest style APIs.
- Add flaky-test tags and recommended remediation steps.

---

## 3. Semantic Analysis

### Current weakness

Semantic analysis is valuable, but it currently rebuilds a fresh TypeScript language service and uses a constant script version. That limits scale and wastes work on repeated scans.

### Target architecture

Adopt a persistent project-backed semantic engine:

- cache by `tsconfig`
- track file versions
- reuse TypeScript project state across scans
- support project references cleanly

### Concrete upgrades

- Replace ad hoc `LanguageService` creation with a project-service wrapper.
- Separate semantic fact collection from detector execution.
- Cache export references, inheritance chains, implementation maps, and symbol relationships.
- Expose semantic facts to detectors through a stable query surface instead of repeated tree walks.

### P0 work

- Introduce a semantic cache keyed by root + tsconfig + file versions.
- Stop hardcoding script version `"1"`.
- Benchmark semantic scan cost before and after caching.

### P1 work

- Move to a Project Service style lifecycle.
- Support project references and monorepo workspaces.
- Share semantic state between multiple detectors in a single run.

---

## 4. Output & Reporting

### Current weakness

The output is rich, but report generation is currently brittle and the output contract is not explicit enough to protect downstream tooling.

### Target architecture

Treat findings and reports as a versioned API:

- one normalized internal result model
- multiple emitters from that model
- stable schema version
- stable rule IDs
- optional SARIF output

### Concrete upgrades

- Normalize `summary.json`, `findings.json`, and Markdown generation around one canonical result object.
- Add `schemaVersion`, `confidence`, `evidence`, and `ruleId`.
- Add SARIF emission with stable fingerprints.
- Add diff/baseline mode so teams can adopt the tool incrementally.
- Add contract tests for output shapes and golden tests for Markdown rendering.

### P0 work

- Fix the report regression first.
- Add dedicated golden tests for `summary.md`, `summary.json`, and `findings.json`.
- Add contract assertions around required keys and nullable fields.

### P1 work

- Add SARIF emitter.
- Add baseline and diff output modes.
- Add category-level and confidence-level summary slices.

---

## 5. Test-Suite Quality

### Current weakness

The suite is large, but the failing report tests show that critical output paths can still regress together. Some important detector modules do not have focused test files.

### Target architecture

Use layered testing:

- focused detector unit tests
- integration tests for orchestration
- golden tests for reports
- property-based tests for AST invariants
- mutation testing for critical rules

### Concrete upgrades

- Add dedicated tests for `security-detectors`, `test-quality-detectors`, and `tree-sitter-analyzer`.
- Add property-based tests for AST search and report invariants.
- Add mutation testing for high-risk detectors and output generation.
- Add smoke tests that run the scanner against its own source and assert key categories.

### P0 work

- Restore a green Vitest run.
- Add missing focused test files.
- Lock down report and findings schema expectations.

### P1 work

- Add property-based tests with `fast-check`.
- Add mutation testing with Stryker for critical modules.
- Add self-scan fixture snapshots for detector stability.

---

## 6. Architecture Analysis Depth

### Current weakness

The current architecture layer is strongest at file-level import analysis and architecture heuristics, but it still underuses graph science and AST/dataflow techniques that would make boundary and coupling defects more explainable.

### Target architecture

Treat architecture analysis as a hybrid of graph evidence and structural evidence:

- graph evidence for dependency shape, chokepoints, layering, and subsystem boundaries
- AST/semantic evidence for code roles, boundary leaks, side effects, and repeated orchestration

### Graph technique upgrades

- Add SCC condensation graphs so large file-level cycles collapse into interpretable cycle clusters.
- Add folder/package graphs to surface subsystem-level cycles and cross-boundary chatter.
- Add articulation-point and bridge-edge detection to identify brittle chokepoints.
- Add broker or betweenness-centrality scoring to find modules that mediate too many paths.
- Add change-coupling overlays from git history to catch architecture defects the import graph misses.

### AST and semantic technique upgrades

- Add relational or composite AST rules for architecture motifs, not just single-node patterns.
- Add symbol-level usage graphs so cohesion and feature-envy checks work below the file level.
- Add CFG/dataflow checks for boundary leaks, initialization order, and validation-before-sink behavior.
- Add import-time effect tracing to classify module-scope I/O, registration, and global mutation.
- Add boundary-role detection so controllers, services, domain modules, and infrastructure code can be checked semantically instead of only by path names.

### P0 work

- Expand the docs and playbooks so agents interpret architecture findings through graph and AST lenses together.
- Surface existing hub-node and hotspot signals more explicitly in result reading guidance.
- Add fixture-based tests for graph-hotspot interpretation and architecture-summary rendering.

### P1 work

- Implement SCC condensation and package-level dependency views.
- Add broker centrality and articulation-point scoring to hotspot analysis.
- Add relational AST rules for boundary leaks, split-brain modules, and import-time orchestration.

### P2 work

- Add lightweight local dataflow for architecture rules.
- Combine graph scores with AST evidence into a single architecture-confidence model.
- Add change-coupling overlays and folder/community clustering for subsystem discovery.

---

## Delivery Phases

### Phase 0: Stabilize

- Fix output/reporting regressions.
- Make Vitest green.
- Add missing focused tests.
- Enforce Octocode local-tool validation in the skill docs and playbooks.
- Tighten architecture reading guidance around graph and AST signals.

### Phase 1: Improve Precision

- Add security taint modeling inside a function body.
- Add richer test-quality rules for cleanup, timers, mocks, and async behavior.
- Add confidence and evidence fields to findings.

### Phase 2: Improve Scale

- Add persistent semantic state and project-backed analysis.
- Add semantic fact caching.
- Add baseline/diff mode and SARIF output.

### Phase 3: Deepen Coverage

- Add optional interprocedural summaries.
- Add property-based and mutation testing.
- Externalize more AST-only rules into rule packs.
- Add deeper graph and subsystem analysis for architecture defects.

---

## Research Basis

- TypeScript Compiler API wiki: https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API
- typescript-eslint Project Service docs: https://typescript-eslint.io/packages/project-service/generated/
- typescript-eslint Project Service blog: https://github.com/typescript-eslint/typescript-eslint/blob/main/packages/website/blog/2025-05-29-project-service.mdx
- Semgrep taint analysis overview: https://github.com/semgrep/semgrep-docs/blob/main/docs/writing-rules/data-flow/taint-mode/overview.md
- ast-grep relational rules: https://github.com/ast-grep/ast-grep.github.io/blob/main/website/guide/rule-config/relational-rule.md
- ESLint code path analysis: https://eslint.org/docs/latest/extend/code-path-analysis
- Tree-sitter predicates and directives: https://tree-sitter.github.io/tree-sitter/using-parsers/queries/3-predicates-and-directives.html
- dependency-cruiser rules reference: https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md
- CodeQL data flow analysis: https://github.com/github/codeql/blob/main/docs/codeql/writing-codeql-queries/about-data-flow-analysis.rst
- CodeQL JS/TS data flow guide: https://github.com/github/codeql/blob/main/docs/codeql/codeql-language-guides/analyzing-data-flow-in-javascript-and-typescript.rst
- Vitest coverage reporters: https://github.com/vitest-dev/vitest/blob/main/docs/config/coverage.md
- Vitest timers guide: https://vitest.dev/guide/mocking/timers
- Stryker JS usage: https://github.com/stryker-mutator/stryker-js/blob/master/docs/usage.md
- fast-check getting started: https://fast-check.dev/docs/introduction/getting-started/
- GitHub SARIF fingerprints: https://docs.github.com/en/code-security/reference/code-scanning/sarif-files/sarif-support-for-code-scanning
