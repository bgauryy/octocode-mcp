# AST Reference

Single AST guide for both tools:
- `scripts/ast/tree-search.js` — fast triage on `ast-trees.txt` from a scan
- `scripts/ast/search.js` — structural proof on live source files

Use this as the only AST reference for agents.

---

## Which tool when

| Goal | Tool | Why |
|------|------|-----|
| Quickly decide where to read next | `tree-search.js` | Works on scan artifact, very fast triage |
| Prove a code shape exists in source | `search.js` | AST-accurate structural matching |
| Validate a finding before presenting | `search.js` | Live-source evidence (not snapshot-only) |

Golden rule: **triage with tree-search, prove with search**.

---

## `ast-trees.txt` format

Each scan writes `ast-trees.txt` — a flattened AST snapshot of every analyzed file. The file is markdown-ish with a fixed structure:

```
# AST Trees — <timestamp>

## <package> — <filepath>
SourceFile[1:200]
  ImportDeclaration[1]
    ImportClause[1]
      NamedImports[1]
        ImportSpecifier[1] ...
  FunctionDeclaration[10:35]
    ExportKeyword[10]
    AsyncKeyword[10]
    Identifier[10]
    Parameter[10]
      Identifier[10]
      StringKeyword[10]
    Block[10:35]
      IfStatement[12] ...
      ReturnStatement[34] ...
```

**Format rules:**
- `## <package> — <filepath>` — section header per file
- `Kind[line]` — single-line node at that source line
- `Kind[startLine:endLine]` — multi-line node spanning those source lines
- **Indentation** (2 spaces per level) = AST depth
- `...` suffix = children truncated by `--tree-depth` (default: 4)
- Suppress with `--no-tree`. Control depth with `--tree-depth N`.

**Reading directly:** you can read sections with standard tools (`grep`, `head`) or use `localGetFileContent(matchString="## <package> — <filepath>")` to jump to a file's AST. But prefer `tree-search.js` for structured queries.

---

## `tree-search.js` (scan artifact triage)

Queries `ast-trees.txt` programmatically — faster and more reliable than reading the raw file.

```bash
node <SKILL_DIR>/scripts/ast/tree-search.js -i .octocode/scan -k function_declaration --limit 25
```

Useful options:
- `--ignore-case` case-insensitive matching
- `-i, --input` scan root or timestamp directory
- `-k` node kind filter (supports `snake_case` and `PascalCase`)
- `-p` regex pattern to match against any AST tree line
- `--file` narrow to file (regex on filepath)
- `--section` narrow to section header (regex)
- `-C` context lines around each match
- `--limit` max matches (default: 50, `0` = all)
- `--json` structured JSON output

Use cases:
- identify large functions and nested regions before deep reading
- find candidate files for a category-specific validation pass

Do not use as final proof of live behavior.

**Scan selection**: when `-i` points to `.octocode/scan` (the root), `tree-search` picks the **most recently modified** scan directory. If the latest scan was a narrow `--scope` run, the artifact will only contain AST trees for those scoped files — not the full codebase. To target a specific full scan, pass the exact timestamp directory: `-i .octocode/scan/<timestamp>`.

---

## `search.js` (live structural proof)

Runs against source files via `@ast-grep/napi`.

```bash
node <SKILL_DIR>/scripts/ast/search.js [options]
```

Modes:
- **Pattern** `-p` for AST shape matching with metavariables (`$X`, `$$$X`)
- **Kind** `-k` for syntax-node class matching
- **Rule** `--rule` for advanced JSON rules
- **Preset** `--preset` for built-in smell checks

Examples:

```bash
node <SKILL_DIR>/scripts/ast/search.js -p 'console.$METHOD($$$ARGS)' --json --root src/
node <SKILL_DIR>/scripts/ast/search.js -k function_declaration --json --root src/
node <SKILL_DIR>/scripts/ast/search.js --preset any-type --json --root src/
```

All presets (run `--list-presets` to verify against your version):

| Preset | Detects |
|--------|---------|
| `empty-catch` | Empty catch blocks that silently swallow errors |
| `console-log` | `console.log` calls left in production code |
| `console-any` | Any `console` method call (log, warn, error, debug, etc.) |
| `debugger` | Debugger statements left in code |
| `todo-fixme` | TODO, FIXME, HACK, XXX, BUG comments |
| `any-type` | Explicit `any` type annotations |
| `type-assertion` | TypeScript type assertions (`as X`) |
| `non-null-assertion` | Non-null assertions (`x!`) |
| `fat-arrow-body` | Arrow functions with statement block bodies (could be expression) |
| `nested-ternary` | Nested ternary expressions (hard to read) |
| `throw-string` | Throwing string literals instead of Error objects |
| `switch-no-default` | Switch statements without a default case |
| `class-declaration` | All class declarations |
| `async-function` | Async function declarations |
| `export-default` | Default exports |
| `import-star` | Namespace imports (`import * as X`) |
| `catch-rethrow` | Catch blocks that only re-throw the caught error |
| `promise-all` | `Promise.all` calls (check for missing error handling) |
| `boolean-param` | Function parameters typed as `boolean` |
| `magic-number` | Numeric literals (excluding 0 and 1) — potential magic numbers |
| `deep-callback` | Deeply nested arrow function callbacks (3+ levels) |
| `unused-var` | Variable declarations without call expressions (dead code candidates) |

---

## TypeScript pattern matching — best practices

Pattern mode (`-p`) matches the full AST structure. In TypeScript, type annotations are part of the AST, so patterns must account for them or they will silently miss matches.

**Common pitfall:** `async function $NAME($$$PARAMS)` returns 0 matches on functions with return types like `async function foo(): Promise<void>` — the `: Promise<void>` is a required part of the AST shape.

| Scenario | Approach | Why |
|----------|----------|-----|
| Find all functions | `-k function_declaration` | Kind ignores type annotations |
| Find all async functions | `--preset async-function` | Preset uses kind + regex internally |
| Find specific call patterns | `-p 'JSON.parse($X)'` | Call expressions don't have TS types |
| Find method calls | `-p 'console.$M($$$A)'` | Method calls don't have TS types |
| Match including types | `-p 'function $N($P: string): string { $$$B }'` | Must include exact type shape |
| Structural smells | `--preset empty-catch` etc. | Presets are TS-aware by design |

**Rule of thumb:** Use `--kind` or `--preset` for declarations (functions, classes, exports, imports). Use `-p` pattern for call expressions, assignments, and code shapes where type annotations are not involved.

---

## Recommended AST workflow

1. `tree-search.js` to narrow candidate files/functions
2. `search.js` (`--preset`, `-p`, or `-k`) to get structural proof
3. `localGetFileContent`/LSP tools for semantic context and impact

This keeps investigation fast and reduces false positives.

