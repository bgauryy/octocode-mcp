/**
 * Integration tests for all local explorer MCP tools
 * Tests all 4 tools on actual node_modules to verify they return smart research data
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { searchContentRipgrep } from '../../src/tools/local_ripgrep.js';
import { viewStructure } from '../../src/tools/local_view_structure.js';
import { findFiles } from '../../src/tools/local_find_files.js';
import { fetchContent } from '../../src/tools/local_fetch_content.js';
import { pathValidator } from '../../src/security/pathValidator.js';
import type {
  SearchContentResult,
  ViewStructureResult,
  FindFilesResult,
  FetchContentResult,
} from '../../src/types.js';
import { RipgrepQuerySchema } from '../../src/scheme/local_ripgrep.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Use monorepo root (go up: tests/integration -> tests -> octocode-local -> packages -> root)
const MONOREPO_ROOT = path.resolve(__dirname, '../../../..');
const NODE_MODULES_PATH = path.resolve(MONOREPO_ROOT, 'node_modules');

beforeAll(() => {
  // Add monorepo root as allowed root so tools can access root node_modules
  // The pathValidator singleton is created at module load with process.cwd()
  // In monorepo context, we need to also allow the parent workspace
  pathValidator.addAllowedRoot(MONOREPO_ROOT);
});

const runRipgrep = (query: Parameters<typeof RipgrepQuerySchema.parse>[0]) =>
  searchContentRipgrep(RipgrepQuerySchema.parse(query));

type ToolResult =
  | SearchContentResult
  | ViewStructureResult
  | FindFilesResult
  | FetchContentResult;

function verifySmartData<T extends ToolResult>(result: T, toolName: string): T {
  expect(result, `${toolName} should return a result object`).toBeDefined();
  expect(result.status, `${toolName} should have status field`).toBeDefined();
  expect(['hasResults', 'empty', 'error']).toContain(result.status);

  if (result.status === 'hasResults') {
    const hasFiles =
      'files' in result &&
      Array.isArray(result.files) &&
      result.files.length > 0;
    const hasContent =
      'content' in result &&
      typeof result.content === 'string' &&
      result.content.length > 0;
    const hasStructuredOutput =
      'structuredOutput' in result &&
      typeof result.structuredOutput === 'string' &&
      result.structuredOutput.length > 0;
    const hasPagination = Boolean(result.pagination);

    expect(
      hasFiles || hasContent || hasStructuredOutput || hasPagination,
      `${toolName} should have data when status is hasResults`
    ).toBe(true);
  }

  if (result.hints) {
    expect(
      Array.isArray(result.hints),
      `${toolName} hints should be an array`
    ).toBe(true);
  }

  return result;
}

describe('Integration Tests: All Tools on node_modules', () => {
  describe('local_ripgrep - Pattern Search', () => {
    it('should find patterns in JavaScript files', async () => {
      const result = await runRipgrep({
        pattern: 'export',
        path: NODE_MODULES_PATH,
        include: ['*.js'],
        matchesPerPage: 5,
        researchGoal: 'Find exported functions in JavaScript files',
        reasoning: 'Testing pattern search on node_modules',
      });

      verifySmartData(result, 'local_ripgrep');

      if (result.status === 'hasResults') {
        expect(result.files).toBeDefined();
        expect(Array.isArray(result.files)).toBe(true);
      }
    });

    it('should find files only mode', async () => {
      const result = await runRipgrep({
        pattern: 'package.json',
        path: NODE_MODULES_PATH,
        filesOnly: true,
        maxFiles: 10,
        researchGoal: 'Find package.json files',
        reasoning: 'Testing filesOnly mode',
      });

      verifySmartData(result, 'local_ripgrep');

      if (result.status === 'hasResults') {
        expect(result.files).toBeDefined();
        expect(Array.isArray(result.files)).toBe(true);
      }
    });
  });

  describe('local_view_structure - Directory Listing', () => {
    it('should list directory contents', async () => {
      const result = await viewStructure({
        path: NODE_MODULES_PATH,
        details: false,
        entriesPerPage: 20,
        researchGoal: 'List top-level node_modules contents',
        reasoning: 'Testing basic directory listing',
      });

      verifySmartData(result, 'local_view_structure');

      if (result.status === 'hasResults') {
        expect(result.structuredOutput).toBeDefined();
      }
    });

    it('should provide detailed file information', async () => {
      const result = await viewStructure({
        path: NODE_MODULES_PATH,
        details: true,
        entriesPerPage: 10,
        sortBy: 'size',
        researchGoal: 'Get detailed file information sorted by size',
        reasoning: 'Testing detailed listing with sorting',
      });

      verifySmartData(result, 'local_view_structure');

      if (result.status === 'hasResults') {
        expect(result.structuredOutput).toBeDefined();
      }
    });

    it('should generate tree view', async () => {
      const result = await viewStructure({
        path: NODE_MODULES_PATH,
        depth: 2,
        researchGoal: 'Get tree structure view',
        reasoning: 'Testing tree view mode',
      });

      verifySmartData(result, 'local_view_structure');

      if (result.status === 'hasResults') {
        expect(result.structuredOutput).toBeDefined();
      }
    });
  });

  describe('local_find_files - File Discovery', () => {
    it('should find files by name', async () => {
      const result = await findFiles({
        path: NODE_MODULES_PATH,
        name: 'package.json',
        maxDepth: 2,
        filesPerPage: 20,
        researchGoal: 'Find package.json files',
        reasoning: 'Testing name-based file discovery',
      });

      verifySmartData(result, 'local_find_files');

      if (result.status === 'hasResults') {
        expect(result.files).toBeDefined();
        expect(Array.isArray(result.files)).toBe(true);
      }
    });

    it('should find files by extension', async () => {
      const result = await findFiles({
        path: NODE_MODULES_PATH,
        type: 'f',
        names: ['*.md'],
        filesPerPage: 10,
        researchGoal: 'Find markdown documentation files',
        reasoning: 'Testing extension-based discovery',
      });

      verifySmartData(result, 'local_find_files');

      if (result.status === 'hasResults') {
        expect(result.files).toBeDefined();
      }
    });

    it('should find directories', async () => {
      const result = await findFiles({
        path: NODE_MODULES_PATH,
        type: 'd',
        maxDepth: 1,
        filesPerPage: 15,
        researchGoal: 'Find top-level directories',
        reasoning: 'Testing directory discovery',
      });

      verifySmartData(result, 'local_find_files');

      if (result.status === 'hasResults') {
        expect(result.files).toBeDefined();
      }
    });
  });

  describe('local_fetch_content - File Content Reading', () => {
    let testFile: string | null = null;

    it('should find a test file first', async () => {
      const findResult = await findFiles({
        path: NODE_MODULES_PATH,
        name: 'package.json',
        maxDepth: 2,
        filesPerPage: 5,
        researchGoal: 'Find package.json files',
        reasoning: 'Testing file discovery for fetch_content tests',
      });

      if (
        findResult.status === 'hasResults' &&
        findResult.files &&
        findResult.files.length > 0
      ) {
        testFile =
          typeof findResult.files[0] === 'string'
            ? findResult.files[0]
            : findResult.files[0].path;
      } else {
        // Fallback: try to find any JavaScript file
        const jsFileResult = await findFiles({
          path: NODE_MODULES_PATH,
          names: ['*.js'],
          filesPerPage: 1,
        });

        if (
          jsFileResult.status === 'hasResults' &&
          jsFileResult.files &&
          jsFileResult.files.length > 0
        ) {
          testFile =
            typeof jsFileResult.files[0] === 'string'
              ? jsFileResult.files[0]
              : jsFileResult.files[0].path;
        }
      }

      // Don't fail if no file found - subsequent tests will skip
    });

    it('should read full file content', async () => {
      if (!testFile) {
        // Skip if no test file found
        return;
      }

      const result = await fetchContent({
        path: testFile,
        fullContent: true,
        minified: false,
        researchGoal: 'Read full package.json content',
        reasoning: 'Testing full content fetch',
      });

      verifySmartData(result, 'local_fetch_content');

      if (result.status === 'hasResults') {
        expect(result.content).toBeDefined();
        expect(typeof result.content).toBe('string');
      }
    });

    it('should read line range', async () => {
      if (!testFile) {
        return;
      }

      const result = await fetchContent({
        path: testFile,
        charOffset: 0,
        charLength: 2000,
        researchGoal: 'Read first 20 lines',
        reasoning: 'Testing line range fetch',
      });

      verifySmartData(result, 'local_fetch_content');

      if (result.status === 'hasResults') {
        expect(result.content).toBeDefined();
      }
    });

    it('should extract pattern-based content', async () => {
      if (!testFile) {
        return;
      }

      const result = await fetchContent({
        path: testFile,
        matchString: 'dependencies',
        matchStringContextLines: 5,
        researchGoal: 'Extract dependencies section',
        reasoning: 'Testing pattern-based extraction',
      });

      verifySmartData(result, 'local_fetch_content');

      if (result.status === 'hasResults') {
        expect(result.content).toBeDefined();
      }
    });
  });
});
