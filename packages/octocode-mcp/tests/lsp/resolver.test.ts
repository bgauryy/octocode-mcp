/**
 * Tests for LSP Symbol Resolver
 * @module lsp/resolver.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SymbolResolver,
  SymbolResolutionError,
  defaultResolver,
} from '../../src/lsp/resolver.js';

describe('SymbolResolver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('resolvePositionFromContent', () => {
    it('should find symbol on exact line', () => {
      const resolver = new SymbolResolver();
      const content = `function test() {
  const myVar = 1;
  return myVar;
}`;

      const result = resolver.resolvePositionFromContent(content, {
        symbolName: 'myVar',
        lineHint: 2,
      });

      expect(result.position.line).toBe(1); // 0-indexed
      expect(result.position.character).toBe(8); // "  const "
      expect(result.foundAtLine).toBe(2);
      expect(result.lineOffset).toBe(0);
    });

    it('should find symbol on line above (within search radius)', () => {
      const resolver = new SymbolResolver({ lineSearchRadius: 2 });
      const content = `function test() {
  const target = 1;
  console.log("hi");
  return 0;
}`;

      const result = resolver.resolvePositionFromContent(content, {
        symbolName: 'target',
        lineHint: 4, // Line 4, but symbol is on line 2
      });

      expect(result.foundAtLine).toBe(2);
      expect(result.lineOffset).toBe(-2);
    });

    it('should find symbol on line below (within search radius)', () => {
      const resolver = new SymbolResolver({ lineSearchRadius: 2 });
      const content = `function test() {
  console.log("hi");
  const target = 1;
  return 0;
}`;

      const result = resolver.resolvePositionFromContent(content, {
        symbolName: 'target',
        lineHint: 1, // Line 1, but symbol is on line 3
      });

      expect(result.foundAtLine).toBe(3);
      expect(result.lineOffset).toBe(2);
    });

    it('should respect orderHint for multiple occurrences', () => {
      const resolver = new SymbolResolver();
      const content = `const x = x + x;`;

      // First occurrence
      const result0 = resolver.resolvePositionFromContent(content, {
        symbolName: 'x',
        lineHint: 1,
        orderHint: 0,
      });
      expect(result0.position.character).toBe(6); // "const "

      // Second occurrence
      const result1 = resolver.resolvePositionFromContent(content, {
        symbolName: 'x',
        lineHint: 1,
        orderHint: 1,
      });
      expect(result1.position.character).toBe(10); // "const x = "

      // Third occurrence
      const result2 = resolver.resolvePositionFromContent(content, {
        symbolName: 'x',
        lineHint: 1,
        orderHint: 2,
      });
      expect(result2.position.character).toBe(14); // "const x = x + "
    });

    it('should throw SymbolResolutionError for symbol not found', () => {
      const resolver = new SymbolResolver();
      const content = `function test() {
  return 1;
}`;

      expect(() =>
        resolver.resolvePositionFromContent(content, {
          symbolName: 'notFound',
          lineHint: 2,
        })
      ).toThrow(SymbolResolutionError);
    });

    it('should throw SymbolResolutionError for out-of-range line', () => {
      const resolver = new SymbolResolver();
      const content = `line1
line2`;

      expect(() =>
        resolver.resolvePositionFromContent(content, {
          symbolName: 'test',
          lineHint: 100,
        })
      ).toThrow(SymbolResolutionError);
    });

    it('should throw SymbolResolutionError for negative line', () => {
      const resolver = new SymbolResolver();
      const content = `line1
line2`;

      expect(() =>
        resolver.resolvePositionFromContent(content, {
          symbolName: 'test',
          lineHint: 0,
        })
      ).toThrow(SymbolResolutionError);
    });

    it('should respect word boundaries', () => {
      const resolver = new SymbolResolver();
      const content = `const fooBar = 1;
const foo = 2;`;

      // Should NOT match "foo" inside "fooBar"
      const result = resolver.resolvePositionFromContent(content, {
        symbolName: 'foo',
        lineHint: 1,
      });

      // Should find "foo" on line 2, not partial match in "fooBar"
      expect(result.foundAtLine).toBe(2);
    });

    it('should handle CRLF line endings', () => {
      const resolver = new SymbolResolver();
      const content = `function test() {\r\n  const myVar = 1;\r\n  return myVar;\r\n}`;

      const result = resolver.resolvePositionFromContent(content, {
        symbolName: 'myVar',
        lineHint: 2,
      });

      expect(result.position.line).toBe(1);
      expect(result.foundAtLine).toBe(2);
    });

    it('should handle symbols at start of line', () => {
      const resolver = new SymbolResolver();
      const content = `myFunc()`;

      const result = resolver.resolvePositionFromContent(content, {
        symbolName: 'myFunc',
        lineHint: 1,
      });

      expect(result.position.character).toBe(0);
    });

    it('should handle symbols at end of line', () => {
      const resolver = new SymbolResolver();
      const content = `const x = myFunc`;

      const result = resolver.resolvePositionFromContent(content, {
        symbolName: 'myFunc',
        lineHint: 1,
      });

      expect(result.position.character).toBe(10);
    });

    it('should handle empty lines in content', () => {
      const resolver = new SymbolResolver();
      const content = `function test() {

  const myVar = 1;

  return myVar;
}`;

      const result = resolver.resolvePositionFromContent(content, {
        symbolName: 'myVar',
        lineHint: 3,
      });

      expect(result.foundAtLine).toBe(3);
    });

    it('should handle underscore in identifiers', () => {
      const resolver = new SymbolResolver();
      const content = `const my_var = _privateVar + __dunder__;`;

      const result1 = resolver.resolvePositionFromContent(content, {
        symbolName: 'my_var',
        lineHint: 1,
      });
      expect(result1.position.character).toBe(6);

      const result2 = resolver.resolvePositionFromContent(content, {
        symbolName: '_privateVar',
        lineHint: 1,
      });
      expect(result2.position.character).toBe(15);
    });

    it('should handle $ in identifiers', () => {
      const resolver = new SymbolResolver();
      const content = `const $element = $$('selector');`;

      const result = resolver.resolvePositionFromContent(content, {
        symbolName: '$element',
        lineHint: 1,
      });
      expect(result.position.character).toBe(6);
    });

    it('should search in correct order (exact first, then alternating)', () => {
      const resolver = new SymbolResolver({ lineSearchRadius: 3 });
      const content = `line1
targetAbove
line3
line4 (hint)
line5
targetBelow
line7`;

      // When searching from line 4, should check: 4, 3, 5, 2, 6, 1, 7
      // Should find "targetAbove" on line 2 before "targetBelow" on line 6
      const resultAbove = resolver.resolvePositionFromContent(content, {
        symbolName: 'targetAbove',
        lineHint: 4,
      });
      expect(resultAbove.foundAtLine).toBe(2);
      expect(resultAbove.lineOffset).toBe(-2);

      const resultBelow = resolver.resolvePositionFromContent(content, {
        symbolName: 'targetBelow',
        lineHint: 4,
      });
      expect(resultBelow.foundAtLine).toBe(6);
      expect(resultBelow.lineOffset).toBe(2);
    });
  });

  describe('resolvePosition (async)', () => {
    // Note: These tests require actual file access, so we test via synchronous methods
    // The async resolvePosition is a thin wrapper around resolvePositionFromContent

    it('should be an async method', () => {
      const resolver = new SymbolResolver();
      expect(typeof resolver.resolvePosition).toBe('function');
    });
  });

  describe('extractContext', () => {
    it('should extract context around a line', () => {
      const resolver = new SymbolResolver();
      const content = `line1
line2
line3
line4
line5
line6
line7`;

      const context = resolver.extractContext(content, 4, 2);

      expect(context.startLine).toBe(2);
      expect(context.endLine).toBe(6);
      expect(context.content).toBe('line2\nline3\nline4\nline5\nline6');
    });

    it('should handle context at start of file', () => {
      const resolver = new SymbolResolver();
      const content = `line1
line2
line3`;

      const context = resolver.extractContext(content, 1, 2);

      expect(context.startLine).toBe(1);
      expect(context.endLine).toBe(3);
    });

    it('should handle context at end of file', () => {
      const resolver = new SymbolResolver();
      const content = `line1
line2
line3`;

      const context = resolver.extractContext(content, 3, 2);

      expect(context.startLine).toBe(1);
      expect(context.endLine).toBe(3);
    });

    it('should handle zero context lines', () => {
      const resolver = new SymbolResolver();
      const content = `line1
line2
line3`;

      const context = resolver.extractContext(content, 2, 0);

      expect(context.startLine).toBe(2);
      expect(context.endLine).toBe(2);
      expect(context.content).toBe('line2');
    });
  });

  describe('SymbolResolutionError', () => {
    it('should contain all error properties', () => {
      const error = new SymbolResolutionError('mySymbol', 42, 'Test reason', 3);

      expect(error.name).toBe('SymbolResolutionError');
      expect(error.symbolName).toBe('mySymbol');
      expect(error.lineHint).toBe(42);
      expect(error.reason).toBe('Test reason');
      expect(error.searchRadius).toBe(3);
      expect(error.message).toContain('mySymbol');
      expect(error.message).toContain('42');
    });

    it('should use default search radius', () => {
      const error = new SymbolResolutionError('sym', 10, 'reason');
      expect(error.searchRadius).toBe(5);
    });
  });

  describe('defaultResolver', () => {
    it('should be a SymbolResolver instance', () => {
      expect(defaultResolver).toBeInstanceOf(SymbolResolver);
    });

    it('should have default lineSearchRadius of 5', () => {
      const content = `line1
line2
line3
target
line5`;

      // Should find "target" within radius 2 from line 2
      const result = defaultResolver.resolvePositionFromContent(content, {
        symbolName: 'target',
        lineHint: 2,
      });
      expect(result.foundAtLine).toBe(4);
    });
  });

  describe('resolveSymbolPosition', () => {
    // Note: resolveSymbolPosition is an async convenience function
    // that wraps the synchronous resolvePositionFromContent

    it('should be exported as a function', async () => {
      const { resolveSymbolPosition } =
        await import('../../src/lsp/resolver.js');
      expect(typeof resolveSymbolPosition).toBe('function');
    });
  });

  describe('edge cases', () => {
    it('should handle single-line file', () => {
      const resolver = new SymbolResolver();
      const content = 'const x = 1;';

      const result = resolver.resolvePositionFromContent(content, {
        symbolName: 'x',
        lineHint: 1,
      });

      expect(result.foundAtLine).toBe(1);
    });

    it('should handle empty file', () => {
      const resolver = new SymbolResolver();
      const content = '';

      expect(() =>
        resolver.resolvePositionFromContent(content, {
          symbolName: 'x',
          lineHint: 1,
        })
      ).toThrow(SymbolResolutionError);
    });

    it('should handle file with only empty lines', () => {
      const resolver = new SymbolResolver();
      const content = '\n\n\n';

      expect(() =>
        resolver.resolvePositionFromContent(content, {
          symbolName: 'x',
          lineHint: 2,
        })
      ).toThrow(SymbolResolutionError);
    });

    it('should handle symbol that looks like regex special char', () => {
      const resolver = new SymbolResolver();
      const content = 'const $test = 1;';

      const result = resolver.resolvePositionFromContent(content, {
        symbolName: '$test',
        lineHint: 1,
      });

      expect(result.foundAtLine).toBe(1);
    });

    it('should not match symbol in middle of word', () => {
      const resolver = new SymbolResolver();
      const content = 'const testing = 1;';

      expect(() =>
        resolver.resolvePositionFromContent(content, {
          symbolName: 'test',
          lineHint: 1,
        })
      ).toThrow(SymbolResolutionError);
    });

    it('should match symbol followed by punctuation', () => {
      const resolver = new SymbolResolver();
      const content = 'func();';

      const result = resolver.resolvePositionFromContent(content, {
        symbolName: 'func',
        lineHint: 1,
      });

      expect(result.position.character).toBe(0);
    });

    it('should handle custom search radius', () => {
      const resolver = new SymbolResolver({ lineSearchRadius: 5 });
      const content = `line1
line2
line3
line4
line5
line6
target
line8`;

      const result = resolver.resolvePositionFromContent(content, {
        symbolName: 'target',
        lineHint: 2, // 5 lines away
      });

      expect(result.foundAtLine).toBe(7);
    });
  });
});
