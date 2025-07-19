import { describe, it, expect } from 'vitest';
import { buildGitHubCliArgs } from '../../src/mcp/tools/github_search_code.js';
import { GitHubCodeSearchParams } from '../../src/types.js';

describe('GitHub CLI Integration Tests - Argument Building', () => {
  describe('Basic Query Types', () => {
    it('should build correct args for exact query', () => {
      const params: GitHubCodeSearchParams = {
        exactQuery: 'useState',
        limit: 30,
      };

      const result = buildGitHubCliArgs(params);

      expect(result).toEqual([
        'code',
        '"useState"',
        '--limit=30',
        '--json=repository,path,textMatches,sha,url',
      ]);
    });

    it('should build correct args for single term query', () => {
      const params: GitHubCodeSearchParams = {
        queryTerms: ['react'],
        limit: 20,
      };

      const result = buildGitHubCliArgs(params);

      expect(result).toEqual([
        'code',
        'react',
        '--limit=20',
        '--json=repository,path,textMatches,sha,url',
      ]);
    });

    it('should build correct args for multi-term query (AND logic)', () => {
      const params: GitHubCodeSearchParams = {
        queryTerms: ['react', 'hooks', 'async'],
        limit: 25,
      };

      const result = buildGitHubCliArgs(params);

      expect(result).toEqual([
        'code',
        'react hooks async',
        '--limit=25',
        '--json=repository,path,textMatches,sha,url',
      ]);
    });
  });

  describe('Language and Extension Filters', () => {
    it('should handle language filter', () => {
      const params: GitHubCodeSearchParams = {
        exactQuery: 'function',
        language: 'typescript',
        limit: 30,
      };

      const result = buildGitHubCliArgs(params);

      expect(result).toEqual([
        'code',
        '"function"',
        '--language=typescript',
        '--limit=30',
        '--json=repository,path,textMatches,sha,url',
      ]);
    });

    it('should handle extension filter', () => {
      const params: GitHubCodeSearchParams = {
        exactQuery: 'class',
        extension: 'tsx',
        limit: 30,
      };

      const result = buildGitHubCliArgs(params);

      expect(result).toEqual([
        'code',
        '"class"',
        '--extension=tsx',
        '--limit=30',
        '--json=repository,path,textMatches,sha,url',
      ]);
    });

    it('should handle both language and extension', () => {
      const params: GitHubCodeSearchParams = {
        exactQuery: 'component',
        language: 'javascript',
        extension: 'jsx',
        limit: 15,
      };

      const result = buildGitHubCliArgs(params);

      expect(result).toEqual([
        'code',
        '"component"',
        '--language=javascript',
        '--extension=jsx',
        '--limit=15',
        '--json=repository,path,textMatches,sha,url',
      ]);
    });
  });

  describe('Owner and Repository Filters', () => {
    it('should handle single owner filter', () => {
      const params: GitHubCodeSearchParams = {
        exactQuery: 'api',
        owner: 'microsoft',
        limit: 30,
      };

      const result = buildGitHubCliArgs(params);

      expect(result).toEqual([
        'code',
        '"api"',
        '--owner=microsoft',
        '--limit=30',
        '--json=repository,path,textMatches,sha,url',
      ]);
    });

    it('should handle multiple owners', () => {
      const params: GitHubCodeSearchParams = {
        exactQuery: 'error',
        owner: ['facebook', 'google', 'microsoft'],
        limit: 30,
      };

      const result = buildGitHubCliArgs(params);

      expect(result).toEqual([
        'code',
        '"error"',
        '--owner=facebook',
        '--owner=google',
        '--owner=microsoft',
        '--limit=30',
        '--json=repository,path,textMatches,sha,url',
      ]);
    });

    it('should handle single repo in owner/repo format', () => {
      const params: GitHubCodeSearchParams = {
        exactQuery: 'hook',
        repo: 'facebook/react',
        limit: 30,
      };

      const result = buildGitHubCliArgs(params);

      expect(result).toEqual([
        'code',
        '"hook"',
        '--repo=facebook/react',
        '--limit=30',
        '--json=repository,path,textMatches,sha,url',
      ]);
    });

    it('should handle multiple repos in owner/repo format', () => {
      const params: GitHubCodeSearchParams = {
        exactQuery: 'component',
        repo: ['facebook/react', 'vuejs/vue', 'angular/angular'],
        limit: 30,
      };

      const result = buildGitHubCliArgs(params);

      expect(result).toEqual([
        'code',
        '"component"',
        '--repo=facebook/react',
        '--repo=vuejs/vue',
        '--repo=angular/angular',
        '--limit=30',
        '--json=repository,path,textMatches,sha,url',
      ]);
    });

    it('should combine owner with simple repo names', () => {
      const params: GitHubCodeSearchParams = {
        exactQuery: 'test',
        owner: 'microsoft',
        repo: 'vscode',
        limit: 30,
      };

      const result = buildGitHubCliArgs(params);

      expect(result).toEqual([
        'code',
        '"test"',
        '--repo=microsoft/vscode',
        '--limit=30',
        '--json=repository,path,textMatches,sha,url',
      ]);
    });

    it('should handle multiple owners with multiple simple repo names', () => {
      const params: GitHubCodeSearchParams = {
        exactQuery: 'async',
        owner: ['facebook', 'google'],
        repo: ['react', 'angular'],
        limit: 30,
      };

      const result = buildGitHubCliArgs(params);

      // Order: each repo iterates through all owners
      expect(result).toEqual([
        'code',
        '"async"',
        '--repo=facebook/react',
        '--repo=google/react',
        '--repo=facebook/angular',
        '--repo=google/angular',
        '--limit=30',
        '--json=repository,path,textMatches,sha,url',
      ]);
    });

    it('should ignore owner when repo is already in owner/repo format', () => {
      const params: GitHubCodeSearchParams = {
        exactQuery: 'util',
        owner: ['ignored', 'also-ignored'],
        repo: ['facebook/react', 'microsoft/vscode'],
        limit: 30,
      };

      const result = buildGitHubCliArgs(params);

      // Owner should be ignored since repos already specify owners
      expect(result).toEqual([
        'code',
        '"util"',
        '--repo=facebook/react',
        '--repo=microsoft/vscode',
        '--limit=30',
        '--json=repository,path,textMatches,sha,url',
      ]);
    });
  });

  describe('File Filters', () => {
    it('should handle filename filter', () => {
      const params: GitHubCodeSearchParams = {
        exactQuery: 'lint',
        filename: 'package.json',
        limit: 30,
      };

      const result = buildGitHubCliArgs(params);

      expect(result).toEqual([
        'code',
        '"lint"',
        '--filename=package.json',
        '--limit=30',
        '--json=repository,path,textMatches,sha,url',
      ]);
    });

    it('should handle filename pattern', () => {
      const params: GitHubCodeSearchParams = {
        exactQuery: 'config',
        filename: '*.json',
        limit: 30,
      };

      const result = buildGitHubCliArgs(params);

      expect(result).toEqual([
        'code',
        '"config"',
        '--filename=*.json',
        '--limit=30',
        '--json=repository,path,textMatches,sha,url',
      ]);
    });
  });

  describe('Size Filters', () => {
    it('should handle size greater than', () => {
      const params: GitHubCodeSearchParams = {
        exactQuery: 'class',
        size: '>1000',
        limit: 30,
      };

      const result = buildGitHubCliArgs(params);

      expect(result).toEqual([
        'code',
        '"class"',
        '--size=>1000',
        '--limit=30',
        '--json=repository,path,textMatches,sha,url',
      ]);
    });

    it('should handle size less than', () => {
      const params: GitHubCodeSearchParams = {
        exactQuery: 'script',
        size: '<500',
        limit: 30,
      };

      const result = buildGitHubCliArgs(params);

      expect(result).toEqual([
        'code',
        '"script"',
        '--size=<500',
        '--limit=30',
        '--json=repository,path,textMatches,sha,url',
      ]);
    });

    it('should handle size range', () => {
      const params: GitHubCodeSearchParams = {
        exactQuery: 'function',
        size: '100..2000',
        limit: 30,
      };

      const result = buildGitHubCliArgs(params);

      expect(result).toEqual([
        'code',
        '"function"',
        '--size=100..2000',
        '--limit=30',
        '--json=repository,path,textMatches,sha,url',
      ]);
    });
  });

  describe('Match Filters', () => {
    it('should handle match=file (default behavior)', () => {
      const params: GitHubCodeSearchParams = {
        exactQuery: 'search',
        match: 'file',
        limit: 30,
      };

      const result = buildGitHubCliArgs(params);

      expect(result).toEqual([
        'code',
        '"search"',
        '--match=file',
        '--limit=30',
        '--json=repository,path,textMatches,sha,url',
      ]);
    });

    it('should handle match=path', () => {
      const params: GitHubCodeSearchParams = {
        exactQuery: 'test',
        match: 'path',
        limit: 30,
      };

      const result = buildGitHubCliArgs(params);

      expect(result).toEqual([
        'code',
        '"test"',
        '--match=path',
        '--limit=30',
        '--json=repository,path,textMatches,sha,url',
      ]);
    });
  });

  describe('Limit Handling', () => {
    it('should use default limit when not specified', () => {
      const params: GitHubCodeSearchParams = {
        exactQuery: 'default',
      };

      const result = buildGitHubCliArgs(params);

      expect(result).toEqual([
        'code',
        '"default"',
        '--limit=30',
        '--json=repository,path,textMatches,sha,url',
      ]);
    });

    it('should respect custom limit', () => {
      const params: GitHubCodeSearchParams = {
        exactQuery: 'custom',
        limit: 50,
      };

      const result = buildGitHubCliArgs(params);

      expect(result).toEqual([
        'code',
        '"custom"',
        '--limit=50',
        '--json=repository,path,textMatches,sha,url',
      ]);
    });

    it('should handle minimum limit', () => {
      const params: GitHubCodeSearchParams = {
        exactQuery: 'min',
        limit: 1,
      };

      const result = buildGitHubCliArgs(params);

      expect(result).toEqual([
        'code',
        '"min"',
        '--limit=1',
        '--json=repository,path,textMatches,sha,url',
      ]);
    });

    it('should handle maximum limit', () => {
      const params: GitHubCodeSearchParams = {
        exactQuery: 'max',
        limit: 100,
      };

      const result = buildGitHubCliArgs(params);

      expect(result).toEqual([
        'code',
        '"max"',
        '--limit=100',
        '--json=repository,path,textMatches,sha,url',
      ]);
    });
  });

  describe('Complex Combined Filters', () => {
    it('should handle comprehensive search with all filters', () => {
      const params: GitHubCodeSearchParams = {
        exactQuery: 'authentication hook',
        language: 'typescript',
        owner: 'facebook',
        repo: 'react',
        filename: '*.tsx',
        extension: 'tsx',
        size: '>1000',
        match: 'file',
        limit: 25,
      };

      const result = buildGitHubCliArgs(params);

      expect(result).toEqual([
        'code',
        '"authentication hook"',
        '--language=typescript',
        '--repo=facebook/react',
        '--filename=*.tsx',
        '--extension=tsx',
        '--size=>1000',
        '--match=file',
        '--limit=25',
        '--json=repository,path,textMatches,sha,url',
      ]);
    });

    it('should handle multi-term search with multiple filters', () => {
      const params: GitHubCodeSearchParams = {
        queryTerms: ['async', 'component', 'loading'],
        language: 'javascript',
        owner: ['microsoft', 'google'],
        filename: '*.js',
        size: '500..2000',
        match: 'path',
        limit: 15,
      };

      const result = buildGitHubCliArgs(params);

      expect(result).toEqual([
        'code',
        'async component loading',
        '--language=javascript',
        '--owner=microsoft',
        '--owner=google',
        '--filename=*.js',
        '--size=500..2000',
        '--match=path',
        '--limit=15',
        '--json=repository,path,textMatches,sha,url',
      ]);
    });

    it('should handle complex repository filtering', () => {
      const params: GitHubCodeSearchParams = {
        exactQuery: 'error handling',
        language: 'typescript',
        repo: ['facebook/react', 'microsoft/vscode', 'angular/angular'],
        extension: 'ts',
        limit: 50,
      };

      const result = buildGitHubCliArgs(params);

      expect(result).toEqual([
        'code',
        '"error handling"',
        '--language=typescript',
        '--repo=facebook/react',
        '--repo=microsoft/vscode',
        '--repo=angular/angular',
        '--extension=ts',
        '--limit=50',
        '--json=repository,path,textMatches,sha,url',
      ]);
    });
  });

  describe('Edge Cases and Special Characters', () => {
    it('should handle queries with spaces', () => {
      const params: GitHubCodeSearchParams = {
        exactQuery: 'error handling with spaces',
        limit: 30,
      };

      const result = buildGitHubCliArgs(params);

      expect(result).toEqual([
        'code',
        '"error handling with spaces"',
        '--limit=30',
        '--json=repository,path,textMatches,sha,url',
      ]);
    });

    it('should handle special characters in filenames', () => {
      const params: GitHubCodeSearchParams = {
        exactQuery: 'config',
        filename: 'jest.config.js',
        limit: 30,
      };

      const result = buildGitHubCliArgs(params);

      expect(result).toEqual([
        'code',
        '"config"',
        '--filename=jest.config.js',
        '--limit=30',
        '--json=repository,path,textMatches,sha,url',
      ]);
    });

    it('should handle repository names with dashes and underscores', () => {
      const params: GitHubCodeSearchParams = {
        exactQuery: 'utils',
        repo: 'my-org/my_awesome-repo',
        limit: 30,
      };

      const result = buildGitHubCliArgs(params);

      expect(result).toEqual([
        'code',
        '"utils"',
        '--repo=my-org/my_awesome-repo',
        '--limit=30',
        '--json=repository,path,textMatches,sha,url',
      ]);
    });
  });

  describe('JSON Output Format', () => {
    it('should always include correct JSON fields', () => {
      const params: GitHubCodeSearchParams = {
        exactQuery: 'test',
        limit: 30,
      };

      const result = buildGitHubCliArgs(params);

      // Verify the JSON output format is always present and correct
      expect(result[result.length - 1]).toBe(
        '--json=repository,path,textMatches,sha,url'
      );
    });

    it('should include JSON format even with minimal params', () => {
      const params: GitHubCodeSearchParams = {
        queryTerms: ['minimal'],
      };

      const result = buildGitHubCliArgs(params);

      expect(result).toContain('--json=repository,path,textMatches,sha,url');
    });
  });

  describe('Flag Ordering', () => {
    it('should maintain consistent flag ordering', () => {
      const params: GitHubCodeSearchParams = {
        exactQuery: 'test',
        match: 'file',
        size: '>100',
        extension: 'js',
        filename: '*.test.js',
        repo: 'org/repo',
        owner: 'org',
        language: 'javascript',
        limit: 25,
      };

      const result = buildGitHubCliArgs(params);

      // Verify the general structure and order
      expect(result[0]).toBe('code');
      expect(result[1]).toBe('"test"');

      // All flags should come after the query
      const flags = result.slice(2);
      const flagsOnly = flags.filter(f => f.startsWith('--'));

      // Debug output to understand what flags are being generated
      // console.log('Generated flags:', flagsOnly);

      // Should have language, repo, filename, extension, size, match, limit, and json flags
      // Check the actual count to understand what we're getting
      expect(flagsOnly.length).toBe(8);

      // Verify specific flags are present
      expect(flags).toContain('--language=javascript');
      expect(flags).toContain('--repo=org/repo');
      expect(flags).toContain('--filename=*.test.js');
      expect(flags).toContain('--extension=js');
      expect(flags).toContain('--size=>100');
      expect(flags).toContain('--match=file');
      expect(flags).toContain('--limit=25');

      // JSON should always be last
      expect(flags[flags.length - 1]).toBe(
        '--json=repository,path,textMatches,sha,url'
      );
    });
  });
});

