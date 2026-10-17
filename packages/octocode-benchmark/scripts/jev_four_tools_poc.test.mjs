import test from 'node:test';
import assert from 'node:assert/strict';
import { evidenceCoverage } from './jev_four_tools_poc.mjs';

test('source identity and exact lines are required; same-number distractors do not pass', () => {
  const item = { directory: 'src', file: 'target.py', atoms: [{ gold: [1, 2] }] };
  const sources = { 'src/target.py': 'guard\nreturn\n', 'src/other.py': 'guard\nreturn\n' };
  const response = name => [{ json: { results: [{ data: { path: name, content: '1\tguard\n2\treturn\n' } }] } }];
  assert.equal(evidenceCoverage(response('src/other.py'), item, sources, '/lab').complete, false);
  assert.equal(evidenceCoverage(response('/lab/src/target.py'), item, sources, '/lab').complete, true);
  assert.equal(evidenceCoverage(response('src/target.py'), item, { ...sources, 'src/target.py': 'guard\nchanged\n' }, '/lab').complete, false);
});
