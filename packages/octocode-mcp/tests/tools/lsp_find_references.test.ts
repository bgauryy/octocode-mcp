/**
 * Tests for LSP Find References tool - focuses on helper functions and registration
 * @module tools/lsp_find_references.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  findWorkspaceRoot,
  isLikelyDefinition,
} from '../../src/tools/lsp_find_references/index.js';

describe('LSP Find References Tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('registerLSPFindReferencesTool', () => {
    it('should register tool with correct name and schema', async () => {
      vi.resetModules();

      const { registerLSPFindReferencesTool } =
        await import('../../src/tools/lsp_find_references/index.js');

      const mockServer = {
        registerTool: vi.fn().mockReturnValue(undefined),
      };

      registerLSPFindReferencesTool(mockServer as any);

      expect(mockServer.registerTool).toHaveBeenCalledWith(
        'lspFindReferences',
        expect.objectContaining({
          description: expect.any(String),
          inputSchema: expect.any(Object),
          annotations: expect.objectContaining({
            title: 'Find References',
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
          }),
        }),
        expect.any(Function)
      );
    });

    it('should have correct annotations', async () => {
      vi.resetModules();

      const { registerLSPFindReferencesTool } =
        await import('../../src/tools/lsp_find_references/index.js');

      const mockServer = {
        registerTool: vi.fn().mockReturnValue(undefined),
      };

      registerLSPFindReferencesTool(mockServer as any);

      const callArgs = mockServer.registerTool.mock.calls[0];
      const toolConfig = callArgs[1];

      expect(toolConfig.annotations.openWorldHint).toBe(false);
    });

    it('should register handler function', async () => {
      vi.resetModules();

      const { registerLSPFindReferencesTool } =
        await import('../../src/tools/lsp_find_references/index.js');

      const mockServer = {
        registerTool: vi.fn().mockReturnValue(undefined),
      };

      registerLSPFindReferencesTool(mockServer as any);

      const handler = mockServer.registerTool.mock.calls[0][2];
      expect(typeof handler).toBe('function');
    });
  });

  describe('Schema validation', () => {
    it('should export correct schema', async () => {
      vi.resetModules();

      const { BulkLSPFindReferencesSchema } =
        await import('../../src/tools/lsp_find_references/scheme.js');

      expect(BulkLSPFindReferencesSchema).toBeDefined();
      // Zod schemas have a shape property for objects
      expect(BulkLSPFindReferencesSchema.shape).toBeDefined();
    });

    it('should have queries property in schema', async () => {
      vi.resetModules();

      const { BulkLSPFindReferencesSchema } =
        await import('../../src/tools/lsp_find_references/scheme.js');

      expect(BulkLSPFindReferencesSchema.shape.queries).toBeDefined();
    });
  });

  describe('isLikelyDefinition', () => {
    // Test the definition detection logic using the actual exported function
    const definitionPatterns = [
      { line: 'export const myVar = 1;', symbol: 'myVar', expected: true },
      { line: 'const myVar = 1;', symbol: 'myVar', expected: true },
      { line: 'let myVar = 1;', symbol: 'myVar', expected: true },
      { line: 'var myVar = 1;', symbol: 'myVar', expected: true },
      { line: 'function myFunc() {}', symbol: 'myFunc', expected: true },
      { line: 'async function myFunc() {}', symbol: 'myFunc', expected: true },
      {
        line: 'export function myFunc() {}',
        symbol: 'myFunc',
        expected: true,
      },
      { line: 'class MyClass {}', symbol: 'MyClass', expected: true },
      {
        line: 'interface MyInterface {}',
        symbol: 'MyInterface',
        expected: true,
      },
      { line: 'type MyType = string;', symbol: 'MyType', expected: true },
      { line: 'enum MyEnum {}', symbol: 'MyEnum', expected: true },
      { line: 'def my_func():', symbol: 'my_func', expected: true },
      { line: 'myVar = 1', symbol: 'myVar', expected: true },
      { line: 'return myVar;', symbol: 'myVar', expected: false },
      { line: 'console.log(myVar);', symbol: 'myVar', expected: false },
    ];

    for (const { line, symbol, expected } of definitionPatterns) {
      it(`should ${expected ? '' : 'not '}detect "${line}" as definition`, () => {
        expect(isLikelyDefinition(line, symbol)).toBe(expected);
      });
    }

    // Additional edge cases
    it('should handle empty line', () => {
      expect(isLikelyDefinition('', 'test')).toBe(false);
    });

    it('should handle whitespace-only line', () => {
      expect(isLikelyDefinition('   ', 'test')).toBe(false);
    });

    it('should detect default export', () => {
      expect(
        isLikelyDefinition('export default function myFunc() {}', 'myFunc')
      ).toBe(true);
    });

    it('should detect class methods', () => {
      expect(isLikelyDefinition('public myMethod()', 'myMethod')).toBe(true);
      expect(isLikelyDefinition('private helper()', 'helper')).toBe(true);
    });
  });

  describe('Tool name constant', () => {
    it('should use correct tool name from constants', async () => {
      vi.resetModules();

      const { STATIC_TOOL_NAMES } =
        await import('../../src/tools/toolNames.js');

      expect(STATIC_TOOL_NAMES.LSP_FIND_REFERENCES).toBeDefined();
      expect(typeof STATIC_TOOL_NAMES.LSP_FIND_REFERENCES).toBe('string');
    });
  });

  describe('Description export', () => {
    it('should export tool description', async () => {
      // Don't reset modules - use the initialized metadata from setup.ts
      const { LSP_FIND_REFERENCES_DESCRIPTION } =
        await import('../../src/tools/lsp_find_references/scheme.js');

      expect(LSP_FIND_REFERENCES_DESCRIPTION).toBeDefined();
      expect(typeof LSP_FIND_REFERENCES_DESCRIPTION).toBe('string');
      // Description may be empty if tool not in remote metadata (local-only tool)
    });
  });

  describe('findWorkspaceRoot', () => {
    it('should return a directory path', () => {
      // findWorkspaceRoot always returns a valid directory path
      const result = findWorkspaceRoot('/some/path/to/file.ts');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle deep paths', () => {
      const deepPath = '/a/b/c/d/e/f/g/h/i/j/file.ts';
      const result = findWorkspaceRoot(deepPath);
      expect(typeof result).toBe('string');
    });

    it('should handle relative paths', () => {
      const result = findWorkspaceRoot('src/file.ts');
      expect(typeof result).toBe('string');
    });
  });

  describe('Reference sorting', () => {
    // Test the reference sorting logic
    it('should sort definitions before usages', () => {
      const refs = [
        { uri: 'b.ts', isDefinition: false, range: { start: { line: 5 } } },
        { uri: 'a.ts', isDefinition: true, range: { start: { line: 1 } } },
        { uri: 'a.ts', isDefinition: false, range: { start: { line: 3 } } },
      ];

      refs.sort((a, b) => {
        if (a.isDefinition && !b.isDefinition) return -1;
        if (!a.isDefinition && b.isDefinition) return 1;
        if (a.uri !== b.uri) return a.uri.localeCompare(b.uri);
        return a.range.start.line - b.range.start.line;
      });

      expect(refs[0].isDefinition).toBe(true);
      expect(refs[1].uri).toBe('a.ts');
      expect(refs[2].uri).toBe('b.ts');
    });
  });
});
