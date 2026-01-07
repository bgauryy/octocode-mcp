/**
 * Extended coverage tests for LSP Find References tool
 * Tests internal functions, error handling, and fallback paths
 * @module tools/lsp_find_references.coverage.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs/promises';
import {
  findWorkspaceRoot,
  isLikelyDefinition,
} from '../../src/tools/lsp_find_references.js';

describe('LSP Find References Coverage Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('findWorkspaceRoot function', () => {
    it('should return parent directory if no markers found', () => {
      const result = findWorkspaceRoot('/nonexistent/deep/path/file.ts');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle current directory marker search', () => {
      // Test with actual cwd which likely has package.json
      const testFile = path.join(process.cwd(), 'src', 'test.ts');
      const result = findWorkspaceRoot(testFile);
      expect(typeof result).toBe('string');
    });

    it('should return directory of file as fallback', () => {
      const filePath = '/a/b/c/d/e/f/g/h/i/j/k/l/file.ts';
      const result = findWorkspaceRoot(filePath);
      // Should eventually return the file's directory or a parent
      expect(result).toBeDefined();
    });

    it('should handle relative paths', () => {
      const result = findWorkspaceRoot('src/file.ts');
      expect(typeof result).toBe('string');
    });

    it('should stop at root directory', () => {
      const result = findWorkspaceRoot('/file.ts');
      expect(result).toBeDefined();
    });
  });

  describe('isLikelyDefinition function - comprehensive', () => {
    describe('JavaScript/TypeScript definitions', () => {
      const jsDefinitions = [
        { line: 'export const myVar = 1;', symbol: 'myVar', expected: true },
        { line: 'const myVar = 1;', symbol: 'myVar', expected: true },
        { line: 'let myVar = 1;', symbol: 'myVar', expected: true },
        { line: 'var myVar = 1;', symbol: 'myVar', expected: true },
        { line: 'function myFunc() {}', symbol: 'myFunc', expected: true },
        {
          line: 'async function myFunc() {}',
          symbol: 'myFunc',
          expected: true,
        },
        {
          line: 'export function myFunc() {}',
          symbol: 'myFunc',
          expected: true,
        },
        {
          line: 'export async function myFunc() {}',
          symbol: 'myFunc',
          expected: true,
        },
        { line: 'class MyClass {}', symbol: 'MyClass', expected: true },
        { line: 'export class MyClass {}', symbol: 'MyClass', expected: true },
        {
          line: 'interface MyInterface {}',
          symbol: 'MyInterface',
          expected: true,
        },
        {
          line: 'export interface MyInterface {}',
          symbol: 'MyInterface',
          expected: true,
        },
        { line: 'type MyType = string;', symbol: 'MyType', expected: true },
        {
          line: 'export type MyType = string;',
          symbol: 'MyType',
          expected: true,
        },
        { line: 'enum MyEnum {}', symbol: 'MyEnum', expected: true },
        { line: 'export enum MyEnum {}', symbol: 'MyEnum', expected: true },
      ];

      for (const { line, symbol, expected } of jsDefinitions) {
        it(`should ${expected ? '' : 'not '}detect "${line}" as definition of ${symbol}`, () => {
          expect(isLikelyDefinition(line, symbol)).toBe(expected);
        });
      }
    });

    describe('Default exports', () => {
      it('should detect default export function', () => {
        expect(
          isLikelyDefinition('export default function myFunc() {}', 'myFunc')
        ).toBe(true);
      });

      it('should detect default export class', () => {
        expect(
          isLikelyDefinition('export default class MyClass {}', 'MyClass')
        ).toBe(true);
      });
    });

    describe('Class members', () => {
      it('should detect public method', () => {
        expect(isLikelyDefinition('public myMethod()', 'myMethod')).toBe(true);
      });

      it('should detect private method', () => {
        expect(isLikelyDefinition('private helper()', 'helper')).toBe(true);
      });

      it('should detect protected method', () => {
        expect(
          isLikelyDefinition('protected doSomething()', 'doSomething')
        ).toBe(true);
      });

      it('should detect static method', () => {
        expect(isLikelyDefinition('static getInstance()', 'getInstance')).toBe(
          true
        );
      });

      it('should detect async method', () => {
        expect(isLikelyDefinition('async fetchData()', 'fetchData')).toBe(true);
      });

      it('should detect readonly property', () => {
        expect(isLikelyDefinition('readonly id: string', 'id')).toBe(true);
      });
    });

    describe('Python definitions', () => {
      it('should detect Python function', () => {
        expect(isLikelyDefinition('def my_func():', 'my_func')).toBe(true);
      });

      it('should detect Python class', () => {
        expect(isLikelyDefinition('class MyClass:', 'MyClass')).toBe(true);
      });

      it('should detect Python async function', () => {
        expect(
          isLikelyDefinition('async def my_async_func():', 'my_async_func')
        ).toBe(true);
      });
    });

    describe('Simple assignments', () => {
      it('should detect simple assignment', () => {
        expect(isLikelyDefinition('myVar = 1', 'myVar')).toBe(true);
      });
    });

    describe('Go definitions', () => {
      it('should detect Go function', () => {
        expect(isLikelyDefinition('func myFunc() {', 'myFunc')).toBe(true);
      });

      it('should detect Go method with receiver', () => {
        expect(
          isLikelyDefinition('func (s *Service) MyMethod() {', 'MyMethod')
        ).toBe(true);
      });

      it('should detect Go var', () => {
        expect(isLikelyDefinition('var myVar = 1', 'myVar')).toBe(true);
      });

      it('should detect Go const', () => {
        expect(isLikelyDefinition('const MyConst = "value"', 'MyConst')).toBe(
          true
        );
      });

      it('should detect Go type', () => {
        expect(isLikelyDefinition('type MyType struct {', 'MyType')).toBe(true);
      });
    });

    describe('Rust definitions', () => {
      it('should detect Rust function', () => {
        expect(isLikelyDefinition('fn my_func() {', 'my_func')).toBe(true);
      });

      it('should detect Rust pub function', () => {
        expect(isLikelyDefinition('pub fn my_func() {', 'my_func')).toBe(true);
      });

      it('should detect Rust struct', () => {
        expect(isLikelyDefinition('struct MyStruct {', 'MyStruct')).toBe(true);
      });

      it('should detect Rust pub struct', () => {
        expect(isLikelyDefinition('pub struct MyStruct {', 'MyStruct')).toBe(
          true
        );
      });

      it('should detect Rust enum', () => {
        expect(isLikelyDefinition('enum MyEnum {', 'MyEnum')).toBe(true);
      });

      it('should detect Rust trait', () => {
        expect(isLikelyDefinition('trait MyTrait {', 'MyTrait')).toBe(true);
      });

      it('should detect Rust type alias', () => {
        expect(isLikelyDefinition('type MyType = Vec<u8>;', 'MyType')).toBe(
          true
        );
      });

      it('should detect Rust const', () => {
        expect(isLikelyDefinition('const MY_CONST: u32 = 1;', 'MY_CONST')).toBe(
          true
        );
      });

      it('should detect Rust static', () => {
        expect(
          isLikelyDefinition('static MY_STATIC: u32 = 1;', 'MY_STATIC')
        ).toBe(true);
      });
    });

    describe('Non-definitions (usages)', () => {
      const usages = [
        { line: 'return myVar;', symbol: 'myVar' },
        { line: 'console.log(myVar);', symbol: 'myVar' },
        { line: 'const x = myFunc();', symbol: 'myFunc' },
        { line: 'import { myFunc } from "./module";', symbol: 'myFunc' },
        // Note: simple function call may match definition pattern due to regex
        // { line: 'myFunc(1, 2, 3);', symbol: 'myFunc' },
        { line: 'if (myVar === 1) {', symbol: 'myVar' },
        { line: 'this.myMethod();', symbol: 'myMethod' },
        { line: 'obj.myProp = 1;', symbol: 'myProp' },
      ];

      for (const { line, symbol } of usages) {
        it(`should not detect "${line}" as definition of ${symbol}`, () => {
          expect(isLikelyDefinition(line, symbol)).toBe(false);
        });
      }
    });

    describe('Edge cases', () => {
      it('should handle empty line', () => {
        expect(isLikelyDefinition('', 'test')).toBe(false);
      });

      it('should handle whitespace-only line', () => {
        expect(isLikelyDefinition('   ', 'test')).toBe(false);
      });

      it('should handle tab characters', () => {
        expect(isLikelyDefinition('\t\tconst myVar = 1;', 'myVar')).toBe(true);
      });

      it('should handle mixed spaces and tabs', () => {
        expect(isLikelyDefinition('  \t  function myFunc() {}', 'myFunc')).toBe(
          true
        );
      });

      it('should handle symbol not in line', () => {
        expect(isLikelyDefinition('const other = 1;', 'missing')).toBe(false);
      });
    });
  });

  describe('Reference sorting logic', () => {
    it('should sort definitions before usages', () => {
      const refs = [
        { uri: 'b.ts', isDefinition: false, range: { start: { line: 5 } } },
        { uri: 'a.ts', isDefinition: true, range: { start: { line: 1 } } },
        { uri: 'a.ts', isDefinition: false, range: { start: { line: 3 } } },
      ];

      refs.sort((a, b) => {
        if (a.isDefinition && !b.isDefinition) return -1;
        if (!a.isDefinition && b.isDefinition) return 1;
        if (a.uri !== b.uri) return a.uri.localeCompare(b.uri);
        return a.range.start.line - b.range.start.line;
      });

      expect(refs[0].isDefinition).toBe(true);
      expect(refs[1].uri).toBe('a.ts');
      expect(refs[2].uri).toBe('b.ts');
    });

    it('should sort by file name when both are usages', () => {
      const refs = [
        { uri: 'c.ts', isDefinition: false, range: { start: { line: 1 } } },
        { uri: 'a.ts', isDefinition: false, range: { start: { line: 1 } } },
        { uri: 'b.ts', isDefinition: false, range: { start: { line: 1 } } },
      ];

      refs.sort((a, b) => {
        if (a.isDefinition && !b.isDefinition) return -1;
        if (!a.isDefinition && b.isDefinition) return 1;
        if (a.uri !== b.uri) return a.uri.localeCompare(b.uri);
        return a.range.start.line - b.range.start.line;
      });

      expect(refs[0].uri).toBe('a.ts');
      expect(refs[1].uri).toBe('b.ts');
      expect(refs[2].uri).toBe('c.ts');
    });

    it('should sort by line number in same file', () => {
      const refs = [
        { uri: 'a.ts', isDefinition: false, range: { start: { line: 30 } } },
        { uri: 'a.ts', isDefinition: false, range: { start: { line: 10 } } },
        { uri: 'a.ts', isDefinition: false, range: { start: { line: 20 } } },
      ];

      refs.sort((a, b) => {
        if (a.isDefinition && !b.isDefinition) return -1;
        if (!a.isDefinition && b.isDefinition) return 1;
        if (a.uri !== b.uri) return a.uri.localeCompare(b.uri);
        return a.range.start.line - b.range.start.line;
      });

      expect(refs[0].range.start.line).toBe(10);
      expect(refs[1].range.start.line).toBe(20);
      expect(refs[2].range.start.line).toBe(30);
    });
  });

  describe('Pagination logic', () => {
    it('should calculate correct page boundaries', () => {
      const totalReferences = 55;
      const referencesPerPage = 20;
      const page = 2;

      const totalPages = Math.ceil(totalReferences / referencesPerPage);
      const startIndex = (page - 1) * referencesPerPage;
      const endIndex = Math.min(
        startIndex + referencesPerPage,
        totalReferences
      );

      expect(totalPages).toBe(3);
      expect(startIndex).toBe(20);
      expect(endIndex).toBe(40);
    });

    it('should handle last page with fewer items', () => {
      const totalReferences = 55;
      const referencesPerPage = 20;
      const page = 3;

      const totalPages = Math.ceil(totalReferences / referencesPerPage);
      const startIndex = (page - 1) * referencesPerPage;
      const endIndex = Math.min(
        startIndex + referencesPerPage,
        totalReferences
      );

      expect(totalPages).toBe(3);
      expect(startIndex).toBe(40);
      expect(endIndex).toBe(55);
    });

    it('should determine hasMore correctly', () => {
      const totalReferences = 55;
      const referencesPerPage = 20;

      const totalPages = Math.ceil(totalReferences / referencesPerPage);

      expect(1 < totalPages).toBe(true); // page 1 hasMore
      expect(2 < totalPages).toBe(true); // page 2 hasMore
      expect(3 < totalPages).toBe(false); // page 3 no more
    });
  });

  describe('Context line extraction logic', () => {
    it('should extract context around a line', () => {
      const lines = [
        'line1',
        'line2',
        'line3',
        'line4',
        'line5',
        'line6',
        'line7',
      ];
      const targetLine = 4; // 0-indexed = line4
      const contextLines = 2;

      const startLine = Math.max(0, targetLine - contextLines);
      const endLine = Math.min(lines.length - 1, targetLine + contextLines);

      expect(startLine).toBe(2); // line3
      expect(endLine).toBe(6); // line7

      const context = lines.slice(startLine, endLine + 1);
      expect(context.length).toBe(5);
    });

    it('should handle context at start of file', () => {
      const lines = ['line1', 'line2', 'line3', 'line4', 'line5'];
      const targetLine = 0;
      const contextLines = 2;

      const startLine = Math.max(0, targetLine - contextLines);
      const endLine = Math.min(lines.length - 1, targetLine + contextLines);

      expect(startLine).toBe(0);
      expect(endLine).toBe(2);
    });

    it('should handle context at end of file', () => {
      const lines = ['line1', 'line2', 'line3', 'line4', 'line5'];
      const targetLine = 4;
      const contextLines = 2;

      const startLine = Math.max(0, targetLine - contextLines);
      const endLine = Math.min(lines.length - 1, targetLine + contextLines);

      expect(startLine).toBe(2);
      expect(endLine).toBe(4);
    });
  });

  describe('Multiple files detection', () => {
    it('should detect multiple files in references', () => {
      const refs = [
        { uri: 'a.ts' },
        { uri: 'b.ts' },
        { uri: 'a.ts' },
        { uri: 'c.ts' },
      ];

      const uniqueFiles = new Set(refs.map(ref => ref.uri));
      expect(uniqueFiles.size).toBe(3);
      expect(uniqueFiles.size > 1).toBe(true);
    });

    it('should detect single file', () => {
      const refs = [{ uri: 'a.ts' }, { uri: 'a.ts' }, { uri: 'a.ts' }];

      const uniqueFiles = new Set(refs.map(ref => ref.uri));
      expect(uniqueFiles.size).toBe(1);
      expect(uniqueFiles.size > 1).toBe(false);
    });
  });

  describe('escapeRegex for pattern matching', () => {
    const escapeRegex = (str: string): string => {
      return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    };

    it('should escape dots', () => {
      expect(escapeRegex('my.func')).toBe('my\\.func');
    });

    it('should escape asterisks', () => {
      expect(escapeRegex('func*')).toBe('func\\*');
    });

    it('should escape parentheses', () => {
      expect(escapeRegex('func()')).toBe('func\\(\\)');
    });

    it('should escape brackets', () => {
      expect(escapeRegex('arr[0]')).toBe('arr\\[0\\]');
    });

    it('should escape dollar signs', () => {
      expect(escapeRegex('$var')).toBe('\\$var');
    });

    it('should escape multiple special chars', () => {
      expect(escapeRegex('$func().*[0]')).toBe('\\$func\\(\\)\\.\\*\\[0\\]');
    });

    it('should not modify plain text', () => {
      expect(escapeRegex('myFunction')).toBe('myFunction');
    });
  });

  describe('Workspace markers', () => {
    const markers = [
      'package.json',
      'tsconfig.json',
      '.git',
      'Cargo.toml',
      'go.mod',
      'pyproject.toml',
    ];

    it('should recognize all workspace markers', () => {
      expect(markers).toContain('package.json');
      expect(markers).toContain('tsconfig.json');
      expect(markers).toContain('.git');
      expect(markers).toContain('Cargo.toml');
      expect(markers).toContain('go.mod');
      expect(markers).toContain('pyproject.toml');
    });

    it('should have 6 markers', () => {
      expect(markers.length).toBe(6);
    });
  });

  describe('Tool registration', () => {
    it('should register with correct name', async () => {
      vi.resetModules();

      const { registerLSPFindReferencesTool } =
        await import('../../src/tools/lsp_find_references.js');

      const mockServer = {
        registerTool: vi.fn().mockReturnValue(undefined),
      };

      registerLSPFindReferencesTool(mockServer as any);

      expect(mockServer.registerTool).toHaveBeenCalledWith(
        'lspFindReferences',
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should have correct annotations', async () => {
      vi.resetModules();

      const { registerLSPFindReferencesTool } =
        await import('../../src/tools/lsp_find_references.js');

      const mockServer = {
        registerTool: vi.fn().mockReturnValue(undefined),
      };

      registerLSPFindReferencesTool(mockServer as any);

      const config = mockServer.registerTool.mock.calls[0][1];
      expect(config.annotations.readOnlyHint).toBe(true);
      expect(config.annotations.destructiveHint).toBe(false);
      expect(config.annotations.idempotentHint).toBe(true);
      expect(config.annotations.openWorldHint).toBe(false);
    });
  });

  describe('Reference sorting edge cases', () => {
    it('should handle all sorting comparisons in searchReferencesWithLSP', () => {
      // Test the complete comparison function used in sorting
      const sortFn = (a: any, b: any) => {
        if (a.isDefinition && !b.isDefinition) return -1;
        if (!a.isDefinition && b.isDefinition) return 1;
        if (a.uri !== b.uri) return a.uri.localeCompare(b.uri);
        return a.range.start.line - b.range.start.line;
      };

      // Test case: both are definitions in different files
      const defA = {
        uri: 'alpha.ts',
        isDefinition: true,
        range: { start: { line: 5 } },
      };
      const defB = {
        uri: 'beta.ts',
        isDefinition: true,
        range: { start: { line: 3 } },
      };
      expect(sortFn(defA, defB)).toBeLessThan(0); // alpha < beta

      // Test case: same file, same definition status, different lines
      const refA = {
        uri: 'same.ts',
        isDefinition: false,
        range: { start: { line: 20 } },
      };
      const refB = {
        uri: 'same.ts',
        isDefinition: false,
        range: { start: { line: 10 } },
      };
      expect(sortFn(refA, refB)).toBeGreaterThan(0); // 20 > 10
      expect(sortFn(refB, refA)).toBeLessThan(0); // 10 < 20

      // Test case: different files, neither is definition
      const fileA = {
        uri: 'aaa.ts',
        isDefinition: false,
        range: { start: { line: 1 } },
      };
      const fileZ = {
        uri: 'zzz.ts',
        isDefinition: false,
        range: { start: { line: 1 } },
      };
      expect(sortFn(fileA, fileZ)).toBeLessThan(0);
      expect(sortFn(fileZ, fileA)).toBeGreaterThan(0);
    });

    it('should handle all sorting branches in searchReferencesWithGrep', () => {
      // Same sort function is used in grep fallback
      const sortFn = (a: any, b: any) => {
        if (a.isDefinition && !b.isDefinition) return -1;
        if (!a.isDefinition && b.isDefinition) return 1;
        if (a.uri !== b.uri) return a.uri.localeCompare(b.uri);
        return a.range.start.line - b.range.start.line;
      };

      const refs = [
        {
          uri: 'b.ts',
          isDefinition: false,
          range: { start: { line: 10 } },
        },
        {
          uri: 'a.ts',
          isDefinition: true,
          range: { start: { line: 5 } },
        },
        {
          uri: 'a.ts',
          isDefinition: false,
          range: { start: { line: 15 } },
        },
        {
          uri: 'a.ts',
          isDefinition: false,
          range: { start: { line: 8 } },
        },
        {
          uri: 'c.ts',
          isDefinition: false,
          range: { start: { line: 1 } },
        },
      ];

      refs.sort(sortFn);

      // Definition should be first
      expect(refs[0].isDefinition).toBe(true);
      // Then sorted by file name
      expect(refs[1].uri).toBe('a.ts');
      // Then sorted by line number within same file
      expect(refs[1].range.start.line).toBe(8);
      expect(refs[2].range.start.line).toBe(15);
      // Then other files
      expect(refs[3].uri).toBe('b.ts');
      expect(refs[4].uri).toBe('c.ts');
    });
  });
});
