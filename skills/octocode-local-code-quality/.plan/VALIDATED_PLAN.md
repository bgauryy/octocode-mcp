# Validated Improvement Plan: octocode-local-code-quality

> All claims validated against real codebase (packages/octocode-mcp: 1036 findings, 25 active categories)

## Validation Summary

| Claim | Verdict | Evidence |
|-------|---------|----------|
| `dead-export` ≈ `semantic-dead-export` | **MERGE** | Semantic is strict subset: 19 overlap, 23 AST false-positives cleared, 0 semantic-only |
| `dead-file` ≈ `orphan-module` | **MERGE** | Identical condition (zero inbound + zero outbound). `dead-file` capped at 20 roots, `orphan-module` checks all files. `dead-file` has 0 findings vs `unreachable-module`'s 30 |
| `type-hierarchy-depth` ≈ `deep-override-chain` | **KEEP SEPARATE** | Different dimensions: structural depth (class inheritance) vs behavioral depth (method override). Can fire independently |
| `orphan-module` ≈ `orphan-implementation` | **KEEP SEPARATE** | Different granularity: file-level (zero edges) vs class-level (exported class with no external refs). Complementary |
| `unsafe-any` ≈ proposed `type-assertion-escape` | **KEEP BOTH** | `unsafe-any` counts `any` type annotations (file-level, 0 findings). `type-assertion-escape` catches `as any`/`as unknown as T`/`!` patterns (line-level). Different signals |

## Phase 1: Merges (46 → 44 categories)

### 1A. Merge `dead-file` into `orphan-module`

**Why**: Identical detection logic. `dead-file` iterates `dependencySummary.roots.slice(0, 20)` (capped!), checks zero inbound + zero outbound. `orphan-module` iterates ALL `dependencyState.files`, checks same condition. `dead-file` = weaker subset.

**How**:
- Remove `detectDeadFiles` from `architecture.ts`
- Remove call from `buildIssueCatalog` in `index.ts`
- Remove `'dead-file'` from `PILLAR_CATEGORIES['dead-code']`
- Add `tags: ['previously-dead-file']` to orphan-module findings where file is a root
- Update tests, SKILL.md, README.md

**Risk**: None — orphan-module already catches everything dead-file would catch.

### 1B. Merge `semantic-dead-export` into `dead-export`

**Why**: Same concept, semantic version has fewer false positives (23 fewer on our codebase). When `--semantic` is active, both fire on the same file:symbol pairs, creating noise.

**How**:
- When `--semantic` is ON: use TypeChecker `findReferences` in `detectDeadExports` instead of import-string matching. Add `lspHints` to findings. Emit as `dead-export` (not `semantic-dead-export`).
- When `--semantic` is OFF: use current AST import-string matching (unchanged).
- Remove `detectSemanticDeadExports` from `semantic-detectors.ts`
- Remove `'semantic-dead-export'` from `PILLAR_CATEGORIES['architecture']` and `SEMANTIC_CATEGORIES`
- Add `semanticProfiles` parameter to `detectDeadExports`
- Update tests

**Risk**: Low — semantic mode produces strictly fewer findings (higher precision). Consumers filtering by `category: 'dead-export'` continue to work.

**Result**: 46 - 2 = **44 categories**

---

## Phase 2: New Features for Coding Agents (44 → 51 categories)

Ranked by **agent value × implementation ease**. Each feature validated with working PoC.

### 2A. `type-assertion-escape` (AST-only, NO --semantic needed)

**Pillar**: code-quality
**Signal**: `as any`, `as unknown as T`, non-null assertion `!`
**Agent value**: Tells agent exactly WHERE type safety is bypassed and WHAT pattern to fix. Auto-fixable in many cases.
**PoC result**: Detected all 3 patterns in test file with exact line numbers.

