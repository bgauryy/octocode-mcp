import { describe, expect, it } from 'vitest';
import { historyToolEffect } from '../src/history-tool-effects.js';

describe('historyToolEffect', () => {
  it('extracts only explicit native file mutations', () => {
    expect(historyToolEffect('file', { queries: [
      { type: 'edit', path: 'src/a.ts' },
      { type: 'write', path: 'src/b.ts' },
      { type: 'delete', path: 'src/a.ts' },
      { type: 'read', path: 'secret.txt' },
    ] })).toEqual({ effect: 'workspace-write', files: ['src/a.ts', 'src/b.ts'] });
  });

  it.each(['bash', 'MCPTool', 'localFetch', undefined])(
    'does not infer writes from %s payload paths',
    (toolName) => {
      expect(historyToolEffect(toolName, {
        path: 'src/a.ts',
        queries: [{ type: 'write', path: 'src/b.ts' }],
      })).toEqual({ effect: 'none', files: [] });
    },
  );
});