describe('GitHub CLI Integration - Command Validation', () => {
  describe('GitHub CLI Command Structure Compliance', () => {
    it('should generate commands that match official GitHub CLI format', () => {
      // Test cases based on official gh search code documentation
      const testCases = [
        {
          name: 'Basic search',
          params: { exactQuery: 'octocat' },
          shouldContain: ['code', '"octocat"'],
        },
        {
          name: 'Language filter',
          params: { exactQuery: 'printf', language: 'c' },
          shouldContain: ['code', '"printf"', '--language=c'],
        },
        {
          name: 'Repository filter',
          params: { exactQuery: 'main', repo: 'github/docs' },
          shouldContain: ['code', '"main"', '--repo=github/docs'],
        },
        {
          name: 'Organization search',
          params: { exactQuery: 'react', owner: 'facebook' },
          shouldContain: ['code', '"react"', '--owner=facebook'],
        },
        {
          name: 'File extension',
          params: { exactQuery: 'function', extension: 'py' },
          shouldContain: ['code', '"function"', '--extension=py'],
        },
        {
          name: 'File size',
          params: { exactQuery: 'import', size: '>100' },
          shouldContain: ['code', '"import"', '--size=>100'],
        },
        {
          name: 'Path matching',
          params: { exactQuery: 'test', match: 'path' },
          shouldContain: ['code', '"test"', '--match=path'],
        },
      ];

      testCases.forEach(({ name, params, shouldContain }) => {
        const result = buildGitHubCliArgs(params as GitHubCodeSearchParams);

        shouldContain.forEach(expectedArg => {
          expect(result, `Test case: ${name}`).toContain(expectedArg);
        });

        // Verify it starts with 'code'
        expect(result[0], `Test case: ${name} - first arg`).toBe('code');

        // Verify it includes JSON output
        expect(result, `Test case: ${name} - JSON output`).toContain(
          '--json=repository,path,textMatches,sha,url'
        );
      });
    });

    it('should generate valid GitHub CLI search qualifiers', () => {
      // These are the exact formats supported by GitHub CLI
      const validFormats = [
        { params: { owner: 'microsoft' }, expected: '--owner=microsoft' },
        { params: { repo: 'cli/cli' }, expected: '--repo=cli/cli' },
        { params: { language: 'go' }, expected: '--language=go' },
        { params: { extension: 'md' }, expected: '--extension=md' },
        { params: { filename: 'README' }, expected: '--filename=README' },
        { params: { size: '1000' }, expected: '--size=1000' },
        { params: { size: '>1000' }, expected: '--size=>1000' },
        { params: { size: '<1000' }, expected: '--size=<1000' },
        { params: { size: '100..1000' }, expected: '--size=100..1000' },
        { params: { match: 'file' }, expected: '--match=file' },
        { params: { match: 'path' }, expected: '--match=path' },
        { params: { limit: 50 }, expected: '--limit=50' },
      ];

      validFormats.forEach(({ params, expected }) => {
        const fullParams = { exactQuery: 'test', ...params };
        const result = buildGitHubCliArgs(fullParams as GitHubCodeSearchParams);

        expect(result).toContain(expected);
      });
    });
  });
});
