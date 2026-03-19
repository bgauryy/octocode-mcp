# Playbooks — Validate & Fix by Category

Per-category guidance: which tools can help, what to check, and how to fix.

All Octocode local tools are available — use whichever fits the finding:

| Tool | What it gives you |
|------|------------------|
| `localSearchCode` | Find patterns, get file + lineHint |
| `localViewStructure` | Directory layout, project organization |
| `localFindFiles` | Locate files by name, size, modification time |
| `localGetFileContent` | Read file content at specific lines or with match strings |
| `lspGotoDefinition` | Jump to symbol definition |
| `lspFindReferences` | All usages of a symbol |
| `lspCallHierarchy` | Incoming/outgoing call chains (functions only) |

CLI scripts (`ast/search.js`, `ast/tree-search.js`, `scripts/index.js --scope`) complement these for broad structural search and re-scanning.

Use `--graph-advanced` for SCC clusters, chokepoints, bridge modules, and package chatter. Use `--flow` for `cfgFlags`, `flowTrace`, and richer evidence.

---

The playbook tables below show CLI and Octocode approaches per category. **These are suggestions, not rigid sequences** — pick the tools that answer the question fastest.
| Confirm dead code | `ast-search -p 'import.*symbolName'` | `lspFindReferences` → 0 refs = confirmed dead |

---

## Architecture Playbooks

| Finding | CLI Validate | Octocode MCP Validate | Fix |
|---------|-------------|----------------------|-----|
| `dependency-cycle` | `--features=dependency-cycle` → read `architecture.json` cycle paths | `localSearchCode(import.*from)` on cycle files → `lspGotoDefinition` on import | Break with shared contracts or dependency inversion |
| `dependency-critical-path` | `--graph` → inspect Mermaid for long chains | `localSearchCode(export)` on hub → `lspCallHierarchy(incoming)` | Split hub, enforce boundaries |
| `architecture-sdp-violation` | Read finding `reason` for I values | `lspCallHierarchy(incoming)` on stable; `(outgoing)` on unstable | Invert via interface or move to stable utility |
| `high-coupling` | `--json \| jq` filter for `high-coupling` → check Ca/Ce | `lspFindReferences` on key exports → count consumers | Extract focused sub-modules by consumer group |
| `god-module-coupling` | Check `hotFiles[]` in `architecture.json` for fan-in/fan-out | Fan-in: `lspFindReferences`; Fan-out: `lspCallHierarchy(outgoing)` | Split by responsibility, introduce facade |
| `orphan-module` | `ast-search -p 'import $$$N from "modulePath"'` — 0 hits = orphan | `localSearchCode(fileName, filesOnly=true)` — check runtime config | Delete if disconnected |
| `unreachable-module` | Same as orphan + check dynamic imports with `ast-search -p 'import($$$A)'` | `localSearchCode(moduleName)` — check dynamic imports | Delete subgraph if confirmed |
| `layer-violation` | `--features=layer-violation --layer-order ui,service,repo` | `lspGotoDefinition` on violating import | Extract shared contracts to lower layer |
| `low-cohesion` | Read finding `reason` for LCOM count + groups | `lspFindReferences` per export → map consumer clusters | Split into N focused modules |
| `distance-from-main-sequence` | Read finding `reason` for A/I/D values + zone | Check `reason` for A/I/D values + zone | Add interfaces (Zone of Pain) or implementations (Zone of Uselessness) |
| `feature-envy` | Check finding → compare import ratio | `lspCallHierarchy(outgoing)` on envious module → see which functions use target | Move logic to target module or extract shared module |
| `cycle-cluster` | `--graph-advanced` → inspect `sccClusters[]` in `architecture.json` | `localSearchCode(import)` on hub files → `lspGotoDefinition` on cluster edges | Break SCC at a hub file or shared contract |
| `broker-module` | `--graph-advanced` → inspect `chokepoints[]` and `criticalHubCandidates[]` | `lspFindReferences` for fan-in + `lspCallHierarchy(outgoing)` for fan-out | Split orchestration seams and narrow consumers |
| `bridge-module` | `--graph-advanced` → inspect articulation-heavy `chokepoints[]` | `localSearchCode(fileName)` → trace the bridge edges with LSP | Remove the single structural bridge by adding lower-level contracts |
| `package-boundary-chatter` | `--graph-advanced` → inspect `packageGraphSummary.hotspots[]` | `localSearchCode("from \\\"pkg\\\"")` on both sides → confirm symbol traffic | Reduce package API surface and stop internal-detail imports |
| `startup-risk-hub` | `--graph-advanced` + `--features=startup-risk-hub` → inspect `topLevelEffects` + `chokepoints[]` | `lspFindReferences` on the module + `lspCallHierarchy` on effectful calls | Move import-time work behind explicit init or lazy paths |
| `untested-critical-code` | `ast-search -p 'import $$$N from "modulePath"' --include-tests` — 0 test imports | `localFindFiles(name=*.test.*)` for sibling test → `lspCallHierarchy(incoming)` | Create test file covering public API + complex functions |
| `import-side-effect-risk` | `--features=import-side-effect-risk` → check `topLevelEffects` in `file-inventory.json` | `lspFindReferences` on file → confirm fan-in; `lspCallHierarchy` on side-effect call → trace callers | Move side effects into explicit init(), wrap in lazy pattern, or guard with feature flags |
| `namespace-import` | `ast-search -p 'import * as $NAME from $MOD'` | `localSearchCode("import * as")` → check which members are used | Convert to named imports for tree-shaking |
| `commonjs-in-esm` | `ast-search -p 'require($$$A)'` | `localSearchCode("require(")` → check if ESM alternative exists | Convert to `import` syntax |
| `export-star-leak` | `ast-search -p 'export * from $MOD'` | `localSearchCode("export * from")` → `lspFindReferences` on re-exported symbols | Replace with explicit named re-exports |
| `mixed-module-format` | Check finding for mixed CJS/ESM evidence | `localGetFileContent` → confirm mixed `require()` and `import` | Standardize on ESM |

