import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import {
  isBetaEnabled,
  isSamplingEnabled,
  cleanup,
  initialize,
} from '../../src/serverConfig';

// Mock dependencies
vi.mock('../../src/utils/exec.js', () => ({
  getGithubCLIToken: vi.fn(),
}));

import { getGithubCLIToken } from '../../src/utils/exec.js';
const mockGetGithubCLIToken = vi.mocked(getGithubCLIToken);

describe('Beta Features', () => {
  const originalBeta = process.env.BETA;

  beforeEach(async () => {
    // Reset mocks and config before each test
    vi.clearAllMocks();
    mockGetGithubCLIToken.mockResolvedValue(null); // No token needed for beta tests
    cleanup();
    // Note: initialize() is called in each individual test after setting env vars
  });

  afterEach(() => {
    // Restore original environment
    if (originalBeta !== undefined) {
      process.env.BETA = originalBeta;
    } else {
      delete process.env.BETA;
    }
    // Reset config after each test
    cleanup();
  });

  describe('isBetaEnabled', () => {
    it('should return true when BETA=1', async () => {
      process.env.BETA = '1';
      await initialize();
      expect(isBetaEnabled()).toBe(true);
    });

    it('should return true when BETA=true', async () => {
      process.env.BETA = 'true';
      await initialize();
      expect(isBetaEnabled()).toBe(true);
    });

    it('should return false when BETA=0', async () => {
      process.env.BETA = '0';
      await initialize();
      expect(isBetaEnabled()).toBe(false);
    });

    it('should return false when BETA is not set', async () => {
      delete process.env.BETA;
      await initialize();
      expect(isBetaEnabled()).toBe(false);
    });
  });

  describe('isSamplingEnabled', () => {
    it('should return true when BETA=1', async () => {
      process.env.BETA = '1';
      await initialize();
      expect(isSamplingEnabled()).toBe(true);
    });

    it('should return false when BETA is not enabled', async () => {
      process.env.BETA = '0';
      await initialize();
      expect(isSamplingEnabled()).toBe(false);
    });
  });
});
