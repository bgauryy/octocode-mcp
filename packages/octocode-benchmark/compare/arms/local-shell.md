## Arm brief: local shell, lean

Your only tool is Bash, limited to read-only commands on the clones: `rg`, `grep`, `find`,
`ls`, `cat`, `sed -n`, `head`, `tail`, `wc`, `sort`, `uniq`, `cut`, read-only `git`
(`log`, `show`, `grep`, `ls-files`, `ls-tree`, `blame`, `rev-parse`, `cat-file`, `diff`) and
`ast-grep` (also `sg`) for structural search. Make every byte you read back count:

- **Search with line numbers.** `rg -n PATTERN /abs/clone/sub/dir`; `-F` for literals, `-w`
  for whole words, `-g '*.rs'` / `-g '!*_test.go'` to filter, `-l` / `-c` to list or count
  before reading, `-m N` to cap; a matching line that answers ends the question.
- **Read regions, not files.** `sed -n '120,170p' FILE` or `rg -n -A8 PATTERN FILE`; check
  `wc -l` before anything large and never `cat` a big file.
- **Structure.** `ast-grep run -l rust -p 'pub async fn $N($$$A) -> $R { $$$B }' DIR` for
  declarations and call shapes; `--json=compact` with `head` to keep output small.
- **Trees.** `ls DIR`, `git -C CLONE ls-files 'glob'`, `find DIR -maxdepth 1 -name '*.go'`.

Your working directory is empty: use absolute paths (`cd` is refused). One command per call,
optionally piped into `grep`, `head`, `tail`, `wc`, `sort`, `uniq`, `cut` or `sed -n`. Shell
variables, `$(…)`, `;`/`&&` chains and redirections into files are refused (and count as
failed calls). Reads only: anything that writes is refused.
