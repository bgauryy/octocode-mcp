/**
 * Tests for research-output utilities
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  appendResearchFinding,
  summarizeQuery,
  summarizeResponse,
  getShortToolName,
  isOctocodeResearchTool,
  getResearchDir,
  getFindingsPath,
  hasResearchDir,
  readFindings,
  type ResearchFinding,
} from '../../src/utils/research-output.js';

describe('research-output', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'octocode-research-test-'));
  });

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('appendResearchFinding', () => {
    it('should create research directory and findings file if they do not exist', async () => {
      const finding: ResearchFinding = {
        tool: 'mcp__octocode-local__localSearchCode',
        timestamp: '2025-01-05T10:00:00.000Z',
        query: 'Search: "test pattern"',
        summary: 'Found 5 matches in 3 files',
      };

      await appendResearchFinding(tempDir, finding);

      const findingsPath = join(
        tempDir,
        '.octocode',
        'research',
        'findings.md'
      );
      expect(existsSync(findingsPath)).toBe(true);
    });

    it('should append finding to existing file', async () => {
      const finding1: ResearchFinding = {
        tool: 'mcp__octocode-local__localSearchCode',
        timestamp: '2025-01-05T10:00:00.000Z',
        query: 'First search',
        summary: 'First result',
      };

      const finding2: ResearchFinding = {
        tool: 'mcp__octocode-local__localGetFileContent',
        timestamp: '2025-01-05T10:05:00.000Z',
        query: 'Second read',
        summary: 'Second result',
      };

      await appendResearchFinding(tempDir, finding1);
      await appendResearchFinding(tempDir, finding2);

      const content = readFindings(tempDir);
      expect(content).toContain('localSearchCode');
      expect(content).toContain('localGetFileContent');
      expect(content).toContain('First search');
      expect(content).toContain('Second read');
    });

    it('should format finding as markdown', async () => {
      const finding: ResearchFinding = {
        tool: 'mcp__octocode-local__githubSearchCode',
        timestamp: '2025-01-05T10:00:00.000Z',
        query: 'pattern search',
        summary: 'Found 10 matches',
      };

      await appendResearchFinding(tempDir, finding);

      const content = readFindings(tempDir);
      expect(content).toContain('## githubSearchCode');
      expect(content).toContain('**Time:**');
      expect(content).toContain('**Query:**');
      expect(content).toContain('**Result:**');
      expect(content).toContain('---');
    });
  });

  describe('summarizeQuery', () => {
    it('should return "(no input)" for null/undefined', () => {
      expect(summarizeQuery(null)).toBe('(no input)');
      expect(summarizeQuery(undefined)).toBe('(no input)');
    });

    it('should handle string input', () => {
      expect(summarizeQuery('test query')).toBe('test query');
    });

    it('should extract pattern from search query', () => {
      const input = { pattern: 'function.*test', path: 'src/' };
      expect(summarizeQuery(input)).toBe('Search: "function.*test" in src/');
    });

    it('should extract path from file content query', () => {
      const input = { path: 'src/index.ts', matchString: 'export' };
      expect(summarizeQuery(input)).toBe('File: src/index.ts (match: export)');
    });

    it('should extract repo from GitHub query', () => {
      const input = { owner: 'octocat', repo: 'hello-world', path: 'src' };
      expect(summarizeQuery(input)).toBe('Repo: octocat/hello-world/src');
    });

    it('should extract package from package search', () => {
      const input = { name: 'express', ecosystem: 'npm' };
      expect(summarizeQuery(input)).toBe('Package: npm/express');
    });

    it('should truncate long input', () => {
      const longInput = { data: 'A'.repeat(500) };
      const result = summarizeQuery(longInput, 100);
      expect(result.length).toBeLessThanOrEqual(100);
      expect(result.endsWith('...')).toBe(true);
    });
  });

  describe('summarizeResponse', () => {
    it('should return "(no response)" for null/undefined', () => {
      expect(summarizeResponse(null)).toBe('(no response)');
      expect(summarizeResponse(undefined)).toBe('(no response)');
    });

    it('should handle string response', () => {
      expect(summarizeResponse('success')).toBe('success');
    });

    it('should summarize files array response', () => {
      const response = {
        files: [{ path: 'a.ts' }, { path: 'b.ts' }],
        totalMatches: 15,
      };
      expect(summarizeResponse(response)).toBe('Found 15 matches in 2 files');
    });

    it('should summarize results array response', () => {
      const response = { results: [{}, {}, {}] };
      expect(summarizeResponse(response)).toBe('3 results returned');
    });

    it('should summarize structure response', () => {
      const response = {
        structure: {},
        summary: { totalFiles: 25, totalFolders: 10 },
      };
      expect(summarizeResponse(response)).toBe(
        'Structure: 25 files, 10 folders'
      );
    });

    it('should extract content from MCP text response', () => {
      const response = {
        content: [{ type: 'text', text: 'This is the response text' }],
      };
      expect(summarizeResponse(response)).toBe('This is the response text');
    });

    it('should truncate long responses', () => {
      const longResponse = 'A'.repeat(1000);
      const result = summarizeResponse(longResponse, 100);
      expect(result.length).toBeLessThanOrEqual(100);
      expect(result.endsWith('...')).toBe(true);
    });
  });

  describe('getShortToolName', () => {
    it('should extract short name from MCP tool name', () => {
      expect(getShortToolName('mcp__octocode-local__localSearchCode')).toBe(
        'localSearchCode'
      );
      expect(
        getShortToolName('mcp__octocode-local__githubGetFileContent')
      ).toBe('githubGetFileContent');
    });

    it('should return original name if not MCP format', () => {
      expect(getShortToolName('Read')).toBe('Read');
      expect(getShortToolName('Bash')).toBe('Bash');
    });
  });

  describe('isOctocodeResearchTool', () => {
    it('should return true for Octocode MCP tools', () => {
      expect(
        isOctocodeResearchTool('mcp__octocode-local__localSearchCode')
      ).toBe(true);
      expect(isOctocodeResearchTool('mcp__octocode__githubSearch')).toBe(true);
    });

    it('should return false for non-Octocode tools', () => {
      expect(isOctocodeResearchTool('Read')).toBe(false);
      expect(isOctocodeResearchTool('mcp__other__tool')).toBe(false);
    });
  });

  describe('path helpers', () => {
    it('getResearchDir should return correct path', () => {
      expect(getResearchDir('/project')).toBe('/project/.octocode/research');
    });

    it('getFindingsPath should return correct path', () => {
      expect(getFindingsPath('/project')).toBe(
        '/project/.octocode/research/findings.md'
      );
    });

    it('hasResearchDir should return false for non-existent dir', () => {
      expect(hasResearchDir(tempDir)).toBe(false);
    });

    it('hasResearchDir should return true after creating findings', async () => {
      await appendResearchFinding(tempDir, {
        tool: 'test',
        timestamp: new Date().toISOString(),
        query: 'test',
        summary: 'test',
      });
      expect(hasResearchDir(tempDir)).toBe(true);
    });
  });

  describe('readFindings', () => {
    it('should return null for non-existent file', () => {
      expect(readFindings(tempDir)).toBeNull();
    });

    it('should return file content', async () => {
      await appendResearchFinding(tempDir, {
        tool: 'test-tool',
        timestamp: new Date().toISOString(),
        query: 'test query',
        summary: 'test summary',
      });

      const content = readFindings(tempDir);
      expect(content).toContain('# Research Findings');
      expect(content).toContain('test-tool');
    });
  });
});
