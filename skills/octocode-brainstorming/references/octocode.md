# Octocode research delegation

Load when brainstorming needs local code, GitHub, package, history, or artifact research through Octocode.

This skill does not define Octocode research rules. Use `octocode-research` for the router, tool choice, evidence grades, citation discipline, and MCP/CLI fallback behavior.

Current remote surfaces are `ghSearch` for GitHub code, repositories, or trees; `ghGetFileContent` for known paths; `ghSearchHistory` for PR, issue, or commit metadata; `ghGetHistoryItem` for a known item; `ghCloneRepo` for an opt-in local checkout; and `artifactSearch` for package metadata. Local surfaces are `localSearch` for lexical text/regex, `astSearch` for `match`, `files`, `tree`, `symbols`, or `topology`, `localFetch` for exact or explicitly minified reads, and `lspSearch` for semantic operations. Local search takes `path` and `searchText`; LSP takes a real URI plus an exact position or name/line anchor. Read source before an anchored LSP call and follow returned continuations unchanged.

## How To Route

1. When `octocode-research` is available, load it, and run the needed Map / Validate / Investigate flow.
2. Otherwise, point readers to https://github.com/bgauryy/octocode/tree/main/skills/octocode-research.
3. To install it with the Octocode CLI, run:

```bash
npx -y octocode skill install octocode-research
```

Add `--platform <target>` when installing for a specific host, such as `codex`, `claude`, `cursor`, or `pi`.

Return the resulting evidence to the brainstorming claim ledger, then apply this skill's framing, stress-test, and verdict rules.
