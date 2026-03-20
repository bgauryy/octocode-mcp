# AST Tree Search

Use `ast/tree-search.js` to inspect the generated `ast-trees.txt` artifact from one specific scan.

This is the canonical way to read AST snapshot output for agents because it keeps the search pinned to the current scan and bounds noisy output by default.

## When to Use It

- use it after reading `summary.md` when you want fast structure-first triage
- use it before `ast/search.js` when you are still deciding which file deserves deeper source-level inspection
- use it to narrow by node kind, file, or section without accidentally reading a different scan

Do not use it as proof of live-code behavior. After artifact triage, validate important claims with Octocode local and LSP tools, or with `ast/search.js` for structural confirmation.

## What `ast-trees.txt` Looks Like

Each file gets a `## package — path` header. Nodes are `Kind[startLine:endLine]`, nesting = indentation. Truncated subtrees end with `...`.

```
## my-package — src/services/storage.ts
SourceFile[1:152]
  ImportDeclaration[1:3]
  FunctionDeclaration[10:45]
    Block[11:44]
      IfStatement[12:20] ...
      ReturnStatement[43]
  ExportDeclaration[50:52]
```

This tells you: `storage.ts` has a function spanning lines 10-45 with a conditional inside it. Use this to decide which files and functions deserve source-level inspection.

## Usage

```bash
node <SKILL_DIR>/scripts/ast/tree-search.js [options]
```

Core options:

- `--input, -i <path>`: `ast-trees.txt`, a timestamped scan directory, or the scan root
- `--kind, -k <kind>`: match node kinds such as `function_declaration` or `ClassDeclaration`
- `--pattern, -p <regex>`: regex against AST tree lines
- `--file <regex>`: filter to section file paths that match the regex
- `--section <regex>`: filter to section headers that match the regex
- `--limit <n>`: default `50`; use `0` for all matches
- `--context, -C <n>`: include surrounding lines
- `--json`: machine-readable output
- `--ignore-case`: case-insensitive matching

## Input Resolution

The `-i` flag accepts three kinds of input, resolved automatically:

| Input | What happens | Selection mode |
|-------|-------------|----------------|
| Path to `ast-trees.txt` file | Uses that file directly | `direct-file` |
| Path to a scan directory (e.g., `.octocode/scan/2026-03-19T00-01-19-468Z`) | Looks for `ast-trees.txt` inside it | `scan-dir` |
| Path to scan root (e.g., `.octocode/scan`) | Finds the latest timestamped directory with an `ast-trees.txt` | `latest-scan` |

Default when `-i` is omitted: `.octocode/scan` (resolves to latest scan automatically).

## Recommended Flow

1. Start from `<CURRENT_SCAN>/ast-trees.txt` or just pass `-i .octocode/scan` for the latest.
2. Run a bounded query with `--limit 25` or smaller.
3. Narrow with `--file` or `--section` once you know the suspicious area.
4. Switch to `ast/search.js` when you need source-level structural matching.
5. Validate final claims with Octocode local and LSP tools.

## Examples

```bash
# Find all function declarations (latest scan)
node <SKILL_DIR>/scripts/ast/tree-search.js -i .octocode/scan -k function_declaration --limit 25

# Find classes in a specific file
node <SKILL_DIR>/scripts/ast/tree-search.js -i <CURRENT_SCAN>/ast-trees.txt --file 'src/report' -k class_declaration --limit 10

# Find control flow nodes
node <SKILL_DIR>/scripts/ast/tree-search.js -i <CURRENT_SCAN>/ast-trees.txt -p 'IfStatement|SwitchStatement|ForStatement|WhileStatement' --limit 25

# JSON output for programmatic use
node <SKILL_DIR>/scripts/ast/tree-search.js -i <CURRENT_SCAN>/ast-trees.txt --section 'src/services' -k function_declaration --json

# With context lines to see surrounding tree structure
node <SKILL_DIR>/scripts/ast/tree-search.js -i .octocode/scan -k function_declaration -C 2 --limit 10
```

## Output

### Text (default)

```
AST tree search: kind=function_declaration
Requested input: /path/to/.octocode/scan
Selected AST file: /path/to/.octocode/scan/2026-03-19T00-01-19-468Z/ast-trees.txt (latest-scan)
Matches: 42 total, showing 10 (limit 10)
Matched files: 5

-- my-package — src/services/storage.ts --
  L14 (src/services/storage.ts)    FunctionDeclaration[10:45]
  L68 (src/services/storage.ts)    FunctionDeclaration[50:80]
```

### Text with `--context 2`

```
-- my-package — src/services/storage.ts --
       12 |   ImportDeclaration[1:3]
       13 |   ExportDeclaration[5:8]
 >     14 |   FunctionDeclaration[10:45]
       15 |     ExportKeyword[10]
       16 |     Identifier[10]
```

### JSON (`--json`)

```json
{
  "requestedInput": "/path/to/.octocode/scan",
  "inputFile": "/path/to/.octocode/scan/2026-03-19T.../ast-trees.txt",
  "selectionMode": "latest-scan",
  "query": "kind=function_declaration",
  "limit": 25,
  "totalMatches": 42,
  "returnedMatches": 25,
  "truncated": true,
  "uniqueFiles": 5,
  "matches": [{
    "section": "my-package — src/services/storage.ts",
    "file": "src/services/storage.ts",
    "lineNumber": 14,
    "line": "  FunctionDeclaration[10:45]",
    "context": [{ "lineNumber": 14, "line": "  FunctionDeclaration[10:45]" }]
  }]
}
```

Use `totalMatches` vs `returnedMatches` to know if results are truncated. Use `selectionMode` to confirm which scan was selected.

## Difference from `ast/search.js`

| | `ast/tree-search.js` | `ast/search.js` |
|---|---|---|
| **Searches** | Generated `ast-trees.txt` artifact | Actual source files on disk |
| **Powered by** | Regex / kind matching on text | `@ast-grep/napi` structural matching |
| **Input** | `-i <scan-path>` | `--root <source-dir>` |
| **Best for** | Quick triage — find where to look | Proof — confirm a code pattern exists |
| **Proves behavior** | No — artifact only | Partial — structural shape, not runtime |

Use `ast/tree-search.js` to decide where to look. Use `ast/search.js` to prove a source-level structural pattern exists.
