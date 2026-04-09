# RFC: High-End LSP Quality, Pagination Correctness, and Full Semantic Utilization

## 1. Summary

This RFC proposes a staged engineering program to harden LSP correctness and raise Octocode from "strong core navigation" to "high-end semantic research platform." We will first fix correctness bugs in query-level pagination and merged reference results, then align pagination semantics across all LSP tools, and finally add missing high-value LSP capabilities for semantic discovery and AST-like structural exploration.

The recommendation is to execute this as a multi-phase, test-first migration with strict acceptance gates per phase. The primary goal is reliability and consistency for existing `lspGotoDefinition`, `lspFindReferences`, and `lspCallHierarchy`; the secondary goal is expanded LSP utilization (`documentSymbol`, `workspace/symbol`, `typeDefinition`, `implementation`, and optional TS execute-command support).

## 2. Motivation

Octocode already has strong LSP foundations:
- Semantic core operations are implemented and wired in the LSP client and operations layer.
- LSP tools are first-class in local workflows and docs.
- Schema consistency and strict validation are now strong.

However, targeted review found correctness and consistency gaps that directly affect trust:
- `lspCallHierarchy` can attach `outputPagination` metadata without actually applying payload slicing.
- `lspFindReferences` merge currently combines page-local subsets, not full result sets, while hints/docs imply comprehensive merged coverage.
- Out-of-range page behavior is inconsistent across LSP tools.
- High-value LSP semantic discovery features are not yet surfaced, limiting "best search + AST-like view" workflows.

This is RFC-worthy because there are multiple implementation strategies with meaningful trade-offs (minimal patch, full stabilization, or ambitious expansion), and because the work changes behavior guarantees relied on by both local and research flows.

## 3. Guide-Level Explanation

After this RFC is implemented:
- LSP query-level pagination will be truthful: metadata and returned payload will always match.
- `lspFindReferences` merged mode will be explicit and deterministic: either true global merge before pagination, or explicitly documented/typed page-local merge mode.
- Out-of-range page requests will behave uniformly across all three LSP tools.
- Local+LSP research flow remains the same:
  1. `localSearchCode` for symbol/line discovery.
  2. LSP semantic operations for definition/references/call tracing.
  3. `localGetFileContent` for deep read.
- New optional semantic tools will unlock high-end discovery:
  - `lspDocumentSymbols` for file-level symbol tree.
  - `lspWorkspaceSymbols` for project-wide symbol discovery.
  - `lspTypeDefinition` and `lspImplementation` for stronger navigation.
  - Optional TS-specific source-definition mode via execute-command path.

## 4. Reference-Level Explanation

### 4.1 Problem Areas to Fix

1. Query pagination mismatch risk in call hierarchy:
- Current limit wrapper in `callHierarchy.ts` can add `outputPagination` based on serialized size.
- Structured pagination path then skips pagination whenever `outputPagination` already exists for `LSP_CALL_HIERARCHY`.
- Net effect can be metadata-only pagination without corresponding data slicing.

2. Page-local merge in references:
- LSP and pattern branches each paginate before merge.
- Merge then repaginates merged subset, so "comprehensive coverage" is not globally true across full result space.

3. Inconsistent page boundary semantics:
- References returns explicit out-of-range empty status with guidance.
- Call hierarchy helper paginates by slice without out-of-range canonical handling.

4. Capability under-utilization:
- Client currently centers on definition/references/call hierarchy.
- Missing high-value semantic discovery endpoints.

### 4.2 Proposed Design

Phase A: Correctness and contract stabilization.
- Enforce invariant: if `outputPagination` exists, returned data must be the corresponding window.
- Refactor call-hierarchy output-limit path so limited payload is materialized from paged content, not metadata only.
- Add explicit out-of-range handling to call hierarchy (both LSP and fallback) matching references semantics.

Phase B: Reference merge semantics redesign.
- Introduce explicit merge strategy:
  - `global_merge`: merge complete result sets then paginate once.
  - `page_local_merge` (optional compatibility mode): keep existing behavior but explicitly labeled and documented.
- Default to `global_merge` for semantic correctness unless memory constraints force fallback mode with explicit hint.

Phase C: Feature-surface expansion for high-end usage.
- Add new LSP operations + tools:
  - `textDocument/documentSymbol` -> `lspDocumentSymbols`.
  - `workspace/symbol` -> `lspWorkspaceSymbols`.
  - `textDocument/typeDefinition` -> `lspTypeDefinition`.
  - `textDocument/implementation` -> `lspImplementation`.
- Optional TypeScript extension:
  - `workspace/executeCommand` support for `_typescript.goToSourceDefinition` path when server advertises capability.

Phase D: Performance and lifecycle hardening.
- Add per-workspace/per-language LSP client reuse with bounded lifecycle and idle shutdown.
- Preserve current safety properties (path validation, per-request timeout, guaranteed stop/cleanup on failure).

### 4.3 Data and API Contract Changes

No breaking rename is required for existing tools. Contract updates:
- Clarify and enforce query-level output pagination semantics in LSP responses.
- Add deterministic out-of-range behavior to `lspCallHierarchy`.
- Add optional metadata field for references merge mode (if compatibility mode retained).
- Add new tool schemas for advanced semantic discovery/navigation.

### 4.4 Testing Strategy (TDD)

Rule: every behavioral change starts with failing tests.

Required test additions:
1. Call hierarchy output pagination correctness:
- Failing test proving payload content actually changes with `charOffset`.
- Failing test proving `outputPagination` and data window are aligned.

2. Call hierarchy out-of-range handling:
- Failing tests for `page > totalPages` in both LSP and pattern fallback paths.

