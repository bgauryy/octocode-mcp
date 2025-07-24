import { describe, it, expect } from 'vitest';
import {
  extractOwnerRepoFromQuery,
  createToolSuggestion,
} from '../../../src/mcp/tools/utils/validation.js';

describe('Validation Utilities', () => {
  describe('extractOwnerRepoFromQuery', () => {
    describe('GitHub URL patterns', () => {
      it('should extract from full HTTPS GitHub URL', () => {
        const result = extractOwnerRepoFromQuery(
          'https://github.com/facebook/react'
        );

        expect(result.owner).toBe('facebook');
        expect(result.repo).toBe('react');
        expect(result.remainingQuery).toBeUndefined();
      });

      it('should extract from HTTP GitHub URL', () => {
        const result = extractOwnerRepoFromQuery(
          'http://github.com/microsoft/vscode'
        );

        expect(result.owner).toBe('microsoft');
        expect(result.repo).toBe('vscode');
        expect(result.remainingQuery).toBeUndefined();
      });

      it('should extract from HTTPS with www GitHub URL', () => {
        const result = extractOwnerRepoFromQuery(
          'https://www.github.com/vercel/next.js'
        );

        expect(result.owner).toBe('vercel');
        expect(result.repo).toBe('next.js');
        expect(result.remainingQuery).toBeUndefined();
      });

      it('should extract from GitHub URL without protocol', () => {
        const result = extractOwnerRepoFromQuery('github.com/golang/go');

        expect(result.owner).toBe('golang');
        expect(result.repo).toBe('go');
        expect(result.remainingQuery).toBeUndefined();
      });

      it('should extract from GitHub URL with .git suffix', () => {
        const result = extractOwnerRepoFromQuery(
          'https://github.com/nodejs/node.git'
        );

        expect(result.owner).toBe('nodejs');
        expect(result.repo).toBe('node');
        expect(result.remainingQuery).toBeUndefined();
      });

      it('should extract from GitHub URL in middle of query with remaining text', () => {
        const result = extractOwnerRepoFromQuery(
          'check this https://github.com/facebook/react for component patterns'
        );

        expect(result.owner).toBe('facebook');
        expect(result.repo).toBe('react');
        expect(result.remainingQuery).toBe(
          'check this  for component patterns'
        );
      });
    });

    describe('Owner/repo patterns', () => {
      it('should extract from simple owner/repo format', () => {
        const result = extractOwnerRepoFromQuery('facebook/react');

        expect(result.owner).toBe('facebook');
        expect(result.repo).toBe('react');
        expect(result.remainingQuery).toBeUndefined();
      });

      it('should extract from owner/repo with numbers and hyphens', () => {
        const result = extractOwnerRepoFromQuery('microsoft/vscode-1');

        expect(result.owner).toBe('microsoft');
        expect(result.repo).toBe('vscode-1');
        expect(result.remainingQuery).toBeUndefined();
      });

      it('should extract from owner/repo in middle of query', () => {
        const result = extractOwnerRepoFromQuery(
          'look at facebook/react for examples'
        );

        expect(result.owner).toBe('facebook');
        expect(result.repo).toBe('react');
        expect(result.remainingQuery).toBe('look at  for examples');
      });

      it('should extract first owner/repo pattern when multiple exist', () => {
        const result = extractOwnerRepoFromQuery(
          'compare facebook/react with vue/vue'
        );

        expect(result.owner).toBe('facebook');
        expect(result.repo).toBe('react');
        expect(result.remainingQuery).toBe('compare  with vue/vue');
      });
    });

    describe('Edge cases and invalid patterns', () => {
      it('should return empty object for query without owner/repo pattern', () => {
        const result = extractOwnerRepoFromQuery('just a regular search query');

        expect(result.owner).toBeUndefined();
        expect(result.repo).toBeUndefined();
        expect(result.remainingQuery).toBeUndefined();
      });

      it('should return empty object for empty string', () => {
        const result = extractOwnerRepoFromQuery('');

        expect(result.owner).toBeUndefined();
        expect(result.repo).toBeUndefined();
        expect(result.remainingQuery).toBeUndefined();
      });

      it('should return empty object for just owner without repo', () => {
        const result = extractOwnerRepoFromQuery('facebook/');

        expect(result.owner).toBeUndefined();
        expect(result.repo).toBeUndefined();
        expect(result.remainingQuery).toBeUndefined();
      });

      it('should return empty object for just repo without owner', () => {
        const result = extractOwnerRepoFromQuery('/react');

        expect(result.owner).toBeUndefined();
        expect(result.repo).toBeUndefined();
        expect(result.remainingQuery).toBeUndefined();
      });

      it('should handle GitHub URL with additional path segments', () => {
        const result = extractOwnerRepoFromQuery(
          'https://github.com/facebook/react/issues/123'
        );

        expect(result.owner).toBe('facebook');
        expect(result.repo).toBe('react');
        expect(result.remainingQuery).toBe('/issues/123');
      });

      it('should handle malformed GitHub URLs', () => {
        const result = extractOwnerRepoFromQuery('github.com//react');

        expect(result.owner).toBeUndefined();
        expect(result.repo).toBeUndefined();
        expect(result.remainingQuery).toBeUndefined();
      });

      it('should handle special characters in owner/repo names', () => {
        const result = extractOwnerRepoFromQuery(
          'owner-with-dashes/repo.with.dots'
        );

        expect(result.owner).toBe('owner-with-dashes');
        expect(result.repo).toBe('repo.with.dots');
        expect(result.remainingQuery).toBeUndefined();
      });

      it('should handle whitespace in query', () => {
        const result = extractOwnerRepoFromQuery('  facebook/react  ');

        expect(result.owner).toBe('facebook');
        expect(result.repo).toBe('react');
        expect(result.remainingQuery).toBeUndefined();
      });

      it('should handle query with newlines and tabs', () => {
        const result = extractOwnerRepoFromQuery(
          'check\n\tfacebook/react\t\nfor examples'
        );

        expect(result.owner).toBe('facebook');
        expect(result.repo).toBe('react');
        expect(result.remainingQuery).toBe('check\n\t\t\nfor examples');
      });
    });

    describe('Case sensitivity', () => {
      it('should preserve case in owner and repo names', () => {
        const result = extractOwnerRepoFromQuery('Facebook/React');

        expect(result.owner).toBe('Facebook');
        expect(result.repo).toBe('React');
        expect(result.remainingQuery).toBeUndefined();
      });

      it('should handle mixed case in GitHub URLs', () => {
        const result = extractOwnerRepoFromQuery(
          'https://GitHub.com/Facebook/React'
        );

        expect(result.owner).toBe('Facebook');
        expect(result.repo).toBe('React');
        expect(result.remainingQuery).toBeUndefined();
      });
    });

    describe('Complex queries', () => {
      it('should handle query with multiple words and patterns', () => {
        const result = extractOwnerRepoFromQuery(
          'How to use facebook/react with typescript and webpack?'
        );

        expect(result.owner).toBe('facebook');
        expect(result.repo).toBe('react');
        expect(result.remainingQuery).toBe(
          'How to use  with typescript and webpack?'
        );
      });

      it('should handle query with email-like patterns', () => {
        const result = extractOwnerRepoFromQuery(
          'contact admin@github.com about facebook/react issue'
        );

        expect(result.owner).toBe('facebook');
        expect(result.repo).toBe('react');
        expect(result.remainingQuery).toBe(
          'contact admin@github.com about  issue'
        );
      });

      it('should handle query with file paths', () => {
        const result = extractOwnerRepoFromQuery(
          'check ./facebook/react/src/index.js file'
        );

        expect(result.owner).toBe('facebook');
        expect(result.repo).toBe('react');
        expect(result.remainingQuery).toBe('check .//src/index.js file');
      });
    });
  });

  describe('createToolSuggestion', () => {
    it('should create formatted suggestion with single tool', () => {
      const suggestions = [
        { tool: 'github_search_repos', reason: 'to find repositories' },
      ];

      const result = createToolSuggestion('current_tool', suggestions);

      expect(result).toBe(
        '\n\nCurrent tool: current_tool\n' +
          'Alternative tools:\n' +
          '• Use github_search_repos to find repositories'
      );
    });

    it('should create formatted suggestion with multiple tools', () => {
      const suggestions = [
        { tool: 'github_search_repos', reason: 'to find repositories' },
        { tool: 'github_fetch_content', reason: 'to get file contents' },
        { tool: 'package_search', reason: 'to find npm packages' },
      ];

      const result = createToolSuggestion('current_tool', suggestions);

      expect(result).toBe(
        '\n\nCurrent tool: current_tool\n' +
          'Alternative tools:\n' +
          '• Use github_search_repos to find repositories\n' +
          '• Use github_fetch_content to get file contents\n' +
          '• Use package_search to find npm packages'
      );
    });

    it('should return empty string for empty suggestions array', () => {
      const suggestions: Array<{ tool: string; reason: string }> = [];

      const result = createToolSuggestion('current_tool', suggestions);

      expect(result).toBe('');
    });

    it('should handle suggestions with special characters', () => {
      const suggestions = [
        {
          tool: 'tool-with-dashes',
          reason: 'for special use-cases & edge scenarios',
        },
      ];

      const result = createToolSuggestion('current_tool', suggestions);

      expect(result).toBe(
        '\n\nCurrent tool: current_tool\n' +
          'Alternative tools:\n' +
          '• Use tool-with-dashes for special use-cases & edge scenarios'
      );
    });

    it('should handle empty tool name and reason', () => {
      const suggestions = [{ tool: '', reason: '' }];

      const result = createToolSuggestion('current_tool', suggestions);

      expect(result).toBe(
        '\n\nCurrent tool: current_tool\n' + 'Alternative tools:\n' + '• Use  '
      );
    });

    it('should handle current tool with special characters', () => {
      const suggestions = [
        { tool: 'alternative_tool', reason: 'for better results' },
      ];

      const result = createToolSuggestion(
        'current-tool_with_chars',
        suggestions
      );

      expect(result).toBe(
        '\n\nCurrent tool: current-tool_with_chars\n' +
          'Alternative tools:\n' +
          '• Use alternative_tool for better results'
      );
    });

    it('should handle long tool names and reasons', () => {
      const suggestions = [
        {
          tool: 'very_long_tool_name_with_many_underscores_and_words',
          reason:
            'to handle very specific and complex use cases that require detailed processing and analysis of multiple data sources',
        },
      ];

      const result = createToolSuggestion('current_tool', suggestions);

      expect(result).toBe(
        '\n\nCurrent tool: current_tool\n' +
          'Alternative tools:\n' +
          '• Use very_long_tool_name_with_many_underscores_and_words to handle very specific and complex use cases that require detailed processing and analysis of multiple data sources'
      );
    });

    it('should preserve whitespace in tool names and reasons', () => {
      const suggestions = [
        { tool: 'tool with spaces', reason: 'for   spaced   reasons' },
      ];

      const result = createToolSuggestion('current tool', suggestions);

      expect(result).toBe(
        '\n\nCurrent tool: current tool\n' +
          'Alternative tools:\n' +
          '• Use tool with spaces for   spaced   reasons'
      );
    });
  });
});
