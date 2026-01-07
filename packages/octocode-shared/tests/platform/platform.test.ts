/**
 * Platform Utilities Tests for octocode-shared
 */

import { describe, it, expect } from 'vitest';
import os from 'node:os';

import {
  isWindows,
  isMac,
  isLinux,
  HOME,
  getAppDataPath,
  getLocalAppDataPath,
  getPlatformName,
  getArchitecture,
} from '../../src/platform/platform.js';

describe('Platform Utilities', () => {
  describe('platform detection', () => {
    it('should export platform detection constants', () => {
      expect(typeof isWindows).toBe('boolean');
      expect(typeof isMac).toBe('boolean');
      expect(typeof isLinux).toBe('boolean');
    });

    it('should have at most one platform as true', () => {
      const truePlatforms = [isWindows, isMac, isLinux].filter(Boolean);
      expect(truePlatforms.length).toBeLessThanOrEqual(1);
    });

    it('should export HOME as user home directory', () => {
      expect(HOME).toBe(os.homedir());
    });
  });

  describe('getAppDataPath', () => {
    it('should return a valid path', () => {
      const appDataPath = getAppDataPath();
      expect(typeof appDataPath).toBe('string');
      expect(appDataPath.length).toBeGreaterThan(0);
    });

    it('should return HOME on non-Windows platforms', () => {
      if (!isWindows) {
        expect(getAppDataPath()).toBe(HOME);
      }
    });
  });

  describe('getLocalAppDataPath', () => {
    it('should return a valid path', () => {
      const localAppDataPath = getLocalAppDataPath();
      expect(typeof localAppDataPath).toBe('string');
      expect(localAppDataPath.length).toBeGreaterThan(0);
    });

    it('should return HOME on non-Windows platforms', () => {
      if (!isWindows) {
        expect(getLocalAppDataPath()).toBe(HOME);
      }
    });
  });

  describe('getPlatformName', () => {
    it('should return a readable platform name', () => {
      const platformName = getPlatformName();
      expect(typeof platformName).toBe('string');

      if (isMac) {
        expect(platformName).toBe('macOS');
      } else if (isWindows) {
        expect(platformName).toBe('Windows');
      } else if (isLinux) {
        expect(platformName).toBe('Linux');
      }
    });
  });

  describe('getArchitecture', () => {
    it('should return the system architecture', () => {
      const arch = getArchitecture();
      expect(typeof arch).toBe('string');
      expect(arch).toBe(os.arch());
    });
  });
});