---

## Code Quality Playbooks

| Finding | CLI Validate | Octocode MCP Validate | Fix |
|---------|-------------|----------------------|-----|
| `duplicate-function-body` | `ast-search -p 'function $NAME($$$P) { $$$B }'` → compare matches | `localSearchCode` → `lspFindReferences` + `lspCallHierarchy(incoming)` | Extract shared helper |
| `duplicate-flow-structure` | Read finding `reason` + line ranges → compare code | `localGetFileContent(startLine, endLine)` | Extract reusable flow helper |
| `similar-function-body` | Read both file:line locations from finding | `localGetFileContent` on both locations → compare side-by-side | Parameterize differences into shared helper |
| `function-optimization` | `--scope=file.ts:functionName` → check complexity breakdown | `lspCallHierarchy(incoming)` + `(outgoing)` | Split along responsibilities |
| `cognitive-complexity` | `--scope=file.ts:functionName --features=cognitive-complexity` | `localGetFileContent(startLine, endLine)` + `lspCallHierarchy` | Early returns, extract nested blocks |
| `god-module` | `--scope=file.ts` → check statement + export count | `localGetFileContent` → identify groups; `lspFindReferences` on exports → find consumer clusters | Extract each into dedicated module |
| `god-function` | `--scope=file.ts:functionName` → check statement count | `localGetFileContent(startLine, endLine)` + `lspCallHierarchy` → map callees | Extract steps into named helpers |
| `halstead-effort` | Read finding `reason` for effort/bugs/volume breakdown | `localGetFileContent` + `lspCallHierarchy(outgoing)` | Split into smaller functions |
| `low-maintainability` | Read finding `reason` for MI components | Check `reason` for MI components | Reduce LOC, simplify expressions |
| `excessive-parameters` | `ast-search -p 'function $NAME($A, $B, $C, $D, $E, $F)'` | `lspCallHierarchy(incoming)` → check caller diversity | Group into options object |
| `unsafe-any` | `ast-search --preset any-type --root <package>` | `localSearchCode(": any\|as any")` | `unknown` + type guards, generics |
| `empty-catch` | `ast-search --preset empty-catch --root <package>` | `localGetFileContent(startLine, endLine)` | Add logging or re-throw |
| `switch-no-default` | `ast-search --preset switch-no-default` | `localGetFileContent(startLine, endLine)` | Add `default` with unreachable error |
| `type-assertion-escape` | `ast-search --preset type-assertion` + `ast-search --preset non-null-assertion` | `localSearchCode("as any")` → review each occurrence | Replace with `unknown` + type guards, proper generics |
| `missing-error-boundary` | `--features=missing-error-boundary` → check await counts (1=low, 2-3=med, 4+=high) | `localGetFileContent(startLine, endLine)` → check await calls; `lspCallHierarchy(incoming)` → check if callers wrap in try-catch | Wrap in try-catch, add `.catch()`, or document caller handling |
| `promise-misuse` | `--features=promise-misuse` → list async-without-await | `localGetFileContent(startLine, endLine)` → check if await forgotten | Remove `async` keyword or add the missing `await` |

