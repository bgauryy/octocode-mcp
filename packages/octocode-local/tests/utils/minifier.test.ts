import { describe, it, expect } from 'vitest';
import { minifyContent } from '../../src/utils/minifier.js';

describe('minifier utils', () => {
  it('minifies simple TypeScript content by trimming comments/whitespace where safe', () => {
    const input = `// comment\nconst x = 1;   \n\n/* block */\nexport const y = x + 1;\n`;
    const out = minifyContent(input, '/tmp/example.ts');
    expect(out.includes('comment')).toBe(false);
    expect(out.includes('block')).toBe(false);
    expect(out.includes('export const y')).toBe(true);
  });

  it('keeps plain text unchanged except normalization', () => {
    const input = 'hello\nworld\n';
    const out = minifyContent(input, '/tmp/notes.txt');
    expect(out).toContain('hello');
    expect(out).toContain('world');
  });
});
