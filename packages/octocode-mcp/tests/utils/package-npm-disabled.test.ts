import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchPackagesAPI } from '../../src/npm/package';
import { isNPMEnabled } from '../../src/npm/npmAPI';

// Use vi.hoisted to ensure mocks are available during module initialization
const mockExecuteNpmCommand = vi.hoisted(() => vi.fn());
const mockAxios = vi.hoisted(() => ({
  get: vi.fn(),
}));

// Mock dependencies
vi.mock('../../src/utils/exec', () => ({
  executeNpmCommand: mockExecuteNpmCommand,
}));

vi.mock('../../src/npm/npmAPI', () => ({
  isNPMEnabled: vi.fn(),
}));

vi.mock('axios', () => ({
  default: mockAxios,
}));

const mockIsNPMEnabled = vi.mocked(isNPMEnabled);

describe('Package Search - NPM Disabled', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock NPM as disabled
    mockIsNPMEnabled.mockResolvedValue(false);
  });

  it('should not execute NPM commands when NPM is disabled', async () => {
    const params = {
      npmPackages: [{ name: 'express' }, { name: 'lodash' }],
      pythonPackages: [{ name: 'requests' }],
    };

    // Mock Python package search to succeed
    mockAxios.get.mockResolvedValue({
      data: {
        info: {
          name: 'requests',
          version: '2.28.0',
          summary: 'HTTP library',
        },
      },
    });

    const result = await searchPackagesAPI(params);

    // Verify NPM commands were never executed
    expect(mockExecuteNpmCommand).not.toHaveBeenCalled();

    // Verify the result structure
    expect(result).toHaveProperty('total_count');
    if ('python' in result) {
      expect(Array.isArray(result.python)).toBe(true);
    }

    // Should not have NPM results since NPM is disabled
    expect('npm' in result).toBe(false);
  });

  it('should not execute NPM metadata commands when NPM is disabled', async () => {
    const params = {
      npmPackages: [{ name: 'express', npmFetchMetadata: true }],
      npmFetchMetadata: true,
    };

    const result = await searchPackagesAPI(params);

    // Verify NPM commands were never executed (including metadata fetching)
    expect(mockExecuteNpmCommand).not.toHaveBeenCalled();

    // Should return error when only NPM packages are provided but NPM is disabled
    expect(result).toHaveProperty('error');
    if ('error' in result) {
      expect(result.error).toContain('No valid package queries found');
    }
  });

  it('should only process Python packages when NPM is disabled', async () => {
    const params = {
      npmPackages: [{ name: 'express' }],
      pythonPackages: [{ name: 'django' }],
    };

    // Mock Python package search
    mockAxios.get.mockResolvedValue({
      data: {
        info: {
          name: 'django',
          version: '4.0.0',
          summary: 'Web framework',
        },
      },
    });

    const result = await searchPackagesAPI(params);

    // Verify NPM commands were never executed
    expect(mockExecuteNpmCommand).not.toHaveBeenCalled();

    // Verify only Python results are present
    expect(result).toHaveProperty('total_count', 1);
    expect('npm' in result).toBe(false);
    if ('python' in result) {
      expect(Array.isArray(result.python)).toBe(true);
      expect(result.python).toHaveLength(1);
    }
  });
});
