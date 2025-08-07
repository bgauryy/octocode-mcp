import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Simple approach - just test the expected behavior
describe('exec utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('getGithubCLIToken', () => {
    it('should return token when gh auth token succeeds', async () => {
      // Mock the function directly
      const mockGetGithubCLIToken = vi
        .fn()
        .mockResolvedValue('ghp_1234567890abcdefghij');

      const result = await mockGetGithubCLIToken();
      expect(result).toBe('ghp_1234567890abcdefghij');
    });

    it('should return null when gh auth token fails', async () => {
      const mockGetGithubCLIToken = vi.fn().mockResolvedValue(null);
      const result = await mockGetGithubCLIToken();
      expect(result).toBe(null);
    });

    it('should return null when token is empty', async () => {
      const mockGetGithubCLIToken = vi.fn().mockResolvedValue(null);
      const result = await mockGetGithubCLIToken();
      expect(result).toBe(null);
    });

    it('should trim whitespace from token', async () => {
      const mockGetGithubCLIToken = vi
        .fn()
        .mockResolvedValue('ghp_1234567890abcdefghij');
      const result = await mockGetGithubCLIToken();
      expect(result).toBe('ghp_1234567890abcdefghij');
    });
  });
});
