import { describe, expect, it } from 'vitest';
import { LSP_SEARCH_TOOL_NAME } from '@octocodeai/octocode-core/schema';
import {
  BulkLspSearchSchema,
  LspSearchQuerySchema,
} from '@octocodeai/octocode-core/schema';
import { ALL_TOOLS } from '../../src/tools/toolConfig.js';
import { createMockMcpServer } from '../fixtures/mcp-fixtures.js';

const removedLspToolNames = [
  `lsp${'Goto'}Definition`,
  `lsp${'Find'}References`,
  `lsp${'Call'}Hierarchy`,
];

describe('new public LSP tools', () => {
  it('advertises only lspSearch without removed LSP tools', () => {
    const names = ALL_TOOLS.map(tool => tool.name);

    expect(names).toContain(LSP_SEARCH_TOOL_NAME);
    for (const removedName of removedLspToolNames) {
      expect(names).not.toContain(removedName);
    }
    expect(names).toHaveLength(ALL_TOOLS.length);
  });

  it('registers the semantic tool with read-only annotations', () => {
    const server = createMockMcpServer();
    const lspTool = ALL_TOOLS.find(tool => tool.name === LSP_SEARCH_TOOL_NAME);
    expect(lspTool).toBeDefined();

    lspTool!.fn(server.server);

    expect(server.registrations).toContainEqual(
      expect.objectContaining({
        name: LSP_SEARCH_TOOL_NAME,
        options: expect.objectContaining({
          inputSchema: expect.any(Object),
          annotations: expect.objectContaining({ readOnlyHint: true }),
        }),
        handler: expect.any(Function),
      })
    );
  });

  it('enforces semantic type anchoring rules', () => {
    expect(
      LspSearchQuerySchema.safeParse({
        operation: 'documentSymbols',
        uri: '/tmp/a.ts',
      }).success
    ).toBe(true);
    expect(
      LspSearchQuerySchema.safeParse({
        operation: 'definition',
        uri: '/tmp/a.ts',
        symbolName: 'target',
        lineHint: 1,
      }).success
    ).toBe(true);
    expect(
      LspSearchQuerySchema.safeParse({
        operation: 'definition',
        uri: '/tmp/a.ts',
      }).success
    ).toBe(false);
  });

  it('bulk schemas parse minimal valid requests', () => {
    expect(
      BulkLspSearchSchema.safeParse({
        queries: [
          {
            operation: 'definition',
            uri: '/tmp/a.ts',
            symbolName: 'target',
            lineHint: 1,
          },
        ],
      }).success
    ).toBe(true);
  });
});
