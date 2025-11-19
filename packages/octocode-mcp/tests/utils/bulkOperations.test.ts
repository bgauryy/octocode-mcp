import { describe, it, expect, vi } from 'vitest';
import { executeBulkOperation } from '../../src/utils/bulkOperations';
import type { QueryStatus } from '../../src/types';
import { ToolName, TOOL_NAMES } from '../../src/tools/toolMetadata';
import { getTextContent } from './testHelpers.js';

describe('executeBulkOperation', () => {
  describe('Single query scenarios', () => {
    it('should process single query with hasResults status', async () => {
      const queries = [{ id: 'q1', name: 'test1' }];
      const processor = vi.fn().mockResolvedValue({
        status: 'hasResults' as const,
        files: [{ path: 'test.ts', content: 'data' }],
        hints: ['Test hint for hasResults'],
      });

      const result = await executeBulkOperation(queries, processor, {
        toolName: TOOL_NAMES.GITHUB_SEARCH_CODE,
        keysPriority: ['files'],
      });

      expect(result.isError).toBe(false);
      expect(processor).toHaveBeenCalledTimes(1);
      expect(processor).toHaveBeenCalledWith(queries[0], 0);

      const responseText = getTextContent(result.content);
      expect(responseText).toContain('Bulk response with 1 results');
      expect(responseText).toContain('1 hasResults');
      expect(responseText).toContain('status: "hasResults"');
      expect(responseText).toContain('path: "test.ts"');
      expect(responseText).toContain('hasResultsStatusHints:');
    });

    it('should process single query with empty status', async () => {
      const queries = [{ id: 'q1', search: 'nonexistent' }];
      const processor = vi.fn().mockResolvedValue({
        status: 'empty' as const,
        files: [],
        hints: ['Test hint for empty'],
      });

      const result = await executeBulkOperation(queries, processor, {
        toolName: TOOL_NAMES.GITHUB_SEARCH_CODE,
      });

      expect(result.isError).toBe(false);
      const responseText = getTextContent(result.content);
      expect(responseText).toContain('Bulk response with 1 results');
      expect(responseText).toContain('1 empty');
      expect(responseText).toContain('status: "empty"');
      expect(responseText).toContain('emptyStatusHints:');
    });

    it('should process single query with error status', async () => {
      const queries = [{ id: 'q1' }];
      const processor = vi.fn().mockResolvedValue({
        status: 'error' as const,
        error: 'Rate limit exceeded',
        hints: ['Test hint for error'],
      });

      const result = await executeBulkOperation(queries, processor, {
        toolName: TOOL_NAMES.GITHUB_SEARCH_CODE,
      });

      expect(result.isError).toBe(false);
      const responseText = getTextContent(result.content);
      expect(responseText).toContain('1 failed');
      expect(responseText).toContain('status: "error"');
      expect(responseText).toContain('error: "Rate limit exceeded"');
      expect(responseText).toContain('errorStatusHints:');
    });

    it('should handle processor throwing error', async () => {
      const queries = [{ id: 'q1' }];
      const processor = vi.fn().mockRejectedValue(new Error('API error'));

      const result = await executeBulkOperation(queries, processor, {
        toolName: TOOL_NAMES.GITHUB_FETCH_CONTENT,
      });

      expect(result.isError).toBe(false);
      const responseText = getTextContent(result.content);
      expect(responseText).toContain('1 failed');
      expect(responseText).toContain('status: "error"');
      expect(responseText).toContain('error: "API error"');
      // Note: Thrown errors don't have hints - only errors returned with status: 'error' have hints
    });
  });

  describe('Multiple queries - same status', () => {
    it('should process multiple queries all with hasResults status', async () => {
      const queries = [
        { id: 'q1', name: 'react' },
        { id: 'q2', name: 'vue' },
        { id: 'q3', name: 'angular' },
      ];
      const processor = vi
        .fn()
        .mockImplementation(async (query: { id: string; name: string }) => ({
          status: 'hasResults' as const,
          repositories: [{ name: `${query.name}-repo` }],
        }));

      const result = await executeBulkOperation(queries, processor, {
        toolName: TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
      });

      expect(result.isError).toBe(false);
      expect(processor).toHaveBeenCalledTimes(3);

      const responseText = getTextContent(result.content);
      expect(responseText).toContain('Bulk response with 3 results');
      expect(responseText).toContain('3 hasResults');
      expect(responseText).not.toContain('empty');
      expect(responseText).not.toContain('failed');
      expect(responseText).toContain('name: "react-repo"');
      expect(responseText).toContain('name: "vue-repo"');
      expect(responseText).toContain('name: "angular-repo"');
    });

    it('should process multiple queries all with empty status', async () => {
      const queries = [
        { id: 'q1', search: 'xyz123' },
        { id: 'q2', search: 'abc456' },
      ];
      const processor = vi.fn().mockResolvedValue({
        status: 'empty' as const,
        files: [],
        hints: ['Test hint for empty'],
      });

      const result = await executeBulkOperation(queries, processor, {
        toolName: TOOL_NAMES.GITHUB_SEARCH_CODE,
      });

      expect(result.isError).toBe(false);
      const responseText = getTextContent(result.content);
      expect(responseText).toContain('Bulk response with 2 results');
      expect(responseText).toContain('2 empty');
      expect(responseText).not.toContain('hasResults');
      expect(responseText).not.toContain('failed');
      expect(responseText).toContain('emptyStatusHints:');
    });

    it('should process multiple queries all with error status', async () => {
      const queries = [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }];
      const processor = vi.fn().mockResolvedValue({
        status: 'error' as const,
        error: 'Authentication failed',
        hints: ['Test hint for error'],
      });

      const result = await executeBulkOperation(queries, processor, {
        toolName: TOOL_NAMES.GITHUB_FETCH_CONTENT,
      });

      expect(result.isError).toBe(false);
      const responseText = getTextContent(result.content);
      expect(responseText).toContain('Bulk response with 3 results');
      expect(responseText).toContain('3 failed');
      expect(responseText).not.toContain('hasResults');
      expect(responseText).not.toContain('empty');
      expect(responseText).toContain('errorStatusHints:');
    });

    it('should process multiple queries all throwing errors', async () => {
      const queries = [{ id: 'q1' }, { id: 'q2' }];
      const processor = vi.fn().mockRejectedValue(new Error('Network timeout'));

      const result = await executeBulkOperation(queries, processor, {
        toolName: TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
      });

      expect(result.isError).toBe(false);
      const responseText = getTextContent(result.content);
      expect(responseText).toContain('Bulk response with 2 results');
      expect(responseText).toContain('2 failed');
      expect(responseText).toContain('error: "Network timeout"');
    });
  });

  describe('Multiple queries - mixed statuses (2 types)', () => {
    it('should handle hasResults + empty mix', async () => {
      const queries = [
        { id: 'q1', name: 'found' },
        { id: 'q2', name: 'notfound' },
        { id: 'q3', name: 'found2' },
      ];
      const processor = vi
        .fn()
        .mockImplementation(async (query: { id: string; name: string }) => {
          const isFound = !query.name.startsWith('notfound');
          return {
            status: isFound ? ('hasResults' as const) : ('empty' as const),
            pull_requests: isFound ? [{ number: 1 }] : [],
            hints: ['Test hint'],
          };
        });

      const result = await executeBulkOperation(queries, processor, {
        toolName: TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
      });

      expect(result.isError).toBe(false);
      const responseText = getTextContent(result.content);
      expect(responseText).toContain('Bulk response with 3 results');
      expect(responseText).toContain('2 hasResults');
      expect(responseText).toContain('1 empty');
      expect(responseText).not.toContain('failed');
      expect(responseText).toContain('hasResultsStatusHints:');
      expect(responseText).toContain('emptyStatusHints:');
    });

    it('should handle hasResults + error mix', async () => {
      const queries = [
        { id: 'q1', type: 'success' },
        { id: 'q2', type: 'error' },
        { id: 'q3', type: 'success' },
      ];
      const processor = vi
        .fn()
        .mockImplementation(async (query: { id: string; type: string }) => {
          if (query.type === 'error') {
            return {
              status: 'error' as const,
              error: 'Failed to fetch',
              hints: ['Test hint for error'],
            };
          }
          return {
            status: 'hasResults' as const,
            data: { result: 'success' },
            hints: ['Test hint for success'],
          };
        });

      const result = await executeBulkOperation(queries, processor, {
        toolName: TOOL_NAMES.GITHUB_FETCH_CONTENT,
      });

      expect(result.isError).toBe(false);
      const responseText = getTextContent(result.content);
      expect(responseText).toContain('Bulk response with 3 results');
      expect(responseText).toContain('2 hasResults');
      expect(responseText).toContain('1 failed');
      expect(responseText).not.toContain(': 0 empty');
      expect(responseText).toContain('hasResultsStatusHints:');
      expect(responseText).toContain('errorStatusHints:');
    });

    it('should handle empty + error mix', async () => {
      const queries = [
        { id: 'q1', type: 'empty' },
        { id: 'q2', type: 'error' },
        { id: 'q3', type: 'empty' },
        { id: 'q4', type: 'error' },
      ];
      const processor = vi
        .fn()
        .mockImplementation(async (query: { id: string; type: string }) => {
          if (query.type === 'error') {
            throw new Error('Query failed');
          }
          return {
            status: 'empty' as const,
            files: [],
            hints: ['Test hint for empty'],
          };
        });

      const result = await executeBulkOperation(queries, processor, {
        toolName: TOOL_NAMES.GITHUB_SEARCH_CODE,
      });

      expect(result.isError).toBe(false);
      const responseText = getTextContent(result.content);
      expect(responseText).toContain('Bulk response with 4 results');
      expect(responseText).toContain('2 empty');
      expect(responseText).toContain('2 failed');
      expect(responseText).not.toContain('hasResults');
      expect(responseText).toContain('emptyStatusHints:');
      // Note: Thrown errors don't have hints - only errors returned with status: 'error' have hints
    });
  });

  describe('Multiple queries - all 3 status types', () => {
    it('should handle hasResults + empty + error mix', async () => {
      const queries = [
        { id: 'q1', type: 'hasResults' },
        { id: 'q2', type: 'empty' },
        { id: 'q3', type: 'error' },
        { id: 'q4', type: 'throw' },
      ];
      const processor = vi
        .fn()
        .mockImplementation(async (query: { id: string; type: string }) => {
          if (query.type === 'throw') {
            throw new Error('Processing failed');
          }
          if (query.type === 'error') {
            return {
              status: 'error' as const,
              error: 'Custom error',
              hints: ['Test hint for error'],
            };
          }
          return {
            status: query.type as 'hasResults' | 'empty',
            data: query.type === 'hasResults' ? { result: 'data' } : {},
            hints: ['Test hint'],
          };
        });

      const result = await executeBulkOperation(queries, processor, {
        toolName: TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
      });

      expect(result.isError).toBe(false);
      const responseText = getTextContent(result.content);
      expect(responseText).toContain('Bulk response with 4 results');
      expect(responseText).toContain('1 hasResults');
      expect(responseText).toContain('1 empty');
      expect(responseText).toContain('2 failed');
      expect(responseText).toContain('hasResultsStatusHints:');
      expect(responseText).toContain('emptyStatusHints:');
      expect(responseText).toContain('errorStatusHints:');
    });

    it('should handle balanced mix of all statuses', async () => {
      const queries = [
        { id: 'q1', type: 'hasResults' },
        { id: 'q2', type: 'hasResults' },
        { id: 'q3', type: 'empty' },
        { id: 'q4', type: 'empty' },
        { id: 'q5', type: 'error' },
        { id: 'q6', type: 'error' },
      ];
      const processor = vi
        .fn()
        .mockImplementation(async (query: { id: string; type: string }) => {
          if (query.type === 'error') {
            return { status: 'error' as const, error: 'Error occurred' };
          }
          return {
            status: query.type as QueryStatus,
            repositories: query.type === 'hasResults' ? [{ name: 'repo' }] : [],
          };
        });

      const result = await executeBulkOperation(queries, processor, {
        toolName: TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
      });

      expect(result.isError).toBe(false);
      const responseText = getTextContent(result.content);
      expect(responseText).toContain('Bulk response with 6 results');
      expect(responseText).toContain('2 hasResults');
      expect(responseText).toContain('2 empty');
      expect(responseText).toContain('2 failed');
    });
  });

  describe('Research fields propagation', () => {
    it('should propagate researchGoal from query when not in result', async () => {
      const queries = [
        {
          id: 'q1',
          researchGoal: 'Find LangGraph implementations',
        },
      ];
      const processor = vi.fn().mockResolvedValue({
        status: 'hasResults' as const,
        files: [{ path: 'test.py' }],
      });

      const result = await executeBulkOperation(queries, processor, {
        toolName: TOOL_NAMES.GITHUB_SEARCH_CODE,
      });

      const responseText = getTextContent(result.content);
      expect(responseText).toContain(
        'researchGoal: "Find LangGraph implementations"'
      );
    });

    it('should propagate reasoning from query when not in result', async () => {
      const queries = [
        {
          id: 'q1',
          reasoning: 'Looking for AI agent patterns',
        },
      ];
      const processor = vi.fn().mockResolvedValue({
        status: 'empty' as const,
        files: [],
      });

      const result = await executeBulkOperation(queries, processor, {
        toolName: TOOL_NAMES.GITHUB_SEARCH_CODE,
      });

      const responseText = getTextContent(result.content);
      expect(responseText).toContain(
        'reasoning: "Looking for AI agent patterns"'
      );
    });

    it('should propagate researchSuggestions from query when not in result', async () => {
      const queries = [
        {
          id: 'q1',
          researchSuggestions: ['Check documentation', 'Review examples'],
        },
      ];
      const processor = vi.fn().mockResolvedValue({
        status: 'hasResults' as const,
        files: [{ path: 'test.py' }],
      });

      const result = await executeBulkOperation(queries, processor, {
        toolName: TOOL_NAMES.GITHUB_SEARCH_CODE,
      });

      const responseText = getTextContent(result.content);
      expect(responseText).toContain('- "Check documentation"');
      expect(responseText).toContain('- "Review examples"');
    });

    it('should propagate all research fields from query', async () => {
      const queries = [
        {
          id: 'q1',
          researchGoal: 'Find implementations',
          reasoning: 'Looking for patterns',
          researchSuggestions: ['Suggestion 1', 'Suggestion 2'],
        },
      ];
      const processor = vi.fn().mockResolvedValue({
        status: 'hasResults' as const,
        data: { test: true },
      });

      const result = await executeBulkOperation(queries, processor, {
        toolName: TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
      });

      const responseText = getTextContent(result.content);
      expect(responseText).toContain('researchGoal: "Find implementations"');
      expect(responseText).toContain('reasoning: "Looking for patterns"');
      expect(responseText).toContain('- "Suggestion 1"');
      expect(responseText).toContain('- "Suggestion 2"');
    });

    it('should prefer result fields over query fields when both exist', async () => {
      const queries = [
        {
          id: 'q1',
          reasoning: 'Query reasoning',
          researchGoal: 'Query goal',
        },
      ];
      const processor = vi.fn().mockResolvedValue({
        status: 'hasResults' as const,
        reasoning: 'Result reasoning',
        researchGoal: 'Result goal',
        data: { test: true },
      });

      const result = await executeBulkOperation(queries, processor, {
        toolName: TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
      });

      const responseText = getTextContent(result.content);
      // Result fields should appear at result level
      expect(responseText).toContain('reasoning: "Result reasoning"');
      expect(responseText).toContain('researchGoal: "Result goal"');
      // Query fields appear in the query section, which is expected behavior
      expect(responseText).toContain('reasoning: "Query reasoning"');
      expect(responseText).toContain('researchGoal: "Query goal"');
    });

    it('should merge researchSuggestions from both query and result', async () => {
      const queries = [
        {
          id: 'q1',
          researchSuggestions: ['Query suggestion 1', 'Query suggestion 2'],
        },
      ];
      const processor = vi.fn().mockResolvedValue({
        status: 'hasResults' as const,
        researchSuggestions: ['Result suggestion 1'],
        files: [{ path: 'test.ts' }],
      });

      const result = await executeBulkOperation(queries, processor, {
        toolName: TOOL_NAMES.GITHUB_SEARCH_CODE,
      });

      const responseText = getTextContent(result.content);
      expect(responseText).toContain('- "Result suggestion 1"');
      expect(responseText).toContain('- "Query suggestion 1"');
      expect(responseText).toContain('- "Query suggestion 2"');
    });

    it('should handle research fields in error scenarios', async () => {
      const queries = [
        {
          id: 'q1',
          researchGoal: 'Test goal',
          reasoning: 'Test reasoning',
          researchSuggestions: ['Suggestion'],
        },
      ];
      const processor = vi.fn().mockRejectedValue(new Error('Failed'));

      const result = await executeBulkOperation(queries, processor, {
        toolName: TOOL_NAMES.GITHUB_SEARCH_CODE,
      });

      const responseText = getTextContent(result.content);
      expect(responseText).toContain('status: "error"');
      expect(responseText).toContain('researchGoal: "Test goal"');
      expect(responseText).toContain('reasoning: "Test reasoning"');
      expect(responseText).toContain('- "Suggestion"');
    });
  });

  describe('Custom hints handling', () => {
    it('should include custom hints for hasResults status', async () => {
      const queries = [{ id: 'q1' }];
      const processor = vi.fn().mockResolvedValue({
        status: 'hasResults' as const,
        hints: ['Custom hint 1', 'Custom hint 2'],
        data: { test: true },
      });

      const result = await executeBulkOperation(queries, processor, {
        toolName: TOOL_NAMES.GITHUB_SEARCH_CODE,
      });

      const responseText = getTextContent(result.content);
      expect(responseText).toContain('hasResultsStatusHints:');
      expect(responseText).toContain('Custom hint 1');
      expect(responseText).toContain('Custom hint 2');
    });

    it('should include custom hints for empty status', async () => {
      const queries = [{ id: 'q1' }];
      const processor = vi.fn().mockResolvedValue({
        status: 'empty' as const,
        hints: ['Try broadening search', 'Check spelling'],
        files: [],
      });

      const result = await executeBulkOperation(queries, processor, {
        toolName: TOOL_NAMES.GITHUB_SEARCH_CODE,
      });

      const responseText = getTextContent(result.content);
      expect(responseText).toContain('emptyStatusHints:');
      expect(responseText).toContain('Try broadening search');
      expect(responseText).toContain('Check spelling');
    });

    it('should include custom hints for error status', async () => {
      const queries = [{ id: 'q1' }];
      const processor = vi.fn().mockResolvedValue({
        status: 'error' as const,
        error: 'Rate limited',
        hints: ['Wait before retrying', 'Use authentication'],
      });

      const result = await executeBulkOperation(queries, processor, {
        toolName: TOOL_NAMES.GITHUB_SEARCH_CODE,
      });

      const responseText = getTextContent(result.content);
      expect(responseText).toContain('errorStatusHints:');
      expect(responseText).toContain('Wait before retrying');
      expect(responseText).toContain('Use authentication');
    });

    it('should deduplicate hints across multiple queries with same hints', async () => {
      const queries = [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }];
      const processor = vi.fn().mockResolvedValue({
        status: 'hasResults' as const,
        hints: ['Same hint for all'],
        data: { test: true },
      });

      const result = await executeBulkOperation(queries, processor, {
        toolName: TOOL_NAMES.GITHUB_SEARCH_CODE,
      });

      const responseText = getTextContent(result.content);
      const hintMatches = (responseText.match(/Same hint for all/g) || [])
        .length;
      expect(hintMatches).toBe(1);
    });

    it('should collect and deduplicate hints from mixed statuses', async () => {
      const queries = [
        { id: 'q1', type: 'hasResults' },
        { id: 'q2', type: 'hasResults' },
        { id: 'q3', type: 'empty' },
        { id: 'q4', type: 'empty' },
      ];
      const processor = vi
        .fn()
        .mockImplementation(async (query: { id: string; type: string }) => {
          if (query.type === 'hasResults') {
            return {
              status: 'hasResults' as const,
              hints: ['Success hint'],
              data: { result: true },
            };
          }
          return {
            status: 'empty' as const,
            hints: ['Empty hint'],
            files: [],
          };
        });

      const result = await executeBulkOperation(queries, processor, {
        toolName: TOOL_NAMES.GITHUB_SEARCH_CODE,
      });

      const responseText = getTextContent(result.content);
      expect(responseText).toContain('hasResultsStatusHints:');
      expect(responseText).toContain('emptyStatusHints:');
      const successHintMatches = (responseText.match(/Success hint/g) || [])
        .length;
      const emptyHintMatches = (responseText.match(/Empty hint/g) || []).length;
      expect(successHintMatches).toBe(1);
      expect(emptyHintMatches).toBe(1);
    });
  });

  describe('Tool-specific data fields', () => {
    it('should preserve all tool-specific fields in response', async () => {
      const queries = [{ id: 'q1' }];
      const processor = vi.fn().mockResolvedValue({
        status: 'hasResults' as const,
        pull_requests: [{ number: 123, title: 'Test PR' }],
        total_count: 1,
        incomplete_results: false,
      });

      const result = await executeBulkOperation(queries, processor, {
        toolName: TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
      });

      const responseText = getTextContent(result.content);
      expect(responseText).toContain('pull_requests:');
      expect(responseText).toContain('number: 123');
      expect(responseText).toContain('title: "Test PR"');
      expect(responseText).toContain('total_count: 1');
      expect(responseText).toContain('incomplete_results: false');
    });

    it('should exclude metadata fields from data section', async () => {
      const queries = [{ id: 'q1' }];
      const processor = vi.fn().mockResolvedValue({
        status: 'hasResults' as const,
        researchGoal: 'Test goal',
        reasoning: 'Test reasoning',
        researchSuggestions: ['Test'],
        error: 'Should not appear in data',
        hints: ['Test hint'],
        query: { test: 'query' },
        actualData: 'This should appear',
      });

      const result = await executeBulkOperation(queries, processor, {
        toolName: TOOL_NAMES.GITHUB_SEARCH_CODE,
      });

      const responseText = getTextContent(result.content);
      // Metadata fields should appear at result level, not in data section
      expect(responseText).toContain('researchGoal: "Test goal"');
      expect(responseText).toContain('reasoning: "Test reasoning"');
      // Extract data section more precisely - between "data:" and next top-level field
      const dataSectionMatch = responseText.match(/data:\s*\n\s+actualData:/);
      expect(dataSectionMatch).toBeTruthy();
      expect(responseText).toContain('actualData: "This should appear"');
    });

    it('should handle complex nested data structures', async () => {
      const queries = [{ id: 'q1' }];
      const processor = vi.fn().mockResolvedValue({
        status: 'hasResults' as const,
        files: [
          {
            path: 'src/index.ts',
            matches: [
              { line: 10, content: 'match1' },
              { line: 20, content: 'match2' },
            ],
          },
        ],
        metadata: {
          total: 2,
          page: 1,
        },
      });

      const result = await executeBulkOperation(queries, processor, {
        toolName: TOOL_NAMES.GITHUB_SEARCH_CODE,
      });

      const responseText = getTextContent(result.content);
      expect(responseText).toContain('path: "src/index.ts"');
      expect(responseText).toContain('line: 10');
      expect(responseText).toContain('content: "match1"');
      expect(responseText).toContain('line: 20');
      expect(responseText).toContain('content: "match2"');
      expect(responseText).toContain('total: 2');
      expect(responseText).toContain('page: 1');
    });
  });

  describe('Config options', () => {
    it('should respect keysPriority for field ordering', async () => {
      const queries = [{ id: 'q1' }];
      const processor = vi.fn().mockResolvedValue({
        status: 'hasResults' as const,
        owner: 'testowner',
        repo: 'testrepo',
        files: [{ path: 'src/index.ts' }],
      });

      const result = await executeBulkOperation(queries, processor, {
        toolName: TOOL_NAMES.GITHUB_SEARCH_CODE,
        keysPriority: ['owner', 'repo', 'files'],
      });

      expect(result.isError).toBe(false);
      const responseText = getTextContent(result.content);
      expect(responseText).toContain('owner: "testowner"');
      expect(responseText).toContain('repo: "testrepo"');
      expect(responseText).toContain('files:');
    });

    it('should work with different tool names', async () => {
      const toolNames: ToolName[] = [
        TOOL_NAMES.GITHUB_SEARCH_CODE,
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
        TOOL_NAMES.GITHUB_FETCH_CONTENT,
        TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
      ];

      for (const toolName of toolNames) {
        const queries = [{ id: 'q1' }];
        const processor = vi.fn().mockResolvedValue({
          status: 'hasResults' as const,
          data: { test: true },
        });

        const result = await executeBulkOperation(queries, processor, {
          toolName,
        });

        expect(result.isError).toBe(false);
        const responseText = getTextContent(result.content);
        expect(responseText).toContain('Bulk response with 1 results');
      }
    });

    it('should work without keysPriority', async () => {
      const queries = [{ id: 'q1' }];
      const processor = vi.fn().mockResolvedValue({
        status: 'hasResults' as const,
        files: [{ path: 'test.ts' }],
      });

      const result = await executeBulkOperation(queries, processor, {
        toolName: TOOL_NAMES.GITHUB_SEARCH_CODE,
      });

      expect(result.isError).toBe(false);
      const responseText = getTextContent(result.content);
      expect(responseText).toContain('files:');
      expect(responseText).toContain('path: "test.ts"');
    });
  });

  describe('Empty queries array', () => {
    it('should handle empty array gracefully', async () => {
      const queries: Array<{ id: string }> = [];
      const processor = vi.fn();

      const result = await executeBulkOperation(queries, processor, {
        toolName: TOOL_NAMES.GITHUB_SEARCH_CODE,
      });

      expect(result.isError).toBe(false);
      expect(processor).not.toHaveBeenCalled();

      const responseText = getTextContent(result.content);
      expect(responseText).toContain('Bulk response with 0 results');
    });
  });

  describe('Query indexing', () => {
    it('should pass correct index to processor for each query', async () => {
      const queries = [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }];
      const processor = vi.fn().mockResolvedValue({
        status: 'hasResults' as const,
        data: { test: true },
      });

      await executeBulkOperation(queries, processor, {
        toolName: TOOL_NAMES.GITHUB_SEARCH_CODE,
      });

      expect(processor).toHaveBeenCalledTimes(3);
      expect(processor).toHaveBeenNthCalledWith(1, queries[0], 0);
      expect(processor).toHaveBeenNthCalledWith(2, queries[1], 1);
      expect(processor).toHaveBeenNthCalledWith(3, queries[2], 2);
    });
  });

  describe('Error message preservation', () => {
    it('should preserve error messages from processor returning error status', async () => {
      const queries = [{ id: 'q1' }];
      const processor = vi.fn().mockResolvedValue({
        status: 'error' as const,
        error: 'Specific error: Repository not found',
      });

      const result = await executeBulkOperation(queries, processor, {
        toolName: TOOL_NAMES.GITHUB_FETCH_CONTENT,
      });

      const responseText = getTextContent(result.content);
      expect(responseText).toContain(
        'error: "Specific error: Repository not found"'
      );
    });

    it('should preserve error messages from thrown errors', async () => {
      const queries = [{ id: 'q1' }];
      const processor = vi
        .fn()
        .mockRejectedValue(new Error('Network error: Connection refused'));

      const result = await executeBulkOperation(queries, processor, {
        toolName: TOOL_NAMES.GITHUB_SEARCH_CODE,
      });

      const responseText = getTextContent(result.content);
      expect(responseText).toContain(
        'error: "Network error: Connection refused"'
      );
    });

    it('should handle different error messages for different queries', async () => {
      const queries = [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }];
      const processor = vi
        .fn()
        .mockImplementation(async (query: { id: string }) => {
          throw new Error(`Error for ${query.id}`);
        });

      const result = await executeBulkOperation(queries, processor, {
        toolName: TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
      });

      const responseText = getTextContent(result.content);
      expect(responseText).toContain('error: "Error for q1"');
      expect(responseText).toContain('error: "Error for q2"');
      expect(responseText).toContain('error: "Error for q3"');
    });
  });

  describe('Non-standard query field types', () => {
    it('should handle queries with non-string researchGoal gracefully', async () => {
      const queries = [
        {
          id: 'q1',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          researchGoal: 123 as any, // Invalid type for testing
        },
      ];
      const processor = vi.fn().mockResolvedValue({
        status: 'hasResults' as const,
        data: { test: true },
      });

      const result = await executeBulkOperation(queries, processor, {
        toolName: TOOL_NAMES.GITHUB_SEARCH_CODE,
      });

      expect(result.isError).toBe(false);
      const responseText = getTextContent(result.content);
      // Invalid types should be included in the query section as-is
      expect(responseText).toContain('researchGoal: 123');
      // But should not appear at the result level since they're not strings
      const resultsSection = responseText.split('results:')[1] || '';
      const querySection = resultsSection.split('query:')[0] || '';
      expect(querySection).not.toContain('researchGoal: 123');
    });

    it('should handle queries with non-string reasoning gracefully', async () => {
      const queries = [
        {
          id: 'q1',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          reasoning: { nested: 'object' } as any, // Invalid type for testing
        },
      ];
      const processor = vi.fn().mockResolvedValue({
        status: 'hasResults' as const,
        data: { test: true },
      });

      const result = await executeBulkOperation(queries, processor, {
        toolName: TOOL_NAMES.GITHUB_SEARCH_CODE,
      });

      expect(result.isError).toBe(false);
      const responseText = getTextContent(result.content);
      // Invalid types should be included in the query section
      expect(responseText).toContain('nested:');
      // But should not appear at the result level since they're not strings
      const lines = responseText.split('\n');
      let foundResultReasoning = false;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        if (line.includes('query:')) break; // Stop at query section
        if (line.includes('reasoning:') && !line.includes('nested')) {
          foundResultReasoning = true;
        }
      }
      expect(foundResultReasoning).toBe(false);
    });

    it('should handle queries with non-array researchSuggestions gracefully', async () => {
      const queries = [
        {
          id: 'q1',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          researchSuggestions: 'not an array' as any, // Invalid type for testing
        },
      ];
      const processor = vi.fn().mockResolvedValue({
        status: 'hasResults' as const,
        data: { test: true },
      });

      const result = await executeBulkOperation(queries, processor, {
        toolName: TOOL_NAMES.GITHUB_SEARCH_CODE,
      });

      expect(result.isError).toBe(false);
      const responseText = getTextContent(result.content);
      // Invalid types should be included in the query section
      expect(responseText).toContain('researchSuggestions: "not an array"');
    });
  });

  describe('Parallel processing', () => {
    it('should process queries in parallel', async () => {
      const queries = [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }];
      const processingOrder: number[] = [];
      const processor = vi.fn().mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (_query: any, index: number) => {
          processingOrder.push(index);
          await new Promise(resolve => setTimeout(resolve, 10));
          return {
            status: 'hasResults' as const,
            data: { processed: true },
          };
        }
      );

      await executeBulkOperation(queries, processor, {
        toolName: TOOL_NAMES.GITHUB_SEARCH_CODE,
      });

      expect(processor).toHaveBeenCalledTimes(3);
      expect(processingOrder).toHaveLength(3);
    });
  });
});
