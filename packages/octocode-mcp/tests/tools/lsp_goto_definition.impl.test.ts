/**
 * Implementation tests for LSP Goto Definition tool
 * Exercises the actual code paths with proper dependency injection
 * @module tools/lsp_goto_definition.impl.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}));

// Mock LSP module - the mock implementation must be self-contained
vi.mock('../../src/lsp/index.js', () => {
  class MockSymbolResolutionError extends Error {
    searchRadius: number;
    constructor(message: string, searchRadius: number) {
      super(message);
      this.name = 'SymbolResolutionError';
      this.searchRadius = searchRadius;
    }
  }

  return {
    SymbolResolver: vi.fn().mockImplementation(() => ({
      resolvePositionFromContent: vi.fn().mockReturnValue({
        position: { line: 3, character: 16 },
        foundAtLine: 4,
      }),
      extractContext: vi.fn().mockReturnValue({
        content: 'test content',
        startLine: 1,
        endLine: 10,
      }),
    })),
    SymbolResolutionError: MockSymbolResolutionError,
    createClient: vi.fn().mockResolvedValue(null),
    isLanguageServerAvailable: vi.fn().mockResolvedValue(false),
  };
});

// Import mocked modules to access them
import * as fs from 'fs/promises';
import * as lspModule from '../../src/lsp/index.js';

// Import the module under test after mocks are set up
import { registerLSPGotoDefinitionTool } from '../../src/tools/lsp_goto_definition/lsp_goto_definition.js';

describe('LSP Goto Definition Implementation Tests', () => {
  const sampleTypeScriptContent = `
import { helper } from './utils';

export function mainFunction(param: string): string {
  const result = helper(param);
  return result.toUpperCase();
}

export interface Config {
  name: string;
  value: number;
}
`.trim();

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mocks for successful path validation
    process.env.WORKSPACE_ROOT = '/workspace';

    // Default: file is readable
    vi.mocked(fs.readFile).mockResolvedValue(sampleTypeScriptContent);

    // Default: LSP not available
    vi.mocked(lspModule.isLanguageServerAvailable).mockResolvedValue(false);
    vi.mocked(lspModule.createClient).mockResolvedValue(null);

    // Restore SymbolResolver mock (reset by vi.resetAllMocks in afterEach)
    // Must use regular function (not arrow) because it's called with `new`
    vi.mocked(lspModule.SymbolResolver).mockImplementation(function () {
      return {
        resolvePositionFromContent: vi.fn().mockReturnValue({
          position: { line: 3, character: 16 },
          foundAtLine: 4,
        }),
        extractContext: vi.fn().mockReturnValue({
          content: 'test content',
          startLine: 1,
          endLine: 10,
        }),
      };
    });
  });

  afterEach(() => {
    delete process.env.WORKSPACE_ROOT;
    vi.resetAllMocks();
  });

  const createHandler = () => {
    const mockServer = {
      registerTool: vi.fn((_name, _config, handler) => handler),
    };
    registerLSPGotoDefinitionTool(mockServer as any);
    return mockServer.registerTool.mock.results[0]!.value;
  };

  describe('Tool Registration', () => {
    it('should register the tool with correct name', () => {
      const mockServer = {
        registerTool: vi.fn(),
      };

      registerLSPGotoDefinitionTool(mockServer as any);

      expect(mockServer.registerTool).toHaveBeenCalledWith(
        'lspGotoDefinition',
        expect.any(Object),
        expect.any(Function)
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle file read errors', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('Permission denied'));

      const handler = createHandler();
      const result = await handler({
        queries: [
          {
            uri: '/workspace/protected.ts',
            symbolName: 'test',
            lineHint: 1,
            researchGoal: 'Find def',
            reasoning: 'Testing',
          },
        ],
      });

      expect(result).toBeDefined();
      expect(result.content?.length).toBeGreaterThan(0);
    });
  });

  describe('Symbol resolution errors', () => {
    it('should return empty result when symbol cannot be resolved', async () => {
      process.env.WORKSPACE_ROOT = process.cwd();
      const testPath = `${process.cwd()}/src/test.ts`;

      vi.mocked(fs.readFile).mockResolvedValue('const somethingElse = 1;');

      const symbolError = new (lspModule as any).SymbolResolutionError(
        'Symbol not found',
        2
      );
      // Must use regular function (not arrow) because it's called with `new`
      vi.mocked(lspModule.SymbolResolver).mockImplementation(function () {
        return {
          resolvePositionFromContent: vi.fn(() => {
            throw symbolError;
          }),
          extractContext: vi.fn(),
        };
      });

      const handler = createHandler();
      const result = await handler({
        queries: [
          {
            uri: testPath,
            symbolName: 'missingSymbol',
            lineHint: 10,
            researchGoal: 'Find definition',
            reasoning: 'Testing symbol resolution error',
          },
        ],
      });

      const text = result.content?.[0]?.text ?? '';
      // Note: YAML output uses quotes around string values
      expect(text).toContain('status: "empty"');
      expect(text).toContain('errorType: "symbol_not_found"');
    });
  });

  describe('Path Validation', () => {
    it('should reject paths outside workspace', async () => {
      const handler = createHandler();
      const result = await handler({
        queries: [
          {
            uri: '../../../etc/passwd',
            symbolName: 'test',
            lineHint: 1,
            researchGoal: 'Find def',
            reasoning: 'Testing',
          },
        ],
      });

      expect(result).toBeDefined();
      expect(result.content?.length).toBeGreaterThan(0);
    });

    it('should handle absolute paths within workspace', async () => {
      const handler = createHandler();
      const result = await handler({
        queries: [
          {
            uri: '/workspace/src/valid.ts',
            symbolName: 'test',
            lineHint: 1,
            researchGoal: 'Find def',
            reasoning: 'Testing',
          },
        ],
      });

      expect(result).toBeDefined();
    });
  });

  describe('Multiple Queries', () => {
    it('should process multiple queries', async () => {
      const handler = createHandler();
      const result = await handler({
        queries: [
          {
            uri: '/workspace/src/a.ts',
            symbolName: 'funcA',
            lineHint: 10,
            researchGoal: 'Find A',
            reasoning: 'Test A',
          },
          {
            uri: '/workspace/src/b.ts',
            symbolName: 'funcB',
            lineHint: 20,
            researchGoal: 'Find B',
            reasoning: 'Test B',
          },
        ],
      });

      expect(result).toBeDefined();
      expect(result.content?.length).toBeGreaterThan(0);
    });

    it('should handle empty queries array', async () => {
      const handler = createHandler();
      const result = await handler({ queries: [] });

      expect(result).toBeDefined();
    });
  });

  describe('Query field validation', () => {
    it('should handle missing optional fields', async () => {
      const handler = createHandler();

      const result = await handler({
        queries: [
          {
            uri: '/workspace/test.ts',
            symbolName: 'test',
            lineHint: 1,
            researchGoal: 'Find definition',
            reasoning: 'Testing',
          },
        ],
      });

      expect(result).toBeDefined();
    });

    it('should handle contextLines parameter', async () => {
      const handler = createHandler();
      const result = await handler({
        queries: [
          {
            uri: '/workspace/test.ts',
            symbolName: 'test',
            lineHint: 1,
            contextLines: 10,
            researchGoal: 'Find def',
            reasoning: 'Testing context',
          },
        ],
      });

      expect(result).toBeDefined();
    });

    it('should handle orderHint parameter', async () => {
      const handler = createHandler();
      const result = await handler({
        queries: [
          {
            uri: '/workspace/test.ts',
            symbolName: 'test',
            lineHint: 1,
            orderHint: 2,
            researchGoal: 'Find def',
            reasoning: 'Testing',
          },
        ],
      });

      expect(result).toBeDefined();
    });
  });

  describe('LSP Integration', () => {
    it('should check LSP availability', async () => {
      const handler = createHandler();
      const result = await handler({
        queries: [
          {
            uri: '/workspace/test.ts',
            symbolName: 'test',
            lineHint: 1,
            researchGoal: 'Find def',
            reasoning: 'Testing',
          },
        ],
      });

      expect(result).toBeDefined();
    });

    it('should attempt LSP when available', async () => {
      vi.mocked(lspModule.isLanguageServerAvailable).mockResolvedValue(true);
      vi.mocked(lspModule.createClient).mockResolvedValue({
        stop: vi.fn(),
        gotoDefinition: vi.fn().mockResolvedValue([]),
      } as any);

      const handler = createHandler();
      const result = await handler({
        queries: [
          {
            uri: '/workspace/test.ts',
            symbolName: 'test',
            lineHint: 1,
            researchGoal: 'Find def',
            reasoning: 'Testing',
          },
        ],
      });

      expect(result).toBeDefined();
    });

    it('should return fallback result when LSP is unavailable', async () => {
      vi.mocked(lspModule.isLanguageServerAvailable).mockResolvedValue(false);

      const handler = createHandler();
      const result = await handler({
        queries: [
          {
            uri: '/workspace/test.ts',
            symbolName: 'test',
            lineHint: 1,
            researchGoal: 'Find def',
            reasoning: 'Testing',
          },
        ],
      });

      expect(result).toBeDefined();
      expect(result.content?.length).toBeGreaterThan(0);
    });
  });

  describe('LSP enhanced location formatting', () => {
    it('should enhance locations with numbered context when LSP returns definitions', async () => {
      process.env.WORKSPACE_ROOT = process.cwd();
      const testPath = `${process.cwd()}/src/test.ts`;
      const defsPath = `${process.cwd()}/src/defs.ts`;

      vi.mocked(lspModule.isLanguageServerAvailable).mockResolvedValue(true);
      vi.mocked(lspModule.createClient).mockResolvedValue({
        stop: vi.fn(),
        gotoDefinition: vi.fn().mockResolvedValue([
          {
            uri: defsPath,
            range: {
              start: { line: 1, character: 0 },
              end: { line: 1, character: 3 },
            },
            content: 'ORIGINAL_CONTENT',
          },
        ]),
      } as any);

      vi.mocked(fs.readFile).mockImplementation(async p => {
        const filePath = typeof p === 'string' ? p : String(p);
        if (filePath === testPath) {
          return 'function test() { return 1; }';
        }
        if (filePath === defsPath) return 'alpha\nbeta\ngamma';
        throw new Error(`Unexpected path: ${filePath}`);
      });

      const handler = createHandler();
      const result = await handler({
        queries: [
          {
            uri: testPath,
            symbolName: 'test',
            lineHint: 1,
            contextLines: 1,
            researchGoal: 'Find def',
            reasoning: 'Testing LSP enhanced snippet',
          },
        ],
      });

      const text = result.content?.[0]?.text ?? '';
      // Note: YAML output uses quotes around string values
      expect(text).toContain('status: "hasResults"');
      expect(text).toContain('Found 1 definition(s) via Language Server');
      expect(text).toContain('>   2| beta');
    });

    it('should fall back to raw location when reading definition file fails', async () => {
      process.env.WORKSPACE_ROOT = process.cwd();
      const testPath = `${process.cwd()}/src/test.ts`;
      const missingPath = `${process.cwd()}/src/missing.ts`;

      vi.mocked(lspModule.isLanguageServerAvailable).mockResolvedValue(true);
      vi.mocked(lspModule.createClient).mockResolvedValue({
        stop: vi.fn(),
        gotoDefinition: vi.fn().mockResolvedValue([
          {
            uri: missingPath,
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 3 },
            },
            content: 'RAW_LOC_CONTENT',
          },
        ]),
      } as any);

      vi.mocked(fs.readFile).mockImplementation(async p => {
        const filePath = typeof p === 'string' ? p : String(p);
        if (filePath === testPath) {
          return 'function test() { return 1; }';
        }
        throw new Error('ENOENT');
      });

      const handler = createHandler();
      const result = await handler({
        queries: [
          {
            uri: testPath,
            symbolName: 'test',
            lineHint: 1,
            researchGoal: 'Find def',
            reasoning: 'Testing LSP location fallback',
          },
        ],
      });

      expect(result.content?.[0]?.text ?? '').toContain('RAW_LOC_CONTENT');
    });
  });

  describe('Schema Exports', () => {
    it('should export BulkLSPGotoDefinitionSchema', async () => {
      const { BulkLSPGotoDefinitionSchema } =
        await import('../../src/tools/lsp_goto_definition/scheme.js');

      expect(BulkLSPGotoDefinitionSchema).toBeDefined();
    });

    it('should export LSP_GOTO_DEFINITION_DESCRIPTION', async () => {
      const { LSP_GOTO_DEFINITION_DESCRIPTION } =
        await import('../../src/tools/lsp_goto_definition/scheme.js');

      expect(LSP_GOTO_DEFINITION_DESCRIPTION).toBeDefined();
      expect(typeof LSP_GOTO_DEFINITION_DESCRIPTION).toBe('string');
    });
  });

  describe('Fallback Behavior', () => {
    it('should use symbol resolver as fallback', async () => {
      vi.mocked(lspModule.isLanguageServerAvailable).mockResolvedValue(false);

      const handler = createHandler();
      const result = await handler({
        queries: [
          {
            uri: '/workspace/test.ts',
            symbolName: 'testFunction',
            lineHint: 4,
            researchGoal: 'Find def',
            reasoning: 'Testing fallback',
          },
        ],
      });

      expect(result).toBeDefined();
      expect(result.content?.length).toBeGreaterThan(0);
    });
  });
});