**Detection logic** (pure AST):
```
ts.isAsExpression(node) && node.type === 'any'     → as-any
ts.isAsExpression(node.expression) && inner === 'unknown' → double-assertion
ts.isNonNullExpression(node)                        → non-null-assertion
```

**Effort**: Small — add to `ts-analyzer.ts` or `architecture.ts` AST walk, collect per-file, emit findings.

### 2B. `shotgun-surgery` (Semantic, needs --semantic)

**Pillar**: architecture
**Signal**: Exported symbol referenced from ≥N unique files (default: 8). Changing it forces edits across many modules.
**Agent value**: Critical for safe refactoring — agent knows "touching this symbol requires updating N files".
**PoC result**: `spawnWithTimeout` → 5 files, `buildChildProcessEnv` → 5 files (real codebase).

**Detection logic**:
- Already have `referenceCountByExport` in `SemanticProfile`
- Need to extend to store **unique file count** (not just total ref count)
- Add `ExportRefInfo.uniqueFiles: number`
- Threshold: default 8 (configurable via `--shotgun-threshold N`)

**Effort**: Small — extend `ExportRefInfo`, modify `analyzeSemanticProfile` to track unique files, add detector.

### 2C. `promise-misuse` (AST-only for async-without-await, Semantic for unhandled)

**Pillar**: code-quality
**Signal**: Two sub-patterns:
1. `async` function with no `await` in body → remove `async` or add missing `await`
2. Unhandled promise (call to async function without `await`/`.catch()`) → needs TypeChecker for return type

**Agent value**: Common bug class. Agent can auto-fix: remove unnecessary `async`, or add missing `await`.
**PoC result**: Correctly detected `async-without-await` on test file.

**Detection logic**:
- Sub-pattern 1 (AST): Walk function nodes with `AsyncKeyword`, check body for `AwaitExpression`.
- Sub-pattern 2 (Semantic): Walk `ExpressionStatement > CallExpression`, use TypeChecker to check if return type is `Promise<T>`, check if not `await`ed or `.then()`/`.catch()`ed.

**Effort**: Medium — AST part is small, semantic part needs TypeChecker return type resolution.

### 2D. `move-to-caller` (Semantic, needs --semantic)

**Pillar**: architecture
**Signal**: Exported function/class used by exactly 1 file externally. The export exists only to serve one consumer → inline it.
**Agent value**: Direct refactoring instruction — "move this code into its only consumer".

**Detection logic**:
- Already have `referenceCountByExport` with file tracking
- Filter: exports where unique referencing files == 1 (excluding test files)
- Exclude: entrypoints, re-exports, default exports

**Effort**: Trivial — data already exists, just add detector function.

### 2E. `leaky-abstraction` (Semantic, needs --semantic)

**Pillar**: architecture
**Signal**: Exported function returns or accepts a type that is defined in an internal (non-exported or internal-module) file.
**Agent value**: Tells agent "this public API leaks an implementation detail". Agent can inline the type or promote it to the public API.
**PoC result**: `getConfig() returns InternalConfig from internal.ts [LEAKY]` correctly detected.

**Detection logic**:
- For each exported function, get signature via `checker.getSignatureFromDeclaration`
- Get return type and param types
- Check if the type's declaration is in a different file AND that file is not a shared/types module
- Flag when public function exposes types from internal modules

**Effort**: Medium — needs TypeChecker type provenance resolution per exported function.

### 2F. `narrowable-type` (Semantic, needs --semantic)

**Pillar**: code-quality
**Signal**: Function parameter typed broadly (`string | number`, `any`, `unknown`) but ALL call sites pass a narrower type (e.g., always `string`).
**Agent value**: Agent can safely narrow the parameter type. Enables more precise TypeScript checking downstream.
**PoC result**: `process(data: string | number | boolean)` → all callers pass `"hello"`, `"world"` (string literals). Narrowable to `string`.

**Detection logic**:
- For each exported function with union/any/unknown params
- Use `findReferences` to find all call sites
- At each call site, use `checker.getTypeAtLocation(callExpr.arguments[i])`
- If all arg types are assignable to a narrower type → flag

