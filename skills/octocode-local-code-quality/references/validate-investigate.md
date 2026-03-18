# Validate & Investigate

**Validate before fixing** — for semantic findings (dead exports, cycles, coupling), always confirm with CLI or LSP tools. For structurally obvious findings (empty-catch, switch-no-default, magic-number), the scan output with `file:line` is sufficient.

---

## Reasoning Loop

Use this loop before you present a conclusion:

1. `Choose lens` — graph, AST, or hybrid
2. `Correlate signals` — compare `summary.md`, `architecture.json`, `findings.json`, and `file-inventory.json`
3. `State confidence` — high / medium / low
4. `Validate` — confirm the live-code claim with Octocode local tools when available
5. `Present` — summarize graph signal, AST signal, combined interpretation, and next validation step

If the scan looks ambiguous, escalate deliberately:

- use `--graph --graph-advanced` for SCC clusters, chokepoints, package chatter, and startup-risk hubs
- use `--flow` for `cfgFlags`, `flowTrace`, and richer evidence on path-sensitive findings
- if graph and AST signals disagree, say so explicitly and continue the investigation instead of flattening them into one claim

---

## Statement Validation Policy

When Octocode MCP local tools are available, every statement about live code must be validated with them before it is presented as fact.

- Start with `localSearchCode` to anchor the claim to a concrete file and `lineHint`.
- Confirm the statement with `lspGotoDefinition`, `lspFindReferences`, or `lspCallHierarchy`.
- Use `localGetFileContent` only after the exact location is known.
- If Octocode local tools are unavailable, use CLI validation and mark confidence explicitly.

---

## Validation Modes

| Mode | When to use | Tools |
|------|------------|-------|
| **CLI only** | No Octocode MCP installed | `scripts/index.js` (rescan with scope/features) + `scripts/ast-search.js` (structural search) |
| **Octocode MCP only** | MCP available, quick semantic checks | `localSearchCode` → `lspGotoDefinition` / `lspFindReferences` / `lspCallHierarchy` |
| **Hybrid** (recommended) | Both available — broadest coverage | CLI for bulk discovery → MCP for semantic precision |

---

## MCP Availability

Try `localSearchCode` first. If it fails → Octocode not installed or `ENABLE_LOCAL ≠ "true"`.
- Suggest once: "Enable local tools by setting `ENABLE_LOCAL=true` in your Octocode MCP config."
- **Without MCP**: use CLI tools (`ast-search.js` for structural search, rescan with `--scope` for targeted checks), mark confidence (`high`/`medium`/`low`), avoid broad refactors.

---

## Tool Chain — Hybrid (CLI + Octocode MCP)

```
1. CLI:   node scripts/index.js --scope=file.ts     → targeted rescan
2. CLI:   node scripts/ast-search.js -p 'pattern'   → find all instances structurally
3. MCP:   localSearchCode(pattern) → lineHint        → locate in codebase (1-indexed)
4. MCP:   lspGotoDefinition(lineHint)                → jump to definition
5. MCP:   lspFindReferences(lineHint)                → all usages (types, variables, exports)
6. MCP:   lspCallHierarchy(lineHint, dir)            → call flow (functions: incoming/outgoing)
7. MCP:   localGetFileContent                        → read implementation (prefer last)
```

**When to use which:**

| Task | CLI approach | Octocode MCP approach |
|------|-------------|----------------------|
| Find all instances of a pattern | `ast-search -p 'pattern'` | `localSearchCode(pattern)` |
| Confirm no references exist | `ast-search -p 'import { sym } from $M'` — 0 hits | `lspFindReferences(lineHint)` — 0 refs |
| Trace call flow | — (no CLI equivalent) | `lspCallHierarchy(incoming/outgoing)` |
| Jump to definition | — | `lspGotoDefinition(lineHint)` |
| Count across repo | `ast-search --json | jq length` | `localSearchCode(filesOnly=true)` |
| Rescan after fix | `node scripts/index.js --scope=file.ts` | — |

**MCP Rules:**
- `lspFindReferences` for types/variables; `lspCallHierarchy` for function calls only
- Batch tool calls where possible for efficiency
- Use `lspCallHierarchy(depth=1)` and chain manually
- External packages: `packageSearch` → `githubSearchCode`

---

## Tool Chain — CLI Only

```
1. node scripts/index.js --scope=file.ts --features=<category>   → targeted rescan
2. node scripts/ast-search.js -p 'pattern' --root <dir>          → structural search
3. node scripts/ast-search.js --preset <name> --root <dir>       → use pre-built patterns
4. Read file at finding line range                                → manual inspection
5. Fix → rescan with same --scope → verify count drops
```

