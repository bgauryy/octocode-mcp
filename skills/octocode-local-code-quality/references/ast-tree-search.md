# AST Tree Search

Use `ast-tree-search.js` to inspect the generated `ast-trees.txt` artifact from one specific scan.

This is the canonical way to read AST snapshot output for agents because it keeps the search pinned to the current scan and bounds noisy output by default.

## When to Use It

- use it after reading `summary.md` when you want fast structure-first triage
- use it before `ast-search.js` when you are still deciding which file deserves deeper source-level inspection
- use it to narrow by node kind, file, or section without accidentally reading a different scan

Do not use it as proof of live-code behavior. After artifact triage, validate important claims with Octocode local and LSP tools.

## Usage

```bash
node scripts/ast-tree-search.js [options]
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

## Recommended Flow

1. Start from the exact `<CURRENT_SCAN>/ast-trees.txt` path shown in `summary.md`.
2. Run a bounded query with `--limit 25` or smaller.
3. Narrow with `--file` or `--section` once you know the suspicious area.
4. Switch to `ast-search.js` when you need source-level structural matching.
5. Validate final claims with Octocode local and LSP tools.

## Examples

```bash
node scripts/ast-tree-search.js -i <CURRENT_SCAN>/ast-trees.txt -k function_declaration --limit 25
node scripts/ast-tree-search.js -i <CURRENT_SCAN>/ast-trees.txt --file 'src/report' -k class_declaration --limit 10
node scripts/ast-tree-search.js -i <CURRENT_SCAN>/ast-trees.txt -p 'IfStatement|SwitchStatement|ForStatement|WhileStatement' --limit 25
node scripts/ast-tree-search.js -i <CURRENT_SCAN>/ast-trees.txt --section 'src/services' -k function_declaration --json
```

## Difference from `ast-search.js`

- `ast-tree-search.js` searches the generated AST artifact for one scan
- `ast-search.js` searches the actual source tree with AST-grep

Use `ast-tree-search.js` to decide where to look. Use `ast-search.js` to prove a source-level structural pattern exists.
