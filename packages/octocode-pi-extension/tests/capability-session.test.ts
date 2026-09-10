import assert from 'node:assert/strict';
import { test } from 'vitest';
import { buildEffectiveCapabilitySnapshot } from '../src/tools/capability-session.js';
import { buildMcpCatalogSnapshot } from '../src/tools/mcp/catalog.js';

test('effective revision is stable across order/time and changes with schema or enabled capabilities', () => {
  const mcp = buildMcpCatalogSnapshot({ cwd: '/tmp/capabilities', sources: [], configSignatures: { custom: '1' }, servers: [{ name: 'custom', instructions: 'Search safely.', tools: [{ name: 'search', inputSchema: { type: 'object' } }] }] });
  const first = buildEffectiveCapabilitySnapshot(['skill', 'MCPTool'], [], mcp);
  assert.equal(first.revision, buildEffectiveCapabilitySnapshot(['MCPTool', 'skill'], [], { ...mcp, capturedAt: 'tomorrow' }).revision);
  assert.notEqual(first.revision, buildEffectiveCapabilitySnapshot(['skill'], [], mcp).revision);
  const updated = structuredClone(mcp);
  updated.servers[0]!.tools[0]!.description = 'Search custom records.';
  assert.notEqual(first.revision, buildEffectiveCapabilitySnapshot(['skill', 'MCPTool'], [], updated).revision);
  assert.equal(first.mcpTools[0]?.instructions, 'Search safely.');
});
