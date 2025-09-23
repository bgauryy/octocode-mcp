import { describe, it, expect, vi } from 'vitest';
import {
  createResult,
  toDDMMYYYY,
  simplifyRepoUrl,
  getCommitTitle,
  humanizeBytes,
  simplifyGitHubUrl,
  optimizeTextMatch,
} from '../../src/responses';

// Mock the isBetaEnabled function
vi.mock('../../src/serverConfig', () => ({
  isBetaEnabled: vi.fn(() => false),
}));

describe('Response Utilities', () => {
  describe('createResult', () => {
    it('should create success result with JSON data', () => {
      const data = { message: 'Hello' };
      const result = createResult({ data });

      expect(result.isError).toBe(false);
      expect(result.content).toHaveLength(1);
      expect(result.content[0]!.type).toBe('text');
      const parsedResponse = JSON.parse(result.content[0]!.text as string);
      expect(parsedResponse).toEqual({
        data: { message: 'Hello' },
        hints: [],
      });
    });

    it('should create error result with string message', () => {
      const errorMessage = 'Something went wrong';
      const result = createResult({
        data: { error: errorMessage },
        isError: true,
      });

      expect(result.isError).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0]!.type).toBe('text');
      const parsedResponse = JSON.parse(result.content[0]!.text as string);
      expect(parsedResponse).toEqual({
        data: { error: errorMessage },
        hints: [],
      });
    });

    it('should include suggestions in error result', () => {
      const result = createResult({
        data: { error: 'Not found' },
        isError: true,
      });

      expect(result.isError).toBe(true);
      const parsedResponse = JSON.parse(result.content[0]!.text as string);
      expect(parsedResponse).toEqual({
        data: { error: 'Not found' },
        hints: [],
      });
    });

    it('should handle error object', () => {
      const error = new Error('Test error');
      const result = createResult({
        data: { error: error.message },
        isError: true,
      });

      expect(result.isError).toBe(true);
      const parsedResponse = JSON.parse(result.content[0]!.text as string);
      expect(parsedResponse).toEqual({
        data: { error: 'Test error' },
        hints: [],
      });
    });

    it('should create success result when no error provided', () => {
      const data = { test: 'value' };
      const result = createResult({ data });

      expect(result.isError).toBe(false);
      const parsedResponse = JSON.parse(result.content[0]!.text as string);
      expect(parsedResponse).toEqual({
        data: { test: 'value' },
        hints: [],
      });
    });
  });

  describe('toDDMMYYYY', () => {
    it('should convert ISO timestamp to DD/MM/YYYY format', () => {
      const result = toDDMMYYYY('2023-12-25T10:30:45Z');
      expect(result).toBe('25/12/2023');
    });

    it('should handle different ISO formats', () => {
      expect(toDDMMYYYY('2023-01-01T00:00:00.000Z')).toBe('01/01/2023');
      expect(toDDMMYYYY('2023-06-15T14:30:20Z')).toBe('15/06/2023');
    });

    it('should pad single digit days and months', () => {
      expect(toDDMMYYYY('2023-05-09T12:00:00Z')).toBe('09/05/2023');
      expect(toDDMMYYYY('2023-01-03T12:00:00Z')).toBe('03/01/2023');
    });
  });

  describe('simplifyRepoUrl', () => {
    it('should extract owner/repo from GitHub URL', () => {
      const url = 'https://github.com/facebook/react';
      expect(simplifyRepoUrl(url)).toBe('facebook/react');
    });

    it('should handle GitHub URLs with additional paths', () => {
      const url = 'https://github.com/microsoft/vscode/tree/main/src';
      expect(simplifyRepoUrl(url)).toBe('microsoft/vscode');
    });

    it('should return original URL if no match found', () => {
      const url = 'https://example.com/repo';
      expect(simplifyRepoUrl(url)).toBe(url);
    });

    it('should handle various GitHub URL formats', () => {
      expect(simplifyRepoUrl('https://github.com/owner/repo.git')).toBe(
        'owner/repo.git'
      );
      expect(simplifyRepoUrl('https://github.com/org/project/')).toBe(
        'org/project'
      );
    });
  });

  describe('getCommitTitle', () => {
    it('should extract first line of commit message', () => {
      const message =
        'Fix bug in authentication\n\nThis commit fixes the issue with...';
      expect(getCommitTitle(message)).toBe('Fix bug in authentication');
    });

    it('should handle single line commit messages', () => {
      const message = 'Update README';
      expect(getCommitTitle(message)).toBe('Update README');
    });

    it('should trim whitespace from first line', () => {
      const message = '  Add new feature  \n\nDetailed description';
      expect(getCommitTitle(message)).toBe('Add new feature');
    });

    it('should handle empty commit messages', () => {
      expect(getCommitTitle('')).toBe('');
      expect(getCommitTitle('\n\n')).toBe('');
    });
  });

  describe('humanizeBytes', () => {
    it('should handle zero bytes', () => {
      expect(humanizeBytes(0)).toBe('0 B');
    });

    it('should format bytes correctly', () => {
      expect(humanizeBytes(500)).toBe('500 B');
      expect(humanizeBytes(1023)).toBe('1023 B');
    });

    it('should format kilobytes correctly', () => {
      expect(humanizeBytes(1024)).toBe('1 KB');
      expect(humanizeBytes(2048)).toBe('2 KB');
      expect(humanizeBytes(1536)).toBe('2 KB'); // 1.5KB rounds to 2KB
    });

    it('should format megabytes correctly', () => {
      expect(humanizeBytes(1024 * 1024)).toBe('1 MB');
      expect(humanizeBytes(2 * 1024 * 1024)).toBe('2 MB');
      expect(humanizeBytes(1.5 * 1024 * 1024)).toBe('2 MB'); // rounds to 2MB
    });

    it('should format gigabytes correctly', () => {
      expect(humanizeBytes(1024 * 1024 * 1024)).toBe('1 GB');
      expect(humanizeBytes(2.5 * 1024 * 1024 * 1024)).toBe('3 GB'); // rounds to 3GB
    });
  });

  describe('simplifyGitHubUrl', () => {
    it('should extract file path from GitHub blob URL', () => {
      const url = 'https://github.com/facebook/react/blob/main/src/index.js';
      expect(simplifyGitHubUrl(url)).toBe('src/index.js');
    });

    it('should extract file path from GitHub commit URL', () => {
      const url =
        'https://github.com/facebook/react/commit/abc123/src/components/Button.tsx';
      expect(simplifyGitHubUrl(url)).toBe('src/components/Button.tsx');
    });

    it('should handle nested directory paths', () => {
      const url =
        'https://github.com/microsoft/vscode/blob/main/src/vs/base/common/utils.ts';
      expect(simplifyGitHubUrl(url)).toBe('src/vs/base/common/utils.ts');
    });

    it('should return original URL if no match found', () => {
      const url = 'https://github.com/owner/repo';
      expect(simplifyGitHubUrl(url)).toBe(url);
    });

    it('should handle various GitHub URL formats', () => {
      expect(
        simplifyGitHubUrl(
          'https://github.com/owner/repo/blob/feature-branch/test.js'
        )
      ).toBe('test.js');
      expect(
        simplifyGitHubUrl(
          'https://github.com/owner/repo/commit/hash/deep/nested/file.ts'
        )
      ).toBe('deep/nested/file.ts');
    });
  });

  describe('optimizeTextMatch', () => {
    it('should return short text as-is', () => {
      const text = 'Short text';
      expect(optimizeTextMatch(text)).toBe('Short text');
    });

    it('should normalize whitespace', () => {
      const text = 'Text  with   multiple    spaces';
      expect(optimizeTextMatch(text)).toBe('Text with multiple spaces');
    });

    it('should truncate long text at word boundary', () => {
      const text =
        'This is a very long text that should be truncated at a word boundary to avoid breaking words in the middle';
      const result = optimizeTextMatch(text, 50);

      expect(result.length).toBeLessThanOrEqual(52); // 50 + '…'
      expect(result.endsWith('…')).toBe(true);
      expect(result).not.toContain('  '); // No double spaces
    });

    it('should truncate at character boundary if no good word boundary', () => {
      const text =
        'verylongtextwithoutspacesorwordsthatcanbebrokenatwordboundaries';
      const result = optimizeTextMatch(text, 30);

      expect(result.length).toBe(31); // 30 + '…'
      expect(result.endsWith('…')).toBe(true);
    });

    it('should use default max length of 100', () => {
      const longText = 'A'.repeat(150);
      const result = optimizeTextMatch(longText);

      expect(result.length).toBe(101); // 100 + '…'
      expect(result.endsWith('…')).toBe(true);
    });

    it('should handle text with newlines and tabs', () => {
      const text = 'Text\nwith\ttabs\nand\nnewlines';
      const result = optimizeTextMatch(text);
      expect(result).toBe('Text with tabs and newlines');
    });

    it('should trim leading and trailing whitespace', () => {
      const text = '  \n  Leading and trailing whitespace  \n  ';
      const result = optimizeTextMatch(text);
      expect(result).toBe('Leading and trailing whitespace');
    });
  });
});
