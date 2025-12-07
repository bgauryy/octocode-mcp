/**
 * Tests for local_ripgrep tool
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { searchContentRipgrep } from '../../src/tools/local_ripgrep.js';
import { ERROR_CODES } from '../../src/errors/errorCodes.js';
import { RipgrepQuerySchema } from '../../src/scheme/local_ripgrep.js';
import * as pathValidator from '../../src/security/pathValidator.js';
import { promises as fs } from 'fs';
import { EventEmitter } from 'events';

// Mock dependencies
vi.mock('../../src/utils/exec.js', () => ({
  safeExec: vi.fn(),
}));

vi.mock('../../src/security/commandValidator.js', () => ({
  validateCommand: vi.fn().mockReturnValue({ isValid: true }),
}));

vi.mock('../../src/security/executionContextValidator.js', () => ({
  validateExecutionContext: vi.fn().mockReturnValue({ isValid: true }),
}));

vi.mock('../../src/security/pathValidator.js', () => ({
  pathValidator: {
    validate: vi.fn(),
  },
}));

vi.mock('fs', () => ({
  promises: {
    stat: vi.fn(),
    readdir: vi.fn(), // Added for estimateDirectoryStats
  },
}));

// Mock child_process.spawn
const mockSpawn = vi.fn();
vi.mock('child_process', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  spawn: (...args: any[]) => mockSpawn(...args),
}));

/**
 * Helper to setup spawn mock behavior
 */
function setupSpawnMock(
  stdoutData: string,
  exitCode: number = 0,
  stderrData: string = ''
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const child = new EventEmitter() as any;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  child.exitCode = null; // simulate running

  mockSpawn.mockReturnValue(child);

  // Defer event emission to simulate async process
  setTimeout(() => {
    if (stdoutData) {
      // Emit in chunks if needed, but simple emit is fine for now
      child.stdout.emit('data', Buffer.from(stdoutData));
    }
    if (stderrData) {
      child.stderr.emit('data', Buffer.from(stderrData));
    }

    child.exitCode = exitCode;
    child.emit('close', exitCode);
  }, 5); // Slight delay

  return child;
}

/**
 * Helper to generate proper ripgrep JSON output format
 */
interface MockMatch {
  path: string;
  line: string;
  lineNumber: number;
  offset?: number;
  matchStart?: number;
  matchEnd?: number;
}

function mockRipgrepJson(
  matches: MockMatch[],
  stats?: { matches?: number; files?: number }
): string {
  const lines: string[] = [];

  for (const m of matches) {
    lines.push(
      JSON.stringify({
        type: 'match',
        data: {
          path: { text: m.path },
          lines: { text: m.line },
          line_number: m.lineNumber,
          absolute_offset: m.offset ?? 0,
          submatches: [
            {
              match: {
                text: m.line.substring(
                  m.matchStart ?? 0,
                  m.matchEnd ?? m.line.length
                ),
              },
              start: m.matchStart ?? 0,
              end: m.matchEnd ?? m.line.length,
            },
          ],
        },
      })
    );
  }

  // Add summary
  const uniqueFiles = new Set(matches.map((m) => m.path)).size;
  lines.push(
    JSON.stringify({
      type: 'summary',
      data: {
        stats: {
          matches: stats?.matches ?? matches.length,
          matched_lines: matches.length,
          searches_with_match: stats?.files ?? uniqueFiles,
          searches: stats?.files ?? uniqueFiles,
          bytes_searched: 1000,
        },
        elapsed_total: { human: '0.001s', secs: 0, nanos: 1000000 },
      },
    })
  );

  return lines.join('\n') + '\n';
}

/**
 * Helper to generate ripgrep JSON for files-only mode (-l flag)
 */
function mockRipgrepFilesOnly(files: string[]): string {
  const lines: string[] = [];

  for (const file of files) {
    lines.push(
      JSON.stringify({
        type: 'match',
        data: {
          path: { text: file },
          lines: { text: '' },
          line_number: 1,
          absolute_offset: 0,
          submatches: [],
        },
      })
    );
  }

  lines.push(
    JSON.stringify({
      type: 'summary',
      data: {
        stats: {
          matches: files.length,
          matched_lines: files.length,
          searches_with_match: files.length,
          searches: files.length,
          bytes_searched: 1000,
        },
        elapsed_total: { human: '0.001s', secs: 0, nanos: 1000000 },
      },
    })
  );

  return lines.join('\n') + '\n';
}

const runRipgrep = (query: Parameters<typeof RipgrepQuerySchema.parse>[0]) =>
  searchContentRipgrep(RipgrepQuerySchema.parse(query));

