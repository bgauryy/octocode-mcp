/**
 * Tests for token validation utility
 * Covers validateTokenLimit, validateBulkTokenLimit
 */

import { describe, it, expect } from 'vitest';
import {
  validateTokenLimit,
  validateBulkTokenLimit,
} from '../../utils/tokenValidation.js';
import { RESOURCE_LIMITS } from '../../constants.js';
import { ERROR_CODES } from '../../errors/errorCodes.js';

describe('tokenValidation', () => {
  describe('validateTokenLimit', () => {
    it('should validate content within limits', () => {
      const content = 'x'.repeat(1000); // ~250 tokens
      const result = validateTokenLimit({
        content,
        toolName: 'test_tool',
      });

      expect(result.isValid).toBe(true);
      expect(result.estimatedTokens).toBeLessThan(
        RESOURCE_LIMITS.MCP_MAX_TOKENS
      );
      expect(result.maxTokens).toBe(RESOURCE_LIMITS.MCP_MAX_TOKENS);
    });

    it('should invalidate content exceeding limits', () => {
      // Create content that exceeds 25K tokens (25K * 4 chars = 100K chars)
      const content = 'x'.repeat(150000);
      const result = validateTokenLimit({
        content,
        toolName: 'test_tool',
      });

      expect(result.isValid).toBe(false);
      expect(result.errorCode).toBe(ERROR_CODES.RESPONSE_TOO_LARGE);
      expect(result.hints).toBeDefined();
      expect(result.hints!.length).toBeGreaterThan(0);
    });

    it('should provide bulk operation hints when queryCount > 1', () => {
      const content = 'x'.repeat(150000);
      const result = validateTokenLimit({
        content,
        toolName: 'test_tool',
        queryCount: 5,
      });

      expect(result.isValid).toBe(false);
      expect(result.hints).toBeDefined();
      expect(result.hints!.some(h => h.includes('Bulk Operation'))).toBe(true);
      expect(result.hints!.some(h => h.includes('5 queries'))).toBe(true);
    });

    it('should provide single operation hints when queryCount = 1', () => {
      const content = 'x'.repeat(150000);
      const result = validateTokenLimit({
        content,
        toolName: 'test_tool',
        queryCount: 1,
      });

      expect(result.isValid).toBe(false);
      expect(result.hints).toBeDefined();
      expect(result.hints!.some(h => h.includes('SOLUTIONS:'))).toBe(true);
    });

    it('should provide ripgrep-specific hints', () => {
      const content = 'x'.repeat(150000);
      const result = validateTokenLimit({
        content,
        toolName: 'local_ripgrep',
      });

      expect(result.isValid).toBe(false);
      expect(result.hints!.some(h => h.includes('local_ripgrep'))).toBe(true);
      expect(result.hints!.some(h => h.includes('discovery'))).toBe(true);
    });

    it('should provide view_structure-specific hints', () => {
      const content = 'x'.repeat(150000);
      const result = validateTokenLimit({
        content,
        toolName: 'local_view_structure',
      });

      expect(result.isValid).toBe(false);
      expect(result.hints!.some(h => h.includes('local_view_structure'))).toBe(
        true
      );
      expect(result.hints!.some(h => h.includes('depth'))).toBe(true);
    });

    it('should include context in hints when provided', () => {
      const content = 'x'.repeat(150000);
      const result = validateTokenLimit({
        content,
        toolName: 'test_tool',
        context: 'Large directory listing',
      });

      expect(result.isValid).toBe(false);
      expect(
        result.hints!.some(h => h.includes('Large directory listing'))
      ).toBe(true);
    });

    it('should calculate estimated tokens correctly', () => {
      const content = 'x'.repeat(4000); // Should be ~1000 tokens
      const result = validateTokenLimit({
        content,
        toolName: 'test_tool',
      });

      expect(result.isValid).toBe(true);
      expect(result.estimatedTokens).toBe(1000);
    });

    it('should handle empty content', () => {
      const result = validateTokenLimit({
        content: '',
        toolName: 'test_tool',
      });

      expect(result.isValid).toBe(true);
      expect(result.estimatedTokens).toBe(0);
    });

    it('should handle content exactly at limit', () => {
      // 25K tokens * 4 chars = 100K chars
      const content = 'x'.repeat(100000);
      const result = validateTokenLimit({
        content,
        toolName: 'test_tool',
      });

      expect(result.isValid).toBe(true);
      expect(result.estimatedTokens).toBe(25000);
    });
  });

  describe('validateBulkTokenLimit', () => {
    it('should validate bulk content within limits', () => {
      const content = 'x'.repeat(1000);
      const result = validateBulkTokenLimit(content, 'test_tool', 3);

      expect(result.isValid).toBe(true);
    });

    it('should invalidate bulk content exceeding limits', () => {
      const content = 'x'.repeat(150000);
      const result = validateBulkTokenLimit(content, 'test_tool', 3);

      expect(result.isValid).toBe(false);
      expect(result.errorCode).toBe(ERROR_CODES.RESPONSE_TOO_LARGE);
    });

    it('should include query count in hints', () => {
      const content = 'x'.repeat(150000);
      const result = validateBulkTokenLimit(content, 'test_tool', 5);

      expect(result.isValid).toBe(false);
      expect(result.hints!.some(h => h.includes('5 queries'))).toBe(true);
    });
  });
});
