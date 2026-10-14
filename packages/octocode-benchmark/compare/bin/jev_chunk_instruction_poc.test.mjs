import test from 'node:test';
import assert from 'node:assert/strict';
import { partitions, contextGold, choosePerQuestion, PARTITIONS } from './jev_chunk_instruction_poc.mjs';

test('every partition preserves Unicode, CRLF, long lines, and an unterminated tail exactly', () => {
  const source = '😀'.repeat(2300) + '\r\nfunction a() {\r\n  return 1;\r\n}\r\ntail';
  const lines = source.match(/[^\n]*\n|[^\n]+$/g);
  for (const mode of PARTITIONS) {
    const units = partitions(source, [{ line: 2, endLine: 4 }], mode);
    assert.equal(units.map(unit => lines.slice(unit.start - 1, unit.end).join('')).join(''), source);
    assert.equal(units[0].start, 1);
    for (let i = 1; i < units.length; i++) assert.equal(units[i].start, units[i - 1].end + 1);
  }
});

test('declarations keep small functions whole and nested declarations do not duplicate source', () => {
  const source = ['prefix', '// docs', 'fn outer() {', ' fn nested() {}', '}', 'gap', 'fn next() {}'].join('\n');
  const units = partitions(source, [{ line: 3, docStartLine: 2, endLine: 5 }, { line: 4, endLine: 4 }, { line: 7 }], 'declarations-4k');
  assert.deepEqual(units.map(({ start, end }) => [start, end]), [[1, 5], [6, 7]]);
});

test('verification adds enclosing identity and per-question routing never consults gold', () => {
  const item = { atoms: [{ gold: [8] }, { gold: [20] }] };
  assert.deepEqual(contextGold(item, [{ line: 5, endLine: 10 }]).atoms.map(atom => atom.gold), [[5, 8], [20]]);
  const units = [{ id: 'a', start: 1, end: 10 }, { id: 'b', start: 11, end: 20 }];
  assert.equal(choosePerQuestion(units, { a: { q: 1 }, b: { q: 2 } }, ['q']).q.id, 'b');
  assert.throws(() => choosePerQuestion(units, { a: { q: 1 } }, ['q']), /Missing score/);
});
