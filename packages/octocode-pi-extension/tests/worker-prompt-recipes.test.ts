import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'vitest';
import { prepareQueryBatch } from '../src/tools/query-envelope.js';
import { preflightMcpQuery } from '../src/tools/mcp-tool.js';
import { MCP_SCHEMA_DISCOVERY_EXAMPLE } from '../src/tools/octocode-tools.js';

test('the former top-level MCP discovery shape is rejected before any operation', async () => {
  await assert.rejects(
    prepareQueryBatch({ server: 'octocode', action: 'describe', tool: 'localSearch' }, { preflight: preflightMcpQuery }),
    /queries must be a non-empty array/,
  );
});

test('the shared discovery recipe passes real MCP batch preflight', async () => {
  const raw = JSON.parse(MCP_SCHEMA_DISCOVERY_EXAMPLE.replace('<catalog-tool-name>', 'localSearch'));
  const queries = await prepareQueryBatch(raw, { preflight: preflightMcpQuery });
  assert.equal(queries.length, 1);
  assert.equal(queries[0]!.action, 'describe');
  assert.equal(queries[0]!.server, 'octocode');
});

for (const role of ['architect', 'implementer', 'planner', 'researcher']) {
  test(`${role} inherits discovery guidance without a duplicate recipe`, () => {
    const source = fs.readFileSync(path.resolve(import.meta.dirname, '../subagents', role, 'SYSTEM_PROMPT.md'), 'utf8');
    assert.match(source, /\{\{OCTOCODE_COORDINATION\}\}/);
    assert.match(source, /\{\{OCTOCODE_SURFACE\}\}/);
    assert.doesNotMatch(source, /MCPTool\(/);
  });
}
