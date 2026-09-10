import { describe, expect, it } from 'vitest';

import { BaseLspSearchQuerySchema as CanonicalLspSearchQuerySchema } from '@octocodeai/octocode-core/schema';
import { BulkLspSearchSchema, LspSearchQuerySchema } from '@octocodeai/octocode-core/schema';

describe('lspSearch runtime schema ownership', () => {
  it('reuses the canonical strict query union for single and bulk inputs', () => {
    expect(LspSearchQuerySchema).toBe(CanonicalLspSearchQuerySchema);

    expect(
      BulkLspSearchSchema.safeParse({
        queries: [
          {
            uri: '/repo/src/a.ts',
            operation: 'definition',
            symbolName: 'run',
            lineHint: 4,
          },
          {
            uri: '/repo/src/a.ts',
            operation: 'definition',
            position: { line: 3, character: 4 },
          },
          { uri: '/repo/src/a.ts', operation: 'documentSymbols' },
          {
            operation: 'workspaceSymbol',
            symbolName: 'Schema',
            workspaceRoot: '/repo',
          },
        ],
      }).success
    ).toBe(true);
  });

  it('rejects mixed, null, and document anchors while requiring workspace scope', () => {
    const rejected = [
      {
        uri: '/repo/src/a.ts',
        operation: 'definition',
        symbolName: 'run',
        lineHint: 4,
        position: { line: 3, character: 4 },
      },
      {
        uri: '/repo/src/a.ts',
        operation: 'definition',
        symbolName: 'run',
        lineHint: 4,
        position: null,
      },
      {
        uri: '/repo/src/a.ts',
        operation: 'documentSymbols',
        symbolName: 'run',
      },
      {
        uri: '/repo/src/a.ts',
        operation: 'documentSymbols',
        position: { line: 3, character: 4 },
      },
      { operation: 'workspaceSymbol', symbolName: 'Schema' },
    ];

    for (const query of rejected) {
      expect(
        BulkLspSearchSchema.safeParse({ queries: [query] }).success,
        JSON.stringify(query)
      ).toBe(false);
    }
  });
});
