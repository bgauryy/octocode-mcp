/**
 * Platform Utilities Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import os from 'node:os';
import fs from 'node:fs';

// Mock os module
vi.mock('node:os', () => ({
  default: {
    platform: vi.fn(),
    homedir: vi.fn(),
    arch: vi.fn(),
  },
  platform: vi.fn(),
  homedir: vi.fn(),
  arch: vi.fn(),
}));

// Mock fs module for git detection tests
vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn(),
  },
  existsSync: vi.fn(),
}));

describe('Platform Utilities', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  describe('Platform Detection', () => {
    it('should detect macOS', async () => {
      vi.mocked(os.platform).mockReturnValue('darwin');
      vi.mocked(os.homedir).mockReturnValue('/Users/test');

      const { isMac, isWindows, isLinux, HOME } =
        await import('../../src/utils/platform.js');

      expect(isMac).toBe(true);
      expect(isWindows).toBe(false);
      expect(isLinux).toBe(false);
      expect(HOME).toBe('/Users/test');
    });

    it('should detect Windows', async () => {
      vi.mocked(os.platform).mockReturnValue('win32');
      vi.mocked(os.homedir).mockReturnValue('C:\\Users\\test');

      const { isMac, isWindows, isLinux, HOME } =
        await import('../../src/utils/platform.js');

      expect(isMac).toBe(false);
      expect(isWindows).toBe(true);
      expect(isLinux).toBe(false);
      expect(HOME).toBe('C:\\Users\\test');
    });

    it('should detect Linux', async () => {
      vi.mocked(os.platform).mockReturnValue('linux');
      vi.mocked(os.homedir).mockReturnValue('/home/test');

      const { isMac, isWindows, isLinux, HOME } =
        await import('../../src/utils/platform.js');

      expect(isMac).toBe(false);
      expect(isWindows).toBe(false);
      expect(isLinux).toBe(true);
      expect(HOME).toBe('/home/test');
    });
  });

  describe('getPlatformName', () => {
    it('should return macOS for darwin', async () => {
      vi.mocked(os.platform).mockReturnValue('darwin');
      vi.mocked(os.homedir).mockReturnValue('/Users/test');

      const { getPlatformName } = await import('../../src/utils/platform.js');
      expect(getPlatformName()).toBe('macOS');
    });

    it('should return Windows for win32', async () => {
      vi.mocked(os.platform).mockReturnValue('win32');
      vi.mocked(os.homedir).mockReturnValue('C:\\Users\\test');

      const { getPlatformName } = await import('../../src/utils/platform.js');
      expect(getPlatformName()).toBe('Windows');
    });

    it('should return Linux for linux', async () => {
      vi.mocked(os.platform).mockReturnValue('linux');
      vi.mocked(os.homedir).mockReturnValue('/home/test');

      const { getPlatformName } = await import('../../src/utils/platform.js');
      expect(getPlatformName()).toBe('Linux');
    });
  });

  describe('getArchitecture', () => {
    it('should return architecture', async () => {
      vi.mocked(os.platform).mockReturnValue('darwin');
      vi.mocked(os.homedir).mockReturnValue('/Users/test');
      vi.mocked(os.arch).mockReturnValue('arm64');

      const { getArchitecture } = await import('../../src/utils/platform.js');
      expect(getArchitecture()).toBe('arm64');
    });
  });

  describe('isGitRelated', () => {
    it('should detect .git directory', async () => {
      vi.mocked(os.platform).mockReturnValue('darwin');
      vi.mocked(os.homedir).mockReturnValue('/Users/test');

      const { isGitRelated } = await import('../../src/utils/platform.js');
      expect(isGitRelated('.git')).toBe(true);
      expect(isGitRelated('/path/to/.git')).toBe(true);
    });

    it('should detect other VCS directories', async () => {
      vi.mocked(os.platform).mockReturnValue('darwin');
      vi.mocked(os.homedir).mockReturnValue('/Users/test');

      const { isGitRelated } = await import('../../src/utils/platform.js');
      expect(isGitRelated('.svn')).toBe(true);
      expect(isGitRelated('.hg')).toBe(true);
      expect(isGitRelated('.bzr')).toBe(true);
    });

    it('should return false for non-VCS directories', async () => {
      vi.mocked(os.platform).mockReturnValue('darwin');
      vi.mocked(os.homedir).mockReturnValue('/Users/test');

      const { isGitRelated } = await import('../../src/utils/platform.js');
      expect(isGitRelated('src')).toBe(false);
      expect(isGitRelated('node_modules')).toBe(false);
    });
  });

  describe('isIDERelated', () => {
    it('should detect .vscode directory', async () => {
      vi.mocked(os.platform).mockReturnValue('darwin');
      vi.mocked(os.homedir).mockReturnValue('/Users/test');

      const { isIDERelated } = await import('../../src/utils/platform.js');
      expect(isIDERelated('.vscode')).toBe(true);
      expect(isIDERelated('/path/to/.vscode')).toBe(true);
    });

    it('should detect JetBrains .idea directory', async () => {
      vi.mocked(os.platform).mockReturnValue('darwin');
      vi.mocked(os.homedir).mockReturnValue('/Users/test');

      const { isIDERelated } = await import('../../src/utils/platform.js');
      expect(isIDERelated('.idea')).toBe(true);
    });

    it('should detect Visual Studio .vs directory', async () => {
      vi.mocked(os.platform).mockReturnValue('darwin');
      vi.mocked(os.homedir).mockReturnValue('/Users/test');

      const { isIDERelated } = await import('../../src/utils/platform.js');
      expect(isIDERelated('.vs')).toBe(true);
    });

    it('should return false for non-IDE directories', async () => {
      vi.mocked(os.platform).mockReturnValue('darwin');
      vi.mocked(os.homedir).mockReturnValue('/Users/test');

      const { isIDERelated } = await import('../../src/utils/platform.js');
      expect(isIDERelated('src')).toBe(false);
      expect(isIDERelated('.git')).toBe(false);
    });
  });

  describe('isIDEOrGitPath', () => {
    it('should return true for both IDE and Git paths', async () => {
      vi.mocked(os.platform).mockReturnValue('darwin');
      vi.mocked(os.homedir).mockReturnValue('/Users/test');

      const { isIDEOrGitPath } = await import('../../src/utils/platform.js');
      expect(isIDEOrGitPath('.git')).toBe(true);
      expect(isIDEOrGitPath('.vscode')).toBe(true);
      expect(isIDEOrGitPath('.idea')).toBe(true);
    });

    it('should return false for regular paths', async () => {
      vi.mocked(os.platform).mockReturnValue('darwin');
      vi.mocked(os.homedir).mockReturnValue('/Users/test');

      const { isIDEOrGitPath } = await import('../../src/utils/platform.js');
      expect(isIDEOrGitPath('src')).toBe(false);
      expect(isIDEOrGitPath('node_modules')).toBe(false);
    });
  });

  describe('isInsideGitRepo', () => {
    it('should return true when .git exists in current directory', async () => {
      vi.mocked(os.platform).mockReturnValue('darwin');
      vi.mocked(os.homedir).mockReturnValue('/Users/test');
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        return p === '/Users/test/project/.git';
      });

      const { isInsideGitRepo } = await import('../../src/utils/platform.js');
      expect(isInsideGitRepo('/Users/test/project')).toBe(true);
    });

    it('should return true when .git exists in parent directory', async () => {
      vi.mocked(os.platform).mockReturnValue('darwin');
      vi.mocked(os.homedir).mockReturnValue('/Users/test');
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        return p === '/Users/test/project/.git';
      });

      const { isInsideGitRepo } = await import('../../src/utils/platform.js');
      expect(isInsideGitRepo('/Users/test/project/src/utils')).toBe(true);
    });

    it('should return false when no .git exists', async () => {
      vi.mocked(os.platform).mockReturnValue('darwin');
      vi.mocked(os.homedir).mockReturnValue('/Users/test');
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { isInsideGitRepo } = await import('../../src/utils/platform.js');
      expect(isInsideGitRepo('/Users/test/not-a-repo')).toBe(false);
    });
  });

  describe('findGitRoot', () => {
    it('should return the git root directory', async () => {
      vi.mocked(os.platform).mockReturnValue('darwin');
      vi.mocked(os.homedir).mockReturnValue('/Users/test');
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        return p === '/Users/test/project/.git';
      });

      const { findGitRoot } = await import('../../src/utils/platform.js');
      expect(findGitRoot('/Users/test/project/src/utils')).toBe(
        '/Users/test/project'
      );
    });

    it('should return null when no git root found', async () => {
      vi.mocked(os.platform).mockReturnValue('darwin');
      vi.mocked(os.homedir).mockReturnValue('/Users/test');
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { findGitRoot } = await import('../../src/utils/platform.js');
      expect(findGitRoot('/Users/test/not-a-repo')).toBe(null);
    });
  });
});
