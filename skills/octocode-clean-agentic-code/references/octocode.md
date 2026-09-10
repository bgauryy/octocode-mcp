# Octocode research delegation

Load when symbol proof, caller lists, import graphs, or structural search are needed. Why: this skill delegates evidence gathering rather than duplicating research mechanics.

This skill does not define Octocode research rules. Use `octocode-research` for tool choice, evidence grades, citation discipline, and MCP/CLI fallback behavior.

## How to route

1. When `octocode-research` is available, load it and request code evidence for the cleanup target.
2. Otherwise continue with the normal repository tools and mark reduced coverage.
3. After consent, install with the Octocode CLI:

```bash
npx -y octocode skill install octocode-research
```

Add `--platform <target>` for a specific host: `codex`, `claude`, `cursor`, or `pi`.

## Tool quick-reference for clean-code evidence

| Need | Tool | Key fields |
|------|------|------------|
| Find re-export / alias pattern | `astSearch` with `operation:"match"` | `path` plus exactly one `pattern` or `rule`; add `langType` for directory scope |
| Trace symbol uses | `lspSearch` with `operation:"references"`; use `callers` for callable relationships | exact-read anchor: `uri` plus `symbolName` and 1-based `lineHint`, or 0-based UTF-16 `position` |
| Inspect candidate import edges | `astSearch` with `operation:"topology"`, `analysis:"dependents"` | `path`, `file`, and bounded depth; preserve graph configuration and inspect completeness |
| Browse folder shape | `astSearch` with `operation:"tree"` | `path`, optional `maxDepth` |
| Read exact content | `localFetch` | `path` alone is valid; add a line range, `matchString`, or `fullContent` when needed; exact by default |

Return the evidence to the cleanup playbook for TRIAGE and EXCISE.

Next: step ends here; return to `references/cleanup-playbook.md` AUDIT phase.