Useful `ast-search` presets: `empty-catch`, `any-type`, `type-assertion`, `non-null-assertion`, `console-log`, `todo-fixme`, `switch-no-default`, `debugger`, `nested-ternary`.

---

## Investigation Loop

1. Read `summary.md` first and note the `Graph Signal`, `AST Signal`, `Combined Interpretation`, `Confidence`, and `Recommended Validation`
2. Read finding: `file`, `lineStart`, `category`, `reason`, `impact`, `suggestedFix`
3. Check `impact` — explains why this finding matters (business/technical consequence)
4. Check `lspHints[]` and `recommendedValidation` — if present, use those before inventing a validation path
5. **CLI path**: `ast-search.js` for structural verification
6. **MCP path**: `localSearchCode` → LSP tools with `lineHint`
7. Cross-check `fileInventory` and related findings in same file
8. Follow `suggestedFix.steps`
9. After fix, re-run scan and compare counts

---

## lspHints Validation

Most findings include `lspHints[]` with pre-computed validation instructions:

```json
{
  "lspHints": [{
    "tool": "lspFindReferences",
    "symbolName": "deadExport",
    "lineHint": 15,
    "file": "packages/foo/src/utils.ts",
    "expectedResult": "zero references confirms dead export"
  }]
}
```

Use directly: `lspFindReferences(file, lineHint)` → compare with `expectedResult`. No `localSearchCode` step needed when the hint provides the exact position.

Most detectors across architecture, performance, security, and dead-code now include `lspHints`.

---

## impact Field

Most findings include an `impact` string explaining the real-world consequence:

```json
{
  "impact": "Sequential awaits multiply latency by N iterations — parallelizing can reduce total time to max(single-latency)."
}
```

Use `impact` to:
- Prioritize which findings to address first (business impact)
- Explain to stakeholders why a fix matters
- Decide between fix-now vs accept-risk

---

## Security Finding Validation — Taint Tracing

Security findings are **context-sensitive** — unlike structural findings (empty-catch, switch-no-default), a `prototype-pollution-risk` on `cache[key] = value` is a false positive if `key` comes from internal iteration. Always trace the data flow before acting.

### Taint Tracing Workflow

For every security finding:

```
1. Read the finding → note source (parameter/variable) and sink (fs/exec/eval)
2. localSearchCode(sinkFunction) → get lineHint
3. lspCallHierarchy(incoming) on sink → trace who calls it
4. For each caller: does the tainted param come from user input?
   - HIGH confidence: param name matches (req, input, args, payload)
   - MEDIUM confidence: param passed through from another function
   - LOW confidence: param is internal/hardcoded
5. lspFindReferences on the tainted param → check all usages
6. Look for sanitizers: validation calls between source and sink
   - Path validation: path.normalize + startsWith + realpathSync
   - Command validation: allowlist check, no string interpolation
   - Input validation: schema validation (zod, joi), type guards
7. Verdict:
   - TRUE POSITIVE: user input → sink, no sanitizer
   - FALSE POSITIVE: internal data, or properly sanitized
   - NEEDS REVIEW: complex call chain, uncertain provenance
```

### Category-Specific Taint Checks

| Category | Source Signal | Sink Signal | Sanitizer Check |
|----------|-------------|-------------|-----------------|
| `path-traversal-risk` | param named `path`, `file`, `dir` | `fs.readFile`, `path.resolve` | `normalize` + `startsWith` + `realpathSync` |
| `command-injection-risk` | param named `cmd`, `command`, `args` | `exec`, `execSync`, `spawn` | allowlist, `spawn` with array args |
| `prototype-pollution-risk` | computed key variable | `obj[key] = val` | `__proto__` guard, `Object.create(null)` |
| `hardcoded-secret` | string literal | auth/network calls | environment variable substitution |
| `unvalidated-input-sink` | req/body/input params | eval/SQL/exec/fs-write | schema validation (zod, joi) |
| `sql-injection-risk` | template interpolation | `.query()`, `.execute()` | parameterized queries |

### Agentic Security Taint Paths

When scanning agentic/MCP code, trace these critical flows:

1. **User prompt → tool arguments → file system**: check for path validation between tool arg parsing and fs calls
2. **User prompt → tool arguments → shell commands**: check for command allowlists between tool arg parsing and exec/spawn
3. **User prompt → tool arguments → network requests**: check for URL validation between tool arg parsing and fetch/http calls
4. **Tool argument schemas**: verify types, ranges, and enums constrain inputs before they reach sinks
