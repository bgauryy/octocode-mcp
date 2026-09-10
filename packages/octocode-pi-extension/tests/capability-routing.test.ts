import assert from 'node:assert/strict';
import { test } from 'vitest';
import { buildMcpCatalogSnapshot, findMcpCatalogTool, renderMcpCatalogIndex } from '../src/tools/mcp/catalog.js';

test('startup routes by exact descriptions while describe retains the complete schema', () => {
  const inputSchema = { type: 'object', required: ['secretFieldName'], properties: { secretFieldName: { type: 'string', minLength: 5 } } };
  const snapshot = buildMcpCatalogSnapshot({ cwd: '/tmp/routing', sources: [], configSignatures: { custom: 'v1' }, servers: [{ name: 'custom', instructions: 'User server guidance.', tools: [{ name: 'search', description: 'Search the custom service.', inputSchema }] }] });
  const prompt = renderMcpCatalogIndex(snapshot);
  assert.match(prompt, /User server guidance/);
  assert.match(prompt, /Search the custom service/);
  assert.match(prompt, /action:"describe"/);
  assert.doesNotMatch(prompt, /secretFieldName|minLength/);
  assert.deepEqual(findMcpCatalogTool(snapshot, 'custom', 'search')?.inputSchema, inputSchema);
});
