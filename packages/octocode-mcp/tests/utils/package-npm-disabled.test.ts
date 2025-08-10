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
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          info: {
            name: 'django',
            version: '4.0.0',
            summary: 'Web framework',
          },
        }),
    });
    global.fetch = mockFetch;

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
