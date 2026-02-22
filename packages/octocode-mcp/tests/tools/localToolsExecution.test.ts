/**
 * Tests for local tools execution and registration modules
 * Covers execution.ts and register.ts files for local_fetch_content, local_find_files,
 * local_ripgrep, and local_view_structure
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RipgrepQuery } from '../../src/tools/local_ripgrep/scheme.js';

// Mock the bulk operation module
vi.mock('../../src/utils/response/bulk.js', () => ({
  executeBulkOperation: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'mocked result' }],
  }),
}));

// Mock individual tool functions
vi.mock('../../src/tools/local_fetch_content/fetchContent.js', () => ({
  fetchContent: vi.fn().mockResolvedValue({ status: 'success' }),
}));

vi.mock('../../src/tools/local_find_files/findFiles.js', () => ({
  findFiles: vi.fn().mockResolvedValue({ status: 'success' }),
}));

vi.mock('../../src/tools/local_ripgrep/searchContentRipgrep.js', () => ({
  searchContentRipgrep: vi.fn().mockResolvedValue({ status: 'success' }),
}));

vi.mock('../../src/tools/local_view_structure/local_view_structure.js', () => ({
  viewStructure: vi.fn().mockResolvedValue({ status: 'success' }),
}));

describe('Local Tools Execution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('executeFetchContent', () => {
    it('should call executeBulkOperation with queries', async () => {
      const { executeFetchContent } =
        await import('../../src/tools/local_fetch_content/execution.js');
      const { executeBulkOperation } =
        await import('../../src/utils/response/bulk.js');

      const queries = [
        {
          researchGoal: 'Test',
          reasoning: 'Schema validation',
          path: '/test/file.ts',
        },
      ];
      await executeFetchContent({ queries });

      expect(executeBulkOperation).toHaveBeenCalledWith(
        queries,
        expect.any(Function),
        { toolName: 'localGetFileContent' }
      );
    });

    it('should pass fetchContent function as callback', async () => {
      const { executeFetchContent } =
        await import('../../src/tools/local_fetch_content/execution.js');
      const { executeBulkOperation } =
        await import('../../src/utils/response/bulk.js');
      const { fetchContent } =
        await import('../../src/tools/local_fetch_content/fetchContent.js');

      const queries = [
        {
          researchGoal: 'Test',
          reasoning: 'Schema validation',
          path: '/test/file.ts',
        },
      ];
      await executeFetchContent({ queries });

      // Get the callback function passed to executeBulkOperation
      const mockCall = vi.mocked(executeBulkOperation).mock.calls[0];
      expect(mockCall).toBeDefined();
      const callback = mockCall![1];

      // Execute the callback to cover line 16
      const query = {
        researchGoal: 'Test',
        reasoning: 'Schema validation',
        path: '/test',
      };
      await callback(query, 0);

      expect(fetchContent).toHaveBeenCalledWith(query);
    });

    it('should handle empty queries array', async () => {
      const { executeFetchContent } =
        await import('../../src/tools/local_fetch_content/execution.js');
      const { executeBulkOperation } =
        await import('../../src/utils/response/bulk.js');

      await executeFetchContent({ queries: [] });

      expect(executeBulkOperation).toHaveBeenCalledWith(
        [],
        expect.any(Function),
        { toolName: 'localGetFileContent' }
      );
    });

    it('should handle undefined queries with fallback to empty array', async () => {
      const { executeFetchContent } =
        await import('../../src/tools/local_fetch_content/execution.js');
      const { executeBulkOperation } =
        await import('../../src/utils/response/bulk.js');

      // @ts-expect-error Testing undefined queries
      await executeFetchContent({ queries: undefined });

      expect(executeBulkOperation).toHaveBeenCalledWith(
        [],
        expect.any(Function),
        { toolName: 'localGetFileContent' }
      );
    });
  });

  describe('executeFindFiles', () => {
    it('should call executeBulkOperation with queries', async () => {
      const { executeFindFiles } =
        await import('../../src/tools/local_find_files/execution.js');
      const { executeBulkOperation } =
        await import('../../src/utils/response/bulk.js');

      const queries = [
        { researchGoal: 'Test', reasoning: 'Schema validation', path: '/test' },
      ];
      await executeFindFiles({ queries });

      expect(executeBulkOperation).toHaveBeenCalledWith(
        queries,
        expect.any(Function),
        { toolName: 'localFindFiles' }
      );
    });

    it('should pass findFiles function as callback', async () => {
      const { executeFindFiles } =
        await import('../../src/tools/local_find_files/execution.js');
      const { executeBulkOperation } =
        await import('../../src/utils/response/bulk.js');
      const { findFiles } =
        await import('../../src/tools/local_find_files/findFiles.js');

      const queries = [
        { researchGoal: 'Test', reasoning: 'Schema validation', path: '/test' },
      ];
      await executeFindFiles({ queries });

      const mockCall = vi.mocked(executeBulkOperation).mock.calls[0];
      expect(mockCall).toBeDefined();
      const callback = mockCall![1];

      const query = {
        researchGoal: 'Test',
        reasoning: 'Schema validation',
        path: '/test',
      };
      await callback(query, 0);

      expect(findFiles).toHaveBeenCalledWith(query);
    });

    it('should handle undefined queries with fallback to empty array', async () => {
      const { executeFindFiles } =
        await import('../../src/tools/local_find_files/execution.js');
      const { executeBulkOperation } =
        await import('../../src/utils/response/bulk.js');

      // @ts-expect-error Testing undefined queries
      await executeFindFiles({ queries: undefined });

      expect(executeBulkOperation).toHaveBeenCalledWith(
        [],
        expect.any(Function),
        { toolName: 'localFindFiles' }
      );
    });
  });

  describe('executeRipgrepSearch', () => {
    it('should call executeBulkOperation with queries', async () => {
      const { executeRipgrepSearch } =
        await import('../../src/tools/local_ripgrep/execution.js');
      const { executeBulkOperation } =
        await import('../../src/utils/response/bulk.js');

      const queries = [
        {
          researchGoal: 'Test',
          reasoning: 'Schema validation',
          pattern: 'test',
          path: '/test',
        },
      ] as RipgrepQuery[];
      await executeRipgrepSearch({ queries });

      expect(executeBulkOperation).toHaveBeenCalledWith(
        queries,
        expect.any(Function),
        { toolName: 'localSearchCode' }
      );
    });

    it('should pass searchContentRipgrep function as callback', async () => {
      const { executeRipgrepSearch } =
        await import('../../src/tools/local_ripgrep/execution.js');
      const { executeBulkOperation } =
        await import('../../src/utils/response/bulk.js');
      const { searchContentRipgrep } =
        await import('../../src/tools/local_ripgrep/searchContentRipgrep.js');

      const queries = [
        {
          researchGoal: 'Test',
          reasoning: 'Schema validation',
          pattern: 'test',
          path: '/test',
        },
      ] as RipgrepQuery[];
      await executeRipgrepSearch({ queries });

      const mockCall = vi.mocked(executeBulkOperation).mock.calls[0];
      expect(mockCall).toBeDefined();
      const callback = mockCall![1];

      const query = {
        researchGoal: 'Test',
        reasoning: 'Schema validation',
        pattern: 'test',
        path: '/test',
      } as RipgrepQuery;
      await callback(query, 0);

      expect(searchContentRipgrep).toHaveBeenCalledWith(query);
    });

    it('should handle undefined queries with fallback to empty array', async () => {
      const { executeRipgrepSearch } =
        await import('../../src/tools/local_ripgrep/execution.js');
      const { executeBulkOperation } =
        await import('../../src/utils/response/bulk.js');

      // @ts-expect-error Testing undefined queries
      await executeRipgrepSearch({ queries: undefined });

      expect(executeBulkOperation).toHaveBeenCalledWith(
        [],
        expect.any(Function),
        { toolName: 'localSearchCode' }
      );
    });
  });

  describe('executeViewStructure', () => {
    it('should call executeBulkOperation with queries', async () => {
      const { executeViewStructure } =
        await import('../../src/tools/local_view_structure/execution.js');
      const { executeBulkOperation } =
        await import('../../src/utils/response/bulk.js');

      const queries = [
        { researchGoal: 'Test', reasoning: 'Schema validation', path: '/test' },
      ];
      await executeViewStructure({ queries });

      expect(executeBulkOperation).toHaveBeenCalledWith(
        queries,
        expect.any(Function),
        { toolName: 'localViewStructure' }
      );
    });

    it('should pass viewStructure function as callback', async () => {
      const { executeViewStructure } =
        await import('../../src/tools/local_view_structure/execution.js');
      const { executeBulkOperation } =
        await import('../../src/utils/response/bulk.js');
      const { viewStructure } =
        await import('../../src/tools/local_view_structure/local_view_structure.js');

      const queries = [
        { researchGoal: 'Test', reasoning: 'Schema validation', path: '/test' },
      ];
      await executeViewStructure({ queries });

      const mockCall = vi.mocked(executeBulkOperation).mock.calls[0];
      expect(mockCall).toBeDefined();
      const callback = mockCall![1];

      const query = {
        researchGoal: 'Test',
        reasoning: 'Schema validation',
        path: '/test',
      };
      await callback(query, 0);

      expect(viewStructure).toHaveBeenCalledWith(query);
    });

    it('should handle undefined queries with fallback to empty array', async () => {
      const { executeViewStructure } =
        await import('../../src/tools/local_view_structure/execution.js');
      const { executeBulkOperation } =
        await import('../../src/utils/response/bulk.js');

      // @ts-expect-error Testing undefined queries
      await executeViewStructure({ queries: undefined });

      expect(executeBulkOperation).toHaveBeenCalledWith(
        [],
        expect.any(Function),
        { toolName: 'localViewStructure' }
      );
    });
  });
});

describe('Local Tools Registration', () => {
  const createMockServer = () => {
    return {
      registerTool: vi.fn().mockReturnValue(undefined),
    } as unknown as McpServer;
  };

  describe('registerLocalFetchContentTool', () => {
    it('should register the tool with correct name and schema', async () => {
      const { registerLocalFetchContentTool } =
        await import('../../src/tools/local_fetch_content/register.js');

      const mockServer = createMockServer();
      registerLocalFetchContentTool(mockServer);

      expect(mockServer.registerTool).toHaveBeenCalledWith(
        'localGetFileContent',
        expect.objectContaining({
          description: expect.any(String),
          inputSchema: expect.any(Object),
          annotations: expect.objectContaining({
            title: 'Local Fetch Content',
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
          }),
        }),
        expect.any(Function)
      );
    });
  });

  describe('registerLocalFindFilesTool', () => {
    it('should register the tool with correct name and schema', async () => {
      const { registerLocalFindFilesTool } =
        await import('../../src/tools/local_find_files/register.js');

      const mockServer = createMockServer();
      registerLocalFindFilesTool(mockServer);

      expect(mockServer.registerTool).toHaveBeenCalledWith(
        'localFindFiles',
        expect.objectContaining({
          description: expect.any(String),
          inputSchema: expect.any(Object),
          annotations: expect.objectContaining({
            title: 'Local Find Files',
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
          }),
        }),
        expect.any(Function)
      );
    });
  });

  describe('registerLocalRipgrepTool', () => {
    it('should register the tool with correct name and schema', async () => {
      const { registerLocalRipgrepTool } =
        await import('../../src/tools/local_ripgrep/register.js');

      const mockServer = createMockServer();
      registerLocalRipgrepTool(mockServer);

      expect(mockServer.registerTool).toHaveBeenCalledWith(
        'localSearchCode',
        expect.objectContaining({
          description: expect.any(String),
          inputSchema: expect.any(Object),
          annotations: expect.objectContaining({
            title: 'Local Ripgrep Search',
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
          }),
        }),
        expect.any(Function)
      );
    });
  });
});
