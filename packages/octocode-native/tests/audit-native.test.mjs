import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  analyzeSources,
  productionTokens,
  tokensOf,
} from '../scripts/audit-native.mjs';

const settings = { minLines: 2, minTokens: 1 };
const scan = (...texts) =>
  analyzeSources(
    texts.map((text, i) => ({ path: `${i}.rs`, text })),
    settings
  );

test('matches comments/spacing changes, retaining source lines', () => {
  const result = scan(
    'let x = 1;\nlet y = x;',
    '// lead\nlet x=1; // end\n/* nested /* comment */ */ let y=x;'
  );
  assert.equal(result.duplicates.length, 1);
  assert.equal(result.duplicates[0].b.start, 2);
  assert.equal(result.duplicates[0].b.end, 3);
});

test('does not erase literals, raw strings, or characters', () => {
  for (const [a, b] of [
    ['"a b"', '"ab"'],
    ['r#"// /*"#', 'r#"// */"#'],
    ["'x'", "'y'"],
  ]) {
    assert.equal(
      scan(`let x = ${a};\nuse_value(x);`, `let x = ${b};\nuse_value(x);`)
        .duplicates.length,
      0
    );
  }
  assert.deepEqual(
    tokensOf("'a &'static str b'\\n'").map(t => t.value),
    ["'", 'a', '&', "'", 'static', 'str', "b'\\n'"]
  );
});

test('omits cfg(test) items without dropping later production items', () => {
  const source =
    '#[cfg(test)]\nmod tests { fn a() { /* } */ run("}"); } }\nconst LIVE: u8 = 2;';
  assert.equal(
    productionTokens(tokensOf(source))
      .map(t => t.value)
      .join(' '),
    'const LIVE : u8 = 2 ;'
  );
});

test('joins overlapping windows into one maximal candidate', () => {
  const source = 'let a = 1;\nlet b = 2;\nlet c = 3;\nlet d = 4;';
  assert.equal(scan(source, source).duplicates.length, 1);
  assert.equal(scan(source, source).duplicates[0].significantLines, 4);
});

test('finds same-file non-overlapping duplication', () => {
  assert.equal(
    scan('let a = 1;\nlet b = 2;\nlet a = 1;\nlet b = 2;').duplicates.length,
    1
  );
});

test('inventories declarations but not comments or string contents', () => {
  const result = scan(
    '// static FAKE: u8 = 1;\nconst LIMIT: u8 = 1;\nstatic CACHE: X = x;\nlet s = "static FAKE";\nlet key = "OCTOCODE_BETA";\nvalue.clamp(1, 64);'
  );
  assert.deepEqual(
    result.constants.map(c => c.name),
    ['LIMIT']
  );
  assert.deepEqual(
    result.statics.map(c => c.name),
    ['CACHE']
  );
  assert.deepEqual(
    result.environmentLiterals.map(c => c.name),
    ['OCTOCODE_BETA']
  );
  assert.equal(result.policyCandidates.length, 1);
});

test('is deterministic and rejects invalid thresholds and unclosed comments', () => {
  assert.deepEqual(scan('let a=1;'), scan('let a=1;'));
  assert.throws(() => analyzeSources([], { minLines: 0 }), /minLines/);
  assert.throws(() => tokensOf('/* incomplete'), /Unclosed/);
});

test('runs its entry point when called through a symlink', () => {
  const dir = mkdtempSync(join(tmpdir(), 'audit-link-'));
  try {
    const link = join(dir, 'audit-native.mjs');
    symlinkSync(
      fileURLToPath(new URL('../scripts/audit-native.mjs', import.meta.url)),
      link
    );
    const run = spawnSync(process.execPath, [link, '--help'], {
      encoding: 'utf8',
    });
    assert.match(run.stdout, /^Usage: node scripts\/audit-native\.mjs/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
