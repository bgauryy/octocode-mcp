import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getNPMUserDetails } from '../../../src/tools/utils/APIStatus';
import { executeNpmCommand } from '../../../src/utils/exec';
import { createResult } from '../../../src/mcp/responses';

// Mock the exec module
vi.mock('../../../src/utils/exec', () => ({
  executeNpmCommand: vi.fn(),
}));

const mockExecuteNpmCommand = vi.mocked(executeNpmCommand);

describe('APIStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getNPMUserDetails', () => {
    it('should return connected status when npm whoami succeeds', async () => {
      // Mock successful npm whoami
      mockExecuteNpmCommand
        .mockResolvedValueOnce(
          createResult({
            isError: false,
            data: 'test-user',
          })
        )
        .mockResolvedValueOnce(
          createResult({
            isError: false,
            data: 'https://registry.npmjs.org/',
          })
        );

      const result = await getNPMUserDetails();

      expect(result).toEqual({
        npmConnected: true,
        registry: 'https://registry.npmjs.org/',
      });

      expect(mockExecuteNpmCommand).toHaveBeenCalledTimes(2);
      expect(mockExecuteNpmCommand).toHaveBeenCalledWith('whoami', [], {
        timeout: 5000,
      });
      expect(mockExecuteNpmCommand).toHaveBeenCalledWith(
        'config',
        ['get', 'registry'],
        { timeout: 3000 }
      );
    });

    it('should return default registry when registry command fails', async () => {
      // Mock successful npm whoami but failed registry command
      mockExecuteNpmCommand
        .mockResolvedValueOnce(
          createResult({
            isError: false,
            data: 'test-user',
          })
        )
        .mockResolvedValueOnce(
          createResult({
            isError: true,
            hints: ['Error getting registry'],
          })
        );

      const result = await getNPMUserDetails();

      expect(result).toEqual({
        npmConnected: true,
        registry: 'https://registry.npmjs.org/',
      });
    });

    it('should return default registry when parseExecResult returns non-string result', async () => {
      // Mock successful npm whoami but registry command returns non-string
      mockExecuteNpmCommand
        .mockResolvedValueOnce(
          createResult({
            isError: false,
            data: 'test-user',
          })
        )
        .mockResolvedValueOnce(
          createResult({
            isError: false,
            data: null, // Non-string result
          })
        );

      const result = await getNPMUserDetails();

      expect(result).toEqual({
        npmConnected: true,
        registry: 'https://registry.npmjs.org/',
      });
    });

    it('should return default registry when parseExecResult returns empty string', async () => {
      // Mock successful npm whoami but registry command returns empty string
      mockExecuteNpmCommand
        .mockResolvedValueOnce(
          createResult({
            isError: false,
            data: 'test-user',
          })
        )
        .mockResolvedValueOnce(
          createResult({
            isError: false,
            data: '', // Empty string
          })
        );

      const result = await getNPMUserDetails();

      expect(result).toEqual({
        npmConnected: true,
        registry: 'https://registry.npmjs.org/', // Empty string defaults to default registry
      });
    });

    it('should return custom registry when registry command succeeds', async () => {
      // Mock successful npm whoami and registry command
      mockExecuteNpmCommand
        .mockResolvedValueOnce(
          createResult({
            isError: false,
            data: 'test-user',
          })
        )
        .mockResolvedValueOnce(
          createResult({
            isError: false,
            data: 'https://custom.registry.com/',
          })
        );

      const result = await getNPMUserDetails();

      expect(result).toEqual({
        npmConnected: true,
        registry: 'https://custom.registry.com/',
      });
    });

    it('should return disconnected status when npm whoami fails', async () => {
      // Mock failed npm whoami
      mockExecuteNpmCommand.mockRejectedValueOnce(new Error('NPM not found'));

      const result = await getNPMUserDetails();

      expect(result).toEqual({
        npmConnected: false,
        registry: '',
      });

      expect(mockExecuteNpmCommand).toHaveBeenCalledTimes(1);
      expect(mockExecuteNpmCommand).toHaveBeenCalledWith('whoami', [], {
        timeout: 5000,
      });
    });

    it('should return disconnected status when npm whoami returns error', async () => {
      // Mock npm whoami returning error
      mockExecuteNpmCommand.mockResolvedValueOnce(
        createResult({
          isError: true,
          hints: ['Not logged in'],
        })
      );

      const result = await getNPMUserDetails();

      expect(result).toEqual({
        npmConnected: false,
        registry: '',
      });

      expect(mockExecuteNpmCommand).toHaveBeenCalledTimes(1);
      expect(mockExecuteNpmCommand).toHaveBeenCalledWith('whoami', [], {
        timeout: 5000,
      });
    });

    it('should handle registry command throwing error', async () => {
      // Mock successful npm whoami but registry command throws
      mockExecuteNpmCommand
        .mockResolvedValueOnce(
          createResult({
            isError: false,
            data: 'test-user',
          })
        )
        .mockRejectedValueOnce(new Error('Registry command failed'));

      const result = await getNPMUserDetails();

      expect(result).toEqual({
        npmConnected: false, // When any error occurs, npmConnected becomes false
        registry: '',
      });
    });

    it('should trim registry result', async () => {
      // Mock successful npm whoami and registry command with whitespace
      mockExecuteNpmCommand
        .mockResolvedValueOnce(
          createResult({
            isError: false,
            data: 'test-user',
          })
        )
        .mockResolvedValueOnce(
          createResult({
            isError: false,
            data: '  https://custom.registry.com/  ',
          })
        );

      const result = await getNPMUserDetails();

      expect(result).toEqual({
        npmConnected: true,
        registry: 'https://custom.registry.com/',
      });
    });
  });
});
