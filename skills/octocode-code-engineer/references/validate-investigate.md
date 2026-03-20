# Validate & Investigate

## Core Principle: Detectors Signal, You Decide

Detectors use cheap structural AST metrics (loop depth, call count, fan-in, statement count) to flag **candidates**. They intentionally avoid hardcoded domain heuristics — no regex patterns, no method-name lists, no keyword matching. This keeps them fast, maintainable, and language-generic.

**You are the intelligence layer.** Use your tools to read the actual code, trace relationships, confirm or dismiss hypotheses, and explain your reasoning. A finding with `loops >= 2 && calls >= 5 && maxLoopDepth >= 2` is a structural signal for potential unbounded growth — read the function body to see if there's actually a `.push()` in a loop, or if it's a harmless traversal. A `god-function` flag based on MI < 10 is a signal — read the code to see if it's genuinely doing too many things or just long-but-focused.

**Your validation toolkit:**
- `localGetFileContent(matchString=...)` — read the code at the flagged location
- `ast/search.js -p 'pattern'` — structural AST proof (zero false positives)
- `lspFindReferences` / `lspCallHierarchy` — trace usage and call flow
- `lspGotoDefinition` — jump to definitions across files
- `localSearchCode` — fast text search for patterns and context

**Your decisions:**
- **Confirmed**: tool evidence supports the finding → present with `file:line` citations
- **Dismissed**: false positive → explain what you checked and why it doesn't hold
- **Uncertain**: need more data → say what's missing, lower confidence

---

**Validate before fixing.** For structurally obvious findings (empty-catch, switch-no-default, debugger), a single code read at `file:line` is sufficient. For semantic findings (dead exports, cycles, coupling, security sinks), always confirm with MCP or CLI tools.

For confidence tiers and the minimum validation required per tier, see the **Confidence Tiers** table in [SKILL.md](../SKILL.md).

---

## Investigation Loop

Before presenting a conclusion, adapt to the finding:

1. **Understand context** — read `summary.md` signals (Graph, AST, Confidence, Recommended Validation), then the finding itself (`file`, `lineStart`, `category`, `reason`, `impact`).
2. **Check `lspHints` first** — if the finding has `lspHints[]`, run those tool calls directly. They're pre-computed shortcuts to the fastest validation path.
3. **Read the code** — `localGetFileContent` at the flagged location. Look for the concrete behavior the detector suspected. This is where you apply intelligence — understanding context, intent, and whether the structural signal corresponds to real risk.
4. **Trace context** — use LSP or `localSearchCode` to understand callers, consumers, data flow.
5. **Correlate signals** — compare `summary.md`, `architecture.json`, `findings.json`, `file-inventory.json`.
6. **Decide** — confirmed / dismissed / uncertain, with evidence.
7. **Present** — what the scan flagged → what you found → your verdict with `file:line` citations.

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

## Security Analysis

Security analysis combines **deterministic detection** (scanner AST patterns) with **agentic investigation** (agent uses tools to understand the project, trace flows, and assess risk). The scanner flags sinks; the agent maps the attack surface.

### Phase 1: Understand the Project Security Context

Before validating individual findings, understand what the project is and where sensitive operations live. Use tools to map the security-relevant landscape:

| Question | How to find it |
|----------|---------------|
| What does this project do? | `localViewStructure(depth=2)` → README, package.json, entry points |
| Where are HTTP/API entry points? | `localSearchCode("app.get\|app.post\|router\|createServer\|handler")` |
| Where is authentication? | `localSearchCode("auth\|session\|jwt\|token\|login\|passport\|cookie")` |
| Where is user data handled? | `localSearchCode("password\|email\|user\|profile\|credential\|ssn")` |
| Where are payments/billing? | `localSearchCode("payment\|billing\|charge\|stripe\|invoice\|price")` |
| Where is the database layer? | `localSearchCode("query\|prisma\|mongoose\|knex\|sequelize\|pool\|.execute")` |
| Where are external services? | `localSearchCode("fetch\|axios\|http.request\|grpc\|sdk\|client")` |
| Where are file system operations? | `localSearchCode("readFile\|writeFile\|createWriteStream\|unlink\|mkdir")` |
| Where are processes/commands? | `localSearchCode("exec\|spawn\|fork\|child_process")` |
| Where is logging? | `localSearchCode("console.log\|logger\|winston\|pino\|bunyan")` |
| Where are exports/exposure points? | `localSearchCode("export\|module.exports\|expose\|public")` in API/route files |

### Phase 2: Map Sensitive Flows

Use the project context to identify **critical data paths** the scanner can't see:

