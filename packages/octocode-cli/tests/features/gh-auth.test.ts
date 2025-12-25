/**
 * GitHub Auth Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { spawnSync } from 'node:child_process';

// Mock child_process
vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
  spawn: vi.fn(),
}));

describe('GitHub Auth', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  describe('isGitHubCLIInstalled', () => {
    it('should return true when gh is available', async () => {
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        stdout: '/usr/local/bin/gh',
        stderr: '',
        pid: 123,
        output: [],
        signal: null,
      });

      const { isGitHubCLIInstalled } =
        await import('../../src/features/gh-auth.js');
      expect(isGitHubCLIInstalled()).toBe(true);
    });

    it('should return false when gh is not available', async () => {
      vi.mocked(spawnSync).mockReturnValue({
        status: 1,
        stdout: '',
        stderr: 'not found',
        pid: 123,
        output: [],
        signal: null,
      });

      const { isGitHubCLIInstalled } =
        await import('../../src/features/gh-auth.js');
      expect(isGitHubCLIInstalled()).toBe(false);
    });
  });

  describe('checkGitHubAuth', () => {
    it('should return not installed when gh is missing', async () => {
      vi.mocked(spawnSync).mockReturnValue({
        status: 1,
        stdout: '',
        stderr: 'not found',
        pid: 123,
        output: [],
        signal: null,
      });

      const { checkGitHubAuth } = await import('../../src/features/gh-auth.js');
      const result = checkGitHubAuth();

      expect(result.installed).toBe(false);
      expect(result.authenticated).toBe(false);
    });

    it('should return authenticated with username', async () => {
      vi.mocked(spawnSync)
        .mockReturnValueOnce({
          // which gh
          status: 0,
          stdout: '/usr/local/bin/gh',
          stderr: '',
          pid: 123,
          output: [],
          signal: null,
        })
        .mockReturnValueOnce({
          // gh auth status
          status: 0,
          stdout: 'Logged in to github.com account testuser (keyring)',
          stderr: '',
          pid: 124,
          output: [],
          signal: null,
        });

      const { checkGitHubAuth } = await import('../../src/features/gh-auth.js');
      const result = checkGitHubAuth();

      expect(result.installed).toBe(true);
      expect(result.authenticated).toBe(true);
      expect(result.username).toBe('testuser');
    });

    it('should return not authenticated when auth fails', async () => {
      vi.mocked(spawnSync)
        .mockReturnValueOnce({
          // which gh
          status: 0,
          stdout: '/usr/local/bin/gh',
          stderr: '',
          pid: 123,
          output: [],
          signal: null,
        })
        .mockReturnValueOnce({
          // gh auth status
          status: 1,
          stdout: '',
          stderr: 'You are not logged in',
          pid: 124,
          output: [],
          signal: null,
        });

      const { checkGitHubAuth } = await import('../../src/features/gh-auth.js');
      const result = checkGitHubAuth();

      expect(result.installed).toBe(true);
      expect(result.authenticated).toBe(false);
    });
  });

  describe('getGitHubCLIVersion', () => {
    it('should return version string', async () => {
      vi.mocked(spawnSync).mockReturnValue({
        status: 0,
        stdout: 'gh version 2.40.0 (2024-01-15)',
        stderr: '',
        pid: 123,
        output: [],
        signal: null,
      });

      const { getGitHubCLIVersion } =
        await import('../../src/features/gh-auth.js');
      expect(getGitHubCLIVersion()).toBe('2.40.0');
    });

    it('should return null when gh is not installed', async () => {
      vi.mocked(spawnSync).mockReturnValue({
        status: 1,
        stdout: '',
        stderr: 'not found',
        pid: 123,
        output: [],
        signal: null,
      });

      const { getGitHubCLIVersion } =
        await import('../../src/features/gh-auth.js');
      expect(getGitHubCLIVersion()).toBeNull();
    });
  });

  describe('constants', () => {
    it('should export GH_CLI_URL', async () => {
      const { GH_CLI_URL } = await import('../../src/features/gh-auth.js');
      expect(GH_CLI_URL).toBe('https://cli.github.com/');
    });

    it('should export getAuthLoginCommand', async () => {
      const { getAuthLoginCommand } =
        await import('../../src/features/gh-auth.js');
      expect(getAuthLoginCommand()).toBe('gh auth login');
    });
  });
});
