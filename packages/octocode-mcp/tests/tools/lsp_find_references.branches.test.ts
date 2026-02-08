/**
 * Branch coverage tests for LSP Find References tool
 * Targets uncovered branches in lsp_find_references.ts and lspReferencesCore.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { LSPFindReferencesQuery } from '../../src/tools/lsp_find_references/scheme.js';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  stat: vi.fn(),
  readFile: vi.fn(),
}));

// Mock LSP module with MockSymbolResolutionError defined INSIDE the factory
vi.mock('../../src/lsp/index.js', () => {
  class MockSymbolResolutionError extends Error {
    searchRadius: number;
    symbolName: string;
    lineHint: number;
    constructor(message: string, searchRadius: number = 2) {
      super(message);
      this.name = 'SymbolResolutionError';
      this.searchRadius = searchRadius;
      this.symbolName = '';
      this.lineHint = 0;
    }
  }

  return {
    SymbolResolver: vi.fn().mockImplementation(() => ({
      resolvePositionFromContent: vi.fn().mockReturnValue({
        position: { line: 0, character: 9 },
        foundAtLine: 1,
      }),
    })),
    SymbolResolutionError: MockSymbolResolutionError,
    isLanguageServerAvailable: vi.fn().mockResolvedValue(false),
    createClient: vi.fn().mockResolvedValue(null),
  };
});

// Mock pattern matching module
vi.mock('../../src/tools/lsp_find_references/lspReferencesPatterns.js', () => ({
  findReferencesWithPatternMatching: vi.fn().mockResolvedValue({
    status: 'hasResults',
    locations: [],
    totalReferences: 0,
  }),
  findWorkspaceRoot: vi.fn(() => '/workspace'),
  isLikelyDefinition: vi.fn(),
}));

// Mock lspReferencesCore
vi.mock('../../src/tools/lsp_find_references/lspReferencesCore.js', () => ({
  findReferencesWithLSP: vi.fn().mockResolvedValue(null),
}));

// Mock toolHelpers
vi.mock('../../src/utils/file/toolHelpers.js', () => ({
  validateToolPath: vi.fn().mockReturnValue({
    isValid: true,
    sanitizedPath: '/workspace/src/file.ts',
  }),
  createErrorResult: vi.fn((error: unknown, _query: unknown) => ({
    status: 'error',
    error: error instanceof Error ? error.message : String(error),
    errorType: 'tool_error',
  })),
}));

// Mock errorCodes
vi.mock('../../src/errorCodes.js', () => ({
  ToolErrors: {
    fileAccessFailed: vi.fn(
      (path: string) => new Error(`Cannot access file: ${path}`)
    ),
    fileReadFailed: vi.fn(
      (path: string) => new Error(`Failed to read file: ${path}`)
    ),
  },
}));

// Import after mocks
import * as fs from 'fs/promises';
import * as lspModule from '../../src/lsp/index.js';
import * as patternModule from '../../src/tools/lsp_find_references/lspReferencesPatterns.js';
import * as coreModule from '../../src/tools/lsp_find_references/lspReferencesCore.js';
import {
  validateToolPath,
  createErrorResult,
} from '../../src/utils/file/toolHelpers.js';
import { findReferences } from '../../src/tools/lsp_find_references/lsp_find_references.js';

describe('LSP Find References - Branch Coverage Tests', () => {
  const baseQuery: LSPFindReferencesQuery = {
    uri: '/workspace/src/file.ts',
    symbolName: 'testFunction',
    lineHint: 5,
    orderHint: 0,
    contextLines: 2,
    page: 1,
    includeDeclaration: true,
    referencesPerPage: 20,
    researchGoal: 'test',
    reasoning: 'test',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WORKSPACE_ROOT = '/workspace';

    // Re-setup all mocks after clearAllMocks
    vi.mocked(validateToolPath).mockReturnValue({
      isValid: true,
      sanitizedPath: '/workspace/src/file.ts',
    } as ReturnType<typeof validateToolPath>);
    vi.mocked(createErrorResult).mockImplementation(
      (error: unknown, _query: any, _options?: any) =>
        ({
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
          errorType: 'tool_error',
        }) as any
    );
    vi.mocked(fs.stat).mockResolvedValue({} as any);
    vi.mocked(fs.readFile).mockResolvedValue(
      'function testFunction() {}\nexport { testFunction };'
    );
    vi.mocked(lspModule.isLanguageServerAvailable).mockResolvedValue(false);
    vi.mocked(lspModule.createClient).mockResolvedValue(null);

    // Must use regular function (not arrow) because it's called with `new`
    vi.mocked(lspModule.SymbolResolver).mockImplementation(function () {
      return {
        resolvePositionFromContent: vi.fn().mockReturnValue({
          position: { line: 0, character: 9 },
          foundAtLine: 1,
        }),
      };
    });

    vi.mocked(
      patternModule.findReferencesWithPatternMatching
    ).mockResolvedValue({
      status: 'hasResults',
      locations: [],
      totalReferences: 0,
      researchGoal: 'test',
      reasoning: 'test',
    } as any);

    vi.mocked(patternModule.findWorkspaceRoot).mockReturnValue('/workspace');
    vi.mocked(coreModule.findReferencesWithLSP).mockResolvedValue(null);
  });

  afterEach(() => {
    delete process.env.WORKSPACE_ROOT;
    vi.resetAllMocks();
  });

  describe('lsp_find_references.ts - Error Paths', () => {
    it('should handle file stat failure (lines 84-88)', async () => {
      vi.mocked(fs.stat).mockRejectedValue(new Error('ENOENT'));

      const result = await findReferences(baseQuery);

      expect(result.status).toBe('error');
      expect(fs.stat).toHaveBeenCalled();
    });

    it('should handle file readFile failure (lines 99-103)', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('EPERM'));

      const result = await findReferences(baseQuery);

      expect(result.status).toBe('error');
      expect(fs.readFile).toHaveBeenCalled();
    });

    it('should handle SymbolResolutionError (line 120)', async () => {
      // Override SymbolResolver to throw SymbolResolutionError
      const { SymbolResolutionError } = lspModule;
      vi.mocked(lspModule.SymbolResolver).mockImplementation(function () {
        return {
          resolvePositionFromContent: vi.fn().mockImplementation(() => {
            throw new SymbolResolutionError(
              'testFunction',
              5,
              'Symbol not found near line 5',
              2
            );
          }),
        };
      });

      const result = await findReferences(baseQuery);

      expect(result.status).toBe('empty');
      expect(result.errorType).toBe('symbol_not_found');
      expect(result.hints).toBeDefined();
      expect(result.hints!.length).toBeGreaterThan(0);
    });

    it('should rethrow non-SymbolResolutionError (line 135) - caught by outer catch', async () => {
      vi.mocked(lspModule.SymbolResolver).mockImplementation(function () {
        return {
          resolvePositionFromContent: vi.fn().mockImplementation(() => {
            throw new TypeError('unexpected error');
          }),
        };
      });

      // The outer catch wraps it via createErrorResult
      const result = await findReferences(baseQuery);
      expect(result.status).toBe('error');
    });

    it('should fallback to pattern matching when LSP returns null (line 151)', async () => {
      vi.mocked(lspModule.isLanguageServerAvailable).mockResolvedValue(true);
      vi.mocked(coreModule.findReferencesWithLSP).mockResolvedValue(null);

      vi.mocked(
        patternModule.findReferencesWithPatternMatching
      ).mockResolvedValue({
        status: 'hasResults',
        locations: [{ uri: '/workspace/src/file.ts', range: {} }],
        totalReferences: 1,
        researchGoal: 'test',
        reasoning: 'test',
      } as any);

      const result = await findReferences(baseQuery);

      expect(result.status).toBe('hasResults');
      expect(
        patternModule.findReferencesWithPatternMatching
      ).toHaveBeenCalled();
    });

    it('should fallback to pattern matching when LSP throws (line 152)', async () => {
      vi.mocked(lspModule.isLanguageServerAvailable).mockResolvedValue(true);
      vi.mocked(coreModule.findReferencesWithLSP).mockRejectedValue(
        new Error('LSP crashed')
      );

      const result = await findReferences(baseQuery);

      expect(result.status).toBe('hasResults');
      expect(
        patternModule.findReferencesWithPatternMatching
      ).toHaveBeenCalled();
    });

    it('should use LSP result when LSP returns a result (line 151)', async () => {
      vi.mocked(lspModule.isLanguageServerAvailable).mockResolvedValue(true);
      const lspResult = {
        status: 'hasResults' as const,
        locations: [{ uri: '/test.ts' }],
        totalReferences: 1,
        researchGoal: 'test',
        reasoning: 'test',
      };
      vi.mocked(coreModule.findReferencesWithLSP).mockResolvedValue(
        lspResult as any
      );

      const result = await findReferences(baseQuery);

      expect(result.status).toBe('hasResults');
      expect(
        patternModule.findReferencesWithPatternMatching
      ).not.toHaveBeenCalled();
    });

    it('should use findWorkspaceRoot when WORKSPACE_ROOT env not set (line 140)', async () => {
      delete process.env.WORKSPACE_ROOT;

      await findReferences(baseQuery);

      expect(patternModule.findWorkspaceRoot).toHaveBeenCalled();
    });
  });
});
