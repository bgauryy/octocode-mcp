import assert from 'node:assert/strict';
import { test } from 'vitest';
import { renderFooterView } from '../src/tui/footer-view.js';
import { visibleWidth } from '../src/tui/width.js';

test('renders exactly one physical line per selected semantic row', () => {
  const lines = renderFooterView({
    rows: [
      [{ text: 'Needs you' }, { text: 'Review permission' }, { text: '/configuration', attention: true }],
      [{ text: 'Plan' }, { text: '3 done' }, { text: '2 active' }, { text: '1 ready' }],
    ],
  }, { width: 36 });
  assert.equal(lines.length, 2);
  assert.match(lines[0]!, /Needs you/);
  assert.match(lines[1]!, /Plan/);
  for (const line of lines) assert.ok(visibleWidth(line) <= 36);
});

test('preserves state and action route before optional tail detail in narrow panes', () => {
  const lines = renderFooterView({
    rows: [[
      { text: 'Blocked', attention: true },
      { text: 'atlas', attention: true },
      { text: '/octocode-inbox', attention: true },
      { text: 'a very long explanation that is available in the inbox' },
    ]],
  }, { width: 28 });
  assert.equal(lines.length, 1);
  assert.match(lines[0]!, /Blocked/);
  assert.match(lines[0]!, /inbox/);
  assert.ok(visibleWidth(lines[0]!) <= 28);
});

test('keeps urgent context and its detail route visible in a narrow row', () => {
  const lines = renderFooterView({
    rows: [[
      { text: 'ctx 96%', attention: true },
      { text: '/configuration', attention: true },
      { text: 'Working · task 2 Implement' },
    ]],
  }, { width: 20 });
  assert.equal(lines.length, 1);
  assert.match(lines[0]!, /ctx 96%/);
  assert.match(lines[0]!, /config/);
  assert.ok(visibleWidth(lines[0]!) <= 20);
});

test('drops empty rows and preserves policy-owned row order', () => {
  const lines = renderFooterView({
    rows: [[], [{ text: '' }], [{ text: 'Working' }], [{ text: 'Plan 1/3' }]],
  }, { width: 80 });
  assert.deepEqual(lines, ['Working', 'Plan 1/3']);
});

test('is cell-width safe for ASCII, CJK, emoji, combining characters, and ANSI labels', () => {
  const labels = [
    'a very long ASCII status label with a route /octocode-inbox',
    '正在验证仓库状态并等待用户确认',
    'worker 🚀 blocked · open inbox',
    'Cafe\u0301 verification running',
    '\u001b[31mfailed\u001b[0m · inspect transcript',
  ];
  for (const width of [20, 28, 36, 52, 80, 120, 160]) {
    const lines = renderFooterView({ rows: labels.map((text) => [{ text }]) }, { width });
    assert.equal(lines.length, labels.length);
    for (const line of lines) assert.ok(visibleWidth(line) <= width, `${width}: ${line}`);
  }
});

test('non-attention routes appear after content segments', () => {
  const lines = renderFooterView({
    rows: [[
      { text: 'Plan 3/6', token: 'brand' as const },
      { text: 'task 2 Implement feature', token: 'muted' as const },
      { text: '/octocode-inbox', token: 'link' as const },  // no attention — should be last
    ]],
  }, { width: 80 });
  assert.equal(lines.length, 1);
  const line = lines[0]!;
  // compactRoute maps /octocode-inbox → inbox in the rendered output
  assert.ok(line.indexOf('task 2') < line.indexOf('inbox'),
    'content segment appears before non-attention route');
  assert.match(line, /Plan 3\/6/);
  assert.match(line, /task 2 Implement/);
  // compactRoute maps /octocode-inbox → inbox in the rendered output
  assert.match(line, /inbox/);
});

test('heartbeat text changes do not change footer height', () => {
  const before = renderFooterView({ rows: [[{ text: 'Working · 14s' }], [{ text: 'Plan 1/3' }]] }, { width: 52 });
  const after = renderFooterView({ rows: [[{ text: 'Working · 15s' }], [{ text: 'Plan 1/3' }]] }, { width: 52 });
  assert.equal(after.length, before.length);
});
