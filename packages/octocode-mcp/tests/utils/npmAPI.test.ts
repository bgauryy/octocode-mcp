import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isNPMEnabled,
  refreshNPMStatus,
  resetNPMStatus,
} from '../../src/mcp/utils/npmAPI';
import { getNPMUserDetails } from '../../src/mcp/utils/APIStatus';

// Mock the NPM status check
vi.mock('../../src/mcp/utils/APIStatus', () => ({
  getNPMUserDetails: vi.fn(),
}));

const mockGetNPMUserDetails = vi.mocked(getNPMUserDetails);

describe('NPM API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetNPMStatus(); // Reset cache before each test
  });

  describe('isNPMEnabled', () => {
    it('should return true when NPM is connected', async () => {
      mockGetNPMUserDetails.mockResolvedValue({
        npmConnected: true,
        registry: 'https://registry.npmjs.org/',
      });

      const result = await isNPMEnabled();
      expect(result).toBe(true);
      expect(mockGetNPMUserDetails).toHaveBeenCalledTimes(1);
    });

    it('should return false when NPM is not connected', async () => {
      mockGetNPMUserDetails.mockResolvedValue({
        npmConnected: false,
        registry: 'https://registry.npmjs.org/',
      });

      const result = await isNPMEnabled();
      expect(result).toBe(false);
      expect(mockGetNPMUserDetails).toHaveBeenCalledTimes(1);
    });

    it('should return false when NPM check fails', async () => {
      mockGetNPMUserDetails.mockRejectedValue(new Error('NPM check failed'));

      const result = await isNPMEnabled();
      expect(result).toBe(false);
      expect(mockGetNPMUserDetails).toHaveBeenCalledTimes(1);
    });

    it('should cache the result and not call NPM check again', async () => {
      mockGetNPMUserDetails.mockResolvedValue({
        npmConnected: true,
        registry: 'https://registry.npmjs.org/',
      });

      // First call
      const result1 = await isNPMEnabled();
      expect(result1).toBe(true);
      expect(mockGetNPMUserDetails).toHaveBeenCalledTimes(1);

      // Second call should use cached result
      const result2 = await isNPMEnabled();
      expect(result2).toBe(true);
      expect(mockGetNPMUserDetails).toHaveBeenCalledTimes(1); // Still 1, not 2
    });
  });

  describe('refreshNPMStatus', () => {
    it('should force refresh the NPM status', async () => {
      // Initial call
      mockGetNPMUserDetails.mockResolvedValue({
        npmConnected: true,
        registry: 'https://registry.npmjs.org/',
      });
      await isNPMEnabled();
      expect(mockGetNPMUserDetails).toHaveBeenCalledTimes(1);

      // Change mock return value
      mockGetNPMUserDetails.mockResolvedValue({
        npmConnected: false,
        registry: 'https://registry.npmjs.org/',
      });

      // Refresh should call NPM check again
      const result = await refreshNPMStatus();
      expect(result).toBe(false);
      expect(mockGetNPMUserDetails).toHaveBeenCalledTimes(2);
    });
  });

  describe('resetNPMStatus', () => {
    it('should reset the cached status', async () => {
      // Initial call
      mockGetNPMUserDetails.mockResolvedValue({
        npmConnected: true,
        registry: 'https://registry.npmjs.org/',
      });
      await isNPMEnabled();
      expect(mockGetNPMUserDetails).toHaveBeenCalledTimes(1);

      // Reset cache
      resetNPMStatus();

      // Next call should check NPM status again
      const result = await isNPMEnabled();
      expect(result).toBe(true);
      expect(mockGetNPMUserDetails).toHaveBeenCalledTimes(2);
    });
  });
});
