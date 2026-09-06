import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'vitest';
import { prepareQueryBatch } from '../src/tools/query-envelope.js';
import { preflightMcpQuery } from '../src/tools/mcp-tool.js';

test('the former top-level MCP discovery shape is rejected before any operation', async () => {
  await assert.rejects(
    prepareQueryBatch({ server: 'octocode', action: 'describe', tool: 'localSearch' }, { preflight: preflightMcpQuery }),
    /queries must be a non-empty array/,
  );
});

for (const role of ['architect', 'planner', 'researcher']) {
  test(`${role} research recipe passes the real MCP batch preflight`, async () => {
    const source = fs.readFileSync(path.resolve(import.meta.dirname, '../subagents', role, 'SYSTEM_PROMPT.md'), 'utf8');
    const recipes = [...source.matchAll(/MCPTool\(([^\n]+)\)/g)];
    assert.ok(recipes.length > 0, 'the worker has an executable discovery recipe');
    for (const [, recipe] of recipes) {
      const raw = JSON.parse(recipe!);
      const queries = await prepareQueryBatch(raw, { preflight: preflightMcpQuery });
      assert.equal(queries.length, 1);
      assert.equal(queries[0]!.action, 'describe');
      assert.equal(queries[0]!.server, 'octocode');
    }
  });
}