---

## Performance Playbooks

| Finding | CLI Validate | Octocode MCP Validate | Fix |
|---------|-------------|----------------------|-----|
| `await-in-loop` | `ast-search -p 'await $EXPR' --root <dir>` + check if inside loop | `localGetFileContent(startLine, endLine)` → confirm loop+await pattern; `lspGotoDefinition` on awaited call | Collect promises, use `Promise.all()` or batch utility |
| `sync-io` | `ast-search -p 'readFileSync($$$A)'` (or `writeFileSync`, etc.) | `localSearchCode("readFileSync\|writeFileSync")` → `lspCallHierarchy(incoming)` → check if in hot path | Replace with `fs.promises.*` async equivalents |
| `uncleared-timer` | `ast-search -p 'setInterval($$$A)'` + search for `clearInterval` in same file | `localSearchCode("setInterval")` → check for `clearInterval` in same scope/cleanup | Store timer ID, call `clearInterval` in cleanup |
| `listener-leak-risk` | `ast-search -p '.addEventListener($$$A)'` + `ast-search -p '.removeEventListener($$$A)'` — compare counts | `localSearchCode("addEventListener\|.on(")` → check for matching removal | Add `removeEventListener`/`.off()` in cleanup, or use `AbortController` |
| `unbounded-collection` | `--scope=file.ts:functionName` → check loop depth and call count | `localGetFileContent(startLine, endLine)` → check nested loop + collection.push | Add size limits, use pagination or streaming |

---

## Dead Code & Hygiene Playbooks

| Finding | CLI Validate | Octocode MCP Validate | Fix |
|---------|-------------|----------------------|-----|
| `dead-export` | `ast-search -p 'import { symbolName } from $MOD'` — 0 hits | `localSearchCode(export symbolName)` → `lspFindReferences(includeDeclaration=false)` — 0 refs | Remove export or delete symbol |
| `dead-re-export` | `ast-search -p 'import { symbolName } from "barrelPath"'` — 0 hits | `localSearchCode(export.*from)` on barrel → `lspFindReferences` | Remove stale re-export |
| `re-export-duplication` / `re-export-shadowed` | Read barrel file → check duplicate export names | `localSearchCode(export {)` in barrel | Keep one source-of-truth per name |
| `unused-npm-dependency` | `ast-search -p 'import $$$N from "packageName"'` — 0 hits; also check `require("packageName")` | `localSearchCode(packageName)` — check build scripts | Remove the dependency via the project's package manager, verify build |
| `package-boundary-violation` | Read finding → check if import goes through public API (index file) | `lspGotoDefinition` on cross-package import | Re-export from target index |
| `barrel-explosion` | Count re-exports in barrel file; `--features=barrel-explosion` | `localGetFileContent(barrel file)` | Group into sub-barrels |

---

## Security Playbooks

