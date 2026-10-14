import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve, relative, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const digest = text => createHash('sha256').update(text).digest('hex');
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// Lexical candidates only: this does not resolve macros, imports, or cfg expressions.
// Literals retain their exact bytes; comments and inter-token spacing do not.
export function tokensOf(source) {
  const tokens = [];
  let i = 0;
  let line = 1;
  const consume = (end, emit) => {
    const value = source.slice(i, end);
    if (emit) tokens.push({ value, line });
    line += value.split('\n').length - 1;
    i = end;
  };
  while (i < source.length) {
    const tail = source.slice(i);
    const whitespace = /^\s+/.exec(tail);
    if (whitespace) {
      consume(i + whitespace[0].length, false);
      continue;
    }
    if (tail.startsWith('//')) {
      const end = source.indexOf('\n', i);
      consume(end < 0 ? source.length : end, false);
      continue;
    }
    if (tail.startsWith('/*')) {
      let end = i + 2;
      let depth = 1;
      while (end < source.length && depth) {
        if (source.startsWith('/*', end)) {
          depth++;
          end += 2;
        } else if (source.startsWith('*/', end)) {
          depth--;
          end += 2;
        } else end++;
      }
      if (depth) throw new Error(`Unclosed block comment at line ${line}`);
      consume(end, false);
      continue;
    }
    const raw = /^(?:br|cr|r)(#*)"/.exec(tail);
    if (raw) {
      const close = `"${raw[1]}`;
      const end = source.indexOf(close, i + raw[0].length);
      if (end < 0) throw new Error(`Unclosed raw string at line ${line}`);
      consume(end + close.length, true);
      continue;
    }
    const literal =
      /^(?:b|c)?"(?:\\[\s\S]|[^"\\])*"|^(?:b)?'(?:\\u\{[0-9a-fA-F_]+\}|\\x[0-9a-fA-F]{2}|\\[\s\S]|[^'\\\r\n])'/u.exec(
        tail
      );
    const word = /^(?:r#)?[\p{L}_][\p{L}\p{N}_]*|^\d[\w.]*/u.exec(tail);
    consume(i + (literal?.[0].length ?? word?.[0].length ?? 1), true);
  }
  return tokens;
}

// Skip only exact #[cfg(test)] items, retaining production code after the item.
export function productionTokens(tokens) {
  const kept = [];
  for (let i = 0; i < tokens.length;) {
    if (
      tokens
        .slice(i, i + 7)
        .map(t => t.value)
        .join('') !== '#[cfg(test)]'
    ) {
      kept.push(tokens[i++]);
      continue;
    }
    i += 7;
    let braces = 0;
    let brackets = 0;
    let parens = 0;
    while (i < tokens.length) {
      const value = tokens[i++].value;
      if (value === '[') brackets++;
      if (value === ']') brackets--;
      if (value === '(') parens++;
      if (value === ')') parens--;
      if (brackets || parens) continue;
      if (value === '{') braces++;
      if (value === '}' && --braces === 0) break;
      if (value === ';' && braces === 0) break;
    }
  }
  return kept;
}

function linesOf(tokens) {
  const lines = new Map();
  for (const token of tokens) {
    const values = lines.get(token.line) ?? [];
    values.push(token.value);
    lines.set(token.line, values);
  }
  return [...lines]
    .filter(([, values]) => values.some(v => /[\p{L}\p{N}_]/u.test(v)))
    .map(([line, values]) => ({
      line,
      key: JSON.stringify(values),
      count: values.length,
    }));
}

