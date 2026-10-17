## Arm brief: plain gh

Your only tool is Bash, limited to read-only `gh` commands, with no pipes or filters. Allowed
forms: `gh search code|repos|prs|issues|commits …`, `gh repo view`, `gh pr view|diff`,
`gh issue view`, `gh api 'repos/O/R/contents/PATH?ref=SHA' -H 'Accept: application/vnd.github.raw'`,
`gh api 'repos/O/R/git/trees/SHA'`. Keep `--json` field lists minimal; prefer a search hit that
already answers over a whole-file read. One `gh` command per call, no variables or chains. Reads only: mutating commands are refused.
