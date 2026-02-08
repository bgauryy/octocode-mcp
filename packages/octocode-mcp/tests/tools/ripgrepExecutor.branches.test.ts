/**
 * Branch coverage tests for ripgrepExecutor.ts
 * Targeting uncovered branches: lines 166, 182, 195-198
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  executeGrepSearch,
  estimateDirectoryStats,
} from '../../src/tools/local_ripgrep/ripgrepExecutor.js';
import type { RipgrepQuery } from '../../src/tools/local_ripgrep/scheme.js';
import { safeExec } from '../../src/utils/exec/index.js';
import { validateToolPath } from '../../src/utils/file/toolHelpers.js';
import { promises as fs } from 'fs';
import { RESOURCE_LIMITS } from '../../src/utils/core/constants.js';
import { getGrepFeatureWarnings } from '../../src/commands/GrepCommandBuilder.js';

// Mock dependencies
vi.mock('../../src/utils/exec/index.js', () => ({
  safeExec: vi.fn(),
}));

vi.mock('../../src/utils/file/toolHelpers.js', () => ({
  validateToolPath: vi.fn(),
  createErrorResult: vi.fn((_error, query, options) => ({
    status: 'error',
    errorCode: 'VALIDATION_ERROR',
    path: query.path,
    researchGoal: query.researchGoal,
    reasoning: query.reasoning,
    hints: [],
    ...options?.extra,
  })),
}));

vi.mock('../../src/hints/index.js', () => ({
  getHints: vi.fn(() => ['Hint 1', 'Hint 2']),
  getLargeFileWorkflowHints: vi.fn(() => [
    'Chunking hint 1',
    'Chunking hint 2',
  ]),
}));

vi.mock('fs', () => ({
  promises: {
    readdir: vi.fn(),
    stat: vi.fn(),
  },
}));

vi.mock('../../src/tools/local_ripgrep/ripgrepParser.js', () => ({
  parseGrepOutputWrapper: vi.fn((_stdout, _query) => []),
}));

vi.mock('../../src/tools/local_ripgrep/ripgrepResultBuilder.js', () => ({
  buildSearchResult: vi.fn((_files, query, engine, warnings) => ({
    status: 'empty',
    path: query.path,
    searchEngine: engine,
    warnings,
    researchGoal: query.researchGoal,
    reasoning: query.reasoning,
  })),
}));

vi.mock('../../src/commands/GrepCommandBuilder.js', () => {
  const MockGrepCommandBuilder = class {
    fromQuery = vi.fn().mockReturnThis();
    build = vi.fn().mockReturnValue({
      command: 'grep',
      args: ['-r', 'pattern'],
    });
  };
  return {
    GrepCommandBuilder: MockGrepCommandBuilder,
    getGrepFeatureWarnings: vi.fn(() => []),
  };
});

describe('ripgrepExecutor - Branch Coverage', () => {
  const mockSafeExec = vi.mocked(safeExec);
  const mockValidateToolPath = vi.mocked(validateToolPath);
  const mockFsReaddir = vi.mocked(fs.readdir);
  const mockFsStat = vi.mocked(fs.stat);
  const mockGetGrepFeatureWarnings = vi.mocked(getGrepFeatureWarnings);

  beforeEach(() => {
    vi.clearAllMocks();

    // Default successful mocks
    mockValidateToolPath.mockReturnValue({
      isValid: true,
      sanitizedPath: '/test/path',
    });

    mockSafeExec.mockResolvedValue({
      success: true,
      code: 0,
      stdout: '',
      stderr: '',
    });

    mockFsReaddir.mockResolvedValue([]);
    mockFsStat.mockResolvedValue({
      size: 1000,
    } as any);

    mockGetGrepFeatureWarnings.mockReturnValue([]);
  });

  describe('executeGrepSearch - Line 166: missing path', () => {
    it('should return error when path is undefined', async () => {
      const query = {
        pattern: 'test',
        path: undefined as any,
        researchGoal: 'test goal',
        reasoning: 'test reasoning',
        mainResearchGoal: 'main goal',
      } as any as RipgrepQuery;

      const result = await executeGrepSearch(query);

      expect(result.status).toBe('error');
      expect(result.errorCode).toBe('VALIDATION_ERROR');
      expect(mockValidateToolPath).not.toHaveBeenCalled();
    });

    it('should return error when path is null', async () => {
      const query = {
        pattern: 'test',
        path: null as any,
        researchGoal: 'test goal',
        reasoning: 'test reasoning',
        mainResearchGoal: 'main goal',
      } as any as RipgrepQuery;

      const result = await executeGrepSearch(query);

      expect(result.status).toBe('error');
      expect(result.errorCode).toBe('VALIDATION_ERROR');
      expect(mockValidateToolPath).not.toHaveBeenCalled();
    });
  });

  describe('executeGrepSearch - Line 182: invalid path validation', () => {
    it('should return error result when path validation fails', async () => {
      const query = {
        pattern: 'test',
        path: '/invalid/path',
        researchGoal: 'test goal',
        reasoning: 'test reasoning',
        mainResearchGoal: 'main goal',
      } as any as RipgrepQuery;

      const errorResult = {
        status: 'error' as const,
        errorCode: 'INVALID_PATH',
        path: '/invalid/path',
        researchGoal: query.researchGoal,
        reasoning: query.reasoning,
        hints: ['Path validation failed'],
      };

      mockValidateToolPath.mockReturnValue({
        isValid: false,
        errorResult,
      });

      const result = await executeGrepSearch(query);

      expect(result.status).toBe('error');
      expect(result.errorCode).toBe('INVALID_PATH');
      expect(result.path).toBe('/invalid/path');
      expect(mockSafeExec).not.toHaveBeenCalled();
    });

    it('should include warnings when path validation fails', async () => {
      const query = {
        pattern: 'test',
        path: '/invalid/path',
        researchGoal: 'test goal',
        reasoning: 'test reasoning',
        mainResearchGoal: 'main goal',
      } as any as RipgrepQuery;

      const errorResult = {
        status: 'error' as const,
        errorCode: 'INVALID_PATH',
        path: '/invalid/path',
        researchGoal: query.researchGoal,
        reasoning: query.reasoning,
        hints: [],
      };

      mockValidateToolPath.mockReturnValue({
        isValid: false,
        errorResult,
      });

      mockGetGrepFeatureWarnings.mockReturnValue(['Grep warning']);

      const result = await executeGrepSearch(query);

      expect(result.status).toBe('error');
      expect(result.warnings).toBeDefined();
      if (result.warnings) {
        expect(result.warnings).toContain('Grep warning');
      }
    });
  });

  describe('executeGrepSearch - Lines 195-198: large directory chunking warnings', () => {
    it('should add chunking warnings when directory is large and filesOnly is false', async () => {
      const query = {
        pattern: 'test',
        path: '/large/path',
        researchGoal: 'test goal',
        reasoning: 'test reasoning',
        mainResearchGoal: 'main goal',
        filesOnly: false,
      } as any as RipgrepQuery;

      // Mock large directory stats - need enough files to exceed limit
      const largeFileCount = RESOURCE_LIMITS.MAX_FILE_COUNT_FOR_SEARCH + 100;

      // Mock root directory with many files
      const rootFiles = Array.from({ length: largeFileCount }, (_, i) => ({
        name: `file${i}.ts`,
        isFile: () => true,
        isDirectory: () => false,
      }));

      mockFsReaddir.mockResolvedValue(rootFiles as any);
      // Each file contributes to size estimation
      mockFsStat.mockResolvedValue({
        size: RESOURCE_LIMITS.ESTIMATED_AVG_FILE_SIZE_BYTES,
      } as any);

      const result = await executeGrepSearch(query);

      expect(result.warnings).toBeDefined();
      if (result.warnings) {
        const warningsStr = result.warnings.join(' ');
        expect(warningsStr).toContain('Large directory detected');
        expect(warningsStr).toContain('Chunking hint');
      }
    });

    it('should not add chunking warnings when filesOnly is true', async () => {
      const query = {
        pattern: 'test',
        path: '/large/path',
        researchGoal: 'test goal',
        reasoning: 'test reasoning',
        mainResearchGoal: 'main goal',
        filesOnly: true, // This should prevent chunking warnings
      } as any as RipgrepQuery;

      const largeFileCount = RESOURCE_LIMITS.MAX_FILE_COUNT_FOR_SEARCH + 100;

      // Mock large directory
      const mockEntries = Array.from({ length: largeFileCount }, (_, i) => ({
        name: `file${i}.ts`,
        isFile: () => true,
        isDirectory: () => false,
      }));

      mockFsReaddir.mockResolvedValue(mockEntries as any);
      mockFsStat.mockResolvedValue({
        size: RESOURCE_LIMITS.ESTIMATED_AVG_FILE_SIZE_BYTES,
      } as any);

      const result = await executeGrepSearch(query);

      // Should not include chunking warnings when filesOnly is true
      expect(result.warnings).toBeDefined();
      if (result.warnings) {
        const warningsStr = result.warnings.join(' ');
        expect(warningsStr).not.toContain('Large directory detected');
        expect(warningsStr).not.toContain('Chunking hint');
      }
    });

    it('should add chunking warnings when directory exceeds size limit', async () => {
      const query = {
        pattern: 'test',
        path: '/large/path',
        researchGoal: 'test goal',
        reasoning: 'test reasoning',
        mainResearchGoal: 'main goal',
        filesOnly: false,
      } as any as RipgrepQuery;

      const largeSizeMB = RESOURCE_LIMITS.MAX_RIPGREP_DIRECTORY_SIZE_MB + 1;
      const fileCount = 10;
      const sizePerFile = (largeSizeMB * 1024 * 1024) / fileCount;

      // Mock directory with large files
      const mockEntries = Array.from({ length: fileCount }, (_, i) => ({
        name: `file${i}.ts`,
        isFile: () => true,
        isDirectory: () => false,
      }));

      mockFsReaddir.mockResolvedValue(mockEntries as any);
      mockFsStat.mockResolvedValue({
        size: sizePerFile,
      } as any);

      const result = await executeGrepSearch(query);

      expect(result.warnings).toBeDefined();
      if (result.warnings) {
        const warningsStr = result.warnings.join(' ');
        expect(warningsStr).toContain('Large directory detected');
        expect(warningsStr).toMatch(/\d+MB/); // Should contain size in MB
      }
    });

    it('should add chunking warnings when directory exceeds file count limit', async () => {
      const query = {
        pattern: 'test',
        path: '/large/path',
        researchGoal: 'test goal',
        reasoning: 'test reasoning',
        mainResearchGoal: 'main goal',
        filesOnly: false,
      } as any as RipgrepQuery;

      const largeFileCount = RESOURCE_LIMITS.MAX_FILE_COUNT_FOR_SEARCH + 1;

      // Mock directory with many files
      const mockEntries = Array.from({ length: largeFileCount }, (_, i) => ({
        name: `file${i}.ts`,
        isFile: () => true,
        isDirectory: () => false,
      }));

      mockFsReaddir.mockResolvedValue(mockEntries as any);
      mockFsStat.mockResolvedValue({
        size: 1000,
      } as any);

      const result = await executeGrepSearch(query);

      expect(result.warnings).toBeDefined();
      if (result.warnings) {
        const warningsStr = result.warnings.join(' ');
        expect(warningsStr).toContain('Large directory detected');
        expect(warningsStr).toMatch(/\d+ files/); // Should contain file count
      }
    });
  });

  describe('estimateDirectoryStats - edge cases', () => {
    it('should handle inaccessible files gracefully', async () => {
      const dirPath = '/test/path';

      const mockEntries = [
        {
          name: 'accessible.ts',
          isFile: () => true,
          isDirectory: () => false,
        },
        {
          name: 'inaccessible.ts',
          isFile: () => true,
          isDirectory: () => false,
        },
      ];

      mockFsReaddir.mockResolvedValue(mockEntries as any);
      mockFsStat
        .mockResolvedValueOnce({ size: 1000 } as any) // accessible file
        .mockRejectedValueOnce(new Error('Permission denied')); // inaccessible file

      const result = await estimateDirectoryStats(dirPath);

      // Should count only accessible file
      expect(result.estimatedFileCount).toBe(1);
      expect(result.estimatedSizeMB).toBeGreaterThan(0);
    });

    it('should handle inaccessible directories gracefully', async () => {
      const dirPath = '/test/path';

      const mockEntries = [
        {
          name: 'accessible',
          isFile: () => false,
          isDirectory: () => true,
        },
      ];

      mockFsReaddir
        .mockResolvedValueOnce(mockEntries as any)
        .mockRejectedValueOnce(new Error('Permission denied')); // inaccessible subdirectory

      const result = await estimateDirectoryStats(dirPath);

      // Should handle error gracefully
      expect(result.estimatedFileCount).toBe(0);
      expect(result.estimatedSizeMB).toBe(0);
    });

    it('should skip hidden directories', async () => {
      const dirPath = '/test/path';

      const mockEntries = [
        {
          name: '.hidden',
          isFile: () => false,
          isDirectory: () => true,
        },
        {
          name: 'visible',
          isFile: () => false,
          isDirectory: () => true,
        },
      ];

      mockFsReaddir
        .mockResolvedValueOnce(mockEntries as any)
        .mockResolvedValueOnce([]); // visible subdirectory

      await estimateDirectoryStats(dirPath);

      // Should only process visible directory
      expect(mockFsReaddir).toHaveBeenCalledTimes(2);
    });
  });
});
