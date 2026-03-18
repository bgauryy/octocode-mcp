# Finding Categories

All categories detected by the scan, grouped by pillar. Categories marked `--semantic` require the `--semantic` flag.

---

## Architecture Risk

| Category | Severity | Detects | Requires |
|----------|----------|---------|----------|
| `dependency-cycle` | high | Circular import chains | — |
| `dependency-critical-path` | high — critical | High-weight transitive dependency chains | — |
| `dependency-test-only` | medium | Production modules imported only from tests | — |
| `architecture-sdp-violation` | medium — high | Stable module depends on unstable module (I = Ce/(Ca+Ce)) | — |
| `high-coupling` | medium — high | Excessive Ca + Ce connections | — |
| `god-module-coupling` | medium — high | High fan-in (bottleneck) or fan-out (sprawl) | — |
| `orphan-module` | medium | Zero inbound AND zero outbound dependencies | — |
| `unreachable-module` | high | Not reachable from any entrypoint via BFS | — |
| `layer-violation` | high | Import backwards in configured layer order | — |
| `low-cohesion` | medium — high | Exports serve unrelated purposes (LCOM > 1) | — |
| `inferred-layer-violation` | medium — high | Auto-detected layer boundary crossed | — |
| `distance-from-main-sequence` | medium — high | Module far from A + I = 1 (Zone of Pain / Uselessness) | — |
| `feature-envy` | medium — high | Module imports 60%+ symbols from single external module | — |
| `untested-critical-code` | high — critical | Hot/critical-path file with zero test imports | — |
| `cycle-cluster` | medium — high | Strongly connected file cluster large enough to behave like one tangled subsystem | — |
| `broker-module` | medium — high | Module concentrates graph pressure across fan-in, fan-out, articulation, or critical-path signals | — |
| `bridge-module` | medium — high | Structural articulation point or bridge between subsystems | — |
| `package-boundary-chatter` | medium — high | Excessive cross-package dependency edges between two package groups | — |
| `startup-risk-hub` | medium — high | Import-time side effects on a high fan-in structural hub | — |
| `over-abstraction` | medium | Interface/abstract class with exactly 1 implementor | `--semantic` |
| `concrete-dependency` | medium | Import resolves to concrete class (DIP violation) | `--semantic` |
| `circular-type-dependency` | high | Type A references Type B, B references A (type-level cycle) | `--semantic` |
| `shotgun-surgery` | medium — high | Export referenced from 8+ unique files (change amplification risk) | `--semantic` |
| `leaky-abstraction` | medium | Exported function returns type defined in internal module | `--semantic` |
| `import-side-effect-risk` | low — critical | Module executes risky work at import time (sync I/O, exec, eval, timers, listeners); scored by AST evidence + architecture context (fan-in, critical path, cycle, entry role) | — |

---

## Code Quality

| Category | Severity | Detects | Requires |
|----------|----------|---------|----------|
| `duplicate-function-body` | low — high | Identical function implementations across files | — |
| `duplicate-flow-structure` | medium — high | Repeated control-flow patterns | — |
| `similar-function-body` | medium — high | Near-clone functions (Type-2: renamed vars, different literals) | — |
| `function-optimization` | medium — high | High complexity, deep nesting, oversized functions | — |
| `cognitive-complexity` | medium — high | Nesting-aware complexity score | — |
| `god-module` | high | Files with excessive statements or exports | — |
| `god-function` | high | Functions with excessive statements | — |
| `halstead-effort` | medium — high | Halstead effort > threshold or estimated bugs > 2.0 | — |
| `low-maintainability` | high — critical | Maintainability Index below threshold | — |
| `high-cyclomatic-density` | medium — high | CC/LOC ratio above threshold | — |
| `excessive-parameters` | medium — high | Function exceeds parameter threshold | — |
| `magic-number` | medium — high | Excessive magic number literals | — |
| `unsafe-any` | medium — high | Excessive `any` types | — |
| `empty-catch` | medium | Empty catch block | — |
| `switch-no-default` | low | Switch missing default case | — |
| `type-assertion-escape` | medium — high | `as any`, `as unknown as T`, non-null `!` assertions | — |
| `missing-error-boundary` | low — high | Async function with await(s) but no try-catch or `.catch()` handler; severity tiers: 1 await = low, 2-3 = medium, 4+ = high | — |
| `promise-misuse` | medium | `async` function that never uses `await` | — |
| `await-in-loop` | high | await inside loop body — sequential async (N+1 latency) | — |
| `sync-io` | medium | Synchronous I/O calls (readFileSync, execSync, etc.) | — |
| `uncleared-timer` | medium | setInterval without clearInterval in scope | — |
| `listener-leak-risk` | medium | Event listeners added without corresponding removal | — |
| `unbounded-collection` | low | Collection growth inside nested loops without size guard | — |
| `unused-parameter` | medium | Function parameter never referenced in body (semantic) | `--semantic` |
| `type-hierarchy-depth` | medium — high | Inheritance chain exceeds depth threshold | `--semantic` |
| `deep-override-chain` | medium — high | Method overridden beyond depth threshold in class hierarchy | `--semantic` |
| `interface-compliance` | medium — high | Class `implements I` with missing or any-cast members | `--semantic` |
| `narrowable-type` | low | Parameter declared broad but all callers pass narrow type | `--semantic` |

