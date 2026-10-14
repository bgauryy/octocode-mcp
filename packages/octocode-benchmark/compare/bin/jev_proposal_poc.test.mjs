import test from 'node:test';
import assert from 'node:assert/strict';
import { chunks, successfulSlots, addContext, arrival } from './jev_proposal_poc.mjs';
import { cases } from '../jev-proposal-poc/cases.mjs';
import { summarize } from './jev_proposal_poc_summary.mjs';

test('candidate chunk partition preserves UTF-8, CRLF and terminal bytes', () => {
  for (const text of ['', 'tail', 'a\r\nb\n尾', '界'.repeat(3000) + '\nlast', 'a\nb\nc\n']) {
    const parts = chunks(text, true);
    assert.equal(parts.map(x => x.text).join(''), text);
    assert.equal(new Set(parts.flatMap(x => x.lines)).size, parts.flatMap(x => x.lines).length);
  }
  const before = chunks('complete\ntail');
  const after = chunks('complete\ntail', true);
  assert.equal(before.filter(x => x.eligible).length, 0);
  assert.deepEqual(after.map(x => x.eligible), [true, false]);
  assert.equal(chunks('x'.repeat(2500) + '\n', true)[0].eligible, true);
});

test('successful slots preserve unknowns and stable ties without losing ordinals', () => {
  assert.deepEqual(successfulSlots(4, new Map([[1, 0], [2, 2]])), [0, 2, 1, 3]);
  assert.deepEqual(successfulSlots(3, new Map([[0, 1], [1, 1], [2, 1]])), [0, 1, 2]);
  assert.deepEqual(successfulSlots(3, new Map()), [0, 1, 2]);
  assert.throws(() => successfulSlots(3, new Map([[3, 2]])));
  assert.throws(() => successfulSlots(3, new Map([[1, NaN]])));
});

test('context remains in selected source, bounded and target-identifiable', () => {
  for (const item of cases()) {
    const parts = chunks(item.source);
    assert.equal(parts.length, 4);
    for (const unit of parts) for (const cap of [2048, 4096, 8192]) {
      const target = { sourceLines: unit.lines, content: unit.text };
      const enriched = addContext(target, item.source, cap);
      assert.equal(enriched.content, unit.text);
      const combined = enriched.contextBefore + enriched.content + enriched.contextAfter;
      assert.ok(Array.from(combined).length <= cap);
      assert.ok(item.source.includes(combined));
    }
  }
});

test('arrival requires every gold line; absence requires complete traversal', () => {
  const pages = [{ content: '2\tcondition\n' }, { content: '7\tconsequence\n' }];
  assert.equal(arrival(pages, [2, 7]).page, 2);
  assert.equal(arrival(pages, [2, 8]).page, null);
  assert.equal(arrival(pages, []).page, 2);
});

test('summary preserves failed cases and unknown usage and uses paired ratios', () => {
  const results = [
    { case: 'a', arm: 'native-2k', coverage: true, page: 2, responseChars: 100, providerCalls: 1, inputTokens: 10 },
    { case: 'b', arm: 'native-2k', coverage: true, page: 2, responseChars: 1000, providerCalls: 1, inputTokens: 10 },
    { case: 'a', arm: 'candidate', coverage: true, page: 1, responseChars: 50, providerCalls: 1, inputTokens: null },
    { case: 'b', arm: 'candidate', error: 'timeout' },
  ];
  const candidate = summarize({ mode: 'live', results }).arms.find(x => x.arm === 'candidate');
  assert.equal(candidate.attempted, 2);
  assert.equal(candidate.failed, 1);
  assert.equal(candidate.inputTokens, null);
  assert.equal(candidate.medianPairedResponseRatio, 0.5);
});
