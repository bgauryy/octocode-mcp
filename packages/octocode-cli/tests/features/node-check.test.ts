/**
 * Node Check Feature Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execSync } from 'node:child_process';

// Mock child_process
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

// Mock fetch for registry tests
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Node Check', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  describe('checkNodeInPath', () => {
    it('should return installed true with version when node is available', async () => {
      vi.mocked(execSync).mockReturnValue('v20.10.0\n');

      const { checkNodeInPath } = await import(
        '../../src/features/node-check.js'
      );
      const result = checkNodeInPath();

      expect(result.installed).toBe(true);
      expect(result.version).toBe('v20.10.0');
    });

    it('should return installed false when node is not available', async () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Command not found');
      });

      const { checkNodeInPath } = await import(
        '../../src/features/node-check.js'
      );
      const result = checkNodeInPath();

      expect(result.installed).toBe(false);
      expect(result.version).toBeNull();
    });
  });

  describe('checkNpmInPath', () => {
    it('should return installed true with version when npm is available', async () => {
      vi.mocked(execSync).mockReturnValue('10.2.3\n');

      const { checkNpmInPath } = await import(
        '../../src/features/node-check.js'
      );
      const result = checkNpmInPath();

      expect(result.installed).toBe(true);
      expect(result.version).toBe('v10.2.3');
    });

    it('should return installed false when npm is not available', async () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Command not found');
      });

      const { checkNpmInPath } = await import(
        '../../src/features/node-check.js'
      );
      const result = checkNpmInPath();

      expect(result.installed).toBe(false);
      expect(result.version).toBeNull();
    });
  });

  describe('checkNpmRegistry', () => {
    it('should return ok status when registry responds quickly', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
      });

      const { checkNpmRegistry } = await import(
        '../../src/features/node-check.js'
      );
      const result = await checkNpmRegistry();

      expect(result.status).toBe('ok');
      expect(result.latency).toBeGreaterThanOrEqual(0);
    });

    it('should return failed status when fetch fails', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const { checkNpmRegistry } = await import(
        '../../src/features/node-check.js'
      );
      const result = await checkNpmRegistry();

      expect(result.status).toBe('failed');
      expect(result.latency).toBeNull();
    });

    it('should return failed status when response is not ok', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
      });

      const { checkNpmRegistry } = await import(
        '../../src/features/node-check.js'
      );
      const result = await checkNpmRegistry();

      expect(result.status).toBe('failed');
    });
  });

  describe('checkOctocodePackage', () => {
    it('should return available true with version', async () => {
      vi.mocked(execSync).mockReturnValue('1.2.3\n');

      const { checkOctocodePackage } = await import(
        '../../src/features/node-check.js'
      );
      const result = checkOctocodePackage();

      expect(result.available).toBe(true);
      expect(result.version).toBe('1.2.3');
    });

    it('should return available false when package not found', async () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Not found');
      });

      const { checkOctocodePackage } = await import(
        '../../src/features/node-check.js'
      );
      const result = checkOctocodePackage();

      expect(result.available).toBe(false);
      expect(result.version).toBeNull();
    });
  });

  describe('checkNodeEnvironment', () => {
    it('should return complete environment status', async () => {
      // Mock all execSync calls
      vi.mocked(execSync)
        .mockReturnValueOnce('v20.10.0\n') // node --version
        .mockReturnValueOnce('10.2.3\n') // npm --version
        .mockReturnValueOnce('1.0.0\n'); // npm view octocode-mcp version

      // Mock fetch for registry
      mockFetch.mockResolvedValue({ ok: true });

      const { checkNodeEnvironment } = await import(
        '../../src/features/node-check.js'
      );
      const result = await checkNodeEnvironment();

      expect(result.nodeInstalled).toBe(true);
      expect(result.nodeVersion).toBe('v20.10.0');
      expect(result.npmInstalled).toBe(true);
      expect(result.npmVersion).toBe('v10.2.3');
      expect(result.octocodePackageAvailable).toBe(true);
      expect(result.registryStatus).toBe('ok');
    });

    it('should handle all failures gracefully', async () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Command not found');
      });

      mockFetch.mockRejectedValue(new Error('Network error'));

      const { checkNodeEnvironment } = await import(
        '../../src/features/node-check.js'
      );
      const result = await checkNodeEnvironment();

      expect(result.nodeInstalled).toBe(false);
      expect(result.nodeVersion).toBeNull();
      expect(result.npmInstalled).toBe(false);
      expect(result.npmVersion).toBeNull();
      expect(result.octocodePackageAvailable).toBe(false);
      expect(result.registryStatus).toBe('failed');
    });
  });
});