| Finding | CLI Validate | Octocode MCP Validate | Fix |
|---------|-------------|----------------------|-----|
| `hardcoded-secret` | `ast-search --rule '{"rule":{"kind":"string","regex":"password\|secret\|token"}}'` → check if test/mock data | `localSearchCode("password\|api_key\|token")` → `lspFindReferences` on variable → scope remediation | Move to environment variable or secrets manager |
| `eval-usage` | `ast-search -p 'eval($$$A)'` + `ast-search -p 'new Function($$$A)'` | `localGetFileContent(startLine, endLine)` → `lspCallHierarchy(incoming)` → trace how user input reaches eval | Replace with `JSON.parse`, lookup table, or function reference |
| `unsafe-html` | `ast-search -p '$OBJ.innerHTML = $VAL'` + `ast-search -p 'dangerouslySetInnerHTML'` | `localSearchCode("innerHTML\|dangerouslySetInnerHTML")` → check if input is sanitized | Use `textContent`, DOMPurify, or JSX instead |
| `sql-injection-risk` | Read finding → check template literal for user-controlled interpolation | `localGetFileContent(startLine, endLine)` → check if interpolated values are user input | Use parameterized queries or query builder |
| `unsafe-regex` | Read finding regex pattern → check for nested quantifiers | `localGetFileContent(startLine, endLine)` → `lspFindReferences` → check if user input reaches regex | Simplify nested quantifiers, use `safe-regex` linter |
| `prototype-pollution-risk` | `ast-search -p 'Object.assign($$$A)'` + `ast-search -p '$OBJ[$KEY] = $VAL'` | `localGetFileContent(startLine, endLine)` → `lspCallHierarchy(incoming)` → trace if user data reaches merge/assign site | Validate keys (reject `__proto__`, `constructor`), use `Object.create(null)`, use `structuredClone()` |
| `unvalidated-input-sink` | `--features=unvalidated-input-sink` → read finding for param names + sink kinds | `lspCallHierarchy(outgoing)` on function → trace where input params flow; `lspFindReferences` on param → check all usages | Add schema validation (zod, joi) before sink; use parameterized queries for SQL/exec |
| `input-passthrough-risk` | `--features=input-passthrough-risk` → read finding for param confidence + callees | `lspCallHierarchy(outgoing)` → verify downstream callees validate input; `lspFindReferences` on param → check all usage points | Add validation at entry point; search for middleware/guard patterns upstream |
| `path-traversal-risk` | `--features=path-traversal-risk` → read finding for source params + sink kinds | `lspCallHierarchy(incoming)` on fs.readFile/path.resolve call → trace if path param comes from user input → check for `path.resolve` + `startsWith` + `realpathSync` guards | Add multi-layer validation: normalize → prefix check → realpath → re-validate |
| `command-injection-risk` | `--features=command-injection-risk` → read finding for exec vs spawn distinction | `lspCallHierarchy(incoming)` on exec/spawn call → check if args come from user input → verify spawn uses array args (safe) vs exec with string interpolation (dangerous) | Replace exec with spawn + array args; use command allowlist; never interpolate user input into command strings |

### Security Validation with Octocode

For every security finding, validate before acting:

| Step | Action | Tool |
|------|--------|------|
| 1. Locate | Find the flagged code | `localSearchCode(pattern)` → get lineHint |
| 2. Trace origin | Check if user input reaches the sink | `lspCallHierarchy(incoming)` on the sink function |
| 3. Check sanitizers | Look for validation between source and sink | `localSearchCode("validate\|sanitize\|guard")` in the call chain |
| 4. Dismiss or confirm | False positive criteria below | Compare with dismissal rules |

**False positive dismissal criteria:**
- `prototype-pollution-risk`: key comes from `Object.keys()` on internal object, or target is `Object.create(null)` / `Map` / `Set` → dismiss
- `hardcoded-secret`: value is inside a regex definition, is a UUID, placeholder (`YOUR_*`, `<key>`), or used only in tests → dismiss. Note: error messages and prose strings are now auto-filtered by the scanner, so common false positives like `"Invalid token format"` no longer appear.
- `path-traversal-risk`: path goes through normalize + prefix check + realpath resolution → dismiss (or downgrade to info)
- `command-injection-risk`: spawn uses array args without `shell: true` → downgrade to info

### Agentic Security Awareness

When scanning **agentic/MCP tool code**, apply additional scrutiny:

1. **Prompt → path flow**: trace from user prompt / tool arguments → file path parameters → `fs.*` operations. Any path from user input MUST go through path validation (normalize → prefix check → realpath)
2. **Prompt → command flow**: trace from user prompt / tool arguments → command strings → `exec`/`spawn` calls. Commands MUST use allowlists, not string interpolation
3. **Tool argument schemas**: verify that tool argument schemas validate input types and ranges (e.g., numeric bounds, string length limits, enum constraints)
4. **SSRF risk**: trace from user prompt / tool arguments → URL parameters → `fetch`/`http.request`. URLs from user input MUST be validated against allowlists

---

## Test Quality Playbooks

