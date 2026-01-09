/**
 * Tests for LSP Go To Definition tool - focuses on helper functions and registration
 * @module tools/lsp_goto_definition.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { addLineNumbers } from '../../src/tools/lsp_goto_definition.js';

describe('LSP Goto Definition Tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('registerLSPGotoDefinitionTool', () => {
    it('should register tool with correct name and schema', async () => {
      // Reset module cache to get fresh import
      vi.resetModules();

      const { registerLSPGotoDefinitionTool } =
        await import('../../src/tools/lsp_goto_definition.js');

      const mockServer = {
        registerTool: vi.fn().mockReturnValue(undefined),
      };

      registerLSPGotoDefinitionTool(mockServer as any);

      expect(mockServer.registerTool).toHaveBeenCalledWith(
        'lspGotoDefinition',
        expect.objectContaining({
          description: expect.any(String),
          inputSchema: expect.any(Object),
          annotations: expect.objectContaining({
            title: 'Go To Definition',
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

      const { registerLSPGotoDefinitionTool } =
        await import('../../src/tools/lsp_goto_definition.js');

      const mockServer = {
        registerTool: vi.fn().mockReturnValue(undefined),
      };

      registerLSPGotoDefinitionTool(mockServer as any);

      const callArgs = mockServer.registerTool.mock.calls[0];
      const toolConfig = callArgs[1];

      expect(toolConfig.annotations.openWorldHint).toBe(false);
    });

    it('should register handler function', async () => {
      vi.resetModules();

      const { registerLSPGotoDefinitionTool } =
        await import('../../src/tools/lsp_goto_definition.js');

      const mockServer = {
        registerTool: vi.fn().mockReturnValue(undefined),
      };

      registerLSPGotoDefinitionTool(mockServer as any);

      const handler = mockServer.registerTool.mock.calls[0][2];
      expect(typeof handler).toBe('function');
    });
  });

  describe('Schema validation', () => {
    it('should export correct schema', async () => {
      vi.resetModules();

      const { BulkLSPGotoDefinitionSchema } =
        await import('../../src/scheme/lsp_goto_definition.js');

      expect(BulkLSPGotoDefinitionSchema).toBeDefined();
      // Zod schemas have a shape property for objects
      expect(BulkLSPGotoDefinitionSchema.shape).toBeDefined();
    });

    it('should have queries property in schema', async () => {
      vi.resetModules();

      const { BulkLSPGotoDefinitionSchema } =
        await import('../../src/scheme/lsp_goto_definition.js');

      expect(BulkLSPGotoDefinitionSchema.shape.queries).toBeDefined();
    });
  });

  describe('addLineNumbers', () => {
    it('should format content with line numbers', () => {
      const content = 'line1\nline2\nline3';
      const result = addLineNumbers(content, 10, 11);

      expect(result).toContain('>11| line2');
      expect(result).toContain(' 10| line1');
      expect(result).toContain(' 12| line3');
    });

    it('should handle single-line content', () => {
      const result = addLineNumbers('single line', 1, 1);
      expect(result).toBe('>1| single line');
    });

    it('should handle three-digit line numbers with correct padding', () => {
      const result = addLineNumbers('line1\nline2', 99, 100);
      expect(result).toContain(' 99| line1');
      expect(result).toContain('>100| line2');
    });

    it('should mark the target line correctly', () => {
      const content = 'a\nb\nc\nd\ne';
      const result = addLineNumbers(content, 5, 7);

      const lines = result.split('\n');
      expect(lines[0]).toMatch(/^ 5\|/);
      expect(lines[1]).toMatch(/^ 6\|/);
      expect(lines[2]).toMatch(/^>7\|/);
      expect(lines[3]).toMatch(/^ 8\|/);
      expect(lines[4]).toMatch(/^ 9\|/);
    });

    it('should handle empty lines in content', () => {
      const content = 'line1\n\nline3';
      const result = addLineNumbers(content, 1, 2);

      expect(result).toContain(' 1| line1');
      expect(result).toContain('>2| ');
      expect(result).toContain(' 3| line3');
    });

    it('should handle large line numbers', () => {
      const content = 'line1\nline2';
      const result = addLineNumbers(content, 9999, 10000);

      expect(result).toContain(' 9999| line1');
      expect(result).toContain('>10000| line2');
    });

    it('should handle content with special characters', () => {
      const content = 'const x = 1;\nconsole.log(x);';
      const result = addLineNumbers(content, 1, 1);

      expect(result).toContain('>1| const x = 1;');
      expect(result).toContain(' 2| console.log(x);');
    });
  });

  describe('Tool name constant', () => {
    it('should use correct tool name from constants', async () => {
      vi.resetModules();

      const { STATIC_TOOL_NAMES } =
        await import('../../src/tools/toolNames.js');

      expect(STATIC_TOOL_NAMES.LSP_GOTO_DEFINITION).toBeDefined();
      expect(typeof STATIC_TOOL_NAMES.LSP_GOTO_DEFINITION).toBe('string');
    });
  });

  describe('Description export', () => {
    it('should export tool description', async () => {
      // Don't reset modules - use the initialized metadata from setup.ts
      const { LSP_GOTO_DEFINITION_DESCRIPTION } =
        await import('../../src/scheme/lsp_goto_definition.js');

      expect(LSP_GOTO_DEFINITION_DESCRIPTION).toBeDefined();
      expect(typeof LSP_GOTO_DEFINITION_DESCRIPTION).toBe('string');
      // Description may be empty if tool not in remote metadata (local-only tool)
    });
  });
});
