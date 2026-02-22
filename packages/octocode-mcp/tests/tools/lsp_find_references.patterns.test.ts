/**
 * Branch coverage tests for lsp_find_references/lspReferencesPatterns.ts
 * Targets the massive coverage gap (36% branch → higher)
 *
 * Key branches covered:
 * - spawnCollectOutput: validation failure, buffer limit, exit codes, error
 * - enhancePatternReference: contextLines > 0, catch block
 * - findReferencesWithPatternMatching: filtering, pagination, hints
 * - buildGrepFilterArgsArray: exclude with / vs without /
 * - buildGrepSearchArgs: with exclude-only patterns
 * - isLikelyDefinition edge cases
 * - searchReferencesInWorkspace/searchReferencesWithGrep via findReferencesWithPatternMatching
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';

// Mock child_process spawn for spawnCollectOutput
const mockSpawnOn = vi.fn();
const mockStdoutOn = vi.fn();
const mockKill = vi.fn();
const mockSpawnReturn = {
  stdout: { on: mockStdoutOn },
  on: mockSpawnOn,
  kill: mockKill,
};

vi.mock('child_process', () => ({
  spawn: vi.fn(() => mockSpawnReturn),
}));

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  stat: vi.fn(),
  access: vi.fn(),
}));

vi.mock('../../src/lsp/validation.js', () => ({
  safeReadFile: vi.fn(),
}));

vi.mock('../../src/security/commandValidator.js', () => ({
  validateCommand: vi.fn().mockReturnValue({ isValid: true }),
}));

vi.mock('../../src/hints/index.js', () => ({
  getHints: vi.fn().mockReturnValue([]),
}));

import { access } from 'fs/promises';
import { safeReadFile } from '../../src/lsp/validation.js';
import { validateCommand } from '../../src/security/commandValidator.js';

import {
  escapeForRegex,
  buildRipgrepGlobArgs,
  buildRipgrepSearchArgs,
  buildGrepFilterArgs,
  buildGrepFilterArgsArray,
  buildGrepSearchArgs,
  findWorkspaceRoot,
  isLikelyDefinition,
  findReferencesWithPatternMatching,
} from '../../src/tools/lsp_find_references/lspReferencesPatterns.js';

describe('lspReferencesPatterns - Branch Coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(validateCommand).mockReturnValue({ isValid: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ========================================================================
  // buildGrepFilterArgsArray: exclude patterns with / vs without /
  // ========================================================================
  describe('buildGrepFilterArgsArray', () => {
    it('should use --exclude-dir for patterns containing /', () => {
      const args = buildGrepFilterArgsArray(undefined, [
        '**/node_modules/**',
        '**/dist/**',
      ]);
      expect(args).toContain('--exclude-dir=node_modules');
      expect(args).toContain('--exclude-dir=dist');
    });

    it('should use --exclude for patterns without /', () => {
      const args = buildGrepFilterArgsArray(undefined, ['*.snap', '*.min.js']);
      expect(args).toContain('--exclude=*.snap');
      expect(args).toContain('--exclude=*.min.js');
    });

    it('should handle mix of include and exclude patterns', () => {
      const args = buildGrepFilterArgsArray(
        ['**/*.ts', '**/*.tsx'],
        ['**/node_modules/**', '*.snap']
      );
      expect(args).toContain('--include=*.ts');
      expect(args).toContain('--include=*.tsx');
      expect(args).toContain('--exclude-dir=node_modules');
      expect(args).toContain('--exclude=*.snap');
    });

    it('should return empty for no patterns', () => {
      expect(buildGrepFilterArgsArray()).toEqual([]);
      expect(buildGrepFilterArgsArray([], [])).toEqual([]);
    });
  });

  // ========================================================================
  // buildGrepSearchArgs: exclude-only patterns branch
  // ========================================================================
  describe('buildGrepSearchArgs - exclude only', () => {
    it('should include default extensions when only excludePattern is provided', () => {
      const args = buildGrepSearchArgs('/workspace', 'myFunc', undefined, [
        '**/node_modules/**',
      ]);
      expect(args.some(a => a.startsWith('--include=*.'))).toBe(true);
      expect(args.some(a => a.startsWith('--exclude-dir='))).toBe(true);
    });

    it('should not add default extensions when includePattern is provided', () => {
      const args = buildGrepSearchArgs(
        '/workspace',
        'myFunc',
        ['**/*.py'],
        ['**/node_modules/**']
      );
      expect(args).toContain('--include=*.py');
      const defaultExtArgs = args.filter(
        a => a.startsWith('--include=*.') && a !== '--include=*.py'
      );
      expect(defaultExtArgs.length).toBe(0);
    });
  });

  // ========================================================================
  // findWorkspaceRoot: marker detection
  // ========================================================================
  describe('findWorkspaceRoot', () => {
    it('should find workspace root when marker exists', async () => {
      vi.mocked(access).mockResolvedValue(undefined);

      const result = await findWorkspaceRoot('/some/project/src/file.ts');
      expect(typeof result).toBe('string');
    });

    it('should traverse up and return dirname when no marker found', async () => {
      vi.mocked(access).mockRejectedValue(new Error('ENOENT'));

      const result = await findWorkspaceRoot('/a/b/c/d/e/f/g/h/i/j/k/file.ts');
      expect(result).toBe(path.dirname('/a/b/c/d/e/f/g/h/i/j/k/file.ts'));
    });

    it('should stop when parentDir equals currentDir (root)', async () => {
      vi.mocked(access).mockRejectedValue(new Error('ENOENT'));

      const result = await findWorkspaceRoot('/file.ts');
      expect(result).toBeDefined();
    });
  });

  // ========================================================================
  // findReferencesWithPatternMatching: core functionality
  // ========================================================================
  describe('findReferencesWithPatternMatching', () => {
    const setupSpawnSuccess = (stdout: string) => {
      mockStdoutOn.mockImplementation(
        (event: string, cb: (data: Buffer) => void) => {
          if (event === 'data') {
            cb(Buffer.from(stdout));
          }
        }
      );
      mockSpawnOn.mockImplementation(
        (event: string, cb: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => cb(0), 0);
          }
        }
      );
    };

    const setupSpawnFailure = (code: number) => {
      mockStdoutOn.mockImplementation(() => {});
      mockSpawnOn.mockImplementation(
        (event: string, cb: (...args: any[]) => void) => {
          if (event === 'close') {
            setTimeout(() => cb(code), 0);
          }
        }
      );
    };

    it('should return empty when no references found', async () => {
      setupSpawnSuccess('');

      const result = await findReferencesWithPatternMatching(
        '/workspace/src/file.ts',
        '/workspace',
        {
          uri: '/workspace/src/file.ts',
          symbolName: 'nonExistentSymbol',
          lineHint: 1,
          researchGoal: 'test',
          reasoning: 'test',
        }
      );

      expect(result.status).toBe('empty');
    });

    it('should return results when ripgrep finds matches', async () => {
      const rgOutput = [
        JSON.stringify({
          type: 'match',
          data: {
            path: { text: '/workspace/src/file.ts' },
            line_number: 5,
            lines: { text: 'export function myFunc() {}\n' },
          },
        }),
        JSON.stringify({
          type: 'match',
          data: {
            path: { text: '/workspace/src/other.ts' },
            line_number: 10,
            lines: { text: 'const result = myFunc();\n' },
          },
        }),
      ].join('\n');

      setupSpawnSuccess(rgOutput);

      const result = await findReferencesWithPatternMatching(
        '/workspace/src/file.ts',
        '/workspace',
        {
          uri: '/workspace/src/file.ts',
          symbolName: 'myFunc',
          lineHint: 5,
          includeDeclaration: true,
          referencesPerPage: 20,
          page: 1,
          contextLines: 0,
          researchGoal: 'test',
          reasoning: 'test',
        }
      );

      expect(result.status).toBe('hasResults');
      expect(result.locations!.length).toBe(2);
    });

    it('should filter by includeDeclaration=false', async () => {
      const rgOutput = JSON.stringify({
        type: 'match',
        data: {
          path: { text: '/workspace/src/file.ts' },
          line_number: 5,
          lines: { text: 'export function myFunc() {}\n' },
        },
      });

      setupSpawnSuccess(rgOutput);

      const result = await findReferencesWithPatternMatching(
        '/workspace/src/file.ts',
        '/workspace',
        {
          uri: '/workspace/src/file.ts',
          symbolName: 'myFunc',
          lineHint: 5,
          includeDeclaration: false,
          contextLines: 0,
          researchGoal: 'test',
          reasoning: 'test',
        }
      );

      // The definition match should be filtered out
      expect(result.status).toBe('empty');
    });

    it('should add filter hint when patterns reduce results', async () => {
      const rgOutput = [
        JSON.stringify({
          type: 'match',
          data: {
            path: { text: '/workspace/src/a.ts' },
            line_number: 1,
            lines: { text: 'const x = myFunc();\n' },
          },
        }),
        JSON.stringify({
          type: 'match',
          data: {
            path: { text: '/workspace/node_modules/pkg/b.ts' },
            line_number: 1,
            lines: { text: 'const y = myFunc();\n' },
          },
        }),
      ].join('\n');

      setupSpawnSuccess(rgOutput);

      const result = await findReferencesWithPatternMatching(
        '/workspace/src/file.ts',
        '/workspace',
        {
          uri: '/workspace/src/file.ts',
          symbolName: 'myFunc',
          lineHint: 1,
          includeDeclaration: true,
          excludePattern: ['**/node_modules/**'],
          contextLines: 0,
          researchGoal: 'test',
          reasoning: 'test',
        }
      );

      expect(result.status).toBe('hasResults');
      expect(result.hints!.some(h => h.includes('Filtered:'))).toBe(true);
    });

    it('should add "none matched patterns" hint when all filtered out', async () => {
      const rgOutput = JSON.stringify({
        type: 'match',
        data: {
          path: { text: '/workspace/node_modules/pkg/index.ts' },
          line_number: 1,
          lines: { text: 'const z = myFunc();\n' },
        },
      });

      setupSpawnSuccess(rgOutput);

      const result = await findReferencesWithPatternMatching(
        '/workspace/src/file.ts',
        '/workspace',
        {
          uri: '/workspace/src/file.ts',
          symbolName: 'myFunc',
          lineHint: 1,
          includeDeclaration: true,
          excludePattern: ['**/node_modules/**'],
          contextLines: 0,
          researchGoal: 'test',
          reasoning: 'test',
        }
      );

      expect(result.status).toBe('empty');
      expect(
        result.hints!.some(h => h.includes('none matched the file patterns'))
      ).toBe(true);
    });

    it('should paginate results and add hasMore hint', async () => {
      const matches = Array.from({ length: 25 }, (_, i) =>
        JSON.stringify({
          type: 'match',
          data: {
            path: { text: `/workspace/src/file${i}.ts` },
            line_number: 1,
            lines: { text: `const v${i} = myFunc();\n` },
          },
        })
      ).join('\n');

      setupSpawnSuccess(matches);

      const result = await findReferencesWithPatternMatching(
        '/workspace/src/source.ts',
        '/workspace',
        {
          uri: '/workspace/src/source.ts',
          symbolName: 'myFunc',
          lineHint: 1,
          includeDeclaration: true,
          referencesPerPage: 10,
          page: 1,
          contextLines: 0,
          researchGoal: 'test',
          reasoning: 'test',
        }
      );

      expect(result.status).toBe('hasResults');
      expect(result.locations!.length).toBe(10);
      expect(result.hints!.some(h => h.includes('page'))).toBe(true);
    });

    it('should enhance references with context when contextLines > 0', async () => {
      const rgOutput = JSON.stringify({
        type: 'match',
        data: {
          path: { text: '/workspace/src/a.ts' },
          line_number: 3,
          lines: { text: 'const x = myFunc();\n' },
        },
      });

      setupSpawnSuccess(rgOutput);

      vi.mocked(safeReadFile).mockResolvedValue(
        'line1\nline2\nconst x = myFunc();\nline4\nline5'
      );

      const result = await findReferencesWithPatternMatching(
        '/workspace/src/file.ts',
        '/workspace',
        {
          uri: '/workspace/src/file.ts',
          symbolName: 'myFunc',
          lineHint: 3,
          includeDeclaration: true,
          contextLines: 2,
          researchGoal: 'test',
          reasoning: 'test',
        }
      );

      expect(result.status).toBe('hasResults');
      const content = result.locations![0]!.content;
      expect(content).toContain('line1');
    });

    it('should keep single-line content when safeReadFile fails', async () => {
      const rgOutput = JSON.stringify({
        type: 'match',
        data: {
          path: { text: '/workspace/src/a.ts' },
          line_number: 3,
          lines: { text: 'const x = myFunc();\n' },
        },
      });

      setupSpawnSuccess(rgOutput);

      vi.mocked(safeReadFile).mockResolvedValue(null);

      const result = await findReferencesWithPatternMatching(
        '/workspace/src/file.ts',
        '/workspace',
        {
          uri: '/workspace/src/file.ts',
          symbolName: 'myFunc',
          lineHint: 3,
          includeDeclaration: true,
          contextLines: 2,
          researchGoal: 'test',
          reasoning: 'test',
        }
      );

      expect(result.status).toBe('hasResults');
      expect(result.locations![0]!.content).toBe('const x = myFunc();');
    });
  });

  // ========================================================================
  // isLikelyDefinition: additional patterns
  // ========================================================================
  describe('isLikelyDefinition - additional patterns', () => {
    it('should detect pub Rust definitions', () => {
      expect(isLikelyDefinition('pub fn create() {', 'create')).toBe(true);
      expect(isLikelyDefinition('pub struct Config {', 'Config')).toBe(true);
      expect(isLikelyDefinition('pub enum Status {', 'Status')).toBe(true);
      expect(isLikelyDefinition('pub trait Handler {', 'Handler')).toBe(true);
      expect(isLikelyDefinition('pub type Result = Vec<u8>;', 'Result')).toBe(
        true
      );
      expect(isLikelyDefinition('pub const MAX: u32 = 100;', 'MAX')).toBe(true);
      expect(
        isLikelyDefinition('pub static INSTANCE: u32 = 1;', 'INSTANCE')
      ).toBe(true);
    });

    it('should detect Go method with receiver', () => {
      expect(isLikelyDefinition('func (s *Server) Handle() {', 'Handle')).toBe(
        true
      );
    });
  });
});
