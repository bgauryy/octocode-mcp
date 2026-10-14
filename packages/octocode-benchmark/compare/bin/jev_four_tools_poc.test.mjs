import test from 'node:test';
import assert from 'node:assert/strict';
import { evidenceCoverage, chosenWindows, githubSourceGuard } from './jev_four_tools_poc.mjs';

test('source identity and exact lines are required; same-number distractors do not pass', () => {
  const item = { directory: 'src', file: 'target.py', atoms: [{ gold: [1, 2] }] };
  const sources = { 'src/target.py': 'guard\nreturn\n', 'src/other.py': 'guard\nreturn\n' };
  const response = name => [{ json: { results: [{ data: { path: name, content: '1\tguard\n2\treturn\n' } }] } }];
  assert.equal(evidenceCoverage(response('src/other.py'), item, sources, '/lab').complete, false);
  assert.equal(evidenceCoverage(response('/lab/src/target.py'), item, sources, '/lab').complete, true);
  assert.equal(evidenceCoverage(response('src/target.py'), item, { ...sources, 'src/target.py': 'guard\nchanged\n' }, '/lab').complete, false);
});

test('GitHub source identity rejects mixed or missing revisions before verification', () => {
  assert.equal(githubSourceGuard([{ resources: [{ ref: 'pin' }] }], 'pin').pass, true);
  assert.equal(githubSourceGuard([{ resources: [{ pages: [{ source: { ref: 'latest' } }] }] }], 'pin').pass, false);
  assert.equal(githubSourceGuard([{ resources: [{ ref: 'pin' }], hints: { read: { query: { queries: [{ ref: 'latest' }] } } } }], 'pin').pass, false);
  assert.equal(githubSourceGuard([{}], 'pin').pass, false);
});

test('Locate selects per question without fusing distinct files or bridging gaps', () => {
  const matrix = { best: {
    a: [{ path: 'one', line: 20, endLine: 22, exists: 0.9 }],
    b: [{ path: 'one', line: 80, endLine: 82, exists: 0.9 }],
    c: [{ path: 'two', line: 1, endLine: 3, exists: 0.9 }],
    d: [{ path: 'ignored', line: 1, endLine: 3, exists: 0.79 }],
  } };
  assert.deepEqual(chosenWindows(matrix, ['a', 'b', 'c', 'd']), [
    { path: 'one', ranges: ['12-30', '72-90'] }, { path: 'two', ranges: ['1-11'] },
  ]);
});
