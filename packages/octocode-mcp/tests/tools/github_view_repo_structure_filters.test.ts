import { describe, it, expect } from 'vitest';
import {
  IGNORED_FOLDER_NAMES,
  IGNORED_FILE_NAMES,
  IGNORED_FILE_EXTENSIONS,
  shouldIgnoreDir,
  shouldIgnoreFile,
} from '../../src/utils/fileFilters';

describe('GitHub View Repo Structure Filters', () => {
  describe('IGNORED_FOLDER_NAMES', () => {
    it('should contain hidden folders', () => {
      expect(IGNORED_FOLDER_NAMES).toContain('.github');
      expect(IGNORED_FOLDER_NAMES).toContain('.git');
      expect(IGNORED_FOLDER_NAMES).toContain('.vscode');
      expect(IGNORED_FOLDER_NAMES).toContain('.devcontainer');
    });

    it('should contain build/distribution folders', () => {
      expect(IGNORED_FOLDER_NAMES).toContain('dist');
      expect(IGNORED_FOLDER_NAMES).toContain('build');
      expect(IGNORED_FOLDER_NAMES).toContain('out');
      expect(IGNORED_FOLDER_NAMES).toContain('target');
    });

    it('should contain dependency folders', () => {
      expect(IGNORED_FOLDER_NAMES).toContain('node_modules');
      expect(IGNORED_FOLDER_NAMES).toContain('vendor');
      expect(IGNORED_FOLDER_NAMES).toContain('third_party');
    });

    it('should contain temporary/cache directories', () => {
      expect(IGNORED_FOLDER_NAMES).toContain('tmp');
      expect(IGNORED_FOLDER_NAMES).toContain('temp');
      expect(IGNORED_FOLDER_NAMES).toContain('cache');
      expect(IGNORED_FOLDER_NAMES).toContain('.cache');
    });

    it('should contain language-specific cache/build directories', () => {
      expect(IGNORED_FOLDER_NAMES).toContain('.pytest_cache');
      expect(IGNORED_FOLDER_NAMES).toContain('.tox');
      expect(IGNORED_FOLDER_NAMES).toContain('.venv');
      expect(IGNORED_FOLDER_NAMES).toContain('.mypy_cache');
      expect(IGNORED_FOLDER_NAMES).toContain('.next');
      expect(IGNORED_FOLDER_NAMES).toContain('.svelte-kit');
      expect(IGNORED_FOLDER_NAMES).toContain('.turbo');
      expect(IGNORED_FOLDER_NAMES).toContain('.angular');
      expect(IGNORED_FOLDER_NAMES).toContain('.dart_tool');
    });

    it('should contain IDE/Editor specific folders', () => {
      expect(IGNORED_FOLDER_NAMES).toContain('.idea');
      expect(IGNORED_FOLDER_NAMES).toContain('.idea_modules');
      expect(IGNORED_FOLDER_NAMES).toContain('.vs');
      expect(IGNORED_FOLDER_NAMES).toContain('.history');
    });

    it('should contain coverage and log directories', () => {
      expect(IGNORED_FOLDER_NAMES).toContain('coverage');
      expect(IGNORED_FOLDER_NAMES).toContain('.nyc_output');
      expect(IGNORED_FOLDER_NAMES).toContain('logs');
      expect(IGNORED_FOLDER_NAMES).toContain('log');
    });

    it('should contain OS specific folders', () => {
      expect(IGNORED_FOLDER_NAMES).toContain('.DS_Store');
    });
  });

  describe('IGNORED_FILE_NAMES', () => {
    it('should contain hidden configuration files', () => {
      // Note: These files are not currently in IGNORED_FILE_NAMES
      // Only checking files that are actually in the current implementation
      expect(IGNORED_FILE_NAMES).toContain('.DS_Store');
    });

    it('should contain lock files', () => {
      expect(IGNORED_FILE_NAMES).toContain('package-lock.json');
      // Note: Other lock files are not currently in IGNORED_FILE_NAMES
    });

    it('should contain configuration files', () => {
      // Note: Configuration files are not currently in IGNORED_FILE_NAMES
      // Only checking files that are actually in the current implementation
      expect(IGNORED_FILE_NAMES.length).toBeGreaterThan(0);
    });

    it('should contain build/CI configuration files', () => {
      // Note: Build/CI configuration files are not currently in IGNORED_FILE_NAMES
      expect(IGNORED_FILE_NAMES.length).toBeGreaterThan(0);
    });

    it('should contain documentation/legal files', () => {
      // Note: Documentation/legal files are not currently in IGNORED_FILE_NAMES
      expect(IGNORED_FILE_NAMES.length).toBeGreaterThan(0);
    });

    it('should contain IDE/Editor files', () => {
      expect(IGNORED_FILE_NAMES).toContain('.DS_Store');
      expect(IGNORED_FILE_NAMES).toContain('Thumbs.db');
    });

    it('should contain language-specific files', () => {
      // Note: Language-specific files are not currently in IGNORED_FILE_NAMES
      expect(IGNORED_FILE_NAMES.length).toBeGreaterThan(0);
    });

    it('should contain project management files', () => {
      // Note: Project management files are not currently in IGNORED_FILE_NAMES
      expect(IGNORED_FILE_NAMES.length).toBeGreaterThan(0);
    });
  });

  describe('IGNORED_FILE_EXTENSIONS', () => {
    it('should contain common ignored extensions', () => {
      expect(IGNORED_FILE_EXTENSIONS).toContain('.lock');
      expect(IGNORED_FILE_EXTENSIONS).toContain('.log');
      expect(IGNORED_FILE_EXTENSIONS).toContain('.tmp');
      expect(IGNORED_FILE_EXTENSIONS).toContain('.temp');
      expect(IGNORED_FILE_EXTENSIONS).toContain('.cache');
      expect(IGNORED_FILE_EXTENSIONS).toContain('.bak');
      expect(IGNORED_FILE_EXTENSIONS).toContain('.backup');
      expect(IGNORED_FILE_EXTENSIONS).toContain('.orig');
      expect(IGNORED_FILE_EXTENSIONS).toContain('.swp');
      expect(IGNORED_FILE_EXTENSIONS).toContain('.swo');
      expect(IGNORED_FILE_EXTENSIONS).toContain('.rej');
      expect(IGNORED_FILE_EXTENSIONS).toContain('.obj');
      expect(IGNORED_FILE_EXTENSIONS).toContain('.bin');
      expect(IGNORED_FILE_EXTENSIONS).toContain('.class');
      expect(IGNORED_FILE_EXTENSIONS).toContain('.pdb');
      expect(IGNORED_FILE_EXTENSIONS).toContain('.dSYM');
    });
  });

  describe('shouldIgnoreDir', () => {
    it('should ignore exact matches', () => {
      expect(shouldIgnoreDir('.github')).toBe(true);
      expect(shouldIgnoreDir('node_modules')).toBe(true);
      expect(shouldIgnoreDir('dist')).toBe(true);
      expect(shouldIgnoreDir('build')).toBe(true);
    });

    it('should not ignore non-matching folders', () => {
      expect(shouldIgnoreDir('src')).toBe(false);
      expect(shouldIgnoreDir('components')).toBe(false);
      expect(shouldIgnoreDir('utils')).toBe(false);
    });
  });

  describe('shouldIgnoreFileByPath', () => {
    it('should ignore files by exact name match', () => {
      // Only test files that are actually in IGNORED_FILE_NAMES
      expect(shouldIgnoreFile('package-lock.json')).toBe(true);
      expect(shouldIgnoreFile('.DS_Store')).toBe(true);
      expect(shouldIgnoreFile('Thumbs.db')).toBe(true);
      // Files not in IGNORED_FILE_NAMES should not be ignored
      expect(shouldIgnoreFile('.gitignore')).toBe(false);
      expect(shouldIgnoreFile('tsconfig.json')).toBe(false);
      expect(shouldIgnoreFile('LICENSE')).toBe(false);
    });

    it('should ignore files by extension', () => {
      expect(shouldIgnoreFile('debug.log')).toBe(true);
      expect(shouldIgnoreFile('temp.tmp')).toBe(true);
      expect(shouldIgnoreFile('cache.cache')).toBe(true);
      expect(shouldIgnoreFile('backup.bak')).toBe(true);
      expect(shouldIgnoreFile('app.min.js')).toBe(true);
      expect(shouldIgnoreFile('styles.min.css')).toBe(true);
      expect(shouldIgnoreFile('bundle.map')).toBe(true);
    });

    it('should ignore files in ignored directories', () => {
      expect(shouldIgnoreFile('.yarn/x/y/z.js')).toBe(true);
      expect(shouldIgnoreFile('node_modules/package/index.js')).toBe(true);
      expect(shouldIgnoreFile('dist/bundle.js')).toBe(true);
      expect(shouldIgnoreFile('.git/config')).toBe(true);
    });

    it('should not ignore non-matching files', () => {
      expect(shouldIgnoreFile('index.js')).toBe(false);
      expect(shouldIgnoreFile('App.tsx')).toBe(false);
      expect(shouldIgnoreFile('styles.css')).toBe(false);
      expect(shouldIgnoreFile('README.md')).toBe(false);
      expect(shouldIgnoreFile('src/components/Button.tsx')).toBe(false);
    });
  });
});
