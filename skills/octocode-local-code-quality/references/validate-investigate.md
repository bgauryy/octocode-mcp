# Validate & Investigate

**Validate before fixing.** For structurally obvious findings (empty-catch, switch-no-default, debugger), a single code read at `file:line` is sufficient. For semantic findings (dead exports, cycles, coupling, security sinks), always confirm with MCP or CLI tools.

For confidence tiers and the minimum validation required per tier, see the **Confidence Tiers** table in [SKILL.md](../SKILL.md).

---

## Investigation Loop

Before presenting a conclusion, adapt to the finding:

1. **Understand context** — read `summary.md` signals (Graph, AST, Confidence, Recommended Validation), then the finding itself (`file`, `lineStart`, `category`, `reason`, `impact`).
2. **Assign a confidence tier** (1–4) from the Confidence Tiers table in SKILL.md.
3. **Use `lspHints` first** — if `lspHints[]` or `recommendedValidation` exist on the finding, use those directly; they are pre-computed validation shortcuts.
4. **Validate with fitting tools** — use Octocode local tools, CLI AST scripts, or both. Cross-check `file-inventory.json` and related findings in the same file.
5. **Correlate signals** — compare `summary.md`, `architecture.json`, `findings.json`, `file-inventory.json`.
6. **State confidence** — high / medium / low.
7. **Present** — graph signal, AST signal, combined interpretation, remaining gaps.

If the scan looks ambiguous:
- use `--graph --graph-advanced` for SCC clusters, chokepoints, package chatter, and startup-risk hubs
- use `--flow` for `cfgFlags`, `flowTrace`, and richer evidence on path-sensitive findings
- if graph and AST signals disagree, say so explicitly and continue investigating rather than flattening them

---

## Tool Selection Guide

Pick the tool that answers the question fastest. When both CLI and MCP are available, prefer MCP for semantic questions (LSP) and CLI for re-scan and structural proof.

| Task | CLI option | Octocode MCP option |
|------|-----------|-------------------|
| Find all instances of a pattern | `ast/search.js -p 'pattern' --json` | `localSearchCode(pattern)` |
| Understand project layout | `ast/tree-search.js -k ...` | `localViewStructure(path)` |
| Find files by name / metadata | — | `localFindFiles(name, path)` |
| Read a specific code section | — | `localGetFileContent(file, matchString)` |
| Confirm no references exist | `ast/search.js -p 'import { sym } from $M'` → 0 hits | `lspFindReferences(lineHint)` → 0 refs |
| Trace call flow | — | `lspCallHierarchy(incoming/outgoing)` |
| Jump to definition | — | `lspGotoDefinition(lineHint)` |
| Count across repo | `ast/search.js --json \| jq length` | `localSearchCode(filesOnly=true)` |
| Re-scan after fix | `scripts/index.js --scope=file.ts` | — |

**LSP tips:**
- `lspFindReferences` for types, variables, all usages.
- `lspCallHierarchy` for function calls only.
- `lspCallHierarchy(depth=1)` + chain manually is faster than high depth.
- `lspGotoDefinition` requires `lineHint` — always run `localSearchCode` first to get it.

---

## CLI-Only Mode

When Octocode MCP is unavailable, use this chain:

```
1. node scripts/index.js --scope=file.ts --features=<category>   → targeted rescan
2. node scripts/ast/search.js -p 'pattern' --root <dir>          → structural search
3. node scripts/ast/search.js --preset <name> --root <dir>       → use pre-built patterns
4. Read file at finding line range                                → manual inspection
5. Fix → rescan with same --scope → verify count drops
```

Mark confidence explicitly: `high` = structural (empty-catch, switch-no-default), `medium` = semantic (dead-export, coupling), `low` = behavioral (security, data-flow).

Useful `ast/search.js` presets: `empty-catch`, `any-type`, `type-assertion`, `non-null-assertion`, `console-log`, `console-any`, `debugger`, `todo-fixme`, `switch-no-default`, `nested-ternary`.

