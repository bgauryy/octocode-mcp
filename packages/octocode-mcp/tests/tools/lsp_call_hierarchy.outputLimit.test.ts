/**
 * Tests for lspCallHierarchy output size limits.
 * Verifies that large call hierarchy results are auto-paginated
 * and that charOffset/charLength work for manual pagination.
 */
import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { SymbolResolver } from '../../src/lsp/index.js';
import * as lspIndex from '../../src/lsp/index.js';
import * as toolHelpers from '../../src/utils/file/toolHelpers.js';
import * as execIndex from '../../src/utils/exec/index.js';
import * as fsPromises from 'fs/promises';
import { registerLSPCallHierarchyTool } from '../../src/tools/lsp_call_hierarchy/index.js';

// Mocks
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}));

vi.mock('../../src/lsp/index.js', () => ({
  SymbolResolver: vi.fn(),
  SymbolResolutionError: class extends Error {},
  createClient: vi.fn(),
  isLanguageServerAvailable: vi.fn(),
}));

vi.mock('../../src/utils/file/toolHelpers.js', () => ({
  validateToolPath: vi.fn(),
  createErrorResult: vi.fn(error => ({
    isError: true,
    error: error?.message || String(error),
    status: 'error',
  })),
}));

vi.mock('../../src/utils/exec/index.js', () => ({
  safeExec: vi.fn(),
  checkCommandAvailability: vi.fn(),
}));

vi.mock('../../src/hints/index.js', () => ({
  getHints: vi.fn(() => []),
}));

vi.mock('../../src/utils/response/bulk.js', () => ({
  executeBulkOperation: vi.fn(async (queries, handler) => {
    const results = [];
    for (const query of queries) {
      results.push(await handler(query));
    }
    return { content: [{ type: 'text', text: JSON.stringify(results) }] };
  }),
}));

function createLargeIncomingCalls(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    from: {
      name: `caller${i}`,
      kind: 'function',
      uri: `/workspace/file${i}.ts`,
      range: {
        start: { line: i, character: 0 },
        end: { line: i + 10, character: 0 },
      },
      selectionRange: {
        start: { line: i, character: 5 },
        end: { line: i, character: 15 },
      },
      content: `function caller${i}() { targetFunction(); /* ${'x'.repeat(500)} */ }`,
    },
    fromRanges: [
      {
        start: { line: i + 2, character: 5 },
        end: { line: i + 2, character: 20 },
      },
    ],
  }));
}

