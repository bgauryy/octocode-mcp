/**
 * Branch coverage tests for lsp_find_references/hints.ts
 * Targets: isFiltered, filteredAll, and nested conditionals
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/hints/static.js', () => ({
  getMetadataDynamicHints: vi.fn((_tool: string, key: string) => [
    `dynamic-${key}`,
  ]),
}));

import { hints } from '../../src/tools/lsp_find_references/hints.js';

describe('lspFindReferences hints - branch coverage', () => {
  describe('hasResults hints', () => {
    it('should not add filtered hints (isFiltered branch removed)', () => {
      // isFiltered/filteredCount branches were removed — dead dynamic context
      const result = hints.hasResults!({
        isFiltered: true,
        filteredCount: 5,
        totalUnfiltered: 20,
      });
      expect(result.some(h => h?.includes('Filtered: 5 of 20'))).toBe(false);
      expect(
        result.some(h => h?.includes('includePattern/excludePattern'))
      ).toBe(false);
    });

    it('should return empty when no matching context', () => {
      const result = hints.hasResults!({});
      expect(
        result.some(h => h?.includes('includePattern/excludePattern'))
      ).toBe(false);
    });
  });

  describe('empty hints', () => {
    it('should add filteredAll hint when all refs filtered', () => {
      const result = hints.empty!({
        filteredAll: true,
      });
      expect(
        result.some(h => h?.includes('All references were excluded'))
      ).toBe(true);
      expect(result.some(h => h?.includes('TIP: Use includePattern'))).toBe(
        false
      );
    });

    it('should not add usage tips when not filteredAll (branch removed)', () => {
      // TIP hints for non-filteredAll were removed — dead dynamic context
      const result = hints.empty!({
        filteredAll: false,
      });
      expect(result.some(h => h?.includes('TIP: Use includePattern'))).toBe(
        false
      );
    });

    it('should add symbolName dynamic hints', () => {
      const result = hints.empty!({
        symbolName: 'myFunc',
      });
      expect(result.some(h => h?.includes('dynamic-symbolNotFound'))).toBe(
        true
      );
    });

    it('should not add symbolName hints when symbolName missing', () => {
      const result = hints.empty!({});
      expect(result.some(h => h?.includes('dynamic-symbolNotFound'))).toBe(
        false
      );
    });
  });

  describe('error hints', () => {
    it('should return symbol_not_found hints', () => {
      const result = hints.error!({ errorType: 'symbol_not_found' });
      expect(result.some(h => h?.includes('dynamic-symbolNotFound'))).toBe(
        true
      );
    });

    it('should return timeout hints', () => {
      const result = hints.error!({ errorType: 'timeout' });
      expect(result.some(h => h?.includes('dynamic-timeout'))).toBe(true);
    });

    it('should return empty for unknown error type', () => {
      const result = hints.error!({ errorType: 'other' });
      expect(result).toHaveLength(0);
    });
  });
});
