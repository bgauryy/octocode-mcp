# AST Search Reference

Structural code search powered by [`@ast-grep/napi`](https://ast-grep.github.io/). Finds code by AST shape, not text — `console.log(x)` matches regardless of whitespace or formatting.

```bash
node <SKILL_DIR>/scripts/ast-search.js [options]
```

---

## Search Modes

Pick one per invocation.

### Pattern (`-p`, `--pattern`)

Write the code shape. Replace variable parts with `$X` (one node) or `$$$X` (zero or more).

```bash
-p 'console.log($$$ARGS)'                    # all console.log
-p 'console.$METHOD($$$ARGS)'                # any console method
-p 'if ($COND) { return $VAL }'              # early returns
-p 'import { $$$NAMES } from $MOD'           # named imports (any module)
-p 'export const $NAME = $VAL'               # exported constants
-p 'process.env.$VAR'                        # env access
-p 'throw new Error($$$MSG)'                 # error throws
-p 'function $NAME($$$P) { $$$B }'           # function declarations
-p 'const $NAME = ($$$P) => $BODY'           # arrow assignments
```

Meta-variables captured in JSON output under `metaVariables`:

```json
{ "$METHOD": "log", "$$$ARGS": "\"hello\", 42" }
```

> **Quote sensitivity**: `'fs'` won't match `"fs"`. Use `$MOD` wildcard to match any quote style.

### Kind (`-k`, `--kind`)

Match all nodes of an AST kind.

```bash
-k function_declaration    -k arrow_function         -k class_declaration
-k interface_declaration   -k type_alias_declaration  -k import_statement
-k try_statement           -k switch_statement        -k for_in_statement
-k await_expression        -k template_string         -k object_pattern
```

> TS-only kinds (`predefined_type`, `interface_declaration`) are silently skipped on `.js` files.

### Preset (`--preset`)

16 built-in rules for common patterns. List with `--list-presets`.

| Preset | Finds |
|--------|-------|
| `empty-catch` | `catch (e) {}` — silently swallowed errors |
| `console-log` | `console.log(...)` left in production |
| `console-any` | Any `console.*()` call |
| `debugger` | `debugger;` statements |
| `todo-fixme` | TODO/FIXME/HACK/XXX/BUG comments |
| `any-type` | `: any` annotations (TS only) |
| `type-assertion` | `x as Type` assertions |
| `non-null-assertion` | `x!` non-null assertions |
| `fat-arrow-body` | `() => { return x }` — could be expression |
| `nested-ternary` | `a ? (b ? 1 : 2) : 3` |
| `throw-string` | `throw "oops"` — should be Error |
| `switch-no-default` | `switch` without `default` |
| `class-declaration` | All class declarations |
| `async-function` | `async function` declarations |
| `export-default` | `export default` statements |
| `import-star` | `import * as X` namespace imports |

### Rule (`--rule`)

Raw ast-grep rule JSON. Use for negation, regex, or nested structural queries.

```bash
# Negation: if without else
--rule '{"rule":{"kind":"if_statement","not":{"has":{"kind":"else_clause"}}}}'

# Regex on text: secrets in strings
--rule '{"rule":{"kind":"string","regex":"password|secret|token|api.?key"}}'

# Nested: try with finally
--rule '{"rule":{"kind":"try_statement","has":{"kind":"finally_clause","stopBy":"end"}}}'

# Long param lists
--rule '{"rule":{"kind":"formal_parameters","regex":"(,.*){5,}"}}'
```

**Rule operators:**

| Operator | Purpose | Example |
|----------|---------|---------|
| `kind` | Match node kind | `{"kind":"catch_clause"}` |
| `pattern` | Match code shape | `{"pattern":"console.log($$$A)"}` |
| `regex` | Match node text | `{"regex":"TODO\|FIXME"}` |
| `has` | Child matches rule | `{"has":{"kind":"finally_clause"}}` |
| `not` | Negate | `{"not":{"has":{"kind":"else_clause"}}}` |
| `all` | AND | `{"all":[{"kind":"X"},{"regex":"Y"}]}` |
| `any` | OR | `{"any":[{"kind":"X"},{"kind":"Y"}]}` |
| `stopBy: "end"` | Search descendants (not just direct children) | `{"has":{"kind":"X","stopBy":"end"}}` |
| `field` | Match by grammar field | `{"has":{"field":"default"}}` |

---

## CLI Reference

```
node scripts/ast-search.js [options]

Search (pick one):
  -p, --pattern <code>     Code shape with $X/$$$X wildcards
  -k, --kind <name>        AST node kind
  --preset <name>          Built-in rule (see --list-presets)
  --rule <json>            Raw ast-grep rule JSON

Options:
  --root <path>            Search directory (default: cwd)
  --json                   JSON output (use for programmatic consumption)
  --limit N                Max matches (default: 500)
  --include-tests          Include *.test.*, *.spec.*, __tests__/
  -C, --context N          Context lines around matches (text mode only)
  --list-presets           List presets and exit
  -h, --help               Show help
```

| Flag | Default | Notes |
|------|---------|-------|
| `--root` | cwd | Relative or absolute |
| `--json` | off | Outputs `AstSearchResult` — always use for agent consumption |
| `--limit` | 500 | Global cap across all files |
| `--include-tests` | off | Test files excluded by default |
| `--context` | 0 | Shows source lines around matches with `>` marker |

**Scanned**: `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs` (excludes `.d.ts`)

**Skipped dirs**: `.git`, `.next`, `.yarn`, `.cache`, `.octocode`, `node_modules`, `dist`, `coverage`, `out`

---

## Output

### Text (default)

```
🔍 preset:empty-catch — Empty catch blocks that silently swallow errors
   3 matches across 2 files

── packages/core/src/parser.ts ──
  L42:4  [catch_clause]  catch (e) { }
```

### Text with `--context 2`

```
── src/index.ts ──
     896 |   for (const [key, file] of Object.entries(outputFiles)) {
     897 |     let size = '—';
  >  898 |     try { size = formatFileSize(fs.statSync(path.join(dir, file)).size); } catch {}
     899 |     lines.push(...);
     900 |   }
```

### JSON (`--json`)

```json
{
  "query": "preset:empty-catch — ...",
  "queryType": "preset",
  "totalMatches": 3,
  "totalFiles": 2,
  "matches": [{
    "file": "packages/core/src/parser.ts",
    "kind": "catch_clause",
    "text": "catch (e) { }",
    "lineStart": 42, "lineEnd": 42,
    "columnStart": 4, "columnEnd": 18,
    "metaVariables": {}
  }]
}
```

---

## Agent Guide

### Decision Tree

```
"Find all X() calls"        → -p 'X($$$ARGS)'
"Find all X nodes"          → -k X_kind_name
"Known code smell"          → --preset name
"Negation / regex / nesting" → --rule '{...}'
```

### Rules for Agents

1. **Always `--json`** for programmatic use. Parse `totalMatches`, iterate `matches[]`.
2. **Start narrow**: `--limit 10 --root <specific-dir>` before broad search.
3. **Chain with scan**: `index.js` flags `unsafe-any` → `--preset any-type --root <pkg>`.
4. **Use `$MOD`** for imports — avoids quote mismatch.
5. **`--rule` for negation** — patterns can't express "X without Y".
6. **`stopBy: "end"`** required for recursive `has` (descendant search, not just children).
7. **Grammar-safe**: TS-only kinds silently skipped on JS files.
8. **`--include-tests`** for `describe`, `it`, `expect` patterns.
9. **Meta-variables** appear in JSON — extract captured `$NAME`, `$MOD`, `$$$ARGS`.
10. **`-C N`** for context — shows N lines before/after matches in text mode.