export function analyzeSources(
  sources,
  { minLines = 12, minTokens = 60 } = {}
) {
  if (
    !Number.isInteger(minLines) ||
    minLines < 2 ||
    !Number.isInteger(minTokens) ||
    minTokens < 1
  ) {
    throw new Error(
      'minLines must be an integer >= 2; minTokens must be an integer >= 1'
    );
  }
  const files = sources
    .map(({ path, text }) => {
      const tokens = productionTokens(tokensOf(text));
      return { path, sha256: digest(text), tokens, lines: linesOf(tokens) };
    })
    .sort((a, b) => compare(a.path, b.path));
  const buckets = new Map();
  const constants = [];
  const statics = [];
  const environmentLiterals = [];
  const policyCandidates = [];
  for (const [fileIndex, file] of files.entries()) {
    for (const [i, token] of file.tokens.entries()) {
      const next = file.tokens[i + 1]?.value;
      if (['const', 'static'].includes(token.value)) {
        const name = next === 'mut' ? file.tokens[i + 2]?.value : next;
        if (/^[A-Z][A-Z0-9_]*$/.test(name ?? '')) {
          const entry = { path: file.path, line: token.line, name };
          (token.value === 'static' ? statics : constants).push(entry);
        }
      }
      if (
        /^"(?:OCTOCODE_[A-Z0-9_]+|GH_TOKEN|GITHUB_TOKEN)"$/.test(token.value)
      ) {
        environmentLiterals.push({
          path: file.path,
          line: token.line,
          name: token.value.slice(1, -1),
        });
      }
      if (
        ['clamp', 'unwrap_or'].includes(token.value) &&
        next === '(' &&
        /^\d/.test(file.tokens[i + 2]?.value ?? '')
      ) {
        policyCandidates.push({
          path: file.path,
          line: token.line,
          operation: token.value,
          expression: file.tokens
            .slice(i, i + 10)
            .map(t => t.value)
            .join(' '),
        });
      }
    }
    for (let start = 0; start <= file.lines.length - minLines; start++) {
      const window = file.lines.slice(start, start + minLines);
      if (window.reduce((n, row) => n + row.count, 0) < minTokens) continue;
      const key = digest(window.map(row => row.key).join('\n'));
      const entries = buckets.get(key) ?? [];
      entries.push({ fileIndex, start });
      buckets.set(key, entries);
    }
  }
  const pairs = new Map();
  for (const entries of buckets.values()) {
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const a = entries[i];
        const b = entries[j];
        if (a.fileIndex === b.fileIndex && b.start - a.start < minLines)
          continue;
        const key = `${a.fileIndex}:${b.fileIndex}:${b.start - a.start}`;
        const windows = pairs.get(key) ?? [];
        windows.push({ a: a.start, b: b.start, end: a.start + minLines });
        pairs.set(key, windows);
      }
    }
  }
  const duplicates = [];
  for (const [key, windows] of pairs) {
    const [aIndex, bIndex, delta] = key.split(':').map(Number);
    windows.sort((a, b) => a.a - b.a);
    const runs = [];
    for (const window of windows) {
      const last = runs.at(-1);
      if (last && window.a <= last.end)
        last.end = Math.max(last.end, window.end);
      else runs.push({ ...window });
    }
    for (const run of runs) {
      const location = (file, start, end) => ({
        path: file.path,
        start: file.lines[start].line,
        end: file.lines[end - 1].line,
      });
      duplicates.push({
        significantLines: run.end - run.a,
        a: location(files[aIndex], run.a, run.end),
        b: location(files[bIndex], run.a + delta, run.end + delta),
      });
    }
  }
  duplicates.sort(
    (a, b) =>
      b.significantLines - a.significantLines ||
      compare(a.a.path, b.a.path) ||
      a.a.start - b.a.start
  );
  return {
    files: files.map(({ path, sha256 }) => ({ path, sha256 })),
    duplicates,
    constants,
    statics,
    environmentLiterals,
    policyCandidates,
  };
}

export async function scan(root, options = {}) {
  const sources = [];
  const excluded = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => compare(a.name, b.name));
    for (const entry of entries) {
      const absolute = join(directory, entry.name);
      const path = relative(root, absolute).replaceAll('\\', '/');
      if (entry.isSymbolicLink()) {
        excluded.push({ path, reason: 'symlink' });
        continue;
      }
      if (entry.isDirectory()) {
        if (
          ['target', 'tests', 'benches', 'fixtures', 'test-utils'].includes(
            entry.name
          )
        )
          excluded.push({ path, reason: 'non-production directory' });
        else await visit(absolute);
      } else if (entry.name.endsWith('.rs')) {
        if (
          /(?:^|_)(?:test|tests|bench|benches)(?:_|\.rs)/.test(basename(path))
        ) {
          excluded.push({ path, reason: 'test/benchmark filename' });
          continue;
        }
        const text = await readFile(absolute, 'utf8');
        if (
          /(?:^|\n)\s*\/\/[^\n]*(?:@generated|generated.*do not edit|auto-generated)/i.test(
            text.slice(0, 1000)
          )
        ) {
          excluded.push({ path, reason: 'generated header' });
          continue;
        }
        sources.push({ path, text });
      }
    }
  }
  await visit(join(root, 'crates'));
  return {
    schemaVersion: 1,
    root,
    parameters: { minLines: 12, minTokens: 60, ...options },
    limitations: [
      'Lexical candidates, not semantic duplication or absence proofs.',
      'Rust source in crates only; exact cfg(test) items omitted. Other cfg conditions and macros are not evaluated.',
      'Generated files, dedicated test/benchmark paths, targets, and symlinks are excluded and listed.',
      'Constants, statics, environment literals, and numeric fallbacks require owner/caller review. No automatic fixes.',
    ],
    excluded,
    ...analyzeSources(sources, options),
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const args = process.argv.slice(2);
    if (args.includes('--help')) {
      console.log(
        'Usage: node scripts/audit-native.mjs [--root NATIVE_PACKAGE] [--min-lines N] [--min-tokens N]\nPrints complete JSON to stdout; never edits source. Exit 0 means scan completed, not review passed.'
      );
    } else {
      const options = {};
      let root = resolve(fileURLToPath(new URL('..', import.meta.url)));
      for (let i = 0; i < args.length; i += 2) {
        if (!args[i + 1]) throw new Error(`Missing value for ${args[i]}`);
        if (args[i] === '--root') root = resolve(args[i + 1]);
        else if (args[i] === '--min-lines')
          options.minLines = Number(args[i + 1]);
        else if (args[i] === '--min-tokens')
          options.minTokens = Number(args[i + 1]);
        else throw new Error(`Unknown option ${args[i]}`);
      }
      console.log(JSON.stringify(await scan(root, options), null, 2));
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
