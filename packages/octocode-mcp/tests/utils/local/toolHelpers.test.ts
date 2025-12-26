/**
 * Tests for toolHelpers.ts
 */
import { describe, it, expect } from 'vitest';
import { checkLargeOutputSafety } from '../../../src/utils/local/utils/toolHelpers.js';

describe('toolHelpers', () => {
  describe('checkLargeOutputSafety', () => {
    it('should not block when hasCharLength is true', () => {
      const result = checkLargeOutputSafety(1000, true);

      expect(result.shouldBlock).toBe(false);
      expect(result.errorCode).toBeUndefined();
    });

    it('should not block when itemCount is below threshold', () => {
      const result = checkLargeOutputSafety(50, false, { threshold: 100 });

      expect(result.shouldBlock).toBe(false);
      expect(result.errorCode).toBeUndefined();
    });

    it('should block when itemCount exceeds threshold', () => {
      const result = checkLargeOutputSafety(150, false, { threshold: 100 });

      expect(result.shouldBlock).toBe(true);
      expect(result.errorCode).toBeDefined();
      expect(result.hints).toBeDefined();
      expect(result.hints?.some(h => h.includes('150'))).toBe(true);
      expect(result.hints?.some(h => h.includes('exceeds'))).toBe(true);
    });

    it('should use default threshold of 100', () => {
      const result = checkLargeOutputSafety(101, false);

      expect(result.shouldBlock).toBe(true);
    });

    it('should include custom itemType in hints', () => {
      const result = checkLargeOutputSafety(150, false, {
        threshold: 100,
        itemType: 'file',
      });

      expect(result.hints?.some(h => h.includes('files'))).toBe(true);
    });

    it('should use singular form for count of 1 (edge case)', () => {
      // This tests the edge case where itemCount === 1
      // Even though 1 shouldn't exceed default threshold,
      // we can test with threshold 0
      const result = checkLargeOutputSafety(1, false, {
        threshold: 0,
        itemType: 'item',
      });

      expect(result.shouldBlock).toBe(true);
      // Should use singular 'item' not 'items'
      expect(result.hints?.some(h => h.includes('1 item -'))).toBe(true);
    });

    it('should show detailed hint when detailed is true', () => {
      const result = checkLargeOutputSafety(150, false, {
        threshold: 100,
        detailed: true,
      });

      expect(
        result.hints?.some(h => h.includes('Detailed results increase size'))
      ).toBe(true);
    });

    it('should show generic hint when detailed is false', () => {
      const result = checkLargeOutputSafety(150, false, {
        threshold: 100,
        detailed: false,
      });

      expect(
        result.hints?.some(h =>
          h.includes('Consider using charLength to paginate')
        )
      ).toBe(true);
    });

    it('should not block at exactly threshold', () => {
      const result = checkLargeOutputSafety(100, false, { threshold: 100 });

      expect(result.shouldBlock).toBe(false);
    });

    it('should block at threshold + 1', () => {
      const result = checkLargeOutputSafety(101, false, { threshold: 100 });

      expect(result.shouldBlock).toBe(true);
    });
  });
});