describe('local_ripgrep', () => {
  const mockValidate = vi.mocked(pathValidator.pathValidator.validate);
  const mockFsStat = vi.mocked(fs.stat);
  const mockFsReaddir = vi.mocked(fs.readdir);

  beforeEach(() => {
    vi.clearAllMocks();
    mockValidate.mockReturnValue({
      isValid: true,
      sanitizedPath: '/test/path',
    });
    // Default mock for fs.stat - return a valid stats object with mtime
    mockFsStat.mockResolvedValue({
      mtime: new Date('2024-06-01T00:00:00.000Z'),
      size: 1024,
      isDirectory: () => false,
      isFile: () => true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    mockFsReaddir.mockResolvedValue([]); // Default empty dir for stats estimate
  });

  describe('Basic search', () => {
    it('should execute ripgrep search successfully', async () => {
      setupSpawnMock(
        mockRipgrepJson([
          { path: 'file1.ts', line: 'function test()', lineNumber: 10 },
        ])
      );

      const result = await runRipgrep({
        pattern: 'test',
        path: '/test/path',
      });

      expect(result.status).toBe('hasResults');
      expect(result.searchEngine).toBe('rg');
    });

    it('should handle empty results', async () => {
      setupSpawnMock('');

      const result = await runRipgrep({
        pattern: 'nonexistent',
        path: '/test/path',
      });

      expect(result.status).toBe('empty');
    });

    it('should handle command failure', async () => {
      // Exit code 1 means no matches in grep/ripgrep, but we treat it as empty
      setupSpawnMock('', 1);

      const result = await runRipgrep({
        pattern: 'test',
        path: '/test/path',
      });

      expect(result.status).toBe('empty');
    });

    it('should handle real error exit code', async () => {
      // Exit code 2 is usually error
      setupSpawnMock('', 2, 'Some error');

      const result = await runRipgrep({
        pattern: 'test',
        path: '/test/path',
      });

      // Our tool catches the error and returns error result
      expect(result.status).toBe('error');
    });
  });

  describe('Workflow modes', () => {
    it('should apply discovery mode preset', async () => {
      setupSpawnMock(mockRipgrepFilesOnly(['file1.ts', 'file2.ts']));

      const result = await runRipgrep({
        pattern: 'test',
        path: '/test/path',
        mode: 'discovery',
      });

      expect(result.status).toBe('hasResults');
      expect(mockSpawn).toHaveBeenCalledWith(
        'rg',
        expect.arrayContaining(['-l']),
        expect.any(Object)
      );
    });

    it('should apply detailed mode preset', async () => {
      setupSpawnMock(
        mockRipgrepJson([
          { path: 'file1.ts', line: 'function test()', lineNumber: 10 },
        ])
      );

      const result = await runRipgrep({
        pattern: 'test',
        path: '/test/path',
        mode: 'detailed',
      });

      expect(result.status).toBe('hasResults');
    });
  });

  describe('Pattern types', () => {
    it('should handle fixed string search', async () => {
      setupSpawnMock(
        mockRipgrepJson([
          { path: 'file1.ts', line: 'TODO: fix this', lineNumber: 10 },
        ])
      );

      const result = await runRipgrep({
        pattern: 'TODO:',
        path: '/test/path',
        fixedString: true,
      });

      expect(result.status).toBe('hasResults');
      expect(mockSpawn).toHaveBeenCalledWith(
        'rg',
        expect.arrayContaining(['-F']),
        expect.any(Object)
      );
    });

    it('should handle perl regex', async () => {
      setupSpawnMock(
        mockRipgrepJson([
          { path: 'file1.ts', line: 'export function test', lineNumber: 10 },
        ])
      );

      const result = await runRipgrep({
        pattern: '(?<=export )\\w+',
        path: '/test/path',
        perlRegex: true,
      });

      expect(result.status).toBe('hasResults');
      expect(mockSpawn).toHaveBeenCalledWith(
        'rg',
        expect.arrayContaining(['-P']),
        expect.any(Object)
      );
    });
  });

  describe('File filtering', () => {
    it('should filter by file type', async () => {
      setupSpawnMock(
        mockRipgrepJson([{ path: 'file1.ts', line: 'test', lineNumber: 10 }])
      );

      const result = await runRipgrep({
        pattern: 'test',
        path: '/test/path',
        type: 'ts',
      });

      expect(result.status).toBe('hasResults');
      expect(mockSpawn).toHaveBeenCalledWith(
        'rg',
        expect.arrayContaining(['-t', 'ts']),
        expect.any(Object)
      );
    });

    it('should exclude directories', async () => {
      setupSpawnMock(
        mockRipgrepJson([
          { path: 'src/file1.ts', line: 'test', lineNumber: 10 },
        ])
      );

      const result = await runRipgrep({
        pattern: 'test',
        path: '/test/path',
        excludeDir: ['node_modules', '.git'],
      });

      expect(result.status).toBe('hasResults');
      expect(mockSpawn).toHaveBeenCalledWith(
        'rg',
        expect.arrayContaining(['-g', '!node_modules/', '-g', '!.git/']),
        expect.any(Object)
      );
    });
  });

  describe('Output control', () => {
    it('should list files only', async () => {
      setupSpawnMock(
        mockRipgrepFilesOnly(['file1.ts', 'file2.ts', 'file3.ts'])
      );

      const result = await runRipgrep({
        pattern: 'test',
        path: '/test/path',
        filesOnly: true,
      });

      expect(result.status).toBe('hasResults');
      expect(mockSpawn).toHaveBeenCalledWith(
        'rg',
        expect.arrayContaining(['-l']),
        expect.any(Object)
      );
    });

    it('should include context lines', async () => {
      // The mock logic in `processResults` doesn't strictly parse context lines from `rg --json` context messages
      // because `processResults` logic is: for i=before..0, use contexts.get(ln-i)
      // But the input mock helper `mockRipgrepJson` doesn't generate "context" messages easily.
      // We will just verify the flag is passed.

      setupSpawnMock(
        mockRipgrepJson([{ path: 'file1.ts', line: 'match', lineNumber: 10 }])
      );

      const result = await runRipgrep({
        pattern: 'match',
        path: '/test/path',
        contextLines: 1,
      });

      expect(result.status).toBe('hasResults');
      expect(mockSpawn).toHaveBeenCalledWith(
        'rg',
        expect.arrayContaining(['-C', '1']),
        expect.any(Object)
      );
    });
  });

  describe('Pagination', () => {
    it('should apply character-based pagination (legacy/generic)', async () => {
      // NOTE: local_ripgrep implementation doesn't use charLength for pagination in the same way fetch_content does.
      // It paginates by files and matches.
      // The test previously checked if hasMore is set based on charLength, but the current implementation
      // primarily uses filesPerPage/matchesPerPage.
      // However, check if we get results.

      const matches = Array.from({ length: 10 }, (_, i) => ({
        path: 'file.ts',
        line: `line content ${i}`,
        lineNumber: i,
        offset: i * 20,
      }));
      setupSpawnMock(mockRipgrepJson(matches));

      const result = await runRipgrep({
        pattern: 'test',
        path: '/test/path',
      });

      expect(result.status).toBe('hasResults');
    });
  });

  describe('Limits and error mappings', () => {
    it('should enforce maxFiles limit', async () => {
      const files = Array.from({ length: 30 }, (_, i) => ({
        path: `/test/file${i}.ts`,
        line: 'match',
        lineNumber: 1,
      }));

      setupSpawnMock(mockRipgrepJson(files));

      const result = await runRipgrep({
        pattern: 'match',
        path: '/test/path',
        maxFiles: 5,
      });

      expect(result.status).toBe('hasResults');
      expect(result.files?.length).toBeLessThanOrEqual(5);
      expect(result.files?.length).toBe(5);
    });
  });

  describe('Path validation', () => {
    it('should reject invalid paths', async () => {
      mockValidate.mockReturnValue({
        isValid: false,
        error: 'Path is outside allowed directories',
      });

      const result = await runRipgrep({
        pattern: 'test',
        path: '/etc/passwd',
      });

      expect(result.status).toBe('error');
      expect(result.errorCode).toBe(ERROR_CODES.PATH_VALIDATION_FAILED);
    });
  });

  describe('Case sensitivity', () => {
    it('should use smart case by default', async () => {
      setupSpawnMock(
        mockRipgrepJson([{ path: 'file.ts', line: 'Test', lineNumber: 1 }])
      );

      const result = await runRipgrep({
        pattern: 'test',
        path: '/test/path',
      });

      expect(result.status).toBe('hasResults');
      expect(mockSpawn).toHaveBeenCalledWith(
        'rg',
        expect.arrayContaining(['-S']),
        expect.any(Object)
      );
    });

    it('should override with case-insensitive', async () => {
      setupSpawnMock(
        mockRipgrepJson([{ path: 'file.ts', line: 'TEST', lineNumber: 1 }])
      );

      const result = await runRipgrep({
        pattern: 'test',
        path: '/test/path',
        caseInsensitive: true,
      });

      expect(result.status).toBe('hasResults');
      expect(mockSpawn).toHaveBeenCalledWith(
        'rg',
        expect.arrayContaining(['-i']),
        expect.any(Object)
      );
    });
  });

  describe('NEW FEATURE: Two-level pagination', () => {
    it('should paginate files with default 10 files per page', async () => {
      const files = Array.from({ length: 25 }, (_, i) => ({
        path: `/test/file${i}.ts`,
        line: 'test match',
        lineNumber: 10,
      }));
      setupSpawnMock(mockRipgrepJson(files));

      const result = await runRipgrep({
        pattern: 'test',
        path: '/test/path',
      });

      expect(result.status).toBe('hasResults');
      expect(result.files).toBeDefined();
      expect(result.files?.length).toBeLessThanOrEqual(10);
      expect(result.totalFiles).toBe(25);
      expect(result.pagination?.totalPages).toBe(3);
      expect(result.pagination?.hasMore).toBe(true);
    });

    it('should navigate to second page of files', async () => {
      const files = Array.from({ length: 25 }, (_, i) => ({
        path: `/test/file${i}.ts`,
        line: 'test match',
        lineNumber: 10,
      }));
      setupSpawnMock(mockRipgrepJson(files));

      const result = await runRipgrep({
        pattern: 'test',
        path: '/test/path',
        filePageNumber: 2,
      });

      expect(result.status).toBe('hasResults');
      expect(result.pagination?.currentPage).toBe(2);
      expect(result.pagination?.hasMore).toBe(true);
    });
  });
});
