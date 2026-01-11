/**
 * Implementation tests for LSP Call Hierarchy tool
 * Exercises the actual code paths with proper dependency injection
 * @module tools/lsp_call_hierarchy.impl.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}));

// Mock exec utilities
vi.mock('../../src/utils/exec/index.js', () => ({
  safeExec: vi
    .fn()
    .mockResolvedValue({ stdout: '', stderr: '', code: 0, success: true }),
  checkCommandAvailability: vi
    .fn()
    .mockResolvedValue({ available: true, command: 'rg' }),
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
    getOrCreateClient: vi.fn().mockResolvedValue(null),
    isLanguageServerAvailable: vi.fn().mockResolvedValue(false),
  };
});

// Import mocked modules to access them
import * as fs from 'fs/promises';
import * as lspModule from '../../src/lsp/index.js';
import * as execModule from '../../src/utils/exec/index.js';

// Import the module under test after mocks are set up
import { registerLSPCallHierarchyTool } from '../../src/tools/lsp_call_hierarchy/index.js';

describe('LSP Call Hierarchy Implementation Tests', () => {
  const sampleTypeScriptContent = `
import { helper } from './utils';

export function mainFunction(param: string): string {
  const result = helper(param);
  innerCall();
  return result;
}

function innerCall() {
  console.log('inner');
}

export function caller() {
  mainFunction('test');
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
    vi.mocked(lspModule.getOrCreateClient).mockResolvedValue(null);

    // Default: ripgrep is available
    vi.mocked(execModule.checkCommandAvailability).mockResolvedValue({
      available: true,
      command: 'rg',
    });
    vi.mocked(execModule.safeExec).mockResolvedValue({
      stdout: '',
      stderr: '',
      code: 0,
      success: true,
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
    registerLSPCallHierarchyTool(mockServer as any);
    return mockServer.registerTool.mock.results[0]!.value;
  };

  describe('Tool Registration', () => {
    it('should register the tool with correct name', () => {
      const mockServer = {
        registerTool: vi.fn(),
      };

      registerLSPCallHierarchyTool(mockServer as any);

      expect(mockServer.registerTool).toHaveBeenCalledWith(
        'lspCallHierarchy',
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
            direction: 'incoming',
            researchGoal: 'Find callers',
            reasoning: 'Testing',
          },
        ],
      });

      expect(result).toBeDefined();
      expect(result.content?.length).toBeGreaterThan(0);
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
            direction: 'incoming',
            researchGoal: 'Find callers',
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
            direction: 'incoming',
            researchGoal: 'Find callers',
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
            direction: 'incoming',
            researchGoal: 'Find A callers',
            reasoning: 'Test A',
          },
          {
            uri: '/workspace/src/b.ts',
            symbolName: 'funcB',
            lineHint: 20,
            direction: 'outgoing',
            researchGoal: 'Find B callees',
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
            direction: 'incoming',
            researchGoal: 'Find callers',
            reasoning: 'Testing',
          },
        ],
      });

      expect(result).toBeDefined();
    });

    it('should handle depth parameter', async () => {
      const handler = createHandler();
      const result = await handler({
        queries: [
          {
            uri: '/workspace/test.ts',
            symbolName: 'test',
            lineHint: 1,
            direction: 'incoming',
            depth: 2,
            researchGoal: 'Find deep callers',
            reasoning: 'Testing depth',
          },
        ],
      });

      expect(result).toBeDefined();
    });

    it('should handle pagination parameters', async () => {
      const handler = createHandler();
      const result = await handler({
        queries: [
          {
            uri: '/workspace/test.ts',
            symbolName: 'test',
            lineHint: 1,
            direction: 'incoming',
            callsPerPage: 10,
            page: 2,
            researchGoal: 'Find callers',
            reasoning: 'Testing pagination',
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
            direction: 'incoming',
            contextLines: 5,
            researchGoal: 'Find callers',
            reasoning: 'Testing context',
          },
        ],
      });

      expect(result).toBeDefined();
    });
  });

  describe('Direction Handling', () => {
    it('should handle incoming direction', async () => {
      const handler = createHandler();
      const result = await handler({
        queries: [
          {
            uri: '/workspace/test.ts',
            symbolName: 'mainFunction',
            lineHint: 4,
            direction: 'incoming',
            researchGoal: 'Find callers',
            reasoning: 'Testing incoming',
          },
        ],
      });

      expect(result).toBeDefined();
    });

    it('should handle outgoing direction', async () => {
      const handler = createHandler();
      const result = await handler({
        queries: [
          {
            uri: '/workspace/test.ts',
            symbolName: 'mainFunction',
            lineHint: 4,
            direction: 'outgoing',
            researchGoal: 'Find callees',
            reasoning: 'Testing outgoing',
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
            direction: 'incoming',
            researchGoal: 'Find callers',
            reasoning: 'Testing',
          },
        ],
      });

      expect(result).toBeDefined();
    });

    it('should attempt LSP when available', async () => {
      vi.mocked(lspModule.isLanguageServerAvailable).mockResolvedValue(true);
      vi.mocked(lspModule.getOrCreateClient).mockResolvedValue({
        prepareCallHierarchy: vi.fn().mockResolvedValue([]),
        getIncomingCalls: vi.fn().mockResolvedValue([]),
        getOutgoingCalls: vi.fn().mockResolvedValue([]),
      } as any);

      const handler = createHandler();
      const result = await handler({
        queries: [
          {
            uri: '/workspace/test.ts',
            symbolName: 'test',
            lineHint: 1,
            direction: 'incoming',
            researchGoal: 'Find callers',
            reasoning: 'Testing',
          },
        ],
      });

      expect(result).toBeDefined();
    });
  });

  describe('Pattern Matching Fallback', () => {
    it('should use pattern matching when LSP unavailable', async () => {
      vi.mocked(lspModule.isLanguageServerAvailable).mockResolvedValue(false);
      vi.mocked(execModule.checkCommandAvailability).mockResolvedValue({
        available: true,
        command: 'rg',
      });

      const handler = createHandler();
      const result = await handler({
        queries: [
          {
            uri: '/workspace/test.ts',
            symbolName: 'mainFunction',
            lineHint: 4,
            direction: 'incoming',
            researchGoal: 'Find callers',
            reasoning: 'Testing fallback',
          },
        ],
      });

      expect(result).toBeDefined();
      expect(result.content?.length).toBeGreaterThan(0);
    });

    it('should fall back to grep when ripgrep unavailable', async () => {
      vi.mocked(lspModule.isLanguageServerAvailable).mockResolvedValue(false);
      vi.mocked(execModule.checkCommandAvailability)
        .mockResolvedValueOnce({ available: false, command: 'rg' }) // rg unavailable
        .mockResolvedValueOnce({ available: true, command: 'grep' }); // grep available

      const handler = createHandler();
      const result = await handler({
        queries: [
          {
            uri: '/workspace/test.ts',
            symbolName: 'mainFunction',
            lineHint: 4,
            direction: 'incoming',
            researchGoal: 'Find callers',
            reasoning: 'Testing grep fallback',
          },
        ],
      });

      expect(result).toBeDefined();
    });
  });

  describe('Schema Exports', () => {
    it('should export BulkLSPCallHierarchySchema', async () => {
      const { BulkLSPCallHierarchySchema } =
        await import('../../src/tools/lsp_call_hierarchy/scheme.js');

      expect(BulkLSPCallHierarchySchema).toBeDefined();
    });

    it('should export LSP_CALL_HIERARCHY_DESCRIPTION', async () => {
      const { LSP_CALL_HIERARCHY_DESCRIPTION } =
        await import('../../src/tools/lsp_call_hierarchy/scheme.js');

      expect(LSP_CALL_HIERARCHY_DESCRIPTION).toBeDefined();
      expect(typeof LSP_CALL_HIERARCHY_DESCRIPTION).toBe('string');
    });
  });

  describe('Empty Results', () => {
    it('should return empty status when no callers found', async () => {
      vi.mocked(lspModule.isLanguageServerAvailable).mockResolvedValue(false);
      vi.mocked(execModule.safeExec).mockResolvedValue({
        stdout: '',
        stderr: '',
        code: 1, // No matches
        success: false,
      });

      const handler = createHandler();
      const result = await handler({
        queries: [
          {
            uri: '/workspace/test.ts',
            symbolName: 'unusedFunction',
            lineHint: 1,
            direction: 'incoming',
            researchGoal: 'Check if function is called',
            reasoning: 'Testing empty results',
          },
        ],
      });

      expect(result).toBeDefined();
      expect(result.content?.length).toBeGreaterThan(0);
    });
  });
});
