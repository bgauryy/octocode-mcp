## Arm brief: gh + RTK

Your only tool is Bash, limited to `rtk gh …`: every GitHub read goes through RTK's output
compressor, e.g. `rtk gh search code TERM --repo O/R`, `rtk gh pr view N --repo O/R`,
`rtk gh api 'repos/O/R/contents/PATH?ref=SHA' -H 'Accept: application/vnd.github.raw'`.
Keep `--json` field lists minimal; prefer a search hit that already answers over a whole-file
read. Reads only: mutating commands are refused.
