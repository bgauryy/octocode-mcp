import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SymbolResolver } from '../../src/lsp/resolver.js';

describe('SymbolResolver - isIdentifierChar optimization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should resolve symbols efficiently without per-call regex compilation', () => {
    const resolver = new SymbolResolver();

    // Content with many identifier boundaries
    const lines = Array.from(
      { length: 100 },
      (_, i) => `const var${i} = mySymbol + otherVar;`
    );
    const content = lines.join('\n');

    // This should complete quickly without creating 100+ regex objects
    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      try {
        resolver.resolvePositionFromContent(content, {
          symbolName: 'mySymbol',
          lineHint: i + 1,
        });
      } catch {
        // Some lines may not find the symbol - ok
      }
    }
    const elapsed = performance.now() - start;

    // Should complete in under 100ms for 100 lookups (generous bound)
    // The point is: no per-char regex compilation
    expect(elapsed).toBeLessThan(100);
  });

  it('should correctly identify identifier chars: letters, digits, _, $', () => {
    const resolver = new SymbolResolver();

    // Word boundary at $ prefix
    const content = `const $value = 1;`;
    const result = resolver.resolvePositionFromContent(content, {
      symbolName: '$value',
      lineHint: 1,
    });
    expect(result.position.character).toBe(6);

    // Word boundary at _ prefix
    const content2 = `const _private = 1;`;
    const result2 = resolver.resolvePositionFromContent(content2, {
      symbolName: '_private',
      lineHint: 1,
    });
    expect(result2.position.character).toBe(6);

    // Should not match partial: _privateVar should not match _private
    const content3 = `const _privateVar = _private;`;
    const result3 = resolver.resolvePositionFromContent(content3, {
      symbolName: '_private',
      lineHint: 1,
    });
    // Should find the standalone _private at position 20
    expect(result3.position.character).toBe(20);
  });

  it('should handle symbols at start and end of line', () => {
    const resolver = new SymbolResolver();

    // Symbol at very start of line
    const content = `myVar = 1;`;
    const result = resolver.resolvePositionFromContent(content, {
      symbolName: 'myVar',
      lineHint: 1,
    });
    expect(result.position.character).toBe(0);

    // Symbol at very end of line
    const content2 = `const x = myVar`;
    const result2 = resolver.resolvePositionFromContent(content2, {
      symbolName: 'myVar',
      lineHint: 1,
    });
    expect(result2.position.character).toBe(10);
  });
});
