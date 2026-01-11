/**
 * Extended coverage tests for LSP Call Hierarchy tool
 * Tests execution flow and internal helpers
 * @module tools/lsp_call_hierarchy.coverage.test
 */

import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import {
  registerLSPCallHierarchyTool,
  parseRipgrepJsonOutput,
  parseGrepOutput,
  extractFunctionBody,
  inferSymbolKind,
  createRange,
} from '../../src/tools/lsp_call_hierarchy/index.js';
import { SymbolResolver } from '../../src/lsp/index.js';
import * as lspIndex from '../../src/lsp/index.js';
import * as toolHelpers from '../../src/utils/file/toolHelpers.js';
import * as execIndex from '../../src/utils/exec/index.js';
import * as fsPromises from 'fs/promises';

// Mocks
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}));

vi.mock('../../src/lsp/index.js', () => ({
  SymbolResolver: vi.fn(),
  SymbolResolutionError: class extends Error {},
  getOrCreateClient: vi.fn(),
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

vi.mock('../../src/hints/index.js', () => {
  return {
    getHints: vi.fn(() => []),
  };
});

vi.mock('../../src/utils/response/bulk.js', () => ({
  executeBulkOperation: vi.fn(async (queries, handler) => {
    // Execute handler for each query immediately for testing
    const results = [];
    for (const query of queries) {
      results.push(await handler(query));
    }
    return { content: [{ type: 'text', text: JSON.stringify(results) }] };
  }),
}));

describe('LSP Call Hierarchy Coverage Tests', () => {
  let toolHandler: any;
  let mockServer: any;
  let mockSymbolResolver: any;
  let mockLSPClient: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    mockServer = {
      registerTool: vi.fn((name, schema, handler) => {
        toolHandler = handler;
        return { name, schema, handler };
      }),
    };

    // Setup SymbolResolver mock
    mockSymbolResolver = {
      resolvePositionFromContent: vi.fn(),
    };
    (SymbolResolver as Mock).mockImplementation(function () {
      return mockSymbolResolver;
    });

    // Setup LSP Client mock
    mockLSPClient = {
      stop: vi.fn(),
      prepareCallHierarchy: vi.fn(),
      getIncomingCalls: vi.fn(),
      getOutgoingCalls: vi.fn(),
    };
    (lspIndex.getOrCreateClient as Mock).mockResolvedValue(mockLSPClient);

    // Register tool to get handler
    registerLSPCallHierarchyTool(mockServer);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Execution Flow', () => {
    const baseQuery = {
      uri: '/workspace/file.ts',
      symbolName: 'myFunc',
      lineHint: 10,
      direction: 'incoming',
      researchGoal: 'goal',
      reasoning: 'reason',
      mainResearchGoal: 'main',
    };

    it('should handle invalid path', async () => {
      (toolHelpers.validateToolPath as Mock).mockReturnValue({
        isValid: false,
        errorResult: { isError: true, message: 'Invalid path' },
      });

      const result = await toolHandler({ queries: [baseQuery] });
      const results = JSON.parse(result.content[0].text);
      expect(results[0]).toEqual({ isError: true, message: 'Invalid path' });
    });

    it('should handle file read error', async () => {
      (toolHelpers.validateToolPath as Mock).mockReturnValue({
        isValid: true,
        sanitizedPath: '/workspace/file.ts',
      });
      (fsPromises.readFile as Mock).mockRejectedValue(
        new Error('Access denied')
      );
      (toolHelpers.createErrorResult as Mock).mockReturnValue({
        error: 'Access denied',
      });

      const result = await toolHandler({ queries: [baseQuery] });
      const results = JSON.parse(result.content[0].text);
      expect(toolHelpers.createErrorResult).toHaveBeenCalled();
      expect(results[0]).toEqual({ error: 'Access denied' });
    });

    it('should handle symbol resolution error', async () => {
      (toolHelpers.validateToolPath as Mock).mockReturnValue({
        isValid: true,
        sanitizedPath: '/workspace/file.ts',
      });
      (fsPromises.readFile as Mock).mockResolvedValue('content');

      mockSymbolResolver.resolvePositionFromContent.mockImplementation(() => {
        throw new lspIndex.SymbolResolutionError(
          'myFunc',
          10,
          'Symbol not found'
        );
      });

      const result = await toolHandler({ queries: [baseQuery] });
      const results = JSON.parse(result.content[0].text);
      expect(results[0].status).toBe('empty');
      expect(results[0].errorType).toBe('symbol_not_found');
    });

    describe('LSP Path', () => {
      beforeEach(() => {
        (toolHelpers.validateToolPath as Mock).mockReturnValue({
          isValid: true,
          sanitizedPath: '/workspace/file.ts',
        });
        (fsPromises.readFile as Mock).mockResolvedValue('function myFunc() {}');
        mockSymbolResolver.resolvePositionFromContent.mockReturnValue({
          position: { line: 0, character: 0 },
          foundAtLine: 1,
        });
        (lspIndex.isLanguageServerAvailable as Mock).mockResolvedValue(true);
      });

      it('should use LSP incoming calls when available', async () => {
        mockLSPClient.prepareCallHierarchy.mockResolvedValue([
          {
            name: 'myFunc',
            uri: 'file:///workspace/file.ts',
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 10 },
            },
            selectionRange: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 10 },
            },
          },
        ]);

        mockLSPClient.getIncomingCalls.mockResolvedValue([
          {
            from: {
              name: 'caller',
              uri: 'file:///workspace/caller.ts',
              range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 10 },
              },
              selectionRange: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 10 },
              },
            },
            fromRanges: [
              {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 10 },
              },
            ],
          },
        ]);

        const result = await toolHandler({ queries: [baseQuery] });
        const results = JSON.parse(result.content[0].text);

        expect(results[0].status).toBe('hasResults');
        expect(results[0].incomingCalls).toHaveLength(1);
        expect(results[0].incomingCalls[0].from.name).toBe('caller');
      });

      it('should handle empty incoming calls from LSP', async () => {
        mockLSPClient.prepareCallHierarchy.mockResolvedValue([
          {
            name: 'myFunc',
            uri: 'file:///workspace/file.ts',
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 10 },
            },
            selectionRange: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 10 },
            },
          },
        ]);
        mockLSPClient.getIncomingCalls.mockResolvedValue([]);

        const result = await toolHandler({ queries: [baseQuery] });
        const results = JSON.parse(result.content[0].text);

        expect(results[0].status).toBe('empty');
        expect(results[0].incomingCalls).toEqual([]);
      });

      it('should use LSP outgoing calls when available', async () => {
        const outgoingQuery = { ...baseQuery, direction: 'outgoing' };

        mockLSPClient.prepareCallHierarchy.mockResolvedValue([
          {
            name: 'myFunc',
            uri: 'file:///workspace/file.ts',
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 10 },
            },
            selectionRange: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 10 },
            },
          },
        ]);
        mockLSPClient.getOutgoingCalls.mockResolvedValue([
          {
            to: {
              name: 'callee',
              uri: 'file:///workspace/callee.ts',
              range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 10 },
              },
              selectionRange: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 10 },
              },
            },
            fromRanges: [],
          },
        ]);

        const result = await toolHandler({ queries: [outgoingQuery] });
        const results = JSON.parse(result.content[0].text);

        expect(results[0].status).toBe('hasResults');
        expect(results[0].outgoingCalls).toHaveLength(1);
        expect(results[0].outgoingCalls[0].to.name).toBe('callee');
      });

      it('should handle LSP prepareCallHierarchy returning empty', async () => {
        mockLSPClient.prepareCallHierarchy.mockResolvedValue([]);

        const result = await toolHandler({ queries: [baseQuery] });
        const results = JSON.parse(result.content[0].text);

        expect(results[0].status).toBe('empty');
        expect(results[0].error).toContain('No callable symbol found');
      });

      it('should fallback to pattern matching if LSP throws', async () => {
        mockLSPClient.prepareCallHierarchy.mockRejectedValue(
          new Error('LSP error')
        );

        // Setup fallback mocks
        (execIndex.checkCommandAvailability as Mock).mockResolvedValue({
          available: false,
        });
        (execIndex.safeExec as Mock).mockResolvedValue({
          success: true,
          stdout: '',
        }); // Grep returns nothing

        const result = await toolHandler({ queries: [baseQuery] });
        const results = JSON.parse(result.content[0].text);

        // Should have tried fallback (grep/rg)
        expect(execIndex.safeExec).toHaveBeenCalled();
        // Since grep returned empty
        expect(results[0].status).toBe('empty');
        expect(results[0].hints[0]).toContain('text-based search');
      });
    });

    describe('Pattern Matching Fallback', () => {
      beforeEach(() => {
        (toolHelpers.validateToolPath as Mock).mockReturnValue({
          isValid: true,
          sanitizedPath: '/workspace/file.ts',
        });
        (fsPromises.readFile as Mock).mockResolvedValue('function myFunc() {}');
        mockSymbolResolver.resolvePositionFromContent.mockReturnValue({
          position: { line: 0, character: 0 },
          foundAtLine: 1,
        });
        (lspIndex.isLanguageServerAvailable as Mock).mockResolvedValue(false);
      });

      it('should use ripgrep for incoming calls if available', async () => {
        (execIndex.checkCommandAvailability as Mock).mockResolvedValue({
          available: true,
        });
        (execIndex.safeExec as Mock).mockResolvedValue({
          success: true,
          stdout: JSON.stringify({
            type: 'match',
            data: {
              path: { text: '/workspace/caller.ts' },
              line_number: 5,
              lines: { text: 'myFunc();' },
              submatches: [{ start: 0 }],
            },
          }),
        });

        const result = await toolHandler({ queries: [baseQuery] });
        const results = JSON.parse(result.content[0].text);

        expect(execIndex.safeExec).toHaveBeenCalledWith(
          'rg',
          expect.any(Array),
          expect.any(Object)
        );
        expect(results[0].status).toBe('hasResults');
        expect(results[0].incomingCalls).toHaveLength(1);
      });

      it('should use grep for incoming calls if rg unavailable', async () => {
        (execIndex.checkCommandAvailability as Mock).mockResolvedValue({
          available: false,
        });
        (execIndex.safeExec as Mock).mockResolvedValue({
          success: true,
          stdout: '/workspace/caller.ts:5:myFunc();',
        });

        const result = await toolHandler({ queries: [baseQuery] });
        const results = JSON.parse(result.content[0].text);

        expect(execIndex.safeExec).toHaveBeenCalledWith(
          'grep',
          expect.any(Array),
          expect.any(Object)
        );
        expect(results[0].status).toBe('hasResults');
      });

      it('should handle search errors', async () => {
        (execIndex.checkCommandAvailability as Mock).mockResolvedValue({
          available: true,
        });
        (execIndex.safeExec as Mock).mockResolvedValue({
          success: false,
          code: 2,
          stderr: 'Search failed',
        });

        const result = await toolHandler({ queries: [baseQuery] });
        const results = JSON.parse(result.content[0].text);

        expect(results[0].status).toBe('error');
        expect(results[0].error).toContain('Search failed');
      });

      it('should find outgoing calls by parsing body', async () => {
        const outgoingQuery = { ...baseQuery, direction: 'outgoing' };
        const content = `
                function myFunc() {
                    otherFunc();
                }
            `;
        (fsPromises.readFile as Mock).mockResolvedValue(content);
        mockSymbolResolver.resolvePositionFromContent.mockReturnValue({
          position: { line: 1, character: 16 },
          foundAtLine: 2,
        });

        const result = await toolHandler({ queries: [outgoingQuery] });
        const results = JSON.parse(result.content[0].text);

        expect(results[0].status).toBe('hasResults');
        expect(results[0].outgoingCalls[0].to.name).toBe('otherFunc');
      });

      it('should handle failure to extract function body', async () => {
        const outgoingQuery = { ...baseQuery, direction: 'outgoing' };
        const content = 'function myFunc()'; // No body
        (fsPromises.readFile as Mock).mockResolvedValue(content);

        const result = await toolHandler({ queries: [outgoingQuery] });
        const results = JSON.parse(result.content[0].text);

        expect(results[0].status).toBe('empty');
        expect(results[0].hints).toContain('Could not extract function body');
      });
    });
  });

  // Unit tests for helper functions
  describe('parseRipgrepJsonOutput', () => {
    it('should parse valid match', () => {
      const output = JSON.stringify({
        type: 'match',
        data: {
          path: { text: '/file.ts' },
          line_number: 1,
          submatches: [{ start: 0 }],
          lines: { text: 'content' },
        },
      });
      const results = parseRipgrepJsonOutput(output);
      expect(results).toHaveLength(1);
    });

    it('should skip invalid lines', () => {
      const results = parseRipgrepJsonOutput('invalid json');
      expect(results).toHaveLength(0);
    });
  });

  describe('parseGrepOutput', () => {
    it('should parse grep output', () => {
      const results = parseGrepOutput('/file.ts:1:content');
      expect(results).toHaveLength(1);
      expect(results[0]!.filePath).toBe('/file.ts');
      expect(results[0]!.lineNumber).toBe(1);
      expect(results[0]!.lineContent).toBe('content');
    });

    it('should skip invalid lines', () => {
      const results = parseGrepOutput('invalid line');
      expect(results).toHaveLength(0);
    });
  });

  describe('extractFunctionBody', () => {
    it('should extract body', () => {
      const lines = ['function f() {', '  return 1;', '}'];
      const result = extractFunctionBody(lines, 0);
      expect(result).not.toBeNull();
      expect(result!.lines).toHaveLength(2);
    });

    it('should handle empty lines', () => {
      const lines = ['function f() {', '', '  return 1;', '}'];
      const result = extractFunctionBody(lines, 0);
      expect(result).not.toBeNull();
      expect(result!.lines).toHaveLength(3);
    });

    it('should return null if no brace', () => {
      const lines = ['function f()'];
      const result = extractFunctionBody(lines, 0);
      expect(result).toBeNull();
    });

    it('should handle multiple braces on same line', () => {
      // Tests the brace counting branch: line[j] === '{' braceCount++ and line[j] === '}' braceCount--
      const lines = ['function f() { if (true) { return 1; } }'];
      const result = extractFunctionBody(lines, 0);
      expect(result).not.toBeNull();
      // After the first '{', we count: '{ return 1; }' has +1 '{' and +2 '}' on same line
    });

    it('should handle nested braces across lines', () => {
      const lines = [
        'function outer() {',
        '  if (true) {',
        '    return { value: 1 };',
        '  }',
        '}',
      ];
      const result = extractFunctionBody(lines, 0);
      expect(result).not.toBeNull();
      expect(result!.lines.length).toBeGreaterThanOrEqual(3);
    });

    it('should handle inline brace on opening line', () => {
      // Cover line 1204-1206: counting braces within same line after opening brace
      const lines = ['function f() { const x = {}; return x; }'];
      const result = extractFunctionBody(lines, 0);
      expect(result).not.toBeNull();
    });

    it('should slice content before closing brace when brace is not at start', () => {
      // Cover line 1233-1234: lastBraceIndex > 0 case
      const lines = ['function f() {', '  return 1;', '  /* comment */ }'];
      const result = extractFunctionBody(lines, 0);
      expect(result).not.toBeNull();
      // The last line should be trimmed before the closing brace
    });
  });

  describe('inferSymbolKind', () => {
    it('should infer function', () => {
      expect(inferSymbolKind('function f() {}')).toBe('function');
    });

    it('should infer class', () => {
      expect(inferSymbolKind('class C {}')).toBe('class');
    });

    it('should infer interface', () => {
      expect(inferSymbolKind('interface I {}')).toBe('interface');
    });

    it('should infer const', () => {
      expect(inferSymbolKind('const c = 1;')).toBe('constant');
    });

    it('should infer variable', () => {
      expect(inferSymbolKind('let v = 1;')).toBe('variable');
    });

    it('should infer type', () => {
      expect(inferSymbolKind('type MyType = string;')).toBe('type');
    });

    it('should infer enum', () => {
      expect(inferSymbolKind('enum Status { Active, Inactive }')).toBe('enum');
    });

    it('should infer namespace', () => {
      expect(inferSymbolKind('namespace MyApp {}')).toBe('namespace');
    });

    it('should infer module', () => {
      expect(inferSymbolKind('module MyModule {}')).toBe('module');
    });

    it('should infer var as variable', () => {
      expect(inferSymbolKind('var x = 1;')).toBe('variable');
    });

    it('should infer const arrow function as function not constant', () => {
      expect(inferSymbolKind('const myFunc = () => {}')).toBe('function');
    });

    it('should infer const function as function not constant', () => {
      expect(inferSymbolKind('const myFunc = function() {}')).toBe('function');
    });

    it('should infer let arrow function as function not variable', () => {
      expect(inferSymbolKind('let myFunc = (x) => x')).toBe('function');
    });
  });

  describe('createRange', () => {
    it('should create range', () => {
      const range = createRange(0, 0, 5);
      expect(range).toEqual({
        start: { line: 0, character: 0 },
        end: { line: 0, character: 5 },
      });
    });

    it('should create range with non-zero character offset', () => {
      const range = createRange(10, 5, 15);
      expect(range).toEqual({
        start: { line: 10, character: 5 },
        end: { line: 10, character: 20 },
      });
    });
  });

  describe('createCallHierarchyItemFromSite - method matching', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should detect method defined as myMethod(args) {', async () => {
      (toolHelpers.validateToolPath as Mock).mockReturnValue({
        isValid: true,
        sanitizedPath: '/workspace/file.ts',
      });

      // Content where a method is defined with myMethod(args): pattern
      const fileContent = `class Service {
  handleRequest(req: Request): void {
    this.myFunc();
  }
}`;
      (fsPromises.readFile as Mock).mockResolvedValue(fileContent);
      mockSymbolResolver.resolvePositionFromContent.mockReturnValue({
        position: { line: 2, character: 9 },
        foundAtLine: 3,
      });
      (lspIndex.isLanguageServerAvailable as Mock).mockResolvedValue(false);
      (execIndex.checkCommandAvailability as Mock).mockResolvedValue({
        available: false,
      });
      (execIndex.safeExec as Mock).mockResolvedValue({
        success: true,
        stdout: '/workspace/caller.ts:3:    this.myFunc();',
      });

      const query = {
        uri: '/workspace/file.ts',
        symbolName: 'myFunc',
        lineHint: 3,
        direction: 'incoming',
        researchGoal: 'goal',
        reasoning: 'reason',
        mainResearchGoal: 'main',
      };

      const result = await toolHandler({ queries: [query] });
      const results = JSON.parse(result.content[0].text);

      expect(results[0].status).toBe('hasResults');
    });

    it('should detect async method pattern', async () => {
      (toolHelpers.validateToolPath as Mock).mockReturnValue({
        isValid: true,
        sanitizedPath: '/workspace/file.ts',
      });

      // Content with async method
      const fileContent = `class Service {
  async processData(data): Promise<void> {
    await myFunc();
  }
}`;
      (fsPromises.readFile as Mock).mockResolvedValue(fileContent);
      mockSymbolResolver.resolvePositionFromContent.mockReturnValue({
        position: { line: 2, character: 10 },
        foundAtLine: 3,
      });
      (lspIndex.isLanguageServerAvailable as Mock).mockResolvedValue(false);
      (execIndex.checkCommandAvailability as Mock).mockResolvedValue({
        available: false,
      });
      (execIndex.safeExec as Mock).mockResolvedValue({
        success: true,
        stdout: '/workspace/caller.ts:3:    await myFunc();',
      });

      const query = {
        uri: '/workspace/file.ts',
        symbolName: 'myFunc',
        lineHint: 3,
        direction: 'incoming',
        researchGoal: 'goal',
        reasoning: 'reason',
        mainResearchGoal: 'main',
      };

      const result = await toolHandler({ queries: [query] });
      const results = JSON.parse(result.content[0].text);

      expect(results[0].status).toBe('hasResults');
    });

    it('should handle file read error gracefully in createCallHierarchyItemFromSite', async () => {
      (toolHelpers.validateToolPath as Mock).mockReturnValue({
        isValid: true,
        sanitizedPath: '/workspace/file.ts',
      });
      (fsPromises.readFile as Mock)
        .mockResolvedValueOnce('function myFunc() {}') // First call for main handler
        .mockRejectedValueOnce(new Error('File not found')); // Second call fails for call site

      mockSymbolResolver.resolvePositionFromContent.mockReturnValue({
        position: { line: 0, character: 0 },
        foundAtLine: 1,
      });
      (lspIndex.isLanguageServerAvailable as Mock).mockResolvedValue(false);
      (execIndex.checkCommandAvailability as Mock).mockResolvedValue({
        available: false,
      });
      (execIndex.safeExec as Mock).mockResolvedValue({
        success: true,
        stdout: '/workspace/caller.ts:5:myFunc();',
      });

      const query = {
        uri: '/workspace/file.ts',
        symbolName: 'myFunc',
        lineHint: 1,
        direction: 'incoming',
        researchGoal: 'goal',
        reasoning: 'reason',
        mainResearchGoal: 'main',
      };

      const result = await toolHandler({ queries: [query] });
      const results = JSON.parse(result.content[0].text);

      // Should still have results, but with default 'unknown' enclosing function
      expect(results[0].status).toBe('hasResults');
    });
  });
});
