import { describe, expect, it } from 'vitest';
import { readOnlyCommand } from '../src/permission/shell.js';

describe('readOnlyCommand', () => {
  it.each([
    'cat src/a.ts',
    'ls -la && pwd',
    'grep -rn "foo" src | head -20',
    'rg --files | sort | uniq -c',
    'git log --oneline -n 20',
    'git diff HEAD~1 -- src',
    'find . -name "*.ts" -type f',
    'wc -l *.ts 2>&1',
    'cat x 2>/dev/null',
    'cd packages/a && git status',
    'echo "a > b"',
    'cat $(git ls-files | head -3)',
    'cat a >&2',
    'cat a > /dev/null 2>&1',
    'cat a &>/dev/null',
    'uniq in',
    'sort -u -k2,2 in | uniq -f 1 -c',
    'sort -rn in',
    'file -b x',
    'git log --oneline --format=%h -n 3',
    'git grep -n -e foo -- src',
    'tree -L 2 -a',
    'date -u +%s',
  ])('accepts %s', (command) => {
    expect(readOnlyCommand(command)).toBe(true);
  });

  it.each([
    ['', 'an empty command'],
    ['npm install', 'a program that is not on the list'],
    ['cat a > b', 'a redirect into a file'],
    ['echo x >> log.txt', 'an append to a file'],
    ['ls | tee out.txt', 'tee'],
    ['git commit -am x', 'a git subcommand that writes'],
    ['git diff --output=patch.diff', 'a git option that writes a file'],
    ['git -c core.pager=x log', 'a git option before the subcommand'],
    ['find . -name x -delete', 'find -delete'],
    ['find . -exec rm {} ;', 'find -exec'],
    ['sort -o out.txt in.txt', 'sort -o'],
    ['rg --pre ./run pattern', 'rg --pre'],
    ['sh -c "cat a"', 'a shell given a script'],
    ['./script.sh', 'a program given by path'],
    ['/bin/cat a', 'a program given by absolute path'],
    ['cat a; rm b', 'a writer after a reader'],
    ['cat $(rm b)', 'a writer in a substitution'],
    ['sed -i s/a/b/ f', 'sed -i'],
    ['sort -ofile in', 'sort -o with its file attached'],
    ['sort -ro file in', 'sort -o in a cluster'],
    ['sort --out=file in', 'an abbreviated sort --output'],
    ['sort --compress-program=./x in', 'sort --compress-program'],
    ['tree -ofile', 'tree -o with its file attached'],
    ['uniq in out', 'uniq with an output operand'],
    ['uniq -c in out', 'uniq -c with an output operand'],
    ['cat a >&2file', 'a redirect to a file named like a descriptor'],
    ['cat a >/dev/nullx', 'a redirect to a file with the prefix /dev/null'],
    ['cat a > /dev/null/../../tmp/x', 'a redirect through /dev/null/..'],
    ['git grep -O"rm x" foo', 'git grep -O, a pager command'],
    ['git grep --open-files-in-pager=less foo', 'git grep --open-files-in-pager'],
    ['git diff --ext-diff', 'git diff --ext-diff'],
    ['git diff --ext', 'an abbreviated git --ext-diff'],
    ['git diff --textconv', 'git --textconv'],
    ['file -C -m x', 'file -C, which writes a compiled magic file'],
    ['date -s "2020-01-01"', 'date -s'],
  ])('rejects %s (%s)', (command) => {
    expect(readOnlyCommand(command)).toBe(false);
  });
});
