# Octocode research delegation

Load when skill discovery or comparison needs local workspace, GitHub, package, or code research. Why: this skill judges/installs skills — it does not own Octocode research rules.

Use `octocode-research` for router, tool choice, evidence grades, citations, and Octocode MCP/CLI fallback.

1. IF `octocode-research` is available THEN load it for local and external research; it owns evidence routing.
2. ELSE IF the `octocode` CLI or Octocode MCP tools are available THEN use them directly:
   - local text: `localSearch` (no `operation`); structure: `astSearch` with `match`, `files`, `tree`, `symbols`, or `topology`; exact source: `localGetFileContent`; scoped semantics: `lspSearch`.
   - GitHub: `octocode tools ghSearch --queries '{"operation":"code","keywords":["<query>"],"owner":"<owner>","repo":"<repo>"}' --compact`
   - packages: `octocode tools npmSearch --queries '{"packageName":"<package>"}' --compact`
   Read `octocode tools <name> --scheme` for an unfamiliar tool or changed version; reuse a schema already inspected. Exact-read before anchored LSP: `uri` plus `symbolName` and 1-based `lineHint`, or 0-based UTF-16 `position`. Document/workspace operations use their own schema scopes. Follow returned executable continuations; partial or failed queries do not prove absence.
3. ELSE point to https://github.com/bgauryy/octocode/tree/main/skills/octocode-research. If installation is authorized, use `npx -y octocode skill install octocode-research` (add `--platform <host>` for a specific host); ask only when source or destination authority is missing.

`octocode skill list` discovers official installable skills; `octocode-research` covers local, GitHub, npm, PR, and history research.

Return found skill folders here for review, quality scoring, adaptation, install gating, and recommendations.

Next: when fanning out load `references/search-playbook.md`; after inspection load `references/quality-rubric.md`.
