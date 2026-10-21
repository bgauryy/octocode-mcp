import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createQueryDefaults } from './query-defaults.mjs';

test('canonical row schemas own defaults independently of envelope branches', () => {
  const defaults = createQueryDefaults([{
    name: 'lookup',
    querySchema: {
      $defs: { Count: { type: 'integer', default: 7 } },
      type: 'object', properties: { count: { $ref: '#/$defs/Count' } },
    },
    inputSchema: { anyOf: [{ properties: { responseSnapshot: { type: 'string' } } }] },
  }]);
  assert.deepEqual(defaults('lookup', {}), { count: 7 });
});

test('envelope fallback follows referenced alternatives and skips forbidden queries', () => {
  const inputSchema = {
    $defs: {
      Row: { type: 'object', properties: { pageSize: { type: 'integer', default: 9 } } },
      Fresh: { properties: { queries: { type: 'array', items: { $ref: '#/$defs/Row' } } } },
    },
    anyOf: [
      { $ref: '#/$defs/Fresh' },
      { properties: { queries: { not: {} }, responseSnapshot: { type: 'string' } } },
    ],
  };
  assert.deepEqual(createQueryDefaults([{ name: 'lookup', inputSchema }])('lookup', {}), { pageSize: 9 });
});

test('regenerated contract defaults work for every registered tool', () => {
  const contract = JSON.parse(readFileSync(new URL('../../../../octocode-config/contract/tool-contract.json', import.meta.url), 'utf8'));
  const canonical = createQueryDefaults(contract.tools);
  const envelope = createQueryDefaults(contract.tools.map(({ name, inputSchema }) => ({ name, inputSchema })));
  for (const tool of contract.tools) {
    assert.doesNotThrow(() => canonical(tool.name, {}), tool.name);
    assert.doesNotThrow(() => envelope(tool.name, {}), tool.name);
  }
  const query = { owner: 'bgauryy', repo: 'octocode' };
  assert.equal(canonical('ghCloneRepo', query).historyDepth, 1);
  assert.deepEqual(envelope('ghCloneRepo', query), canonical('ghCloneRepo', query));
});