3. References global merge correctness:
- Failing tests where matches are split across pages in both branches, validating full global merged pagination.
- Failing tests asserting truthful `totalResults` and `hasMore`.

4. New tool surface:
- Schema strictness, bounds, unknown-field rejection.
- Integration tests with mocked server capabilities and fallback behavior.

5. Flow tests:
- Update local impact-analysis and where-defined flows to ensure compatibility.

## 5. Drawbacks

- Increased implementation complexity in merge/pagination internals.
- Additional memory pressure for true global references merge in very large workspaces.
- New LSP tools expand maintenance and test matrix.
- Client pooling introduces lifecycle complexity and requires careful leak prevention.

## 6. Rationale and Alternatives

### Alternative A: Minimal patch only

Scope:
- Fix call hierarchy pagination mismatch only.

Pros:
- Lowest change risk.
- Fastest stabilization for one critical bug.

Cons:
- Leaves references merge semantics ambiguous.
- Leaves out-of-range inconsistency.
- Does not improve high-end LSP utilization.

### Alternative B: Stabilization-first (recommended baseline)

Scope:
- Fix all correctness and pagination consistency issues across existing tools.
- Defer feature expansion.

Pros:
- Strong reliability gain with manageable scope.
- Preserves existing tool surface.

Cons:
- Still under-utilizes LSP discovery/AST-like capabilities.

### Alternative C: Full program (recommended)

Scope:
- Stabilization baseline plus capability expansion and client lifecycle improvements.

Pros:
- Resolves correctness trust issues and unlocks high-end semantic workflows.
- Aligns implementation with modern LSP best-practice usage.

Cons:
- Largest scope and coordination burden.

### Recommendation

Adopt Alternative C, executed as gated phases A -> B -> C -> D. This yields immediate correctness wins without delaying advanced capability adoption.

## 7. Prior Art

- LSP 3.17 defines rich semantic endpoints beyond definition/references/call hierarchy (document symbols, workspace symbols, type definition, implementation, selection range, type hierarchy, execute command).
- TypeScript language server documents execute-command support for source-definition and TS server command bridging.

## 8. Unresolved Questions

1. Should `global_merge` be mandatory for references, or should `page_local_merge` remain as an explicit low-memory fallback?
2. Do we want one generic "semantic search" tool over `workspace/symbol`, or separate explicit tools?
3. Should TS execute-command functionality be public by default or hidden behind explicit opt-in flag?
4. What is the final policy for pooled client eviction and max concurrent servers per workspace?

## 9. Implementation Plan

### Phase A: Correctness hotfixes

1. Add failing tests for call hierarchy pagination window mismatch.
2. Refactor call hierarchy output-limit path to ensure data window materialization matches `outputPagination`.
3. Add out-of-range page behavior tests and implementation for call hierarchy LSP and fallback paths.
4. Run targeted tests, LSP suites, and typecheck.

Exit criteria:
- No metadata-only pagination cases.
- Out-of-range behavior consistent with references tools.

### Phase B: References merge redesign

1. Add failing tests for global merge across page-split datasets.
2. Implement global merge before final pagination.
3. Preserve dedupe and hints, update/clarify messaging.
4. Add regression tests for include/exclude filters and declaration toggles.

Exit criteria:
- Merged `totalResults` and pagination are globally truthful.

### Phase C: Capability expansion

1. Extend LSP operations and client capability wiring for:
   - `documentSymbol`
   - `workspace/symbol`
   - `typeDefinition`
   - `implementation`
2. Add tool schemas + execution + registration + hints for new tools.
3. Add docs updates and flow examples in local tools references.

Exit criteria:
- New tools stable with strict schema contracts and end-to-end tests.

### Phase D: Lifecycle/performance

1. Introduce client cache/pool keyed by workspace + language server config.
2. Add idle eviction and hard safety cleanup.
3. Add tests for reuse, eviction, and no orphan process behavior.

Exit criteria:
- Reduced process churn without leaked clients/processes.

### Cross-Phase Quality Gates

1. `yarn typecheck` passes.
2. LSP-specific suites pass, including new tests.
3. No schema regressions in public exports.
4. Documentation updated with exact behavior and examples.

## 10. References

### Local Code References

- LSP client capabilities and operations core:
  - https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/src/lsp/client.ts
  - https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/src/lsp/lspOperations.ts
- Call hierarchy output limit and pagination path:
  - https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/src/tools/lsp_call_hierarchy/callHierarchy.ts
  - https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/src/utils/response/structuredPagination.ts
  - https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/src/tools/lsp_call_hierarchy/callHierarchyHelpers.ts
  - https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/src/tools/lsp_call_hierarchy/callHierarchyLsp.ts
  - https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/src/tools/lsp_call_hierarchy/callHierarchyPatterns.ts
- References merge and pagination behavior:
  - https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/src/tools/lsp_find_references/lsp_find_references.ts
  - https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/src/tools/lsp_find_references/lspReferencesCore.ts
  - https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/src/tools/lsp_find_references/lspReferencesPatterns.ts
- LSP schema consistency:
  - https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/src/tools/lspSchemaBuilders.ts
  - https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/src/tools/lsp_goto_definition/scheme.ts
  - https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/src/tools/lsp_find_references/scheme.ts
  - https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/src/tools/lsp_call_hierarchy/scheme.ts
  - https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/tests/scheme/lsp_schema_consistency.test.ts

### External References

- LSP 3.17 specification:
  - https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/
- TypeScript language server feature reference:
  - https://github.com/typescript-language-server/typescript-language-server/blob/master/README.md
- TypeScript server protocol (`navtree` command and protocol surface):
  - https://github.com/microsoft/TypeScript/blob/main/src/server/protocol.ts
