import { describe, expect, it } from 'vitest';
import { renderTypeScript } from '../scripts/tool-contract/typescript.ts';

describe('canonical tool type roots', () => {
  it('does not turn named shapes ending in Input, Query or Output into tools', async () => {
    const source = await renderTypeScript('fixture', {
      $defs: {
        LookupQuery: { type: 'object', properties: { source: { $ref: '#/$defs/ContextInput' } } },
        LookupInput: { type: 'object', properties: { queries: { type: 'array', items: { $ref: '#/$defs/LookupQuery' } } } },
        LookupOutput: { type: 'object', properties: { result: { $ref: '#/$defs/ContextOutput' } } },
        ContextInput: { type: 'object', properties: { text: { type: 'string' } } },
        ContextQuery: { type: 'string' },
        ContextOutput: { type: 'string' },
      },
    }, ['lookup']);
    for (const suffix of ['Query', 'Input', 'Output']) {
      const map = source.match(new RegExp(`export interface Tool${suffix}Map \\{([^}]+)\\}`))?.[1];
      expect(map).toBe(`\n  lookup: Lookup${suffix};\n`);
    }
    expect(source).toContain('export interface ContextInput');
    expect(source).not.toContain('context:');
  });
});
