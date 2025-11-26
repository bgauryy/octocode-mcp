/**
 * Tests for tokenValidation utility
 */

import { describe, it, expect } from 'vitest';
import {
  validateTokenLimit,
  validateBulkTokenLimit,
  validateSingleTokenLimit,
} from '../../src/utils/tokenValidation.js';
import { RESOURCE_LIMITS } from '../../src/constants.js';
import { ERROR_CODES } from '../../src/errors/errorCodes.js';

describe('tokenValidation', () => {
  describe('validateTokenLimit', () => {
    it('should validate content within token limits', () => {
      const content = 'a'.repeat(1000); // Small content
      const result = validateTokenLimit({
        content,
        toolName: 'local_ripgrep',
      });

      expect(result.isValid).toBe(true);
      expect(result.estimatedTokens).toBeLessThan(
        RESOURCE_LIMITS.MCP_MAX_TOKENS
      );
      expect(result.maxTokens).toBe(RESOURCE_LIMITS.MCP_MAX_TOKENS);
      expect(result.errorCode).toBeUndefined();
      expect(result.hints).toBeUndefined();
    });

    it('should reject content exceeding token limits', () => {
      // Create content that exceeds the token limit
      const charsNeeded =
        RESOURCE_LIMITS.MCP_MAX_TOKENS * RESOURCE_LIMITS.CHARS_PER_TOKEN + 1000;
      const content = 'a'.repeat(charsNeeded);

      const result = validateTokenLimit({
        content,
        toolName: 'local_ripgrep',
      });

      expect(result.isValid).toBe(false);
      expect(result.estimatedTokens).toBeGreaterThan(
        RESOURCE_LIMITS.MCP_MAX_TOKENS
      );
      expect(result.errorCode).toBe(ERROR_CODES.RESPONSE_TOO_LARGE);
      expect(result.hints).toBeDefined();
      expect(result.hints!.length).toBeGreaterThan(0);
    });

    it('should provide single operation hints for queryCount = 1', () => {
      const charsNeeded =
        RESOURCE_LIMITS.MCP_MAX_TOKENS * RESOURCE_LIMITS.CHARS_PER_TOKEN + 1000;
      const content = 'a'.repeat(charsNeeded);

      const result = validateTokenLimit({
        content,
        toolName: 'local_ripgrep',
        queryCount: 1,
      });

      expect(result.isValid).toBe(false);
      expect(result.hints).toBeDefined();
      expect(result.hints!.some((h) => h.includes('SOLUTIONS:'))).toBe(true);
      expect(result.hints!.some((h) => h.includes('matchString'))).toBe(true);
    });

    it('should provide bulk operation hints for queryCount > 1', () => {
      const charsNeeded =
        RESOURCE_LIMITS.MCP_MAX_TOKENS * RESOURCE_LIMITS.CHARS_PER_TOKEN + 1000;
      const content = 'a'.repeat(charsNeeded);

      const result = validateTokenLimit({
        content,
        toolName: 'local_ripgrep',
        queryCount: 5,
      });

      expect(result.isValid).toBe(false);
      expect(result.hints).toBeDefined();
      expect(result.hints!.some((h) => h.includes('Bulk Operation'))).toBe(
        true
      );
      expect(result.hints!.some((h) => h.includes('currently 5 queries'))).toBe(
        true
      );
    });

    it('should include tool-specific hints for local_ripgrep', () => {
      const charsNeeded =
        RESOURCE_LIMITS.MCP_MAX_TOKENS * RESOURCE_LIMITS.CHARS_PER_TOKEN + 1000;
      const content = 'a'.repeat(charsNeeded);

      const result = validateTokenLimit({
        content,
        toolName: 'local_ripgrep',
      });

      expect(result.isValid).toBe(false);
      expect(result.hints!.some((h) => h.includes('discovery'))).toBe(true);
      expect(result.hints!.some((h) => h.includes('excludeDir'))).toBe(true);
    });

    it('should include tool-specific hints for local_view_structure', () => {
      const charsNeeded =
        RESOURCE_LIMITS.MCP_MAX_TOKENS * RESOURCE_LIMITS.CHARS_PER_TOKEN + 1000;
      const content = 'a'.repeat(charsNeeded);

      const result = validateTokenLimit({
        content,
        toolName: 'local_view_structure',
      });

      expect(result.isValid).toBe(false);
      expect(result.hints!.some((h) => h.includes('depth'))).toBe(true);
    });

    it('should include context in hints when provided', () => {
      const charsNeeded =
        RESOURCE_LIMITS.MCP_MAX_TOKENS * RESOURCE_LIMITS.CHARS_PER_TOKEN + 1000;
      const content = 'a'.repeat(charsNeeded);

      const result = validateTokenLimit({
        content,
        toolName: 'local_ripgrep',
        context: 'Searching node_modules',
      });

      expect(result.isValid).toBe(false);
      expect(
        result.hints!.some((h) => h.includes('Searching node_modules'))
      ).toBe(true);
    });

    it('should handle empty content', () => {
      const result = validateTokenLimit({
        content: '',
        toolName: 'local_ripgrep',
      });

      expect(result.isValid).toBe(true);
      expect(result.estimatedTokens).toBe(0);
    });

    it('should estimate tokens correctly', () => {
      const content = 'a'.repeat(400); // Should be 100 tokens (400 / 4)
      const result = validateTokenLimit({
        content,
        toolName: 'local_ripgrep',
      });

      expect(result.estimatedTokens).toBe(100);
    });
  });

  describe('validateBulkTokenLimit', () => {
    it('should validate content with query count', () => {
      const content = 'a'.repeat(1000);
      const result = validateBulkTokenLimit(content, 'local_ripgrep', 3);

      expect(result.isValid).toBe(true);
    });

    it('should provide bulk-specific hints when over limit', () => {
      const charsNeeded =
        RESOURCE_LIMITS.MCP_MAX_TOKENS * RESOURCE_LIMITS.CHARS_PER_TOKEN + 1000;
      const content = 'a'.repeat(charsNeeded);

      const result = validateBulkTokenLimit(content, 'local_ripgrep', 10);

      expect(result.isValid).toBe(false);
      expect(result.hints!.some((h) => h.includes('10 queries'))).toBe(true);
    });
  });

  describe('validateSingleTokenLimit', () => {
    it('should validate single operation content', () => {
      const content = 'a'.repeat(1000);
      const result = validateSingleTokenLimit(content, 'local_fetch_content');

      expect(result.isValid).toBe(true);
    });

    it('should include context when provided', () => {
      const charsNeeded =
        RESOURCE_LIMITS.MCP_MAX_TOKENS * RESOURCE_LIMITS.CHARS_PER_TOKEN + 1000;
      const content = 'a'.repeat(charsNeeded);

      const result = validateSingleTokenLimit(
        content,
        'local_fetch_content',
        'Reading large file'
      );

      expect(result.isValid).toBe(false);
      expect(result.hints!.some((h) => h.includes('Reading large file'))).toBe(
        true
      );
    });
  });
});
