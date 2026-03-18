# Finding Categories (51)

All categories detected by the scan. Categories marked `--semantic` require the `--semantic` flag.

---

## Architecture Risk (19)

| # | Category | Severity | Detects | Requires |
|---|----------|----------|---------|----------|
| 1 | `dependency-cycle` | high | Circular import chains | — |
| 2 | `dependency-critical-path` | high — critical | High-weight transitive dependency chains | — |
| 3 | `dependency-test-only` | medium | Production modules imported only from tests | — |
| 4 | `architecture-sdp-violation` | medium — high | Stable module depends on unstable module (I = Ce/(Ca+Ce)) | — |
| 5 | `high-coupling` | medium — high | Excessive Ca + Ce connections | — |
| 6 | `god-module-coupling` | medium — high | High fan-in (bottleneck) or fan-out (sprawl) | — |
| 7 | `orphan-module` | medium | Zero inbound AND zero outbound dependencies | — |
| 8 | `unreachable-module` | high | Not reachable from any entrypoint via BFS | — |
| 9 | `layer-violation` | high | Import backwards in configured layer order | — |
| 10 | `low-cohesion` | medium — high | Exports serve unrelated purposes (LCOM > 1) | — |
| 11 | `inferred-layer-violation` | medium — high | Auto-detected layer boundary crossed | — |
| 12 | `distance-from-main-sequence` | medium — high | Module far from A + I = 1 (Zone of Pain / Uselessness) | — |
| 13 | `feature-envy` | medium — high | Module imports 60%+ symbols from single external module | — |
| 14 | `untested-critical-code` | high — critical | Hot/critical-path file with zero test imports | — |
| 15 | `over-abstraction` | medium | Interface/abstract class with exactly 1 implementor | `--semantic` |
| 16 | `concrete-dependency` | medium | Import resolves to concrete class (DIP violation) | `--semantic` |
| 17 | `circular-type-dependency` | high | Type A references Type B, B references A (type-level cycle) | `--semantic` |
| 18 | `shotgun-surgery` | medium — high | Export referenced from 8+ unique files (change amplification risk) | `--semantic` |
| 19 | `leaky-abstraction` | medium | Exported function returns type defined in internal module | `--semantic` |

---

## Code Quality (22)

| # | Category | Severity | Detects | Requires |
|---|----------|----------|---------|----------|
| 20 | `duplicate-function-body` | low — high | Identical function implementations across files | — |
| 21 | `duplicate-flow-structure` | medium — high | Repeated control-flow patterns | — |
| 22 | `function-optimization` | medium — high | High complexity, deep nesting, oversized functions | — |
| 23 | `cognitive-complexity` | medium — high | Nesting-aware complexity score | — |
| 24 | `god-module` | high | Files >500 statements or >20 exports | — |
| 25 | `god-function` | high | Functions >100 statements | — |
| 26 | `halstead-effort` | medium — high | Halstead effort > 500K or estimated bugs > 2.0 | — |
| 27 | `low-maintainability` | high — critical | Maintainability Index < 20 | — |
| 28 | `high-cyclomatic-density` | medium — high | CC/LOC > 0.5 | — |
| 29 | `excessive-parameters` | medium — high | Function >5 parameters | — |
| 30 | `magic-number` | medium — high | >3 magic number literals | — |
| 31 | `unsafe-any` | medium — high | >5 `any` types | — |
| 32 | `empty-catch` | medium | Empty catch block | — |
| 33 | `switch-no-default` | low | Switch missing default case | — |
| 34 | `type-assertion-escape` | medium — high | `as any`, `as unknown as T`, non-null `!` assertions | — |
| 35 | `missing-error-boundary` | medium — high | Async function with await(s) but no try-catch | — |
| 36 | `promise-misuse` | medium | `async` function that never uses `await` | — |
| 37 | `unused-parameter` | medium | Function parameter never referenced in body (semantic) | `--semantic` |
| 38 | `type-hierarchy-depth` | medium — high | Inheritance chain > 4 levels deep | `--semantic` |
| 39 | `deep-override-chain` | medium — high | Method overridden > 3 levels deep in class hierarchy | `--semantic` |
| 40 | `interface-compliance` | medium — high | Class `implements I` with missing or any-cast members | `--semantic` |
| 41 | `narrowable-type` | low | Parameter declared broad but all callers pass narrow type | `--semantic` |

---

## Dead Code & Hygiene (10)

| # | Category | Severity | Detects | Requires |
|---|----------|----------|---------|----------|
| 42 | `dead-export` | medium — high | Exported symbol with no usage (import matching) | — |
| 43 | `dead-re-export` | medium | Barrel re-export with no consumers | — |
| 44 | `re-export-duplication` | medium | Same symbol re-exported from multiple paths | — |
| 45 | `re-export-shadowed` | high | Local export and re-export name collision | — |
| 46 | `unused-npm-dependency` | low — medium | package.json dep not imported anywhere | — |
| 47 | `package-boundary-violation` | medium — high | Cross-package import bypassing public API | — |
| 48 | `barrel-explosion` | medium — high | Barrel >30 re-exports or >2 chain levels | — |
| 49 | `unused-import` | low | Imported symbol never semantically used (TypeChecker confirmed) | `--semantic` |
| 50 | `orphan-implementation` | medium | Exported class with no external references and no interface | `--semantic` |
| 51 | `move-to-caller` | low | Exported symbol consumed by exactly 1 file (candidate for inlining) | `--semantic` |
