# Playbooks — Validate & Fix by Category

Per-category instructions: which MCP/LSP tool to use, what to check, and how to fix.

---

## Architecture Playbooks

| Finding | Validate | Fix |
|---------|----------|-----|
| `dependency-cycle` | `localSearchCode(import.*from)` on cycle files → `lspGotoDefinition` | Break with shared contracts or dependency inversion |
| `dependency-critical-path` | `localSearchCode(export)` on hub → `lspCallHierarchy(incoming)` | Split hub, enforce boundaries |
| `architecture-sdp-violation` | `lspCallHierarchy(incoming)` on stable; `(outgoing)` on unstable | Invert via interface or move to stable utility |
| `high-coupling` | `lspFindReferences` on key exports → count consumers | Extract focused sub-modules by consumer group |
| `god-module-coupling` | Fan-in: `lspFindReferences`; Fan-out: `lspCallHierarchy(outgoing)` | Split by responsibility, introduce facade |
| `orphan-module` | `localSearchCode(fileName, filesOnly=true)` — check runtime config | Delete if disconnected |
| `unreachable-module` | `localSearchCode(moduleName)` — check dynamic imports | Delete subgraph if confirmed |
| `layer-violation` | `lspGotoDefinition` on violating import | Extract shared contracts to lower layer |
| `inferred-layer-violation` | Same as `layer-violation` (auto-detected: `types/`→foundation, `utils/`→utility, `services/`→service) | Same fix |
| `low-cohesion` | `lspFindReferences` per export → map consumer clusters | Split into N focused modules |
| `dependency-test-only` | `lspFindReferences` + `localSearchCode(from.*moduleName, filesOnly=true)` | Move to test fixtures or add production usage |
| `distance-from-main-sequence` | Check `reason` for A/I/D values + zone | Add interfaces (Zone of Pain) or implementations (Zone of Uselessness) |
| `feature-envy` | `lspFindReferences` on imported symbols → confirm usage | Move logic to target module or extract shared module |
| `untested-critical-code` | `localFindFiles(name=*.test.*)` for sibling test → `lspCallHierarchy(incoming)` | Create test file covering public API + complex functions |

---

## Code Quality Playbooks

| Finding | Validate | Fix |
|---------|----------|-----|
| `duplicate-function-body` | `localSearchCode` → `lspFindReferences` + `lspCallHierarchy(incoming)` | Extract shared helper |
| `duplicate-flow-structure` | `localGetFileContent(startLine, endLine)` | Extract reusable flow helper |
| `function-optimization` | `lspCallHierarchy(incoming)` + `(outgoing)` | Split along responsibilities |
| `cognitive-complexity` | `localGetFileContent(startLine, endLine)` | Early returns, extract nested blocks |
| `god-module` | `localGetFileContent` → identify groups | Extract each into dedicated module |
| `god-function` | `localGetFileContent(startLine, endLine)` | Extract steps into named helpers |
| `halstead-effort` | `localGetFileContent` + `lspCallHierarchy(outgoing)` | Split into smaller functions |
| `low-maintainability` | Check `reason` for MI components | Reduce LOC, simplify expressions |
| `high-cyclomatic-density` | `localGetFileContent(startLine, endLine)` | Guard clauses, lookup tables |
| `excessive-parameters` | `lspCallHierarchy(incoming)` → check caller diversity | Group into options object |
| `unsafe-any` | `localSearchCode(": any\|as any")` | `unknown` + type guards, generics |
| `magic-number` | `localSearchCode(literal value)` | Named `const`, config objects |
| `empty-catch` | `localGetFileContent(startLine, endLine)` | Add logging or re-throw |
| `switch-no-default` | `localGetFileContent(startLine, endLine)` | Add `default` with unreachable error |
| `type-assertion-escape` | `localSearchCode("as any")` → review each occurrence | Replace with `unknown` + type guards, proper generics |
| `missing-error-boundary` | `localGetFileContent(startLine, endLine)` → check await calls | Wrap in try-catch, add `.catch()`, or document caller handling |
| `promise-misuse` | `localGetFileContent(startLine, endLine)` → check if await forgotten | Remove `async` keyword or add the missing `await` |

---

## Dead Code & Hygiene Playbooks

| Finding | Validate | Fix |
|---------|----------|-----|
| `orphan-module` | `localSearchCode(fileNameWithoutExt, filesOnly=true)` → `lspFindReferences` | Confirm not runtime entrypoint, then delete |
| `dead-export` | `localSearchCode(export symbolName)` → `lspFindReferences(includeDeclaration=false)` | Remove export or delete symbol |
| `dead-re-export` | `localSearchCode(export.*from)` on barrel → `lspFindReferences` | Remove stale re-export |
| `re-export-duplication` / `re-export-shadowed` | `localSearchCode(export {)` in barrel | Keep one source-of-truth per name |
| `unused-npm-dependency` | `localSearchCode(packageName)` — check build scripts | `npm uninstall`, verify build |
| `package-boundary-violation` | `lspGotoDefinition` on cross-package import | Re-export from target index |
| `barrel-explosion` | `localGetFileContent(barrel file)` | Group into sub-barrels |

---

## Semantic Analysis Playbooks (`--semantic`)

| Finding | Validate (use `lspHints` from finding) | Fix |
|---------|----------------------------------------|-----|
| `over-abstraction` | `lspFindReferences` on interface → exactly 1 implementor | Inline interface into concrete class, or keep if mocking needed |
| `concrete-dependency` | `lspGotoDefinition` on import → resolves to class (not interface) | Extract interface, depend on abstraction (DIP) |
| `circular-type-dependency` | `lspFindReferences` on each type in cycle → see cross-refs | Extract shared types to common file |
| `unused-parameter` | `lspFindReferences` on param → 0 non-declaration refs | Remove param or prefix with `_` |
| `type-hierarchy-depth` | `lspGotoDefinition` → trace base chain | Flatten with composition over inheritance |
| `deep-override-chain` | `lspGotoDefinition` → trace override chain | Use template method or strategy pattern |
| `interface-compliance` | `lspGotoDefinition` on interface → compare members | Implement missing members; replace `any` with proper types |
| `unused-import` | `lspFindReferences` on import → 0 usages | Remove unused import statement |
| `orphan-implementation` | `lspFindReferences` on class → 0 external refs | Wire into DI/module graph, or delete if truly dead |
| `shotgun-surgery` | `lspFindReferences(symbolName, lineHint)` → count unique files | Introduce facade/adapter or event-based decoupling |
| `move-to-caller` | `lspFindReferences(symbolName, lineHint)` → exactly 1 consumer file | Move symbol to consumer file or inline it |
| `leaky-abstraction` | `lspGotoDefinition` on return type → resolves to internal module | Re-export the type or define a public interface |
| `narrowable-type` | `lspCallHierarchy(incoming)` → check argument types at all call sites | Narrow param type to match actual usage |

---

## Change Risk Hotspots

`architecture.json` → `hotFiles[]`: riskScore = fan-in + complexity + exports + cycle/critical-path membership. Prioritize for refactoring.
