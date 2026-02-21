/**
 * Branch coverage tests for callHierarchyHelpers.ts
 * Targets: enhanceIncomingCalls/enhanceOutgoingCalls null file, createCallHierarchyItemFromSite patterns
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/lsp/validation.js', () => ({
  safeReadFile: vi.fn(),
}));

import { safeReadFile } from '../../src/lsp/validation.js';
import {
  enhanceIncomingCalls,
  enhanceOutgoingCalls,
  createCallHierarchyItemFromSite,
} from '../../src/tools/lsp_call_hierarchy/callHierarchyHelpers.js';

const makeRange = (line: number) => ({
  start: { line, character: 0 },
  end: { line, character: 10 },
});

describe('callHierarchyHelpers - branch coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('enhanceIncomingCalls - null fileContent branch', () => {
    it('should keep original call when safeReadFile returns null', async () => {
      vi.mocked(safeReadFile).mockResolvedValue(null);
      const calls = [
        {
          from: {
            name: 'caller',
            kind: 'function' as const,
            uri: '/test/file.ts',
            range: makeRange(5),
            selectionRange: makeRange(5),
          },
          fromRanges: [makeRange(5)],
        },
      ];
      const result = await enhanceIncomingCalls(calls, 2);
      expect(result).toHaveLength(1);
      expect(result[0]!.from.name).toBe('caller');
      expect(result[0]!.from.content).toBeUndefined();
    });

    it('should keep original call when safeReadFile throws', async () => {
      vi.mocked(safeReadFile).mockRejectedValue(new Error('read failed'));
      const calls = [
        {
          from: {
            name: 'caller',
            kind: 'function' as const,
            uri: '/test/file.ts',
            range: makeRange(5),
            selectionRange: makeRange(5),
          },
          fromRanges: [makeRange(5)],
        },
      ];
      const result = await enhanceIncomingCalls(calls, 2);
      expect(result).toHaveLength(1);
      expect(result[0]!.from.name).toBe('caller');
    });
  });

  describe('enhanceOutgoingCalls - null fileContent branch', () => {
    it('should keep original call when safeReadFile returns null', async () => {
      vi.mocked(safeReadFile).mockResolvedValue(null);
      const calls = [
        {
          to: {
            name: 'callee',
            kind: 'function' as const,
            uri: '/test/target.ts',
            range: makeRange(10),
            selectionRange: makeRange(10),
          },
          fromRanges: [makeRange(3)],
        },
      ];
      const result = await enhanceOutgoingCalls(calls, 2);
      expect(result).toHaveLength(1);
      expect(result[0]!.to.name).toBe('callee');
      expect(result[0]!.to.content).toBeUndefined();
    });

    it('should keep original call when safeReadFile throws', async () => {
      vi.mocked(safeReadFile).mockRejectedValue(new Error('read failed'));
      const calls = [
        {
          to: {
            name: 'callee',
            kind: 'function' as const,
            uri: '/test/target.ts',
            range: makeRange(10),
            selectionRange: makeRange(10),
          },
          fromRanges: [makeRange(3)],
        },
      ];
      const result = await enhanceOutgoingCalls(calls, 2);
      expect(result).toHaveLength(1);
      expect(result[0]!.to.name).toBe('callee');
    });
  });

  describe('createCallHierarchyItemFromSite - function pattern branches', () => {
    it('should detect const arrow function (funcMatch[2])', async () => {
      vi.mocked(safeReadFile).mockResolvedValue(
        'const handler = async (req) => {\n  doSomething();\n}'
      );
      const site = {
        filePath: '/test/file.ts',
        lineNumber: 2,
        column: 2,
        lineContent: '  doSomething();',
      };
      const result = await createCallHierarchyItemFromSite(site, 1);
      expect(result.name).toBe('handler');
    });

    it('should detect method pattern (funcMatch[3])', async () => {
      vi.mocked(safeReadFile).mockResolvedValue(
        'class Svc {\n  processData(input) {\n    doWork();\n  }\n}'
      );
      const site = {
        filePath: '/test/file.ts',
        lineNumber: 3,
        column: 4,
        lineContent: '    doWork();',
      };
      const result = await createCallHierarchyItemFromSite(site, 1);
      expect(result.name).toBe('processData');
    });

    it('should detect async arrow assignment (funcMatch[4])', async () => {
      vi.mocked(safeReadFile).mockResolvedValue(
        'const fetcher = async (url) => {\n  return fetch(url);\n}'
      );
      const site = {
        filePath: '/test/file.ts',
        lineNumber: 2,
        column: 9,
        lineContent: '  return fetch(url);',
      };
      const result = await createCallHierarchyItemFromSite(site, 1);
      expect(result.name).toBe('fetcher');
    });

    it('should detect named function (funcMatch[1])', async () => {
      vi.mocked(safeReadFile).mockResolvedValue(
        'function myHelper(x) {\n  return x * 2;\n}'
      );
      const site = {
        filePath: '/test/file.ts',
        lineNumber: 2,
        column: 9,
        lineContent: '  return x * 2;',
      };
      const result = await createCallHierarchyItemFromSite(site, 1);
      expect(result.name).toBe('myHelper');
    });

    it('should detect async method via methodMatch', async () => {
      vi.mocked(safeReadFile).mockResolvedValue(
        'class API {\n  async fetchUser(id) {\n    return db.get(id);\n  }\n}'
      );
      const site = {
        filePath: '/test/file.ts',
        lineNumber: 3,
        column: 11,
        lineContent: '    return db.get(id);',
      };
      const result = await createCallHierarchyItemFromSite(site, 1);
      expect(result.name).toBe('fetchUser');
    });

    it('should return "unknown" when no function pattern matches', async () => {
      vi.mocked(safeReadFile).mockResolvedValue(
        '// just a comment\n// another comment\ncallSomething();\n'
      );
      const site = {
        filePath: '/test/file.ts',
        lineNumber: 3,
        column: 0,
        lineContent: 'callSomething();',
      };
      const result = await createCallHierarchyItemFromSite(site, 1);
      expect(result.name).toBe('unknown');
    });

    it('should fall back to defaults when safeReadFile returns null', async () => {
      vi.mocked(safeReadFile).mockResolvedValue(null);
      const site = {
        filePath: '/test/file.ts',
        lineNumber: 1,
        column: 0,
        lineContent: 'someLine();',
      };
      const result = await createCallHierarchyItemFromSite(site, 1);
      expect(result.name).toBe('unknown');
      expect(result.content).toBe('someLine();');
    });
  });
});
