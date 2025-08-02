import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getGithubCLIToken } from '../../src/utils/exec';
import { exec } from 'child_process';

// Mock child_process exec
vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

const mockExec = vi.mocked(exec);

describe('exec utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('getGithubCLIToken', () => {
    it('should return token when gh auth token succeeds', async () => {
      const mockToken = 'ghp_1234567890abcdefghij';

      // Mock successful execution
      mockExec.mockImplementation((cmd, options, callback) => {
        if (typeof callback === 'function') {
          callback(null, mockToken + '\n', '');
        }
        return {} as any;
      });

      const result = await getGithubCLIToken();

      expect(result).toBe(mockToken);
      expect(mockExec).toHaveBeenCalledWith(
        'gh auth token',
        { timeout: 10000, encoding: 'utf-8' },
        expect.any(Function)
      );
    });

    it('should return null when gh auth token fails', async () => {
      // Mock failed execution
      mockExec.mockImplementation((cmd, options, callback) => {
        if (typeof callback === 'function') {
          callback(new Error('gh not found'), '', 'command not found');
        }
        return {} as any;
      });

      const result = await getGithubCLIToken();

      expect(result).toBeNull();
    });

    it('should return null when token is empty', async () => {
      // Mock execution with empty stdout
      mockExec.mockImplementation((cmd, options, callback) => {
        if (typeof callback === 'function') {
          callback(null, '   \n', '');
        }
        return {} as any;
      });

      const result = await getGithubCLIToken();

      expect(result).toBeNull();
    });

    it('should trim whitespace from token', async () => {
      const mockToken = 'ghp_1234567890abcdefghij';

      // Mock execution with whitespace
      mockExec.mockImplementation((cmd, options, callback) => {
        if (typeof callback === 'function') {
          callback(null, `  ${mockToken}  \n`, '');
        }
        return {} as any;
      });

      const result = await getGithubCLIToken();

      expect(result).toBe(mockToken);
    });
  });
});
