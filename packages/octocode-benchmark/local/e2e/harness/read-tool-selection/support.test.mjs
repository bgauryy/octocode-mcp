import assert from 'node:assert/strict';
import test from 'node:test';
import { walk } from './support.mjs';

test('selected paging excludes recovery branches while preserving every selected page', async () => {
  const tool = 'localFetch';
  const recovery = { tool, query: { queries: [{ path: 'unknown.txt' }] } };
  const calls = [];
  const ctx = {
    calls: () => 0,
    async cliArgs(args) {
      const input = JSON.parse(args[1]);
      const page = input.queries[0].offset ?? 0;
      calls.push(input);
      assert.ok(page === 0 || page === 1);
      assert.equal(input.queries[0].path, 'selected.txt');
      return { json: { results: [{ data: {
        path: 'selected.txt', content: `${page + 1}\tselected ${page}\n`,
        next: {
          unfiltered: recovery,
          unfilteredUnknown: recovery,
          unfilteredUnknown2: recovery,
          ...(page === 0 ? { continueWindow: {
            tool, query: { queries: [{ path: 'selected.txt', offset: 1 }] },
          } } : {}),
        },
      } }] } };
    },
  };
  const result = await walk(ctx, { tool, kind: 'source' }, { path: 'selected.txt' });
  assert.equal(calls.length, 2);
  assert.equal(result.rows.length, 2);
  assert.deepEqual(result.edges.map(edge => edge.kind), ['continueWindow']);
});

test('a repeated selected-page edge still fails', async () => {
  const tool = 'localFetch';
  const query = { queries: [{ path: 'selected.txt' }] };
  const ctx = {
    calls: () => 0,
    async cliArgs() {
      return { json: { results: [{ data: {
        path: 'selected.txt', content: '1\tselected\n',
        next: { continueWindow: { tool, query } },
      } }] } };
    },
  };
  await assert.rejects(
    walk(ctx, { tool, kind: 'source' }, query.queries[0]),
    /repeated continuation edge/
  );
});
