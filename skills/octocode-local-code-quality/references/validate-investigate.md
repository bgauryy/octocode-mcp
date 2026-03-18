# Validate & Investigate

**Do not fix based on scan output alone.** Validate each finding with Octocode MCP tools before changing code.

---

## MCP Availability

Try `localSearchCode` first. If it fails → Octocode not installed or `ENABLE_LOCAL ≠ "true"`.
- Suggest once: "Enable local tools by setting `ENABLE_LOCAL=true` in your Octocode MCP config."
- **Without MCP**: trust scan evidence, validate with targeted file reads, mark confidence (`high`/`medium`/`low`), avoid broad refactors.

---

## Tool Chain

```
1. localSearchCode(pattern)         → get lineHint (1-indexed)
2. lspGotoDefinition(lineHint)      → jump to definition
3. lspFindReferences(lineHint)      → all usages (types, variables, exports)
4. lspCallHierarchy(lineHint, dir)  → call flow (functions only: incoming/outgoing)
5. localGetFileContent              → read implementation (ALWAYS LAST)
```

**Rules:**
- `lspFindReferences` for types/variables; `lspCallHierarchy` for function calls only
- Batch: `localSearchCode` up to 5/call, LSP tools 3–5
- Use `lspCallHierarchy(depth=1)` and chain manually
- External packages: `packageSearch` → `githubSearchCode`

---

## Investigation Loop

1. Read finding: `file`, `lineStart`, `category`, `reason`, `suggestedFix`
2. Check `lspHints[]` — if present, use the suggested tool/symbol/line directly
3. Otherwise: `localSearchCode` for symbol → get `lineHint`
4. LSP tools with `lineHint`
5. Cross-check `fileInventory` and related findings in same file
6. Follow `suggestedFix.steps`
7. After fix, re-run scan and compare counts

---

## lspHints Validation (Semantic Findings)

Semantic findings include `lspHints[]` with pre-computed validation instructions:

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

Use directly: `lspFindReferences(file, lineHint)` → compare with `expectedResult`. No `localSearchCode` step needed — the hint provides the exact position.
