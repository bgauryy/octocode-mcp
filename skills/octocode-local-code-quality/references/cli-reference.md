# CLI Reference

```bash
node <SKILL_BASE_DIRECTORY>/scripts/index.js [flags]
```

Output goes to `.octocode/scan/<timestamp>/` by default. Results are cached — subsequent runs skip unchanged files (~4x faster).

---

## CLI Presets

| Situation | Flags |
|---|---|
| Default scan | _(none)_ |
| Scope to one package | `--scope=packages/octocode-mcp` |
| Scope to a directory | `--scope=packages/octocode-mcp/src/tools` |
| Scope to a single file | `--scope=packages/octocode-mcp/src/session.ts` |
| Scope to a function | `--scope=packages/octocode-mcp/src/session.ts:initSession` |
| Scope to a variable/export | `--scope=packages/octocode-mcp/src/config.ts:DEFAULT_OPTS` |
| Scope to multiple areas | `--scope=packages/foo/src/tools,packages/bar/src/ui` |
| Architecture only | `--features=architecture` |
| Code quality only | `--features=code-quality` |
| Dead code only | `--features=dead-code` |
| Single category | `--features=cognitive-complexity` |
| Mix pillars + categories | `--features=dead-code,dependency-cycle` |
| Everything except X | `--exclude=architecture` |
| Exclude specific categories | `--exclude=dead-export,magic-number` |
| Cap findings | `--findings-limit 500` |
| Include tests | `--include-tests` |
| Architecture graph | `--graph` |
| Strict complexity | `--critical-complexity-threshold 20 --cognitive-complexity-threshold 10` |
| Strict type safety | `--any-threshold 0` |
| Strict maintainability | `--maintainability-index-threshold 30 --halstead-effort-threshold 200000` |
| Layer enforcement | `--layer-order ui,service,repository` |
| Sensitive flow dups | `--flow-dup-threshold 2 --min-flow-statements 4` |
| Diverse top recs | `--max-recs-per-category 1` |
| Enable semantic analysis | `--semantic` |
| Semantic + scope combo | `--semantic --scope=packages/octocode-mcp` |
| Only semantic categories | `--semantic --features=unused-parameter,shotgun-surgery` |
| Deep hierarchy threshold | `--semantic --type-hierarchy-threshold 6` |
| Force full re-parse | `--no-cache` |
| Clear cache | `--clear-cache` |
| JSON to stdout | `--json` |

---

## Flag Details

`--scope` focuses on specific paths (comma-separated, relative to root). Use `file:symbol` syntax to drill into a specific function or exported variable — only findings whose line range overlaps with that symbol are returned. The full dependency graph is still built so architecture findings involving scoped files are reported. Combinable with `--features`/`--exclude`.

`--features` and `--exclude` are mutually exclusive. Both accept pillar names (`architecture`, `code-quality`, `dead-code`) and individual category names, comma-separated.

`--semantic` enables TypeChecker + LanguageService analysis (13 additional categories). Off by default since it adds ~3-5s. Semantic categories require `--semantic` to appear in results.

---

## Drill-Down Workflow

```
1. Full scan                     → identify hotspots from summary.md
2. --scope=critical/area         → deep-dive into the worst package/directory
3. --scope=file.ts               → investigate a single file's findings
4. --scope=file.ts:functionName  → drill into a specific function or variable
5. Fix → re-scan with scope      → verify finding count drops
```
