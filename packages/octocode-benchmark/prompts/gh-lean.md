## Arm brief: gh, lean

Your only tool is Bash, limited to read-only `gh` plus the text filters `grep`, `sed`,
`head`, `tail`, `wc`, `sort`, `uniq`, `cut` and `jq` on gh's output. Make every byte you
read back count:

- **Project, don't dump.** `--json` with only the fields you need, `--jq` to cut them down
  further, `--limit` to cap rows. `gh api … --jq '<expr>'` for API calls.
- **Search with snippets.** `gh search code TERM --repo O/R --json path,textMatches --jq …`;
  a matching fragment that answers ends the question.
- **Read regions, not files.** Raw file media, then a filter:
  `gh api 'repos/O/R/contents/PATH?ref=SHA' -H 'Accept: application/vnd.github.raw' | grep -n 'symbol'`
  and `… | sed -n '120,170p'`. Never base64 `--jq .content`.
- **Trees by path.** `gh api 'repos/O/R/git/trees/SHA:sub/dir' --jq '.tree[].path'`; add
  `?recursive=1` only on a narrow subtree you truly need.
- **History.** `gh search prs|issues|commits … --json …`, `gh pr view N --repo O/R --json files,title`,
  `gh pr diff N --repo O/R | grep -n …`, `gh api repos/O/R/compare/A...B --jq …`.

One command per call: `gh …` alone or piped into the filters above. Shell variables,
`$(…)`, `cd`, `;`/`&&` chains and temp files are refused (and count as failed calls), so put
a SHA you found straight into the next command. Reads only: mutating commands are refused.
