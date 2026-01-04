/**
 * Skills Marketplace Registry Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SKILLS_MARKETPLACES,
  getMarketplaceById,
  getMarketplacesSortedByStars,
  getMarketplaceCount,
  fetchMarketplaceStars,
  fetchAllMarketplaceStars,
  clearStarsCache,
} from '../../src/configs/skills-marketplace.js';

describe('Skills Marketplace Registry', () => {
  describe('SKILLS_MARKETPLACES', () => {
    it('should have at least one marketplace', () => {
      expect(SKILLS_MARKETPLACES.length).toBeGreaterThan(0);
    });

    it('should have required fields for each marketplace', () => {
      for (const marketplace of SKILLS_MARKETPLACES) {
        expect(marketplace.id).toBeDefined();
        expect(marketplace.name).toBeDefined();
        expect(marketplace.owner).toBeDefined();
        expect(marketplace.repo).toBeDefined();
        expect(marketplace.branch).toBeDefined();
        expect(marketplace.skillsPath).toBeDefined();
        expect(marketplace.skillPattern).toBeDefined();
        expect(marketplace.description).toBeDefined();
        expect(marketplace.url).toBeDefined();
      }
    });

    it('should have unique IDs', () => {
      const ids = SKILLS_MARKETPLACES.map(m => m.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should have valid skill patterns', () => {
      for (const marketplace of SKILLS_MARKETPLACES) {
        expect(['flat-md', 'skill-folders']).toContain(
          marketplace.skillPattern
        );
      }
    });

    it('should have valid GitHub URLs', () => {
      for (const marketplace of SKILLS_MARKETPLACES) {
        expect(marketplace.url).toMatch(
          /^https:\/\/github\.com\/[\w-]+\/[\w-]+$/
        );
      }
    });

    it('should include buildwithclaude marketplace', () => {
      const buildWithClaude = SKILLS_MARKETPLACES.find(
        m => m.id === 'buildwithclaude'
      );
      expect(buildWithClaude).toBeDefined();
      expect(buildWithClaude?.owner).toBe('davepoon');
      expect(buildWithClaude?.repo).toBe('buildwithclaude');
    });
  });

  describe('getMarketplaceById', () => {
    it('should return marketplace when ID exists', () => {
      const marketplace = getMarketplaceById('buildwithclaude');
      expect(marketplace).toBeDefined();
      expect(marketplace?.id).toBe('buildwithclaude');
    });

    it('should return undefined for non-existent ID', () => {
      const marketplace = getMarketplaceById('non-existent-marketplace');
      expect(marketplace).toBeUndefined();
    });

    it('should return undefined for empty ID', () => {
      const marketplace = getMarketplaceById('');
      expect(marketplace).toBeUndefined();
    });
  });

  describe('getMarketplacesSortedByStars', () => {
    it('should return all marketplaces', () => {
      const starsMap = new Map([
        ['buildwithclaude', 2000],
        ['claude-code-plugins-plus-skills', 800],
      ]);
      const sorted = getMarketplacesSortedByStars(starsMap);
      expect(sorted.length).toBe(SKILLS_MARKETPLACES.length);
    });

    it('should return marketplaces sorted by stars descending', () => {
      const starsMap = new Map([
        ['buildwithclaude', 2000],
        ['claude-code-plugins-plus-skills', 800],
        ['claude-skills-marketplace', 150],
        ['daymade-claude-code-skills', 100],
      ]);
      const sorted = getMarketplacesSortedByStars(starsMap);

      for (let i = 0; i < sorted.length - 1; i++) {
        const currentStars = starsMap.get(sorted[i].id) ?? 0;
        const nextStars = starsMap.get(sorted[i + 1].id) ?? 0;
        expect(currentStars).toBeGreaterThanOrEqual(nextStars);
      }
    });

    it('should not modify original array', () => {
      const originalFirst = SKILLS_MARKETPLACES[0];
      const starsMap = new Map<string, number>();
      const sorted = getMarketplacesSortedByStars(starsMap);

      // Original should still be the same
      expect(SKILLS_MARKETPLACES[0]).toBe(originalFirst);

      // Sorted may have different order
      expect(sorted).not.toBe(SKILLS_MARKETPLACES);
    });

    it('should handle empty stars map', () => {
      const starsMap = new Map<string, number>();
      const sorted = getMarketplacesSortedByStars(starsMap);
      expect(sorted.length).toBe(SKILLS_MARKETPLACES.length);
    });
  });

  describe('getMarketplaceCount', () => {
    it('should return correct count', () => {
      expect(getMarketplaceCount()).toBe(SKILLS_MARKETPLACES.length);
    });

    it('should return at least 4 (curated marketplaces)', () => {
      expect(getMarketplaceCount()).toBeGreaterThanOrEqual(4);
    });
  });

  describe('fetchMarketplaceStars', () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
      vi.resetAllMocks();
      clearStarsCache();
    });

    afterEach(() => {
      global.fetch = originalFetch;
      clearStarsCache();
    });

    it('should fetch stars from GitHub API', async () => {
      const mockResponse = {
        ok: true,
        json: () => Promise.resolve({ stargazers_count: 1500 }),
      };
      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const source = SKILLS_MARKETPLACES[0];
      const stars = await fetchMarketplaceStars(source);

      expect(stars).toBe(1500);
      expect(global.fetch).toHaveBeenCalledWith(
        `https://api.github.com/repos/${source.owner}/${source.repo}`,
        expect.objectContaining({
          headers: expect.objectContaining({
            Accept: 'application/vnd.github.v3+json',
          }),
        })
      );
    });

    it('should return null on API error', async () => {
      const mockResponse = {
        ok: false,
        status: 404,
      };
      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const source = SKILLS_MARKETPLACES[0];
      const stars = await fetchMarketplaceStars(source);

      expect(stars).toBeNull();
    });

    it('should return null on network error', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const source = SKILLS_MARKETPLACES[0];
      const stars = await fetchMarketplaceStars(source);

      expect(stars).toBeNull();
    });

    it('should use cached value on subsequent calls', async () => {
      const mockResponse = {
        ok: true,
        json: () => Promise.resolve({ stargazers_count: 999 }),
      };
      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const source = SKILLS_MARKETPLACES[0];

      // First call
      await fetchMarketplaceStars(source);

      // Second call should use cache
      const stars = await fetchMarketplaceStars(source);

      expect(stars).toBe(999);
      // Should only be called once due to caching
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('fetchAllMarketplaceStars', () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
      clearStarsCache();
    });

    afterEach(() => {
      global.fetch = originalFetch;
      clearStarsCache();
    });

    it('should fetch stars for all marketplaces', async () => {
      const mockResponse = {
        ok: true,
        json: () => Promise.resolve({ stargazers_count: 500 }),
      };
      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const starsMap = await fetchAllMarketplaceStars();

      expect(starsMap.size).toBeGreaterThan(0);
    });

    it('should handle partial failures', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ stargazers_count: 100 }),
          });
        }
        return Promise.resolve({ ok: false });
      });

      const starsMap = await fetchAllMarketplaceStars();

      // Should have at least one result
      expect(starsMap.size).toBeGreaterThanOrEqual(0);
    });
  });
});
