import assert from 'node:assert/strict';
import { test } from 'vitest';
import { buildMcpCatalogSnapshot } from '../src/tools/mcp/catalog.js';
import { readMcpCatalogPage, renderMcpRoutingIndex, type McpCatalogPageQuery } from '../src/tools/mcp/catalog-pages.js';

test('an oversized MCP identity produces an explicit terminal diagnostic', () => {
  const snapshot = buildMcpCatalogSnapshot({ cwd: '/tmp/pages', sources: [], configSignatures: {}, servers: [{ name: 'custom', tools: [{ name: 'x'.repeat(8_000), description: 'Description.', inputSchema: {} }] }] });
  const page = readMcpCatalogPage(snapshot);
  assert.equal(page.partial, true);
  assert.equal(page.diagnostic?.code, 'entry-limit');
  assert.equal(page.next, undefined);
  assert.match(renderMcpRoutingIndex(snapshot), /entry-limit/);
});

test('executable continuations cover every tool and reconstruct long descriptions exactly', () => {
  const description = 'Exact routing guidance. '.repeat(1200);
  const snapshot = buildMcpCatalogSnapshot({ cwd: '/tmp/pages', sources: [], configSignatures: {}, servers: [{ name: 'custom', instructions: 'Initialize instructions.', tools: Array.from({ length: 100 }, (_, i) => ({ name: `tool-${i}`, description: i === 0 ? description : `Tool ${i}`, inputSchema: {} })) }] });
  const names = new Set<string>();
  let query: McpCatalogPageQuery = { limit: 7 };
  let reconstructed = '';
  let calls = 0;
  for (;;) {
    assert.ok(++calls < 100);
    const page = readMcpCatalogPage(snapshot, query);
    for (const item of page.items) { if (item.tool) names.add(item.tool); if (item.tool === 'tool-0') reconstructed += item.description; }
    if (!page.next) break;
    assert.equal(page.partial, true);
    assert.equal(page.next.tool, 'MCPTool');
    query = page.next.params.queries[0]!;
  }
  assert.equal(names.size, 100);
  assert.equal(reconstructed, description);
  assert.match(renderMcpRoutingIndex(snapshot), /catalog_continuation/);
  const stale = readMcpCatalogPage(snapshot, { catalogRevision: 'old' });
  assert.equal(stale.diagnostic?.code, 'catalog-revision-changed');
  assert.equal(readMcpCatalogPage(snapshot, stale.next!.params.queries[0]!).diagnostic, undefined);
});
