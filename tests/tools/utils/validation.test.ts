import { describe, it, expect } from 'vitest';
import { createToolSuggestion } from '../../../src/mcp/tools/utils/validation.js';

describe('Validation Utilities', () => {
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
