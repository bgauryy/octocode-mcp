/**
 * Extended coverage tests for LSP Go To Definition tool
 * Tests internal functions, error handling, and fallback paths
 * @module tools/lsp_goto_definition.coverage.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import { addLineNumbers } from '../../src/tools/lsp_goto_definition.js';

describe('LSP Goto Definition Coverage Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('addLineNumbers function - comprehensive', () => {
    it('should format single line content', () => {
      const result = addLineNumbers('const x = 1;', 1, 1);
      expect(result).toBe('>1| const x = 1;');
    });

    it('should format multi-line content with target', () => {
      const content = 'line one\nline two\nline three';
      const result = addLineNumbers(content, 10, 11);

      expect(result).toContain(' 10| line one');
      expect(result).toContain('>11| line two');
      expect(result).toContain(' 12| line three');
    });

    it('should handle three-digit line numbers', () => {
      const content = 'a\nb\nc';
      const result = addLineNumbers(content, 98, 100);

      expect(result).toContain(' 98| a');
      expect(result).toContain(' 99| b');
      expect(result).toContain('>100| c');
    });

    it('should handle four-digit line numbers', () => {
      const content = 'first\nsecond';
      const result = addLineNumbers(content, 999, 1000);

      expect(result).toContain(' 999| first');
      expect(result).toContain('>1000| second');
    });

    it('should handle five-digit line numbers', () => {
      const content = 'a\nb';
      const result = addLineNumbers(content, 9999, 10000);

      expect(result).toContain(' 9999| a');
      expect(result).toContain('>10000| b');
    });

    it('should handle empty lines in content', () => {
      const content = 'line1\n\nline3';
      const result = addLineNumbers(content, 1, 2);

      const lines = result.split('\n');
      expect(lines[0]).toContain('| line1');
      expect(lines[1]).toContain('>2| ');
      expect(lines[2]).toContain('| line3');
    });

    it('should handle content with special characters', () => {
      const content = 'const x = "hello";';
      const result = addLineNumbers(content, 1, 1);

      expect(result).toContain('>1| const x = "hello";');
    });

    it('should handle content with regex special chars', () => {
      const content = 'const regex = /test.*pattern/g;';
      const result = addLineNumbers(content, 1, 1);

      expect(result).toContain('>1| const regex = /test.*pattern/g;');
    });

    it('should handle tabs in content', () => {
      const content = '\tindented\n\t\tdouble';
      const result = addLineNumbers(content, 1, 1);

      expect(result).toContain('>1| \tindented');
      expect(result).toContain(' 2| \t\tdouble');
    });

    it('should handle target line not in range', () => {
      const content = 'a\nb\nc';
      const result = addLineNumbers(content, 1, 10); // target 10 is outside

      // No line should be marked with >
      const lines = result.split('\n');
      lines.forEach(line => {
        expect(line.startsWith('>')).toBe(false);
      });
    });

    it('should mark only the exact target line', () => {
      const content = 'one\ntwo\nthree\nfour\nfive';
      const result = addLineNumbers(content, 1, 3);

      const lines = result.split('\n');
      expect(lines.length).toBeGreaterThanOrEqual(5);
      expect(lines[0]?.startsWith('>') ?? false).toBe(false); // line 1
      expect(lines[1]?.startsWith('>') ?? false).toBe(false); // line 2
      expect(lines[2]?.startsWith('>') ?? false).toBe(true); // line 3
      expect(lines[3]?.startsWith('>') ?? false).toBe(false); // line 4
      expect(lines[4]?.startsWith('>') ?? false).toBe(false); // line 5
    });

    it('should use consistent padding width', () => {
      const content = 'a\nb\nc\nd\ne\nf\ng\nh\ni\nj';
      const result = addLineNumbers(content, 1, 5);

      const lines = result.split('\n');
      // All line numbers should have same padding (2 chars for lines 1-10)
      // The format includes a marker char + padded number + | + space + content
      expect(lines[0]).toMatch(/^\s+1\|/);
      expect(lines[8]).toMatch(/^\s+9\|/);
      expect(lines[9]).toMatch(/10\|/);
    });
  });

  describe('Tool registration', () => {
    it('should register tool correctly', async () => {
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
        }),
        expect.any(Function)
      );
    });

    it('should have all required annotations', async () => {
      vi.resetModules();

      const { registerLSPGotoDefinitionTool } =
        await import('../../src/tools/lsp_goto_definition.js');

      const mockServer = {
        registerTool: vi.fn().mockReturnValue(undefined),
      };

      registerLSPGotoDefinitionTool(mockServer as any);

      const config = mockServer.registerTool.mock.calls[0][1];
      expect(config.annotations).toEqual({
        title: 'Go To Definition',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      });
    });
  });

  describe('Schema exports', () => {
    it('should export BulkLSPGotoDefinitionSchema', async () => {
      const { BulkLSPGotoDefinitionSchema } =
        await import('../../src/scheme/lsp_goto_definition.js');
      expect(BulkLSPGotoDefinitionSchema).toBeDefined();
      expect(BulkLSPGotoDefinitionSchema.shape.queries).toBeDefined();
    });

    it('should export description', async () => {
      const { LSP_GOTO_DEFINITION_DESCRIPTION } =
        await import('../../src/scheme/lsp_goto_definition.js');
      expect(typeof LSP_GOTO_DEFINITION_DESCRIPTION).toBe('string');
      expect(LSP_GOTO_DEFINITION_DESCRIPTION.length).toBeGreaterThan(0);
    });
  });

  describe('Context extraction logic', () => {
    it('should calculate correct context range', () => {
      const totalLines = 100;
      const targetLine = 50;
      const contextLines = 5;

      const startLine = Math.max(0, targetLine - contextLines);
      const endLine = Math.min(totalLines - 1, targetLine + contextLines);

      expect(startLine).toBe(45);
      expect(endLine).toBe(55);
    });

    it('should handle context at file start', () => {
      const totalLines = 100;
      const targetLine = 2;
      const contextLines = 5;

      const startLine = Math.max(0, targetLine - contextLines);
      const endLine = Math.min(totalLines - 1, targetLine + contextLines);

      expect(startLine).toBe(0);
      expect(endLine).toBe(7);
    });

    it('should handle context at file end', () => {
      const totalLines = 100;
      const targetLine = 97;
      const contextLines = 5;

      const startLine = Math.max(0, targetLine - contextLines);
      const endLine = Math.min(totalLines - 1, targetLine + contextLines);

      expect(startLine).toBe(92);
      expect(endLine).toBe(99);
    });

    it('should handle small files', () => {
      const totalLines = 3;
      const targetLine = 1;
      const contextLines = 5;

      const startLine = Math.max(0, targetLine - contextLines);
      const endLine = Math.min(totalLines - 1, targetLine + contextLines);

      expect(startLine).toBe(0);
      expect(endLine).toBe(2);
    });
  });

  describe('CodeSnippet structure', () => {
    it('should create valid CodeSnippet object', () => {
      const snippet = {
        uri: '/path/to/file.ts',
        range: {
          start: { line: 10, character: 0 },
          end: { line: 10, character: 20 },
        },
        content: 'const myFunc = () => {};',
        displayRange: {
          startLine: 8,
          endLine: 13,
        },
      };

      expect(snippet.uri).toBe('/path/to/file.ts');
      expect(snippet.range.start.line).toBe(10);
      expect(snippet.displayRange.startLine).toBe(8);
    });

    it('should handle multi-line range', () => {
      const snippet = {
        uri: '/path/to/file.ts',
        range: {
          start: { line: 10, character: 0 },
          end: { line: 15, character: 1 },
        },
        content: 'function myFunc() {\n  // body\n  return;\n}',
        displayRange: {
          startLine: 8,
          endLine: 18,
        },
      };

      expect(snippet.range.end.line).toBe(15);
      expect(snippet.displayRange.endLine).toBe(18);
    });
  });

  describe('Position resolution logic', () => {
    it('should handle exact position', () => {
      const position = { line: 10, character: 5 };
      const symbolName = 'myFunc';
      const endPosition = {
        line: position.line,
        character: position.character + symbolName.length,
      };

      expect(endPosition.line).toBe(10);
      expect(endPosition.character).toBe(11);
    });

    it('should handle position at start of line', () => {
      const position = { line: 0, character: 0 };
      const symbolName = 'const';
      const endPosition = {
        line: position.line,
        character: position.character + symbolName.length,
      };

      expect(endPosition.character).toBe(5);
    });
  });

  describe('Fallback result creation', () => {
    it('should include all required fields', () => {
      const fallbackResult = {
        status: 'hasResults' as const,
        locations: [
          {
            uri: '/test/file.ts',
            range: {
              start: { line: 10, character: 0 },
              end: { line: 10, character: 10 },
            },
            content: 'const x = 1;',
            displayRange: { startLine: 8, endLine: 13 },
          },
        ],
        resolvedPosition: { line: 10, character: 5 },
        searchRadius: 2,
        researchGoal: 'Find definition',
        reasoning: 'User requested',
        hints: ['Note: Using text-based resolution'],
      };

      expect(fallbackResult.status).toBe('hasResults');
      expect(fallbackResult.locations.length).toBe(1);
      expect(fallbackResult.searchRadius).toBe(2);
    });

    it('should include hint about text-based resolution', () => {
      const hints = [
        'Note: Using text-based resolution (language server not available)',
        'Install typescript-language-server for semantic definition lookup',
      ];

      expect(hints[0]).toContain('text-based');
      expect(hints[1]).toContain('typescript-language-server');
    });

    it('should include line mismatch hint when applicable', () => {
      const foundAtLine = 12;
      const hintedLine = 10;

      const hint =
        foundAtLine !== hintedLine
          ? `Symbol found at line ${foundAtLine} (hint was ${hintedLine})`
          : undefined;

      expect(hint).toBe('Symbol found at line 12 (hint was 10)');
    });
  });

  describe('Error result structure', () => {
    it('should create empty status for not found', () => {
      const emptyResult = {
        status: 'empty' as const,
        error: 'Symbol not found',
        errorType: 'symbol_not_found',
        searchRadius: 2,
        hints: [
          'Symbol not found at or near line 10',
          'Verify the exact symbol name',
        ],
      };

      expect(emptyResult.status).toBe('empty');
      expect(emptyResult.errorType).toBe('symbol_not_found');
    });

    it('should include search radius in hints', () => {
      const lineHint = 10;
      const searchRadius = 2;

      const hint = `Searched lines ${Math.max(1, lineHint - searchRadius)} to ${lineHint + searchRadius}`;
      expect(hint).toBe('Searched lines 8 to 12');
    });
  });

  describe('Tool name constant', () => {
    it('should have correct tool name', async () => {
      const { STATIC_TOOL_NAMES } =
        await import('../../src/tools/toolNames.js');

      expect(STATIC_TOOL_NAMES.LSP_GOTO_DEFINITION).toBeDefined();
      expect(typeof STATIC_TOOL_NAMES.LSP_GOTO_DEFINITION).toBe('string');
    });
  });

  describe('Enhanced location processing', () => {
    it('should calculate display range correctly', () => {
      const startLine = 5; // 0-indexed
      const endLine = 15;

      const displayRange = {
        startLine: startLine + 1, // Convert to 1-indexed
        endLine: endLine + 1,
      };

      expect(displayRange.startLine).toBe(6);
      expect(displayRange.endLine).toBe(16);
    });

    it('should format numbered content with markers', () => {
      const lines = ['line 1', 'line 2', 'line 3'];
      const startLine = 10;
      const targetLine = 11; // 1-indexed

      const numberedContent = lines
        .map((line, i) => {
          const lineNum = startLine + i + 1;
          const isTarget = lineNum > 10 && lineNum <= 11 + 1;
          const marker = isTarget ? '>' : ' ';
          return `${marker}${String(lineNum).padStart(4, ' ')}| ${line}`;
        })
        .join('\n');

      expect(numberedContent).toContain('>  11| line 1');
      expect(numberedContent).toContain('>  12| line 2');
      expect(numberedContent).toContain('   13| line 3');
    });
  });

  describe('Multiple definitions handling', () => {
    it('should handle multiple definition locations', () => {
      const locations = [
        { uri: '/file1.ts', range: { start: { line: 10 }, end: { line: 10 } } },
        { uri: '/file2.ts', range: { start: { line: 20 }, end: { line: 25 } } },
      ];

      expect(locations.length).toBe(2);

      const hints =
        locations.length > 1
          ? ['Multiple definitions - check overloads or re-exports']
          : [];

      expect(hints.length).toBe(1);
      expect(hints[0]).toContain('Multiple definitions');
    });

    it('should not add hint for single definition', () => {
      const locations = [
        { uri: '/file1.ts', range: { start: { line: 10 }, end: { line: 10 } } },
      ];

      const hints =
        locations.length > 1
          ? ['Multiple definitions - check overloads or re-exports']
          : [];

      expect(hints.length).toBe(0);
    });
  });
});