| Finding | CLI Validate | Octocode MCP Validate | Fix |
|---------|-------------|----------------------|-----|
| `low-assertion-density` | `ast-search -p 'expect($$$A)' --include-tests --root <test-file>` → count per `it()` block | `localSearchCode("expect\|assert")` in file → count assertions per test | Add meaningful assertions to each test case |
| `test-no-assertion` | Read finding → check specific `it()`/`test()` block at line range | `localGetFileContent(startLine, endLine)` → confirm no expect/assert inside test block | Add at least one assertion verifying behavior |
| `excessive-mocking` | `ast-search -p 'vi.mock($$$A)' --include-tests` + `ast-search -p 'jest.mock($$$A)' --include-tests` — count | `localSearchCode("jest.mock\|vi.mock\|sinon")` → count mock calls | Reduce mocks by testing through public interfaces; use DI |
| `shared-mutable-state` | Read finding → check `let`/`var` at describe scope | `localGetFileContent(startLine, endLine)` → confirm let/var at describe scope | Move to `beforeEach` or use `const` |
| `missing-test-cleanup` | `ast-search -p 'beforeAll($$$A)' --include-tests` + check for `afterAll` in same file | `localSearchCode("beforeAll\|beforeEach\|afterAll\|afterEach")` → check pairing | Add corresponding `afterAll`/`afterEach` to clean up resources |

---

## Semantic Analysis Playbooks (`--semantic`)

| Finding | CLI Validate | Octocode MCP Validate (use `lspHints`) | Fix |
|---------|-------------|----------------------------------------|-----|
| `semantic-dead-export` | `--features=semantic-dead-export --semantic` → read findings | `lspFindReferences(symbolName, lineHint)` → 0 refs confirms dead | Remove export or delete symbol (stricter than `dead-export`) |
| `over-abstraction` | `ast-search -p 'implements $IFACE'` → count implementations | `lspFindReferences` on interface → exactly 1 implementor | Inline interface into concrete class, or keep if mocking needed |
| `concrete-dependency` | Read finding → check import target is class not interface | `lspGotoDefinition` on import → resolves to class (not interface) | Extract interface, depend on abstraction (DIP) |
| `circular-type-dependency` | `--features=circular-type-dependency` → read cycle paths | `lspFindReferences` on each type in cycle → see cross-refs | Extract shared types to common file |
| `unused-parameter` | `ast-search -p 'function $NAME($$$BEFORE, paramName, $$$AFTER)'` → check body references | `lspFindReferences` on param → 0 non-declaration refs | Remove param or prefix with `_` |
| `deep-override-chain` | Read finding for override chain depth | `lspGotoDefinition` → trace override chain | Use template method or strategy pattern |
| `interface-compliance` | Read finding for missing/any-cast members | `lspGotoDefinition` on interface → compare members | Implement missing members; replace `any` with proper types |
| `unused-import` | `--features=unused-import --semantic` | `lspFindReferences` on import → 0 usages | Remove unused import statement |
| `orphan-implementation` | `ast-search -p 'import { className } from $MOD'` — 0 hits | `lspFindReferences` on class → 0 external refs | Wire into DI/module graph, or delete if truly dead |
| `shotgun-surgery` | Read finding for reference count across files | `lspFindReferences(symbolName, lineHint)` → count unique files | Introduce facade/adapter or event-based decoupling |
| `move-to-caller` | Read finding → confirm 1 consumer | `lspFindReferences(symbolName, lineHint)` → exactly 1 consumer file | Move symbol to consumer file or inline it |
| `narrowable-type` | Read finding for broad vs narrow type info | `lspCallHierarchy(incoming)` → check argument types at all call sites | Narrow param type to match actual usage |

---

## Change Risk Hotspots

`architecture.json` → `hotFiles[]`: riskScore = fan-in + complexity + exports + cycle/critical-path membership.

**CLI check**: `jq '.hotFiles[:5]' .octocode/scan/<ts>/architecture.json`

**Octocode check**: `lspFindReferences` on top hotfile exports → map consumer blast radius.

Prioritize for refactoring.

## Mega-Folder Restructuring

When the scan reports a mega-folder finding (flat directory with many loosely related files):

1. **Map the import graph.** Use `localSearchCode` or `rg` to extract `from './...'` imports. Group files into clusters. Use LSP to confirm boundaries when ambiguous.
2. **Design target structure.** Name directories after their role (e.g., types → parsing → analysis → detection → reporting).
3. **Write a migration script.** Disposable Node.js/shell script that moves files and rewrites all relative import paths atomically. Path resolution: same dir → `./name.js`, root→subdir → `./subdir/name.js`, subdir→root → `../name.js`, across subdirs → `../other/name.js`.
4. **Validate.** Run the project's lint, build, and test scripts after migration (see Project Environment in SKILL.md).
5. **Delete the migration script.** One-shot tool, not part of the codebase.

Prefer this over manual file-by-file moves when a directory has 15+ files in clearly separable domains.
