import { describe, it, expect } from 'vitest';
import { extractBearerToken } from '../../../src/utils/github/client';

describe('Bearer Token Extraction - Case Sensitive', () => {
  describe('Bearer prefix handling (case-sensitive)', () => {
    it('should extract token after "Bearer " (exact case)', () => {
      const result = extractBearerToken('Bearer ghp_xxxxxxxxxxxxxxxxxxxx');
      expect(result).toBe('ghp_xxxxxxxxxxxxxxxxxxxx');
    });

    it('should NOT extract token after "bearer " (lowercase)', () => {
      const result = extractBearerToken('bearer ghp_xxxxxxxxxxxxxxxxxxxx');
      expect(result).toBe('ghp_xxxxxxxxxxxxxxxxxxxx'); // Should remain unchanged
    });

    it('should NOT extract token after "BEARER " (uppercase)', () => {
      const result = extractBearerToken('BEARER ghp_xxxxxxxxxxxxxxxxxxxx');
      expect(result).toBe('ghp_xxxxxxxxxxxxxxxxxxxx'); // Should remain unchanged
    });

    it('should extract token with abcdefg', () => {
      const result = extractBearerToken('BEARER abcdefg');
      expect(result).toBe('abcdefg'); // Should remain unchanged
    });

    it('should NOT extract token after "BeaRer " (mixed case)', () => {
      const result = extractBearerToken('BeaRer ghp_xxxxxxxxxxxxxxxxxxxx');
      expect(result).toBe('ghp_xxxxxxxxxxxxxxxxxxxx'); // Should remain unchanged
    });

    it('should handle "Bearer" with multiple spaces', () => {
      const result = extractBearerToken('Bearer     ghp_xxxxxxxxxxxxxxxxxxxx');
      expect(result).toBe('ghp_xxxxxxxxxxxxxxxxxxxx');
    });

    it('should handle whitespace around Bearer token', () => {
      const result = extractBearerToken('  Bearer ghp_xxxxxxxxxxxxxxxxxxxx  ');
      expect(result).toBe('ghp_xxxxxxxxxxxxxxxxxxxx');
    });
  });

  describe('JWT tokens with Bearer', () => {
    it('should extract JWT token after "Bearer"', () => {
      const jwtToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.test.signature';
      const result = extractBearerToken(`Bearer ${jwtToken}`);
      expect(result).toBe(jwtToken);
    });

    it('should handle Bearer with JWT in template format', () => {
      const jwtToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.test.signature';
      const result = extractBearerToken(`Bearer {{${jwtToken}}}`);
      expect(result).toBe(jwtToken);
    });
  });

  describe('GitHub token types with Bearer', () => {
    it('should handle Personal Access Token', () => {
      const result = extractBearerToken('Bearer ghp_xxxxxxxxxxxxxxxxxxxx');
      expect(result).toBe('ghp_xxxxxxxxxxxxxxxxxxxx');
    });

    it('should handle OAuth token', () => {
      const result = extractBearerToken('Bearer gho_xxxxxxxxxxxxxxxxxxxx');
      expect(result).toBe('gho_xxxxxxxxxxxxxxxxxxxx');
    });

    it('should handle GitHub App installation token', () => {
      const result = extractBearerToken('Bearer ghs_xxxxxxxxxxxxxxxxxxxx');
      expect(result).toBe('ghs_xxxxxxxxxxxxxxxxxxxx');
    });

    it('should handle GitHub App token', () => {
      const result = extractBearerToken('Bearer ghu_xxxxxxxxxxxxxxxxxxxx');
      expect(result).toBe('ghu_xxxxxxxxxxxxxxxxxxxx');
    });

    it('should handle refresh token', () => {
      const result = extractBearerToken('Bearer ghr_xxxxxxxxxxxxxxxxxxxx');
      expect(result).toBe('ghr_xxxxxxxxxxxxxxxxxxxx');
    });
  });

  describe('Template format handling', () => {
    it('should extract from Bearer {{token}} format', () => {
      const result = extractBearerToken('Bearer {{GITHUB_TOKEN}}');
      expect(result).toBe('GITHUB_TOKEN');
    });

    it('should extract from Bearer {{env.GITHUB_TOKEN}} format', () => {
      const result = extractBearerToken('Bearer {{env.GITHUB_TOKEN}}');
      expect(result).toBe('env.GITHUB_TOKEN');
    });

    it('should handle plain {{token}} format', () => {
      const result = extractBearerToken('{{GITHUB_TOKEN}}');
      expect(result).toBe('GITHUB_TOKEN');
    });
  });

  describe('Fallback token prefix handling', () => {
    it('should handle "token " prefix (case insensitive)', () => {
      const result = extractBearerToken('token ghp_xxxxxxxxxxxxxxxxxxxx');
      expect(result).toBe('ghp_xxxxxxxxxxxxxxxxxxxx');
    });

    it('should handle "TOKEN " prefix (case insensitive)', () => {
      const result = extractBearerToken('TOKEN ghp_xxxxxxxxxxxxxxxxxxxx');
      expect(result).toBe('ghp_xxxxxxxxxxxxxxxxxxxx');
    });

    it('should handle "Token " prefix (case insensitive)', () => {
      const result = extractBearerToken('Token ghp_xxxxxxxxxxxxxxxxxxxx');
      expect(result).toBe('ghp_xxxxxxxxxxxxxxxxxxxx');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty string', () => {
      const result = extractBearerToken('');
      expect(result).toBe('');
    });

    it('should handle undefined/null', () => {
      const result1 = extractBearerToken(undefined as unknown as string);
      const result2 = extractBearerToken(null as unknown as string);
      expect(result1).toBe('');
      expect(result2).toBe('');
    });

    it('should handle plain token without any prefix', () => {
      const result = extractBearerToken('ghp_xxxxxxxxxxxxxxxxxxxx');
      expect(result).toBe('ghp_xxxxxxxxxxxxxxxxxxxx');
    });

    it('should handle Bearer without space (should not match)', () => {
      const result = extractBearerToken('Bearerghp_xxxxxxxxxxxxxxxxxxxx');
      expect(result).toBe('Bearerghp_xxxxxxxxxxxxxxxxxxxx'); // Should remain unchanged
    });

    it('should handle Bearer at end of string', () => {
      const result = extractBearerToken('Bearer');
      expect(result).toBe('Bearer'); // Should remain unchanged since no token follows
    });

    it('should handle Bearer with only spaces', () => {
      const result = extractBearerToken('Bearer   ');
      expect(result).toBe('Bearer'); // After trim, becomes "Bearer" without space, so no match
    });
  });

  describe('Real-world examples', () => {
    it('should handle curl command format', () => {
      const result = extractBearerToken(
        'Bearer ghp_1234567890abcdef1234567890abcdef12345678'
      );
      expect(result).toBe('ghp_1234567890abcdef1234567890abcdef12345678');
    });

    it('should handle Postman variable format', () => {
      const result = extractBearerToken('Bearer {{github_token}}');
      expect(result).toBe('github_token');
    });

    it('should handle API testing format', () => {
      const result = extractBearerToken('Bearer {{$randomAlphaNumeric}}');
      expect(result).toBe('$randomAlphaNumeric');
    });

    it('should handle environment variable format', () => {
      const result = extractBearerToken('Bearer {{process.env.GITHUB_TOKEN}}');
      expect(result).toBe('process.env.GITHUB_TOKEN');
    });
  });
});