---

## `lspHints` Validation

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

## `impact` Field

Most findings include an `impact` string explaining the real-world consequence:

```json
{ "impact": "Sequential awaits multiply latency by N iterations — parallelizing reduces total time to max(single-latency)." }
```

Use `impact` to prioritize which findings to address first, explain to stakeholders why a fix matters, and decide between fix-now vs accept-risk.

---

## Security Finding Validation — Taint Tracing

Security findings are **context-sensitive** — a `prototype-pollution-risk` on `cache[key] = value` is a false positive if `key` comes from internal iteration. Always trace the data flow before acting.

### Taint Tracing Workflow

For every Tier 4 security finding:

1. **Find the sink**: `localSearchCode` or `lspGotoDefinition` to locate it
2. **Trace callers**: `lspCallHierarchy(incoming)` to see who calls the sink
3. **Assess source confidence**:
   - HIGH: param name matches known input patterns (`req`, `input`, `args`, `payload`)
   - MEDIUM: param passed through from another function
   - LOW: param is internal or hardcoded
4. **Find all usages**: `lspFindReferences` on the tainted param
5. **Read surrounding code**: `localGetFileContent` to look for sanitizers between source and sink

**Verdict**: TRUE POSITIVE (user input → sink, no sanitizer) | FALSE POSITIVE (internal data or sanitized) | NEEDS REVIEW (complex chain, uncertain provenance)

### Category-Specific Taint Checks

| Category | Source signal | Sink signal | Sanitizer check |
|----------|-------------|-------------|-----------------|
| `path-traversal-risk` | param named `path`, `file`, `dir` | `fs.readFile`, `path.resolve` | `normalize` + `startsWith` + `realpathSync` |
| `command-injection-risk` | param named `cmd`, `command`, `args` | `exec`, `execSync`, `spawn` | allowlist, `spawn` with array args |
| `prototype-pollution-risk` | computed key variable | `obj[key] = val` | `__proto__` guard, `Object.create(null)` |
| `hardcoded-secret` | string literal | auth / network calls | environment variable substitution |
| `unvalidated-input-sink` | `req`/`body`/`input` params | eval / SQL / exec / fs-write | schema validation (zod, joi) |
| `sql-injection-risk` | template interpolation | `.query()`, `.execute()` | parameterized queries |
| `sensitive-data-logging` | param names matching password/token/secret/credential | `console.*` call | field-level redaction, structured logger with redact config |

### False Positive Dismissal Criteria

- **`prototype-pollution-risk`**: key from `Object.keys()` on internal object, or target is `Object.create(null)` / `Map` / `Set` → dismiss
- **`hardcoded-secret`**: value is inside a regex definition, is a UUID, placeholder (`YOUR_*`, `<key>`), used only in tests, or is an error-message string → dismiss. Error messages and prose strings are auto-filtered by the scanner.
- **`debug-log-leakage`**: call is inside a test file, or is explicitly gated behind a `LOG_LEVEL`/`DEBUG` environment check → dismiss or downgrade to info
- **`sensitive-data-logging`**: argument is already redacted before logging (e.g., `{ ...user, password: "[REDACTED]" }`), or call is inside a test file → dismiss
- **`path-traversal-risk`**: path goes through normalize + prefix check + realpath resolution → dismiss (or downgrade to info)
- **`command-injection-risk`**: spawn uses array args without `shell: true` → downgrade to info

### Agentic Security Taint Paths

When scanning agentic/MCP code, trace these critical flows:

1. **User prompt → tool arguments → file system**: check path validation between tool arg parsing and fs calls
2. **User prompt → tool arguments → shell commands**: check command allowlists between tool arg parsing and exec/spawn
3. **User prompt → tool arguments → network requests**: check URL validation between tool arg parsing and fetch/http calls
4. **Tool argument schemas**: verify types, ranges, and enums constrain inputs before reaching sinks