---

## Dead Code & Hygiene

| Category | Severity | Detects | Requires |
|----------|----------|---------|----------|
| `dead-export` | medium — high | Exported symbol with no usage (import matching) | — |
| `dead-re-export` | medium | Barrel re-export with no consumers | — |
| `re-export-duplication` | medium | Same symbol re-exported from multiple paths | — |
| `re-export-shadowed` | high | Local export and re-export name collision | — |
| `unused-npm-dependency` | low — medium | package.json dep not imported anywhere | — |
| `package-boundary-violation` | medium — high | Cross-package import bypassing public API | — |
| `barrel-explosion` | medium — high | Barrel with excessive re-exports or chain depth | — |
| `unused-import` | low | Imported symbol never semantically used (TypeChecker confirmed) | `--semantic` |
| `orphan-implementation` | medium | Exported class with no external references and no interface | `--semantic` |
| `move-to-caller` | low | Exported symbol consumed by exactly 1 file (candidate for inlining) | `--semantic` |
| `semantic-dead-export` | high | Exported symbol with zero semantic references (TypeChecker confirmed, stricter than `dead-export`) | `--semantic` |

---

## Security

| Category | Severity | Detects | Requires |
|----------|----------|---------|----------|
| `hardcoded-secret` | high | String literals matching secret patterns (password, API key, token) or high-entropy strings | — |
| `eval-usage` | critical | `eval()`, `new Function()`, string-based `setTimeout`/`setInterval` | — |
| `unsafe-html` | high | `innerHTML`, `outerHTML`, `dangerouslySetInnerHTML`, `document.write` | — |
| `sql-injection-risk` | high | Template literal with SQL keywords and interpolated expressions | — |
| `unsafe-regex` | medium | Regex with nested quantifiers (catastrophic backtracking / ReDoS) | — |
| `prototype-pollution-risk` | medium — high | `Object.assign()` without `__proto__` guard, deep merge/extend utilities, computed-property bracket writes (`obj[key] = val`) | — |
| `unvalidated-input-sink` | high | Function receives external input (param name heuristic) and uses a dangerous sink (eval, innerHTML, SQL, exec, fs write) without validation evidence | — |
| `input-passthrough-risk` | low — medium | Function receives external input and passes it to other functions without validation; severity by param confidence (high-confidence params like `req`, `body` = medium; medium-confidence like `input`, `event` = low; low-confidence like `data`, `args` = filtered out). Trace downstream with `lspCallHierarchy` | — |
| `path-traversal-risk` | medium — high | Function receives external input that flows into `fs.readFile`, `path.resolve`, or `path.join` without validation (normalize → prefix check → realpath). High severity when no validation; medium when partial validation detected | — |
| `command-injection-risk` | high — critical | Function receives external input that flows into `exec`/`execSync` (critical) or `spawn` with potential `shell:true` (high). exec with string interpolation enables arbitrary OS command execution | — |

---

## Test Quality

Requires `--include-tests` (or auto-enabled when `--features=test-quality`).

| Category | Severity | Detects | Requires |
|----------|----------|---------|----------|
| `low-assertion-density` | medium | Average < 1 assertion per test block | `--include-tests` |
| `test-no-assertion` | high | `it()`/`test()` block with zero assertions | `--include-tests` |
| `excessive-mocking` | medium | Mock/spy calls exceeding threshold per test file | `--include-tests` |
| `shared-mutable-state` | medium | `let`/`var` at describe scope — mutation across tests | `--include-tests` |
| `missing-test-cleanup` | medium | `beforeAll`/`beforeEach` without corresponding `afterAll`/`afterEach` | `--include-tests` |
| `focused-test` | medium | `.only`, `.skip`, or `.todo` committed in a test file | `--include-tests` |
| `fake-timer-no-restore` | medium | Fake timers enabled without restoring real timers | `--include-tests` |
| `missing-mock-restoration` | medium | Spies/stubs created without restore or restoreAll cleanup | `--include-tests` |
