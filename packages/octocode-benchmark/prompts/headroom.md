## Arm brief: gh + Headroom

Your only tool is Bash, limited to `ghc …`, which runs a read-only `gh` command and returns
its output compressed by Headroom, e.g. `ghc search code TERM --repo O/R --limit 20`,
`ghc api 'repos/O/R/contents/PATH?ref=SHA' -H 'Accept: application/vnd.github.raw'`.
Keep `--json` field lists minimal; prefer a search hit that already answers over a whole-file
read. Reads only.