**Sensitive data flows** — trace with `lspCallHierarchy`:
- User input → validation → storage (passwords, PII, credentials)
- Database → serialization → API response (data leakage)
- Secrets/config → usage sites (env vars, key management)
- User data → logging/monitoring (accidental exposure)
- Internal data → external services (third-party leakage)

**Critical operation flows**:
- Payment/billing → charge → confirmation (financial integrity)
- Auth → session → permission check (access control)
- File upload → storage → serving (path traversal, content injection)
- User input → command/query construction (injection)

**How to trace a flow**:
1. `localSearchCode` → find the entry point (e.g., route handler with user input)
2. `lspCallHierarchy(outgoing)` → what does it call? Follow the chain
3. At each hop: does data pass through validation? Does it reach a sink?
4. `localGetFileContent` → read the actual code at each node to confirm

### Phase 3: Validate Scanner Findings

Security findings are **context-sensitive** — always trace data flow before acting.

**Taint tracing workflow** for each finding:

1. **Find the sink**: `localSearchCode` or `lspGotoDefinition`
2. **Trace callers**: `lspCallHierarchy(incoming)` — who calls the sink?
3. **Assess source**: HIGH = user input params (`req`, `input`, `body`, `args`), MEDIUM = passed through, LOW = internal/hardcoded
4. **Check sanitizers**: `localGetFileContent` — read code between source and sink
5. **Verdict**: confirmed / dismissed / needs-review

| Category | Source signal | Sink signal | Sanitizer check |
|----------|-------------|-------------|-----------------|
| `path-traversal-risk` | param: `path`, `file`, `dir` | `fs.readFile`, `path.resolve` | `normalize` + `startsWith` + `realpathSync` |
| `command-injection-risk` | param: `cmd`, `command`, `args` | `exec`, `execSync`, `spawn` | allowlist, `spawn` with array args |
| `prototype-pollution-risk` | computed key variable | `obj[key] = val` | `__proto__` guard, `Object.create(null)` |
| `hardcoded-secret` | string literal | auth / network calls | env var substitution |
| `unvalidated-input-sink` | `req`/`body`/`input` | eval / SQL / exec / fs-write | schema validation (zod, joi) |
| `sql-injection-risk` | template interpolation | `.query()`, `.execute()` | parameterized queries |
| `sensitive-data-logging` | password/token/secret params | `console.*` call | field-level redaction |

### Phase 4: Check Exposure Points

Use tools to verify what the system exposes:

| Exposure vector | Search pattern | Validate with |
|----------------|---------------|---------------|
| API responses | `localSearchCode("res.json\|res.send\|return.*response")` | Does response include user PII, tokens, internal IDs? |
| Error messages | `localSearchCode("error.message\|stack\|err")` in response handlers | Do errors leak stack traces, file paths, SQL? |
| Logs | `ast/search.js --preset console-any` | Do logs contain passwords, tokens, user data? |
| Environment | `localSearchCode("process.env")` | Are secrets loaded safely? Any defaults with real values? |
| Static assets | `localViewStructure` on public/static dirs | Sensitive files accessible? `.env`, configs, backups? |
| Third-party data | `localSearchCode` for SDK/API client usage | What user data is sent to external services? |

### False Positive Dismissal

- **`prototype-pollution-risk`**: key from `Object.keys()` on internal object, or target is `Object.create(null)` / `Map` / `Set` → dismiss
- **`hardcoded-secret`**: regex definition, UUID, placeholder (`YOUR_*`, `<key>`), test-only, error-message string → dismiss
- **`debug-log-leakage`**: inside test file, or gated by `LOG_LEVEL`/`DEBUG` env check → dismiss
- **`sensitive-data-logging`**: already redacted before logging, or test file → dismiss
- **`path-traversal-risk`**: normalize + prefix check + realpath → dismiss
- **`command-injection-risk`**: spawn with array args, no `shell: true` → downgrade

### Agentic Security: MCP/Tool Code

For agentic/MCP code, trace these critical paths:

1. **User prompt → tool arguments → file system**: path validation between arg parsing and fs calls
2. **User prompt → tool arguments → shell commands**: command allowlists between parsing and exec/spawn
3. **User prompt → tool arguments → network requests**: URL validation before fetch/http
4. **Tool argument schemas**: types, ranges, enums constraining inputs before sinks

### Recommended External Tools

For deep analysis beyond pattern detection:
- **Semgrep** — taint tracking, custom rules, cross-function data flow
- **CodeQL** — full semantic analysis, vulnerability databases
- **Snyk / npm audit** — dependency vulnerabilities (SCA)
