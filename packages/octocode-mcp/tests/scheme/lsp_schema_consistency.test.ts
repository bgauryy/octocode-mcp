import { describe, expect, it } from 'vitest';
import {
  BulkLSPCallHierarchySchema,
  BulkLSPFindReferencesSchema,
  BulkLSPGotoDefinitionSchema,
  LSPCallHierarchyQuerySchema,
  LSPFindReferencesQuerySchema,
  LSPGotoDefinitionQuerySchema,
} from '@octocodeai/octocode-core';

describe('LSP schema consistency', () => {
  it('documents explicit bulk query limits for every LSP tool', () => {
    expect(BulkLSPGotoDefinitionSchema.shape.queries.description).toContain(
      '1-5 per call'
    );
    expect(BulkLSPFindReferencesSchema.shape.queries.description).toContain(
      '1-5 per call'
    );
    expect(BulkLSPCallHierarchySchema.shape.queries.description).toContain(
      '1-3 per call'
    );
  });

  it('uses query-level output pagination descriptions consistently', () => {
    const schemasWithCharPagination = [
      LSPGotoDefinitionQuerySchema,
      LSPCallHierarchyQuerySchema,
    ];

    for (const schema of schemasWithCharPagination) {
      expect(schema.shape.charOffset.description).toContain(
        'query-level output pagination'
      );
      expect(schema.shape.charLength.description).toContain(
        'query-level output pagination'
      );
    }

    expect('charOffset' in LSPFindReferencesQuerySchema.shape).toBe(false);
  });

  it('rejects unknown query fields for all LSP single-query schemas', () => {
    const cases = [
      LSPGotoDefinitionQuerySchema.safeParse({
        id: 'goto_unknown_field',
        researchGoal: 'Find a definition',
        reasoning: 'Need the symbol implementation',
        uri: '/tmp/file.ts',
        symbolName: 'foo',
        lineHint: 10,
        mainResearchGoal: 'Should not be accepted',
      }),
      LSPFindReferencesQuerySchema.safeParse({
        id: 'refs_unknown_field',
        researchGoal: 'Find references',
        reasoning: 'Need all usages',
        uri: '/tmp/file.ts',
        symbolName: 'foo',
        lineHint: 10,
        mainResearchGoal: 'Should not be accepted',
      }),
      LSPCallHierarchyQuerySchema.safeParse({
        id: 'calls_unknown_field',
        researchGoal: 'Trace call relationships',
        reasoning: 'Need caller context',
        uri: '/tmp/file.ts',
        symbolName: 'foo',
        lineHint: 10,
        direction: 'incoming',
        mainResearchGoal: 'Should not be accepted',
      }),
    ];

    for (const result of cases) {
      expect(result.success).toBe(false);
      expect(JSON.stringify(result.error?.issues ?? [])).toContain(
        'mainResearchGoal'
      );
    }
  });

  it('rejects unknown query fields in LSP bulk queries', () => {
    const result = BulkLSPGotoDefinitionSchema.safeParse({
      queries: [
        {
          id: 'goto_bulk_unknown_field',
          researchGoal: 'Find a definition',
          reasoning: 'Need the symbol implementation',
          uri: '/tmp/file.ts',
          symbolName: 'foo',
          lineHint: 10,
          mainResearchGoal: 'Should not be accepted',
        },
      ],
    });

    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues ?? [])).toContain(
      'mainResearchGoal'
    );
  });

  it('rejects unknown top-level bulk fields for all LSP tools', () => {
    const results = [
      BulkLSPGotoDefinitionSchema.safeParse({
        queries: [
          {
            id: 'goto_top_level_unknown',
            researchGoal: 'Find a definition',
            reasoning: 'Need the implementation',
            uri: '/tmp/file.ts',
            symbolName: 'foo',
            lineHint: 10,
          },
        ],
        unexpected: true,
      }),
      BulkLSPFindReferencesSchema.safeParse({
        queries: [
          {
            id: 'refs_top_level_unknown',
            researchGoal: 'Find references',
            reasoning: 'Need the usages',
            uri: '/tmp/file.ts',
            symbolName: 'foo',
            lineHint: 10,
          },
        ],
        unexpected: true,
      }),
      BulkLSPCallHierarchySchema.safeParse({
        queries: [
          {
            id: 'calls_top_level_unknown',
            researchGoal: 'Trace calls',
            reasoning: 'Need caller context',
            uri: '/tmp/file.ts',
            symbolName: 'foo',
            lineHint: 10,
            direction: 'incoming',
          },
        ],
        unexpected: true,
      }),
    ];

    for (const result of results) {
      expect(result.success).toBe(false);
      expect(JSON.stringify(result.error?.issues ?? [])).toContain(
        'unexpected'
      );
    }
  });

  it('applies default values consistently across all LSP query schemas', () => {
    const goto = LSPGotoDefinitionQuerySchema.parse({
      id: 'goto_defaults',
      researchGoal: 'Find a definition',
      reasoning: 'Need the implementation',
      uri: '/tmp/file.ts',
      symbolName: 'foo',
      lineHint: 10,
    });
    expect(goto.orderHint).toBe(0);
    expect(goto.contextLines).toBe(5);

    const refs = LSPFindReferencesQuerySchema.parse({
      id: 'refs_defaults',
      researchGoal: 'Find references',
      reasoning: 'Need the usages',
      uri: '/tmp/file.ts',
      symbolName: 'foo',
      lineHint: 10,
    });
    expect(refs.orderHint).toBe(0);
    expect(refs.includeDeclaration).toBe(true);
    expect(refs.contextLines).toBe(2);
    expect(refs.referencesPerPage).toBe(20);
    expect(refs.page).toBe(1);

    const calls = LSPCallHierarchyQuerySchema.parse({
      id: 'calls_defaults',
      researchGoal: 'Trace calls',
      reasoning: 'Need caller context',
      uri: '/tmp/file.ts',
      symbolName: 'foo',
      lineHint: 10,
      direction: 'incoming',
    });
    expect(calls.orderHint).toBe(0);
    expect(calls.depth).toBe(1);
    expect(calls.contextLines).toBe(2);
    expect(calls.callsPerPage).toBe(15);
    expect(calls.page).toBe(1);
  });

  it('enforces tool-specific validation limits across all LSP schemas', () => {
    const invalidCases = [
      LSPGotoDefinitionQuerySchema.safeParse({
        id: 'goto_invalid_line',
        researchGoal: 'Find a definition',
        reasoning: 'Need the implementation',
        uri: '/tmp/file.ts',
        symbolName: 'foo',
        lineHint: 0,
      }),
      LSPGotoDefinitionQuerySchema.safeParse({
        id: 'goto_invalid_length',
        researchGoal: 'Find a definition',
        reasoning: 'Need the implementation',
        uri: '/tmp/file.ts',
        symbolName: 'foo',
        lineHint: 10,
        charLength: 50001,
      }),
      LSPFindReferencesQuerySchema.safeParse({
        id: 'refs_invalid_page_size',
        researchGoal: 'Find references',
        reasoning: 'Need the usages',
        uri: '/tmp/file.ts',
        symbolName: 'foo',
        lineHint: 10,
        referencesPerPage: 51,
      }),
      LSPFindReferencesQuerySchema.safeParse({
        id: 'refs_invalid_page',
        researchGoal: 'Find references',
        reasoning: 'Need the usages',
        uri: '/tmp/file.ts',
        symbolName: 'foo',
        lineHint: 10,
        page: 0,
      }),
      LSPCallHierarchyQuerySchema.safeParse({
        id: 'calls_invalid_direction',
        researchGoal: 'Trace calls',
        reasoning: 'Need caller context',
        uri: '/tmp/file.ts',
        symbolName: 'foo',
        lineHint: 10,
        direction: 'sideways',
      }),
      LSPCallHierarchyQuerySchema.safeParse({
        id: 'calls_invalid_depth',
        researchGoal: 'Trace calls',
        reasoning: 'Need caller context',
        uri: '/tmp/file.ts',
        symbolName: 'foo',
        lineHint: 10,
        direction: 'incoming',
        depth: 4,
      }),
      LSPCallHierarchyQuerySchema.safeParse({
        id: 'calls_invalid_page_size',
        researchGoal: 'Trace calls',
        reasoning: 'Need caller context',
        uri: '/tmp/file.ts',
        symbolName: 'foo',
        lineHint: 10,
        direction: 'incoming',
        callsPerPage: 31,
      }),
    ];

    for (const result of invalidCases) {
      expect(result.success).toBe(false);
    }
  });
});
