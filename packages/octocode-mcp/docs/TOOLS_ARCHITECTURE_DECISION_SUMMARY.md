# Tools Architecture Decision Summary

## Context

The tools runtime in `packages/octocode-mcp/src/tools` had concentrated coupling and mixed responsibilities that capped architecture and maintainability scores.

Reference RFC:
- https://github.com/bgauryy/octocode-mcp/blob/main/docs/RFC_TOOLS_ARCHITECTURE_MAINTAINABILITY_UPLIFT.md

## Decisions

1. Keep `registerTools` stable and extract runtime seams
- Runtime filtering moved to `toolFilters.ts`
- Metadata policy moved to `metadataPolicy.ts`
- Registration execution/aggregation moved to `registrationExecutor.ts`

2. Introduce a metadata gateway boundary
- Added `ToolMetadataGateway` (`toolMetadata/gateway.ts`)
- `toolConfig.ts` now builds a catalog through `createToolCatalog(gateway)`
- Default compatibility exports remain intact

3. Reduce metadata proxy hub pressure with focused read surfaces
- Added focused modules:
  - `toolMetadata/names.ts`
  - `toolMetadata/descriptions.ts`
  - `toolMetadata/hints.ts`
  - `toolMetadata/baseSchema.ts`
  - `toolMetadata/genericErrorHints.ts`
  - `toolMetadata/metadataPresence.ts`
- `toolMetadata/proxies.ts` is now a compatibility barrel

4. Standardize execution error boundaries
- Added `executeWithToolBoundary` (`executionGuard.ts`)
- Applied to:
  - `local_fetch_content/execution.ts`
  - `local_ripgrep/execution.ts`
  - `lsp_call_hierarchy/execution.ts`
  - `github_clone_repo/execution.ts`

5. Decompose high-complexity local content flow
- Refactored `local_fetch_content/fetchContent.ts` into focused helper stages:
  - extraction option validation
  - file stats/read error mapping
  - match/range/full extraction state builders
  - unified success response assembly

## Quality Gates

- CI now captures architecture snapshot and enforces non-regression gates:
  - https://github.com/bgauryy/octocode-mcp/blob/main/.github/workflows/ci.yml
- Gate scripts:
  - https://github.com/bgauryy/octocode-mcp/blob/main/scripts/architecture-snapshot.mjs
  - https://github.com/bgauryy/octocode-mcp/blob/main/scripts/score-gate.mjs

## Backward Compatibility

- Tool protocol behavior and registration API remain unchanged.
- Existing metadata proxy imports continue to work via compatibility barrel exports.

## Follow-up

- Continue hotspot decomposition in `lsp_find_references/lspReferencesPatterns.ts` and `github_clone_repo/cloneRepo.ts` for further score improvements.
- Gradually migrate imports from `toolMetadata/proxies.ts` to focused metadata modules.
