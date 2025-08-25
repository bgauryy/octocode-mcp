import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchPackagesAPI } from '../../src/npm/package';
import { isNPMEnabled } from '../../src/npm/npmAPI';

// Use vi.hoisted to ensure mocks are available during module initialization
const mockExecuteNpmCommand = vi.hoisted(() => vi.fn());
const mockAxios = vi.hoisted(() => ({
  get: vi.fn(),
}));

// Mock dependencies
vi.mock('../../src/mcp/utils/exec', () => ({
  executeNpmCommand: mockExecuteNpmCommand,
}));

vi.mock('../../src/npm/npmAPI', () => ({
  isNPMEnabled: vi.fn(),
}));

vi.mock('../../src/mcp/utils/APIStatus', () => ({
  getNPMUserDetails: vi.fn(),
}));

vi.mock('axios', () => ({
  default: mockAxios,
}));

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
    // Mock NPM as enabled with faster resolution to prevent timeout
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
    mockAxios.get.mockResolvedValue({
      data: {
        info: {
          name: 'requests',
          version: '2.28.0',
          summary: 'HTTP library',
        },
      },
    });

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
  }, 10000); // 10 second timeout

  it('should NOT execute NPM commands when NPM is disabled', async () => {
    // Mock NPM as disabled
    mockIsNPMEnabled.mockResolvedValue(false);

    // Mock Python package search
    mockAxios.get.mockResolvedValue({
      data: {
        info: {
          name: 'requests',
          version: '2.28.0',
          summary: 'HTTP library',
        },
      },
    });

    const result = await searchPackagesAPI(testParams);

    // Verify NPM commands were NOT executed when disabled
    expect(mockExecuteNpmCommand).not.toHaveBeenCalled();

    // Should only have Python results
    expect(result).toHaveProperty('total_count', 1);
    expect('npm' in result).toBe(false);
    expect('python' in result).toBe(true);
  });
});
