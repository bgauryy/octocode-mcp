# AST Search — Structural Code Search Reference

Structural code search powered by [`@ast-grep/napi`](https://ast-grep.github.io/). Finds code by shape (AST structure), not text — so `console.log(x)` matches regardless of whitespace, comments, or formatting.

---

## Quick Start

```bash
# Pre-built — no install needed
node <SKILL_BASE_DIRECTORY>/scripts/ast-search.js [options]
```

---

## Search Modes

Four mutually exclusive modes — pick one per invocation.

### 1. Pattern Search (`--pattern`, `-p`)

Match code structurally using pattern-as-code syntax. Meta-variables capture matched nodes.

| Wildcard | Meaning | Example |
|----------|---------|---------|
| `$NAME` | Match exactly one AST node | `console.log($MSG)` |
| `$$$NAME` | Match zero or more nodes (variadic) | `console.log($$$ARGS)` |

```bash
# Find all console.log calls, capture arguments
node scripts/ast-search.js -p 'console.log($$$ARGS)' --root ./src

# Find if-return patterns
node scripts/ast-search.js -p 'if ($COND) { return $VAL }' --root ./src

# Find specific function calls
node scripts/ast-search.js -p 'fs.readFileSync($$$A)' --root ./packages
```

Meta-variables appear in JSON output under `metaVariables`:

```json
{
  "file": "src/utils.ts",
  "lineStart": 42,
  "metaVariables": { "$$$ARGS": "'hello', 'world'" }
}
```

### 2. Kind Search (`--kind`, `-k`)

Match by AST node kind. Useful for finding all instances of a syntactic construct.

```bash
# All function declarations
node scripts/ast-search.js -k function_declaration --root ./src

# All arrow functions
node scripts/ast-search.js -k arrow_function --root ./src

# All class declarations
node scripts/ast-search.js -k class_declaration --root ./src

# All try statements
node scripts/ast-search.js -k try_statement --root ./src
```

Common TypeScript/JavaScript AST kinds:

| Kind | Matches |
|------|---------|
| `function_declaration` | `function foo() {}` |
| `arrow_function` | `(x) => x + 1` |
| `class_declaration` | `class Foo {}` |
| `interface_declaration` | `interface Bar {}` (TS only) |
| `type_alias_declaration` | `type X = ...` (TS only) |
| `try_statement` | `try { } catch { }` |
| `switch_statement` | `switch (x) { }` |
| `for_statement` | `for (...) { }` |
| `while_statement` | `while (...) { }` |
| `import_statement` | `import ... from '...'` |
| `export_statement` | `export ...` |
| `predefined_type` | `any`, `string`, `number` (TS only) |

> **Note:** Some kinds are grammar-specific. TypeScript-only kinds (e.g. `predefined_type`, `interface_declaration`) are silently skipped when scanning `.js` files.

### 3. Preset Search (`--preset`)

Built-in rule sets for common code quality patterns. Each preset is a curated ast-grep rule with description.

```bash
# List all available presets
node scripts/ast-search.js --list-presets

# Use a preset
node scripts/ast-search.js --preset empty-catch --root ./packages

# Preset list as JSON (for programmatic use)
node scripts/ast-search.js --list-presets --json
```

#### Available Presets (16)

| Preset | Description | Finds |
|--------|-------------|-------|
| `empty-catch` | Empty catch blocks that silently swallow errors | `catch (e) {}` |
| `console-log` | console.log calls left in production code | `console.log(...)` |
| `console-any` | Any console method call | `console.warn(...)`, `console.error(...)`, etc. |
| `debugger` | Debugger statements left in code | `debugger;` |
| `todo-fixme` | TODO/FIXME/HACK/XXX/BUG comments | `// TODO: ...` |
| `any-type` | Explicit `any` type annotations (TS only) | `: any`, `as any` |
| `type-assertion` | TypeScript type assertions | `x as Type` |
| `non-null-assertion` | Non-null assertions | `x!.prop` |
| `fat-arrow-body` | Arrow functions with block body (could be expression) | `(x) => { return x }` |
| `nested-ternary` | Nested ternary expressions (hard to read) | `a ? (b ? 1 : 2) : 3` |
| `throw-string` | Throwing string literals instead of Error objects | `throw 'oops'` |
| `switch-no-default` | Switch statements without a default case | `switch(x) { case 1: ... }` |
| `class-declaration` | All class declarations | `class Foo {}` |
| `async-function` | Async function declarations | `async function f() {}` |
| `export-default` | Default exports | `export default ...` |
| `import-star` | Namespace imports | `import * as X from '...'` |

### 4. Raw Rule Search (`--rule`)

Pass a raw ast-grep rule as JSON. Full power of the [ast-grep rule API](https://ast-grep.github.io/reference/rule.html).

```bash
# Match catch clauses (equivalent to a kind search)
node scripts/ast-search.js --rule '{"rule":{"kind":"catch_clause"}}' --root ./src

# Match functions with more than 5 params (regex on text)
node scripts/ast-search.js --rule '{"rule":{"kind":"formal_parameters","regex":"(,.*){5,}"}}' --root ./src

# Combine kind + has for structural matching
node scripts/ast-search.js --rule '{"rule":{"kind":"if_statement","has":{"kind":"if_statement","stopBy":"end"}}}' --root ./src
```

---

## CLI Options

```
node scripts/ast-search.js [options]

Search modes (pick one):
  --pattern, -p <code>     Match code structurally (e.g. 'console.log($$$ARGS)')
  --kind, -k <kind>        Match AST node kind (e.g. 'function_declaration')
  --preset <name>          Use a built-in search preset (e.g. 'empty-catch')
  --rule <json>            Raw ast-grep rule object as JSON

Options:
  --root <path>            Search root directory (default: cwd)
  --json                   Output as JSON
  --limit N                Max matches (default: 500)
  --include-tests          Include test files in search
  --context, -C N          Lines of context around matches (text mode only)
  --list-presets           Show available presets and exit
  --help, -h               Show help message
```

### Flag Behavior

| Flag | Default | Notes |
|------|---------|-------|
| `--root` | `cwd` | Accepts relative or absolute path |
| `--json` | `false` | Outputs `AstSearchResult` JSON; text output otherwise |
| `--limit` | `500` | Global cap on total matches returned |
| `--include-tests` | `false` | Excludes `*.test.*`, `*.spec.*`, `__tests__/`, `test_*` by default |
| `--context` | `0` | Extra context lines in text output (no effect in JSON mode) |

### Ignored Directories

Always skipped: `.git`, `.next`, `.yarn`, `.cache`, `.octocode`, `node_modules`, `dist`, `coverage`, `out`.

### Scanned Extensions

`.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs` (excludes `.d.ts`).

---

## Output Format

### Text Output (default)

```
🔍 preset:empty-catch — Empty catch blocks that silently swallow errors
   3 matches across 2 files

── packages/core/src/parser.ts ──
  L42:4  [catch_clause]  catch (e) { }
  L89:4  [catch_clause]  catch { }

── packages/api/src/handler.ts ──
  L15:2  [catch_clause]  catch (err) { }
```

### JSON Output (`--json`)

```json
{
  "query": "preset:empty-catch — Empty catch blocks that silently swallow errors",
  "queryType": "preset",
  "totalMatches": 3,
  "totalFiles": 2,
  "matches": [
    {
      "file": "packages/core/src/parser.ts",
      "kind": "catch_clause",
      "text": "catch (e) { }",
      "lineStart": 42,
      "lineEnd": 42,
      "columnStart": 4,
      "columnEnd": 18,
      "metaVariables": {}
    }
  ]
}
```

---

## How It Works

1. **Collect files** — walks `--root` respecting extension filters and ignore lists
2. **Select parser** — `.ts` → TypeScript parser, `.tsx` → TSX, `.js`/`.mjs`/`.cjs`/`.jsx` → JavaScript parser
3. **Parse + search** — `@ast-grep/napi` parses each file into a concrete syntax tree, then runs the pattern/kind/rule matcher against it
4. **Extract matches** — each match captures file, line, column, AST kind, matched text, and any meta-variable bindings
5. **Format output** — text (human-readable) or JSON (machine-readable)

Grammar mismatches (e.g. TypeScript-only kinds on `.js` files) are handled gracefully — the file is silently skipped with zero matches.

---

## Integration with Code Quality Scan

`ast-search` is a **complementary tool** to the main `index.js` scanner:

| Tool | Purpose | How |
|------|---------|-----|
| `index.js` | 46-category static analysis (architecture, quality, hygiene) | Full pipeline with dependency graph, metrics, severity |
| `ast-search.js` | Targeted structural search | Pattern/kind/preset matching on AST |

**Workflow**: Use `index.js` to identify hotspots → use `ast-search.js` to find specific patterns across the codebase → validate with Octocode MCP LSP tools → fix.

```
SCAN (index.js) → SEARCH (ast-search.js) → VALIDATE (Octocode LSP) → FIX
```

### Example: Hunting down all `any` usage after scan flags `unsafe-any`

```bash
# 1. Scan finds unsafe-any in packages/core
node scripts/index.js --scope=packages/core --features=unsafe-any

# 2. Search for exact locations with ast-search
node scripts/ast-search.js --preset any-type --root ./packages/core --json

# 3. Validate each with LSP, then fix
```

---

## Agent Pattern Language Guide

This section teaches how to **compose patterns on the fly** for any code search task. The pattern language is "code-as-query" — write the code shape you want to find, using meta-variables as wildcards.

### Core Principle

**Write the code you're looking for, replace variable parts with `$X` or `$$$X`.**

- `$NAME` — matches exactly one AST node (expression, identifier, type, literal, etc.)
- `$$$NAME` — matches zero or more nodes (arguments, parameters, statements, imports)

### Decision Tree: Which Mode to Use

```
"Find all X calls"           → --pattern 'X($$$ARGS)'
"Find all X kind of node"    → --kind X_kind_name
"Find common code smell"     → --preset (check --list-presets first)
"Complex structural query"   → --rule '{"rule":{...}}'
```

### Pattern Recipes by Task

#### Finding Function/Method Calls

```bash
# Specific function
-p 'console.log($$$ARGS)'
-p 'JSON.parse($$$ARGS)'
-p 'Promise.all($$$ARGS)'
-p 'fs.readFileSync($$$ARGS)'

# Any method on an object
-p 'console.$METHOD($$$ARGS)'
-p 'process.$METHOD($$$ARGS)'

# Chained calls
-p '$OBJ.then($$$ARGS)'
-p '$OBJ.catch($$$ARGS)'
```

#### Finding Declarations

```bash
# Functions
-p 'function $NAME($$$PARAMS) { $$$BODY }'
-p 'const $NAME = ($$$PARAMS) => $BODY'
-p 'async function $NAME($$$PARAMS) { $$$BODY }'

# Variables
-p 'const $NAME = $VAL'
-p 'let $NAME = $VAL'
-p 'export const $NAME = $VAL'

# Classes
-k class_declaration
-p 'class $NAME extends $BASE { $$$BODY }'
-p 'class $NAME implements $IFACE { $$$BODY }'
```

#### Finding Imports/Exports

```bash
# Named imports (use $MOD wildcard — quote-style agnostic)
-p 'import { $$$NAMES } from $MOD'

# Default imports
-p 'import $DEFAULT from $MOD'

# Type imports (TS)
-p 'import type { $$$NAMES } from $MOD'

# Specific module (MUST match quote style used in codebase)
-p "import { \$$$NAMES } from 'lodash'"

# Namespace imports
--preset import-star
```

> **Quote sensitivity**: Pattern string literals must match the codebase's quote style. Use `$MOD` wildcard to match any quote style. Single-quoted `'node:fs'` won't match double-quoted `"node:fs"`.

#### Finding Error Handling

```bash
# throw new Error
-p 'throw new Error($$$MSG)'

# Empty catch blocks
--preset empty-catch

# try-catch-finally (rule mode for structural)
--rule '{"rule":{"kind":"try_statement","has":{"kind":"finally_clause","stopBy":"end"}}}'
```

#### Finding Type System Patterns (TypeScript)

```bash
# any annotations
--preset any-type

# Type assertions
--preset type-assertion
-p '$EXPR as $TYPE'

# Non-null assertions
--preset non-null-assertion

# Interface declarations
-k interface_declaration

# Type aliases
-k type_alias_declaration

# Generic calls
-p '$FN<$TYPE>($$$ARGS)'
```

#### Finding Control Flow

```bash
# If-return (early return pattern)
-p 'if ($COND) { return $VAL }'

# If without else
--rule '{"rule":{"kind":"if_statement","not":{"has":{"kind":"else_clause"}}}}'

# Nested ternaries
--preset nested-ternary

# Switch without default
--preset switch-no-default

# For-of loops
-k for_in_statement

# While loops
-k while_statement
```

#### Finding Security-Sensitive Patterns

```bash
# Hardcoded secrets in strings
--rule '{"rule":{"kind":"string","regex":"password|secret|token|api.?key"}}'

# process.env access (captures var name)
-p 'process.env.$VAR'

# eval calls
-p 'eval($$$ARGS)'

# innerHTML assignment
-p '$EL.innerHTML = $VAL'
```

#### Finding Code for Refactoring

```bash
# Long parameter lists (regex on formal_parameters text)
--rule '{"rule":{"kind":"formal_parameters","regex":"(,.*){5,}"}}'

# Nested if statements
--rule '{"rule":{"kind":"if_statement","has":{"kind":"if_statement","stopBy":"end"}}}'

# Arrow functions that could be expressions
--preset fat-arrow-body

# TODO/FIXME comments
--preset todo-fixme
```

### Rule Composition Operators

For `--rule` JSON, combine these operators:

| Operator | Meaning | Example |
|----------|---------|---------|
| `kind` | Match AST node kind | `{"kind":"catch_clause"}` |
| `pattern` | Match code shape | `{"pattern":"console.log($$$A)"}` |
| `regex` | Match node text with regex | `{"regex":"TODO\|FIXME"}` |
| `has` | Node contains child matching rule | `{"has":{"kind":"finally_clause"}}` |
| `not` | Negate a rule | `{"not":{"has":{"kind":"else_clause"}}}` |
| `all` | All sub-rules must match (AND) | `{"all":[{"kind":"X"},{"regex":"Y"}]}` |
| `any` | Any sub-rule matches (OR) | `{"any":[{"kind":"X"},{"kind":"Y"}]}` |
| `stopBy: "end"` | Search descendants recursively (not just direct children) | `{"has":{"kind":"X","stopBy":"end"}}` |
| `field` | Match by field name in AST grammar | `{"has":{"field":"default"}}` |

### Tips for Agents

1. **Always use `--json`** for programmatic consumption. Parse `totalMatches`, `totalFiles`, and iterate `matches[]`.
2. **Use `$MOD` wildcard** for imports to avoid quote-style mismatch.
3. **Start with `--limit 10`** to preview results before searching broadly.
4. **Narrow with `--root`** to a specific package/directory first.
5. **Chain with scan findings**: If `index.js` flags `unsafe-any` in a package, follow up with `--preset any-type --root <that-package>`.
6. **Meta-variables are extractable**: `$NAME` in patterns captures the matched identifier — use JSON output to extract names, modules, values.
7. **Grammar-safe**: TS-only kinds on JS files are silently skipped — no need to filter file extensions manually.
8. **Use `--rule` for negation**: "Find X that does NOT have Y" requires `--rule` with `not`/`has` — patterns alone can't express negation.
9. **Use `--include-tests`** when searching for test patterns like `describe`, `it`, `expect`.
10. **`stopBy: "end"`** is required when `has` needs to search descendants recursively (not just direct children).

---

## Programmatic API

All functions are exported for use in other scripts or tests:

```typescript
import {
  searchFile,         // Search a single file's source
  runSearch,          // Search multiple files with full options
  collectSearchFiles, // Collect scannable files from a root
  parseSearchArgs,    // Parse CLI argv into options
  PRESETS,            // Built-in preset rules
  printSearchHelp,    // Print help text
} from './ast-search.js';

import type {
  AstSearchOptions,   // Full search configuration
  AstSearchResult,    // Search result with matches
  AstMatch,           // Single match entry
  PresetRule,         // Preset rule definition
  ParsedSearchArgs,   // Parsed CLI arguments
} from './ast-search.js';
```

---

## Validation Status

All features validated against live monorepo code:

| Feature | Status | Notes |
|---------|--------|-------|
| **16 presets** | All working | `debugger`, `throw-string`, `export-default`, `import-star` return 0 matches (no instances in codebase — not errors) |
| **Pattern search** | Working | Meta-variables (`$X`, `$$$X`) correctly extracted |
| **Kind search** | Working | Validates all returned nodes match requested kind |
| **Raw rule search** | Working | Full ast-grep rule JSON accepted |
| **`--json` output** | Working | Valid JSON with `AstSearchResult` structure |
| **`--limit`** | Working | Correctly caps total matches |
| **`--include-tests`** | Working | Test files included/excluded correctly |
| **`--root`** | Working | Relative and absolute paths accepted |
| **`--list-presets`** | Working | Text and JSON modes |
| **`--help`** | Working | Prints usage and exits |
| **Grammar mismatch** | Handled | TS-only kinds on JS files silently skipped (no crash) |
| **Unit tests** | All passing | 46 tests covering all search modes, presets, and edge cases |
