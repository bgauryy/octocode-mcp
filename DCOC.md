# DCOC — Remaining Code Quality Improvement Plan

## 1. MCP Dead Re-exports (150)

- Trim `src/serverConfig.ts` barrel — 11 re-exports, audit each consumer
- Trim `src/public.ts` + `src/public/*` — 6 re-exports, confirm public API surface before removing
- Clean `src/tools/local_ripgrep/searchContentRipgrep.ts` — 7 dead re-exports
- Clean `src/providers/bitbucket/BitbucketProvider.ts` — 6 dead re-exports
- Clean remaining tool index barrels (`lsp_call_hierarchy`, `lsp_goto_definition`, `github_fetch_content`)
- Clean `src/github/fileContent.ts`, `fileOperations.ts`, `pullRequestSearch.ts` — 1 each
- Clean `src/hints/dynamic.ts`, `src/providers/types.ts` — 1 each

## 2. CLI Await-in-Loop (103)

- `scripts/validate-mcp-registry.ts` — batch registry validations with `Promise.all`
- `scripts/validate-skills-marketplace.ts` — batch skill validations with `Promise.all`
- `src/utils/skills-fetch.ts` — parallelize skill downloads per source
- `src/ui/skills-menu/marketplace.ts` — batch marketplace fetches
- `src/ui/install/prompts.ts` — parallelize IDE config reads
- `src/features/sync.ts` — parallelize multi-IDE sync operations
- Audit remaining: many are inherently serial (user prompts, sequential writes) — mark as accepted

## 3. MCP Cognitive Complexity (91)

- `src/utils/response/structuredPagination.ts` (234) — extract pagination strategies into separate functions
- `src/utils/exec/spawn.ts` (168) — split process lifecycle phases into helpers
- `src/github/queryBuilders.ts` (159) — extract per-query-type builders
- `src/security/withSecurityValidation.ts` (112) — extract validation steps into composable validators
- `src/tools/local_find_files/findFiles.ts` (93) — extract filter/sort/enrich phases
- `src/tools/lsp_goto_definition/execution.ts` (91) — extract location resolution and snippet building
- `src/github/directoryFetch.ts` — extract clone-vs-API decision tree
- `src/github/fileContentRaw.ts` — extract fallback chain into strategy pattern
- `src/lsp/resolver.ts` — extract symbol matching heuristics
- `src/github/prContentFetcher.ts` — extract diff processing

## 4. MCP SDP Violations (57)

- `src/errorCodes.ts` → `src/errors/index.ts` (delta 0.80) — inline the barrel or invert dependency
- `src/security/contentSanitizer.ts` → `src/security/regexes/index.ts` (delta 0.69) — inject patterns via parameter
- `src/security/mask.ts` → `src/security/regexes/index.ts` (delta 0.57) — same pattern injection
- `src/hints/index.ts` → `src/hints/dynamic.ts` (delta 0.73) — merge into single module
- `src/github/fileOperations.ts` → `src/github/repoStructure.ts` (delta 0.62) — extract shared interface
- `src/github/pullRequestSearch.ts` → `src/github/prByNumber.ts` (delta 0.43) — extract shared PR types
- `src/lsp/index.ts` → `src/lsp/client.ts` / `src/lsp/manager.ts` — flatten barrel
- `src/providers/types.ts` → `src/providers/providerResults.ts` — merge result types into types.ts
- Remaining 49 — audit: many are low-delta leaf modules, deprioritize

## 5. Security (159 findings)

- Prototype pollution (72) — add `Object.freeze` / safe-merge for user-controlled objects in tool execution paths
- Input passthrough (87) — add Zod runtime validation at tool execution entry points
- Path traversal (5) — audit `pathValidator.ts` edge cases
- Unvalidated input sinks (7) — trace each sink, add sanitization
- Hardcoded secrets (29) — audit: likely test fixtures / regex patterns, confirm non-real

## 6. Untested Critical Code (31 modules)

### MCP (15 modules)
- `src/tools/local_find_files/findFiles.ts`
- `src/tools/lsp_goto_definition/execution.ts`
- `src/tools/lsp_call_hierarchy/callHierarchyPatterns.ts`
- `src/github/fileContentRaw.ts`
- `src/github/prContentFetcher.ts`
- `src/index.ts`
- Remaining 9 high-complexity untested modules

### CLI (16 modules)
- `src/ui/config/index.ts`
- `src/cli/commands.ts`
- `src/ui/menu.ts`
- `src/ui/skills-menu/marketplace.ts`
- `src/ui/skills-menu/index.ts`
- `src/ui/install/prompts.ts`
- `src/ui/external-mcp/prompts.ts`
- `src/ui/external-mcp/flow.ts`
- `src/ui/sync/display.ts`
- `src/ui/config/inspect-flow.ts`
- `src/features/github-oauth.ts`
- `scripts/validate-skills-marketplace.ts`
- `scripts/validate-mcp-registry.ts`
- Remaining 3 high-risk modules
