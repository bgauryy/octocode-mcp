# Proof Ladder

Load before converting a graph hypothesis into a finding. Why: file topology cannot prove symbol identity, runtime behavior, or safe deletion.

```text
graph candidate
→ exact-read every decisive import/export edge
→ AST structural search for import kind/code shape
→ LSP definition/references/callers/callees for symbol identity
→ configs, tests, diagnostics, build, or runtime check
→ confirmed | likely | candidate | dismissed
```

## Tool roles

- `localFetch`: exact content is the default; use `minify:"none"` explicitly when documenting the intent, with `matchString` or a line range for bounded imports, exports, registrations, and anchors. Path-only reads are valid; exhaust returned continuations. In match results, `matchedLines` are exact anchors and `matchRanges` include context padding.
- `astSearch operation:"match"`: distinguish code shapes; use `pattern` or YAML `rule`, and prefer `rule: kind: …` when fragment parsing is unreliable.
- `lspSearch`: prove definitions, references, callers/callees, symbols, and diagnostics when a semantic provider is available. Check `lsp.source`, completeness, and terminal/partial state; native graph-facts results are syntactic evidence. Use `includeDeclaration:false` for unused claims.
- Text search: cover configs, strings, scripts, tests, reflection, generated registries, and LSP blind spots; lexical hits do not prove identity.

## Claim gates

- First apply every relevant control from `references/false-positive-controls.md`; unresolved scope/runtime alternates cap confidence at candidate.
- Cycle issue: start with the directed `runtimeCycleEdges` witness, exact-read each reported import, then show a concrete loading or maintenance impact; type-only cycles alone are not runtime-cycle proof.
- Dominator issue: explicit roots plus exact alternate-path/config search; a syntactic dominator is not proof that runtime traffic must pass through the file.
- Redundant edge: condensation `transitiveEdge:true` plus exact binding and side-effect comparison before removal.
- Affected scope: graph dependents/path plus LSP references/callers for the symbol under change.
- Layer violation: exact path, importing symbol, and an authoritative layer rule.
- Dead code/delete: explicit entrypoints and tests policy, exact export/re-export chain, LSP excluding declarations, broad text/config search, then tests/build.
- Coupling/god module: graph breadth plus mixed AST responsibilities and semantic callers/callees; file size alone is insufficient.

Distinguish a successful empty LSP result from unsupported, error, and partial states. Empty means no results in that completed query scope; the other states leave the semantic question unresolved. Use exact reads, structural/configuration evidence, and relevant checks to address gaps, and retain uncertainty when identity remains unresolved. Inspect pagination and graph warnings before a negative claim. Verification is green only when the command exit status is zero. Then load `references/output.md` to keep candidates separate from findings.