**Effort**: High — need call-site argument type collection, union narrowing logic.

### 2G. `missing-error-boundary` (AST-only, NO --semantic needed)

**Pillar**: code-quality
**Signal**: Async function with `await` expressions but no enclosing `try`-`catch`.
**Agent value**: Tells agent "this async code has no error handling". Agent can wrap in try-catch.
**PoC result**: `riskyChain: 2 awaits, NO try-catch [UNPROTECTED]` correctly detected.

**Detection logic** (pure AST):
- Walk async function bodies
- Count `AwaitExpression` nodes (skip nested functions)
- Check for `TryStatement` in the same scope
- Flag if await count > 0 and no try-catch

**Effort**: Small — pure AST walk, similar pattern to empty-catch detection.

---

## Phase 3: De-duplication Guards

### 3A. `orphan-implementation` → exclude files flagged as `orphan-module`

When both fire on the same file, it's noise. If the whole file is orphaned, the class-level finding adds nothing.

### 3B. `dead-export` (with semantic) → suppress AST `dead-export` for same symbol

When `--semantic` is on and both engines run, emit only the semantic-precision finding for each symbol. Already handled by merge in 1B.

---

## Impact Summary

| Phase | Categories | Net Change |
|-------|-----------|------------|
| Current | 46 | — |
| Phase 1 (merges) | 44 | -2 |
| Phase 2 (new features) | 51 | +7 |
| **Final** | **51** | **+5 net** |

### New categories by pillar:

| Pillar | New | Categories |
|--------|-----|-----------|
| architecture | 3 | `shotgun-surgery`, `move-to-caller`, `leaky-abstraction` |
| code-quality | 4 | `type-assertion-escape`, `promise-misuse`, `narrowable-type`, `missing-error-boundary` |

### Agent refactoring capability matrix:

| Category | Agent can auto-fix? | Requires --semantic? | LSP validation? |
|----------|-------------------|--------------------|-----------------|
| `type-assertion-escape` | Yes (suggest `unknown` + guard) | No | No |
| `shotgun-surgery` | No (awareness only) | Yes | `lspFindReferences` |
| `promise-misuse` | Yes (add/remove `async`/`await`) | Partial | No |
| `move-to-caller` | Yes (inline function) | Yes | `lspFindReferences` |
| `leaky-abstraction` | Yes (promote type to public) | Yes | `lspGotoDefinition` |
| `narrowable-type` | Yes (narrow param type) | Yes | `lspCallHierarchy` |
| `missing-error-boundary` | Yes (wrap in try-catch) | No | No |

---

## Implementation Order

```
Phase 1A: Merge dead-file → orphan-module         [30 min]
Phase 1B: Merge semantic-dead-export → dead-export [1 hr]
Phase 2A: type-assertion-escape (AST)              [45 min]
Phase 2G: missing-error-boundary (AST)             [45 min]
Phase 2C: promise-misuse (AST + Semantic)          [1 hr]
Phase 2B: shotgun-surgery (Semantic)               [1 hr]
Phase 2D: move-to-caller (Semantic)                [30 min]
Phase 2E: leaky-abstraction (Semantic)             [1.5 hr]
Phase 2F: narrowable-type (Semantic)               [2 hr]
Phase 3:  De-dup guards                            [30 min]
                                     Total: ~9.5 hrs
```

## Dropped from Original Proposal (with reasons)

| Feature | Why Dropped |
|---------|-------------|
| `dead-branch` | Only literal `true`/`false` detectable via AST. Const-fold needs TypeChecker. Constraint solving too complex. Low real-world hit rate. |
| `extract-function` | Requires variable scope analysis (live-in/live-out per block). High false-positive risk. Revisit when flow graph available. |
| `divergent-change` | Needs git blame/history integration. Out of scope for static analysis. |
