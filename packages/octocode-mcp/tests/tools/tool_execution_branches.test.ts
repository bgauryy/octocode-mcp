/**
 * Branch coverage tests for tool execution functions
 * Targets uncovered branches in execution.ts files and lspReferencesCore.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LSPFindReferencesQuery } from '../../src/tools/lsp_find_references/scheme.js';

// Mock fs/promises for lspReferencesCore
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}));

// Mock LSP client creation
vi.mock('../../src/lsp/index.js', () => ({
  createClient: vi.fn(),
}));

// Mock hints
vi.mock('../../src/hints/index.js', () => ({
  getHints: vi.fn(() => []),
}));

// Mock executeBulkOperation for execution files
vi.mock('../../src/utils/response/bulk.js', () => ({
  executeBulkOperation: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: '' }],
    isError: false,
  }),
}));

// Mock withSecurityValidation to pass through handler
vi.mock('../../src/security/withSecurityValidation.js', () => ({
  withSecurityValidation: vi.fn((_toolName, handler) => handler),
  withBasicSecurityValidation: vi.fn(handler => handler),
}));

// Mock invokeCallbackSafely
vi.mock('../../src/tools/utils.js', () => ({
  invokeCallbackSafely: vi.fn().mockResolvedValue(undefined),
}));

// Mock searchMultipleGitHubCode, searchMultipleGitHubRepos, exploreMultipleRepositoryStructures
vi.mock('../../src/tools/github_search_code/execution.js', () => ({
  searchMultipleGitHubCode: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: '' }],
    isError: false,
  }),
}));

vi.mock('../../src/tools/github_search_repos/execution.js', () => ({
  searchMultipleGitHubRepos: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: '' }],
    isError: false,
  }),
}));

vi.mock('../../src/tools/github_view_repo_structure/execution.js', () => ({
  exploreMultipleRepositoryStructures: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: '' }],
    isError: false,
  }),
}));

// Import after mocks
import * as fs from 'fs/promises';
import { createClient } from '../../src/lsp/index.js';
import { executeBulkOperation } from '../../src/utils/response/bulk.js';
import { findReferencesWithLSP } from '../../src/tools/lsp_find_references/lspReferencesCore.js';
import { executeCallHierarchy } from '../../src/tools/lsp_call_hierarchy/execution.js';
import { executeFindReferences } from '../../src/tools/lsp_find_references/execution.js';
import { registerGitHubSearchCodeTool } from '../../src/tools/github_search_code/github_search_code.js';
import { registerSearchGitHubReposTool } from '../../src/tools/github_search_repos/github_search_repos.js';
import { registerViewGitHubRepoStructureTool } from '../../src/tools/github_view_repo_structure/github_view_repo_structure.js';
import { searchMultipleGitHubCode } from '../../src/tools/github_search_code/execution.js';
import { searchMultipleGitHubRepos } from '../../src/tools/github_search_repos/execution.js';
import { exploreMultipleRepositoryStructures } from '../../src/tools/github_view_repo_structure/execution.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

describe('Tool Execution Branch Coverage Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('lspReferencesCore.ts - findReferencesWithLSP', () => {
    it('should return empty result when LSP returns no locations (line 47)', async () => {
      const mockClient = {
        findReferences: vi.fn().mockResolvedValue([]),
        stop: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const query: LSPFindReferencesQuery = {
        uri: '/workspace/src/file.ts',
        symbolName: 'testFunction',
        lineHint: 5,
        researchGoal: 'test',
        reasoning: 'test',
      } as any;

      const result = await findReferencesWithLSP(
        '/workspace/src/file.ts',
        '/workspace',
        { line: 0, character: 9 },
        query
      );

      expect(result).not.toBeNull();
      expect(result?.status).toBe('empty');
      expect(mockClient.findReferences).toHaveBeenCalled();
      expect(mockClient.stop).toHaveBeenCalled();
    });

    it('should return empty result when LSP returns null locations (line 47)', async () => {
      const mockClient = {
        findReferences: vi.fn().mockResolvedValue(null),
        stop: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(createClient).mockResolvedValue(mockClient as any);

      const query: LSPFindReferencesQuery = {
        uri: '/workspace/src/file.ts',
        symbolName: 'testFunction',
        lineHint: 5,
        researchGoal: 'test',
        reasoning: 'test',
      } as any;

      const result = await findReferencesWithLSP(
        '/workspace/src/file.ts',
        '/workspace',
        { line: 0, character: 9 },
        query
      );

      expect(result).not.toBeNull();
      expect(result?.status).toBe('empty');
      expect(mockClient.stop).toHaveBeenCalled();
    });

    it('should set hasMultipleFiles to true when references span multiple files (line 110)', async () => {
      const mockClient = {
        findReferences: vi.fn().mockResolvedValue([
          {
            uri: '/workspace/src/file1.ts',
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 10 },
            },
            content: 'testFunction()',
          },
          {
            uri: '/workspace/src/file2.ts',
            range: {
              start: { line: 5, character: 0 },
              end: { line: 5, character: 10 },
            },
            content: 'testFunction()',
          },
        ]),
        stop: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(createClient).mockResolvedValue(mockClient as any);
      vi.mocked(fs.readFile).mockResolvedValue('test content');

      const query: LSPFindReferencesQuery = {
        uri: '/workspace/src/file.ts',
        symbolName: 'testFunction',
        lineHint: 5,
        researchGoal: 'test',
        reasoning: 'test',
        referencesPerPage: 20,
        page: 1,
      } as any;

      const result = await findReferencesWithLSP(
        '/workspace/src/file.ts',
        '/workspace',
        { line: 0, character: 9 },
        query
      );

      expect(result).not.toBeNull();
      expect(result?.status).toBe('hasResults');
      expect(result?.hasMultipleFiles).toBe(true);
      expect(result?.hints).toContainEqual(
        expect.stringContaining('References span 2 files')
      );
      expect(mockClient.stop).toHaveBeenCalled();
    });
  });

  describe('lsp_call_hierarchy/execution.ts - executeCallHierarchy', () => {
    it('should handle falsy queries (line 20)', async () => {
      const result = await executeCallHierarchy({ queries: undefined } as any);

      expect(executeBulkOperation).toHaveBeenCalledWith(
        [],
        expect.any(Function),
        expect.objectContaining({ toolName: expect.any(String) })
      );
      expect(result).toBeDefined();
    });

    it('should handle null queries (line 20)', async () => {
      const result = await executeCallHierarchy({ queries: null } as any);

      expect(executeBulkOperation).toHaveBeenCalledWith(
        [],
        expect.any(Function),
        expect.objectContaining({ toolName: expect.any(String) })
      );
      expect(result).toBeDefined();
    });
  });

  describe('lsp_find_references/execution.ts - executeFindReferences', () => {
    it('should handle falsy queries (line 20)', async () => {
      const result = await executeFindReferences({ queries: undefined } as any);

      expect(executeBulkOperation).toHaveBeenCalledWith(
        [],
        expect.any(Function),
        expect.objectContaining({ toolName: expect.any(String) })
      );
      expect(result).toBeDefined();
    });

    it('should handle null queries (line 20)', async () => {
      const result = await executeFindReferences({ queries: null } as any);

      expect(executeBulkOperation).toHaveBeenCalledWith(
        [],
        expect.any(Function),
        expect.objectContaining({ toolName: expect.any(String) })
      );
      expect(result).toBeDefined();
    });
  });

  describe('github_search_code/github_search_code.ts - registerGitHubSearchCodeTool', () => {
    it('should handle falsy queries (line 38)', async () => {
      const mockServer = {
        registerTool: vi.fn().mockReturnValue(undefined),
      } as unknown as McpServer;

      registerGitHubSearchCodeTool(mockServer);

      expect(mockServer.registerTool).toHaveBeenCalled();

      // Get the handler function (it's wrapped by withSecurityValidation which we mocked to pass through)
      const registerCall = vi.mocked(mockServer.registerTool).mock.calls[0]!;
      const handler = registerCall[2] as any;

      const mockAuthInfo = {};
      const mockSessionId = 'test-session';

      await handler({ queries: undefined }, mockAuthInfo, mockSessionId);

      // Verify the handler was called and searchMultipleGitHubCode received empty array
      expect(searchMultipleGitHubCode).toHaveBeenCalledWith(
        expect.objectContaining({ queries: [] })
      );
    });
  });

  describe('github_search_repos/github_search_repos.ts - registerSearchGitHubReposTool', () => {
    it('should handle falsy queries (line 38)', async () => {
      const mockServer = {
        registerTool: vi.fn().mockReturnValue(undefined),
      } as unknown as McpServer;

      registerSearchGitHubReposTool(mockServer);

      expect(mockServer.registerTool).toHaveBeenCalled();

      // Get the handler function
      const registerCall = vi.mocked(mockServer.registerTool).mock.calls[0]!;
      const handler = registerCall[2] as any;

      const mockAuthInfo = {};
      const mockSessionId = 'test-session';

      await handler({ queries: undefined }, mockAuthInfo, mockSessionId);

      // Verify searchMultipleGitHubRepos received empty array
      expect(searchMultipleGitHubRepos).toHaveBeenCalledWith(
        expect.objectContaining({ queries: [] })
      );
    });
  });

  describe('github_view_repo_structure/github_view_repo_structure.ts - registerViewGitHubRepoStructureTool', () => {
    it('should handle falsy queries (line 39)', async () => {
      const mockServer = {
        registerTool: vi.fn().mockReturnValue(undefined),
      } as unknown as McpServer;

      registerViewGitHubRepoStructureTool(mockServer);

      expect(mockServer.registerTool).toHaveBeenCalled();

      // Get the handler function
      const registerCall = vi.mocked(mockServer.registerTool).mock.calls[0]!;
      const handler = registerCall[2] as any;

      const mockAuthInfo = {};
      const mockSessionId = 'test-session';

      await handler({ queries: undefined }, mockAuthInfo, mockSessionId);

      // Verify exploreMultipleRepositoryStructures received empty array
      expect(exploreMultipleRepositoryStructures).toHaveBeenCalledWith(
        expect.objectContaining({ queries: [] })
      );
    });
  });
});
