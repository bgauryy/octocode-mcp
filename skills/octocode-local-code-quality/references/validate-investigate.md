# Validate & Investigate

**Validate before fixing** — for semantic findings (dead exports, cycles, coupling), always confirm with CLI or LSP tools. For structurally obvious findings (empty-catch, switch-no-default), the scan output with `file:line` is sufficient.

For available tools, see the Tools section in [SKILL.md](../SKILL.md).

---

## Investigation Loop

Before presenting a conclusion — adapt to the finding, not the other way around:

1. **Understand context**: read `summary.md` signals (Graph, AST, Confidence, Recommended Validation), then the finding itself (`file`, `lineStart`, `category`, `reason`, `impact`).
2. **Choose lens** — graph, AST, or hybrid — based on what the finding needs.
3. **Use lspHints first**: if `lspHints[]` or `recommendedValidation` exist on the finding, use those directly — they're pre-computed validation shortcuts.
4. **Validate with any fitting tool**: use Octocode local tools, CLI AST scripts, or both — pick what answers the question fastest. Cross-check `fileInventory` and related findings in the same file.
5. **Correlate signals** — compare `summary.md`, `architecture.json`, `findings.json`, `file-inventory.json`.
6. **State confidence** — high / medium / low.
7. **Present** — graph signal, AST signal, combined interpretation, remaining gaps.

If the scan looks ambiguous, escalate deliberately:

- use `--graph --graph-advanced` for SCC clusters, chokepoints, package chatter, and startup-risk hubs
- use `--flow` for `cfgFlags`, `flowTrace`, and richer evidence on path-sensitive findings
- if graph and AST signals disagree, say so explicitly and continue the investigation instead of flattening them into one claim

---

## Hybrid Validation (CLI + Octocode MCP)

When both CLI scripts and Octocode tools are available, use whichever fits:

| Task | CLI option | Octocode option |
|------|-----------|----------------|
| Find all instances of a pattern | `ast/search.js -p 'pattern'` | `localSearchCode(pattern)` |
| Understand project layout | `ast/tree-search.js -k ...` | `localViewStructure(path)` |
| Find files by name/metadata | — | `localFindFiles(name, path)` |
| Read specific code section | — | `localGetFileContent(file, matchString)` |
| Confirm no references exist | `ast/search.js -p 'import { sym } from $M'` → 0 hits | `lspFindReferences(lineHint)` → 0 refs |
| Trace call flow | — | `lspCallHierarchy(incoming/outgoing)` |
| Jump to definition | — | `lspGotoDefinition(lineHint)` |
| Count across repo | `ast/search.js --json \| jq length` | `localSearchCode(filesOnly=true)` |
| Rescan after fix | `scripts/index.js --scope=file.ts` | — |

**Tips:**
- `lspFindReferences` for types/variables; `lspCallHierarchy` for function calls only
- `lspCallHierarchy(depth=1)` + chain manually is faster than high depth
- Batch tool calls where possible
- External packages: `packageSearch` → `githubSearchCode`

---

## CLI-Only Tool Chain

When Octocode MCP is unavailable:

```
1. node scripts/index.js --scope=file.ts --features=<category>   → targeted rescan
2. node scripts/ast/search.js -p 'pattern' --root <dir>          → structural search
3. node scripts/ast/search.js --preset <name> --root <dir>       → use pre-built patterns
4. Read file at finding line range                                → manual inspection
5. Fix → rescan with same --scope → verify count drops
```

Useful `ast-search` presets: `empty-catch`, `any-type`, `type-assertion`, `non-null-assertion`, `console-log`, `todo-fixme`, `switch-no-default`, `debugger`, `nested-ternary`.

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

Security findings are **context-sensitive** — a `prototype-pollution-risk` on `cache[key] = value` is a false positive if `key` comes from internal iteration. Always trace the data flow before acting.

### Taint Tracing Workflow

For every security finding, trace the data flow from source to sink:

- **Find the sink**: `localSearchCode` or `lspGotoDefinition` to locate it
- **Trace callers**: `lspCallHierarchy(incoming)` to see who calls the sink
- **Check the source**: does the tainted param come from user input?
  - HIGH confidence: param name matches (req, input, args, payload)
  - MEDIUM confidence: param passed through from another function
  - LOW confidence: param is internal/hardcoded
- **Find all usages**: `lspFindReferences` on the tainted param
- **Read surrounding code**: `localGetFileContent` to look for sanitizers between source and sink
  - Path: `path.normalize` + `startsWith` + `realpathSync`
  - Command: allowlist check, `spawn` with array args
  - Input: schema validation (zod, joi), type guards

**Verdict**: TRUE POSITIVE (user input → sink, no sanitizer), FALSE POSITIVE (internal data or sanitized), NEEDS REVIEW (complex chain, uncertain provenance).

### Category-Specific Taint Checks

| Category | Source Signal | Sink Signal | Sanitizer Check |
|----------|-------------|-------------|-----------------|
| `path-traversal-risk` | param named `path`, `file`, `dir` | `fs.readFile`, `path.resolve` | `normalize` + `startsWith` + `realpathSync` |
| `command-injection-risk` | param named `cmd`, `command`, `args` | `exec`, `execSync`, `spawn` | allowlist, `spawn` with array args |
| `prototype-pollution-risk` | computed key variable | `obj[key] = val` | `__proto__` guard, `Object.create(null)` |
| `hardcoded-secret` | string literal | auth/network calls | environment variable substitution |
| `unvalidated-input-sink` | req/body/input params | eval/SQL/exec/fs-write | schema validation (zod, joi) |
| `sql-injection-risk` | template interpolation | `.query()`, `.execute()` | parameterized queries |

### False Positive Dismissal Criteria

- `prototype-pollution-risk`: key comes from `Object.keys()` on internal object, or target is `Object.create(null)` / `Map` / `Set` → dismiss
- `hardcoded-secret`: value is inside a regex definition, is a UUID, placeholder (`YOUR_*`, `<key>`), or used only in tests → dismiss. Error messages and prose strings are auto-filtered by the scanner.
- `path-traversal-risk`: path goes through normalize + prefix check + realpath resolution → dismiss (or downgrade to info)
- `command-injection-risk`: spawn uses array args without `shell: true` → downgrade to info

### Agentic Security Taint Paths

When scanning agentic/MCP code, trace these critical flows:

1. **User prompt → tool arguments → file system**: check for path validation between tool arg parsing and fs calls
2. **User prompt → tool arguments → shell commands**: check for command allowlists between tool arg parsing and exec/spawn
3. **User prompt → tool arguments → network requests**: check for URL validation between tool arg parsing and fetch/http calls
4. **Tool argument schemas**: verify types, ranges, and enums constrain inputs before they reach sinks