describe('lspCallHierarchy output size limits', () => {
  let toolHandler: (args: { queries: unknown[] }) => Promise<{
    content: { type: string; text: string }[];
  }>;
  let mockServer: { registerTool: ReturnType<typeof vi.fn> };
  let mockSymbolResolver: {
    resolvePositionFromContent: ReturnType<typeof vi.fn>;
  };
  let mockLSPClient: {
    stop: ReturnType<typeof vi.fn>;
    prepareCallHierarchy: ReturnType<typeof vi.fn>;
    getIncomingCalls: ReturnType<typeof vi.fn>;
    getOutgoingCalls: ReturnType<typeof vi.fn>;
  };

  const targetItem = {
    name: 'targetFunction',
    kind: 'function',
    uri: '/workspace/file.ts',
    range: {
      start: { line: 5, character: 0 },
      end: { line: 10, character: 1 },
    },
    selectionRange: {
      start: { line: 5, character: 10 },
      end: { line: 5, character: 24 },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockServer = {
      registerTool: vi.fn((_name, _schema, handler) => {
        toolHandler = handler;
        return { name: _name, schema: _schema, handler };
      }),
    };

    mockSymbolResolver = {
      resolvePositionFromContent: vi.fn().mockReturnValue({
        position: { line: 5, character: 10 },
        foundAtLine: 6,
      }),
    };
    (SymbolResolver as Mock).mockImplementation(function () {
      return mockSymbolResolver;
    });

    mockLSPClient = {
      stop: vi.fn(),
      prepareCallHierarchy: vi.fn().mockResolvedValue([targetItem]),
      getIncomingCalls: vi.fn().mockResolvedValue([]),
      getOutgoingCalls: vi.fn().mockResolvedValue([]),
    };
    (lspIndex.createClient as Mock).mockResolvedValue(mockLSPClient);

    // Default path and file mocks
    (toolHelpers.validateToolPath as Mock).mockReturnValue({
      isValid: true,
      sanitizedPath: '/workspace/file.ts',
    });
    (fsPromises.readFile as Mock).mockResolvedValue(
      'function targetFunction() {\n  doSomething();\n}\n'
    );
    (lspIndex.isLanguageServerAvailable as Mock).mockResolvedValue(true);
    (execIndex.checkCommandAvailability as Mock).mockResolvedValue({
      available: false,
    });

    registerLSPCallHierarchyTool(
      mockServer as unknown as Parameters<
        typeof registerLSPCallHierarchyTool
      >[0]
    );
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('auto-pagination on large output', () => {
    it('should auto-paginate when LSP result produces large output', async () => {
      // Create many incoming calls with large content snippets
      const largeCalls = createLargeIncomingCalls(100);
      mockLSPClient.getIncomingCalls.mockResolvedValue(largeCalls);

      const result = await toolHandler({
        queries: [
          {
            uri: '/workspace/file.ts',
            symbolName: 'targetFunction',
            lineHint: 6,
            direction: 'incoming',
            depth: 1,
            contextLines: 0,
            researchGoal: 'test',
            reasoning: 'test',
            mainResearchGoal: 'test',
          },
        ],
      });

      const results = JSON.parse(result.content[0]!.text);
      const firstResult = results[0];

      expect(firstResult.status).toBe('hasResults');
      // Large output should trigger auto-pagination
      expect(firstResult.outputPagination).toBeDefined();
      expect(firstResult.outputPagination.charOffset).toBe(0);
      expect(firstResult.outputPagination.totalChars).toBeGreaterThan(2000);
      expect(firstResult.outputPagination.hasMore).toBeDefined();
    });

    it('should NOT add outputPagination when output is small', async () => {
      // Small output: just 1 caller with minimal content
      mockLSPClient.getIncomingCalls.mockResolvedValue([
        {
          from: {
            name: 'smallCaller',
            kind: 'function',
            uri: '/workspace/small.ts',
            range: {
              start: { line: 0, character: 0 },
              end: { line: 1, character: 0 },
            },
            selectionRange: {
              start: { line: 0, character: 5 },
              end: { line: 0, character: 16 },
            },
          },
          fromRanges: [
            {
              start: { line: 2, character: 0 },
              end: { line: 2, character: 10 },
            },
          ],
        },
      ]);

      const result = await toolHandler({
        queries: [
          {
            uri: '/workspace/file.ts',
            symbolName: 'targetFunction',
            lineHint: 6,
            direction: 'incoming',
            depth: 1,
            contextLines: 0,
            researchGoal: 'test',
            reasoning: 'test',
            mainResearchGoal: 'test',
          },
        ],
      });

      const results = JSON.parse(result.content[0]!.text);
      const firstResult = results[0];

      expect(firstResult.status).toBe('hasResults');
      expect(firstResult.outputPagination).toBeUndefined();
    });
  });

  describe('explicit charOffset/charLength', () => {
    it('should apply charLength to limit output', async () => {
      const largeCalls = createLargeIncomingCalls(50);
      mockLSPClient.getIncomingCalls.mockResolvedValue(largeCalls);

      const result = await toolHandler({
        queries: [
          {
            uri: '/workspace/file.ts',
            symbolName: 'targetFunction',
            lineHint: 6,
            direction: 'incoming',
            depth: 1,
            contextLines: 0,
            charLength: 1000,
            researchGoal: 'test',
            reasoning: 'test',
            mainResearchGoal: 'test',
          },
        ],
      });

      const results = JSON.parse(result.content[0]!.text);
      const firstResult = results[0];

      expect(firstResult.status).toBe('hasResults');
      expect(firstResult.outputPagination).toBeDefined();
      expect(firstResult.outputPagination.charLength).toBeLessThanOrEqual(1000);
      expect(firstResult.outputPagination.charOffset).toBe(0);
    });

    it('should apply charOffset for next page navigation', async () => {
      const largeCalls = createLargeIncomingCalls(50);
      mockLSPClient.getIncomingCalls.mockResolvedValue(largeCalls);

      const result = await toolHandler({
        queries: [
          {
            uri: '/workspace/file.ts',
            symbolName: 'targetFunction',
            lineHint: 6,
            direction: 'incoming',
            depth: 1,
            contextLines: 0,
            charOffset: 500,
            charLength: 1000,
            researchGoal: 'test',
            reasoning: 'test',
            mainResearchGoal: 'test',
          },
        ],
      });

      const results = JSON.parse(result.content[0]!.text);
      const firstResult = results[0];

      expect(firstResult.status).toBe('hasResults');
      expect(firstResult.outputPagination).toBeDefined();
      expect(firstResult.outputPagination.charOffset).toBe(500);
    });
  });

  describe('empty/error results bypass output limit', () => {
    it('should NOT apply output limit when result is empty', async () => {
      mockLSPClient.getIncomingCalls.mockResolvedValue([]);

      const result = await toolHandler({
        queries: [
          {
            uri: '/workspace/file.ts',
            symbolName: 'targetFunction',
            lineHint: 6,
            direction: 'incoming',
            depth: 1,
            contextLines: 0,
            researchGoal: 'test',
            reasoning: 'test',
            mainResearchGoal: 'test',
          },
        ],
      });

      const results = JSON.parse(result.content[0]!.text);
      const firstResult = results[0];

      expect(firstResult.status).toBe('empty');
      expect(firstResult.outputPagination).toBeUndefined();
    });

    it('should NOT apply output limit when LSP returns null and pattern matching has empty results', async () => {
      // Make LSP return null (prepareCallHierarchy returns null)
      (lspIndex.createClient as Mock).mockResolvedValue(null);

      // Pattern matching fallback: mock rg as unavailable, grep returns no matches
      (execIndex.checkCommandAvailability as Mock).mockResolvedValue({
        available: false,
      });
      (execIndex.safeExec as Mock).mockResolvedValue({
        success: true,
        code: 0,
        stdout: '',
        stderr: '',
      });

      const result = await toolHandler({
        queries: [
          {
            uri: '/workspace/file.ts',
            symbolName: 'targetFunction',
            lineHint: 6,
            direction: 'incoming',
            depth: 1,
            contextLines: 0,
            researchGoal: 'test',
            reasoning: 'test',
            mainResearchGoal: 'test',
          },
        ],
      });

      const results = JSON.parse(result.content[0]!.text);
      const firstResult = results[0];

      expect(firstResult.status).toBe('empty');
      expect(firstResult.outputPagination).toBeUndefined();
    });
  });

  describe('file read error branches', () => {
    it('should handle non-Error thrown from readFile', async () => {
      (fsPromises.readFile as Mock).mockRejectedValue('string error');
      (toolHelpers.createErrorResult as Mock).mockReturnValue({
        status: 'error',
        error: 'File access failed',
      });

      const result = await toolHandler({
        queries: [
          {
            uri: '/workspace/file.ts',
            symbolName: 'targetFunction',
            lineHint: 6,
            direction: 'incoming',
            depth: 1,
            researchGoal: 'test',
            reasoning: 'test',
            mainResearchGoal: 'test',
          },
        ],
      });

      const results = JSON.parse(result.content[0]!.text);
      expect(results[0].status).toBe('error');
    });
  });

  describe('outgoing direction with output limits', () => {
    it('should auto-paginate large outgoing call results', async () => {
      const largeCalls = Array.from({ length: 100 }, (_, i) => ({
        to: {
          name: `callee${i}`,
          kind: 'function',
          uri: `/workspace/callee${i}.ts`,
          range: {
            start: { line: i, character: 0 },
            end: { line: i + 10, character: 0 },
          },
          selectionRange: {
            start: { line: i, character: 5 },
            end: { line: i, character: 15 },
          },
          content: `function callee${i}() { /* ${'y'.repeat(500)} */ }`,
        },
        fromRanges: [
          {
            start: { line: i + 1, character: 3 },
            end: { line: i + 1, character: 15 },
          },
        ],
      }));
      mockLSPClient.getOutgoingCalls.mockResolvedValue(largeCalls);

      const result = await toolHandler({
        queries: [
          {
            uri: '/workspace/file.ts',
            symbolName: 'targetFunction',
            lineHint: 6,
            direction: 'outgoing',
            depth: 1,
            contextLines: 0,
            researchGoal: 'test',
            reasoning: 'test',
            mainResearchGoal: 'test',
          },
        ],
      });

      const results = JSON.parse(result.content[0]!.text);
      const firstResult = results[0];

      expect(firstResult.status).toBe('hasResults');
      expect(firstResult.outputPagination).toBeDefined();
      expect(firstResult.outputPagination.totalChars).toBeGreaterThan(2000);
    });
  });
});
