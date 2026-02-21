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
    it('should add filtered info when isFiltered with counts', () => {
      const result = hints.hasResults!({
        isFiltered: true,
        filteredCount: 5,
        totalUnfiltered: 20,
      });
      expect(result.some(h => h?.includes('Filtered: 5 of 20'))).toBe(true);
      expect(
        result.some(h => h?.includes('includePattern/excludePattern'))
      ).toBe(true);
    });

    it('should add filtered hint without counts when undefined', () => {
      const result = hints.hasResults!({
        isFiltered: true,
      });
      expect(
        result.some(h => h?.includes('includePattern/excludePattern'))
      ).toBe(true);
      expect(result.some(h => h?.includes('Filtered:'))).toBe(false);
    });

    it('should not add filtered hints when isFiltered is false', () => {
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

    it('should add usage tips when not filteredAll', () => {
      const result = hints.empty!({
        filteredAll: false,
      });
      expect(result.some(h => h?.includes('TIP: Use includePattern'))).toBe(
        true
      );
      expect(result.some(h => h?.includes('TIP: Use excludePattern'))).toBe(
        true
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
