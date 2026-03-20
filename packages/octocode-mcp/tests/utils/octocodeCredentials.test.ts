import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('octocode-shared', () => ({
  getToken: vi.fn().mockResolvedValue(null),
  getConfigSync: vi.fn(() => ({})),
  getOctocodeDir: vi.fn(() => '/mock/.octocode'),
  OCTOCODE_DIR: '/mock/.octocode',
}));

import { getToken as getOctocodeToken } from 'octocode-shared';

describe('octocodeCredentials (via shared package)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getOctocodeToken', () => {
    it('should return token for default hostname (github.com)', async () => {
      vi.mocked(getOctocodeToken).mockResolvedValueOnce('ghp_test_token_12345');

      const token = await getOctocodeToken();

      expect(token).toBe('ghp_test_token_12345');
      expect(getOctocodeToken).toHaveBeenCalledWith();
    });

    it('should return token for specified hostname', async () => {
      vi.mocked(getOctocodeToken).mockResolvedValueOnce('ghp_enterprise_token');

      const token = await getOctocodeToken('github.enterprise.com');

      expect(token).toBe('ghp_enterprise_token');
      expect(getOctocodeToken).toHaveBeenCalledWith('github.enterprise.com');
    });

    it('should return null when hostname not found in credentials', async () => {
      vi.mocked(getOctocodeToken).mockResolvedValueOnce(null);

      const token = await getOctocodeToken('unknown.host.com');

      expect(token).toBeNull();
      expect(getOctocodeToken).toHaveBeenCalledWith('unknown.host.com');
    });

    it('should return null when credentials file does not exist', async () => {
      vi.mocked(getOctocodeToken).mockResolvedValueOnce(null);

      const token = await getOctocodeToken();

      expect(token).toBeNull();
    });

    it('should return null when credentials have no token', async () => {
      vi.mocked(getOctocodeToken).mockResolvedValueOnce(null);

      const token = await getOctocodeToken();

      expect(token).toBeNull();
    });

    it('should normalize hostname (lowercase, remove protocol)', async () => {
      vi.mocked(getOctocodeToken).mockResolvedValueOnce('ghp_test_token_12345');

      const token = await getOctocodeToken('https://GitHub.com/');

      expect(token).toBe('ghp_test_token_12345');
      expect(getOctocodeToken).toHaveBeenCalledWith('https://GitHub.com/');
    });

    it('should handle expired tokens gracefully', async () => {
      vi.mocked(getOctocodeToken).mockResolvedValueOnce(null);

      const token = await getOctocodeToken();

      expect(token).toBeNull();
    });

    it('should return token if expiration date is in the future', async () => {
      vi.mocked(getOctocodeToken).mockResolvedValueOnce('ghp_valid_token');

      const token = await getOctocodeToken();

      expect(token).toBe('ghp_valid_token');
    });

    it('should return token if no expiration date is set (PAT tokens)', async () => {
      vi.mocked(getOctocodeToken).mockResolvedValueOnce('ghp_test_token_12345');

      const token = await getOctocodeToken();

      expect(token).toBe('ghp_test_token_12345');
    });

    it('should handle invalid expiresAt date', async () => {
      vi.mocked(getOctocodeToken).mockResolvedValueOnce(null);

      const token = await getOctocodeToken();

      expect(token).toBeNull();
    });

    it('should handle read errors gracefully', async () => {
      vi.mocked(getOctocodeToken).mockResolvedValueOnce(null);

      const token = await getOctocodeToken();

      expect(token).toBeNull();
    });
  });
});
