import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync, binary, root, tempWorkspace, withReasoning } from './helpers.mjs';

/**
 * The reservation rules this package shares with Pi's team (packages/octocode-pi-extension/src/team/lease-key.ts).
 * The vectors are test-utils/agent-coordination/contract.json; Pi's suite runs the same file against its TypeScript.
 */
const contract = JSON.parse(readFileSync(new URL('../../../test-utils/agent-coordination/contract.json', import.meta.url), 'utf8'));
const python = process.env.OCTOCODE_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');

/** The package's own path functions (communication.paths), evaluated for every vector in one interpreter run. */
const functions = JSON.parse(execFileSync(python, ['-B', '-c', `
import json, sys
sys.path.insert(0, ${JSON.stringify(join(root, 'scripts'))})
from communication.paths import lease_key, overlap
from communication.unicode16 import normalize_path_component
contract = json.load(sys.stdin)
print(json.dumps({
    'fold': [normalize_path_component(v['component']) for v in contract['fold']],
    'keys': [lease_key(v['path']) for v in contract['keys']],
    'overlap': [overlap(v['a']['path'], v['a']['kind'], v['b']['path'], v['b']['kind']) for v in contract['overlap']],
}))
`], { input: JSON.stringify(contract), encoding: 'utf8' }));

test('contract vectors: components fold, paths key and reservations overlap as the shared contract says', () => {
  assert.deepEqual(functions.fold, contract.fold.map(v => v.folded));
  assert.deepEqual(functions.keys, contract.keys.map(v => v.key));
  assert.deepEqual(functions.overlap, contract.overlap.map(v => v.overlap));
});

function fixture(t) {
  const workspace = tempWorkspace(t, 'communication-contract-', { real: true }), database = join(workspace, 'communication.sqlite');
  const call = (session, name, input = {}) => JSON.parse(execFileSync(binary, [...name.split(' '), JSON.stringify(withReasoning(name, input)), '--workspace', workspace, '--database', database, ...(session ? ['--session', session] : [])], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }));
  return { call, a: call(null, 'join', { name: 'a', vendor: 'raw' }).id, b: call(null, 'join', { name: 'b', vendor: 'raw' }).id };
}

test('contract vectors: the live lock command refuses exactly the overlapping reservations', t => {
  const f = fixture(t);
  for (const vector of contract.overlap) {
    const held = f.call(f.a, 'lock', vector.a);
    assert.equal(held.ok, true, vector.name);
    const asked = f.call(f.b, 'lock', vector.b);
    assert.equal(asked.ok, !vector.overlap, vector.name);
    f.call(f.a, 'unlock', { leaseId: held.lease.id });
    if (asked.ok) f.call(f.b, 'unlock', { leaseId: asked.lease.id });
  }
});

test('contract vectors: one lock_many call refuses requests that overlap each other and takes nothing', t => {
  const f = fixture(t);
  for (const vector of contract.batches) {
    if (vector.refused) assert.throws(() => f.call(f.a, 'lock_many', { paths: vector.paths }), vector.name);
    else {
      const result = f.call(f.a, 'lock_many', { paths: vector.paths });
      assert.equal(result.ok, true, vector.name);
      for (const lease of result.leases) f.call(f.a, 'unlock', { leaseId: lease.id });
    }
    assert.deepEqual(f.call(f.a, 'locks', { owner: f.a }).items, [], `${vector.name}: nothing stays held`);
  }
});
