import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchPackagesAPI } from '../../src/utils/package';
import { executeNpmCommand } from '../../src/utils/exec';
import { isNPMEnabled } from '../../src/utils/npmAPI';

// Mock dependencies
vi.mock('../../src/utils/exec', () => ({
  executeNpmCommand: vi.fn(),
}));

vi.mock('../../src/utils/npmAPI', () => ({
  isNPMEnabled: vi.fn(),
}));

const mockExecuteNpmCommand = vi.mocked(executeNpmCommand);
const mockIsNPMEnabled = vi.mocked(isNPMEnabled);

describe('Package Search - NPM Enabled vs Disabled Comparison', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const testParams = {
    npmPackages: [{ name: 'express' }],
    pythonPackages: [{ name: 'requests' }],
  };

  it('should execute NPM commands when NPM is enabled', async () => {
    // Mock NPM as enabled
    mockIsNPMEnabled.mockResolvedValue(true);

    // Mock successful NPM command execution
    mockExecuteNpmCommand.mockResolvedValue({
      isError: false,
      content: [
        {
          type: 'text',
          text: JSON.stringify([
            {
              name: 'express',
              version: '4.18.0',
              description: 'Fast, unopinionated web framework',
            },
          ]),
        },
      ],
    });

    // Mock Python package search
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          info: {
            name: 'requests',
            version: '2.28.0',
            summary: 'HTTP library',
          },
        }),
    });
    global.fetch = mockFetch;

    const result = await searchPackagesAPI(testParams);

    // Verify NPM commands were executed when enabled
    expect(mockExecuteNpmCommand).toHaveBeenCalled();
    expect(mockExecuteNpmCommand).toHaveBeenCalledWith(
      'search',
      expect.any(Array),
      expect.any(Object)
    );

    // Should have both NPM and Python results
    expect(result).toHaveProperty('total_count', 2);
    expect('npm' in result).toBe(true);
    expect('python' in result).toBe(true);
  });

  it('should NOT execute NPM commands when NPM is disabled', async () => {
    // Mock NPM as disabled
    mockIsNPMEnabled.mockResolvedValue(false);

    // Mock Python package search
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          info: {
            name: 'requests',
            version: '2.28.0',
            summary: 'HTTP library',
          },
        }),
    });
    global.fetch = mockFetch;

    const result = await searchPackagesAPI(testParams);

    // Verify NPM commands were NOT executed when disabled
    expect(mockExecuteNpmCommand).not.toHaveBeenCalled();

    // Should only have Python results
    expect(result).toHaveProperty('total_count', 1);
    expect('npm' in result).toBe(false);
    expect('python' in result).toBe(true);
  });
});
