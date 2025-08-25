import { describe, it, expect } from 'vitest';
import {
  IGNORED_FOLDER_PATTERNS,
  IGNORED_FILE_PATTERNS,
  MEDIA_FILE_EXTENSIONS,
  IGNORED_FILE_EXTENSIONS,
  shouldIgnoreFolder,
  shouldIgnoreFile,
  filterItems,
} from '../../src/tools/github_view_repo_structure_filters';

describe('GitHub View Repo Structure Filters', () => {
  describe('IGNORED_FOLDER_PATTERNS', () => {
    it('should contain hidden folders', () => {
      expect(IGNORED_FOLDER_PATTERNS).toContain('.github');
      expect(IGNORED_FOLDER_PATTERNS).toContain('.git');
      expect(IGNORED_FOLDER_PATTERNS).toContain('.vscode');
      expect(IGNORED_FOLDER_PATTERNS).toContain('.devcontainer');
    });

    it('should contain build/distribution folders', () => {
      expect(IGNORED_FOLDER_PATTERNS).toContain('dist');
      expect(IGNORED_FOLDER_PATTERNS).toContain('build');
      expect(IGNORED_FOLDER_PATTERNS).toContain('out');
      expect(IGNORED_FOLDER_PATTERNS).toContain('target');
    });

    it('should contain dependency folders', () => {
      expect(IGNORED_FOLDER_PATTERNS).toContain('node_modules');
      expect(IGNORED_FOLDER_PATTERNS).toContain('vendor');
      expect(IGNORED_FOLDER_PATTERNS).toContain('third_party');
    });

    it('should contain temporary/cache directories', () => {
      expect(IGNORED_FOLDER_PATTERNS).toContain('tmp');
      expect(IGNORED_FOLDER_PATTERNS).toContain('temp');
      expect(IGNORED_FOLDER_PATTERNS).toContain('cache');
      expect(IGNORED_FOLDER_PATTERNS).toContain('.cache');
    });

    it('should contain language-specific cache/build directories', () => {
      expect(IGNORED_FOLDER_PATTERNS).toContain('.pytest_cache');
      expect(IGNORED_FOLDER_PATTERNS).toContain('.tox');
      expect(IGNORED_FOLDER_PATTERNS).toContain('.venv');
      expect(IGNORED_FOLDER_PATTERNS).toContain('.mypy_cache');
      expect(IGNORED_FOLDER_PATTERNS).toContain('.next');
      expect(IGNORED_FOLDER_PATTERNS).toContain('.svelte-kit');
      expect(IGNORED_FOLDER_PATTERNS).toContain('.turbo');
      expect(IGNORED_FOLDER_PATTERNS).toContain('.angular');
      expect(IGNORED_FOLDER_PATTERNS).toContain('.dart_tool');
    });

    it('should contain IDE/Editor specific folders', () => {
      expect(IGNORED_FOLDER_PATTERNS).toContain('.idea');
      expect(IGNORED_FOLDER_PATTERNS).toContain('.idea_modules');
      expect(IGNORED_FOLDER_PATTERNS).toContain('.vs');
      expect(IGNORED_FOLDER_PATTERNS).toContain('.history');
    });

    it('should contain coverage and log directories', () => {
      expect(IGNORED_FOLDER_PATTERNS).toContain('coverage');
      expect(IGNORED_FOLDER_PATTERNS).toContain('.nyc_output');
      expect(IGNORED_FOLDER_PATTERNS).toContain('logs');
      expect(IGNORED_FOLDER_PATTERNS).toContain('log');
    });

    it('should contain OS specific folders', () => {
      expect(IGNORED_FOLDER_PATTERNS).toContain('.DS_Store');
    });
  });

  describe('IGNORED_FILE_PATTERNS', () => {
    it('should contain hidden configuration files', () => {
      expect(IGNORED_FILE_PATTERNS).toContain('.gitignore');
      expect(IGNORED_FILE_PATTERNS).toContain('.gitattributes');
      expect(IGNORED_FILE_PATTERNS).toContain('.editorconfig');
      expect(IGNORED_FILE_PATTERNS).toContain('.eslintrc');
      expect(IGNORED_FILE_PATTERNS).toContain('.prettierrc');
      expect(IGNORED_FILE_PATTERNS).toContain('.npmrc');
      expect(IGNORED_FILE_PATTERNS).toContain('.env');
    });

    it('should contain lock files', () => {
      expect(IGNORED_FILE_PATTERNS).toContain('package-lock.json');
      expect(IGNORED_FILE_PATTERNS).toContain('yarn.lock');
      expect(IGNORED_FILE_PATTERNS).toContain('pnpm-lock.yaml');
      expect(IGNORED_FILE_PATTERNS).toContain('Cargo.lock');
      expect(IGNORED_FILE_PATTERNS).toContain('Pipfile.lock');
      expect(IGNORED_FILE_PATTERNS).toContain('poetry.lock');
      expect(IGNORED_FILE_PATTERNS).toContain('composer.lock');
      expect(IGNORED_FILE_PATTERNS).toContain('Gemfile.lock');
    });

    it('should contain configuration files', () => {
      expect(IGNORED_FILE_PATTERNS).toContain('tsconfig.json');
      expect(IGNORED_FILE_PATTERNS).toContain('jest.config.js');
      expect(IGNORED_FILE_PATTERNS).toContain('webpack.config.js');
      expect(IGNORED_FILE_PATTERNS).toContain('rollup.config.js');
      expect(IGNORED_FILE_PATTERNS).toContain('vite.config.js');
      expect(IGNORED_FILE_PATTERNS).toContain('vitest.config.js');
      expect(IGNORED_FILE_PATTERNS).toContain('babel.config.js');
      expect(IGNORED_FILE_PATTERNS).toContain('postcss.config.js');
      expect(IGNORED_FILE_PATTERNS).toContain('tailwind.config.js');
      expect(IGNORED_FILE_PATTERNS).toContain('next.config.js');
      expect(IGNORED_FILE_PATTERNS).toContain('nuxt.config.js');
      expect(IGNORED_FILE_PATTERNS).toContain('svelte.config.js');
      expect(IGNORED_FILE_PATTERNS).toContain('astro.config.js');
      expect(IGNORED_FILE_PATTERNS).toContain('remix.config.js');
    });

    it('should contain build/CI configuration files', () => {
      expect(IGNORED_FILE_PATTERNS).toContain('Dockerfile');
      expect(IGNORED_FILE_PATTERNS).toContain('docker-compose.yml');
      expect(IGNORED_FILE_PATTERNS).toContain('Makefile');
      expect(IGNORED_FILE_PATTERNS).toContain('CMakeLists.txt');
      expect(IGNORED_FILE_PATTERNS).toContain('meson.build');
      expect(IGNORED_FILE_PATTERNS).toContain('BUILD.bazel');
      expect(IGNORED_FILE_PATTERNS).toContain('WORKSPACE');
    });

    it('should contain documentation/legal files', () => {
      expect(IGNORED_FILE_PATTERNS).toContain('LICENSE');
      expect(IGNORED_FILE_PATTERNS).toContain('LICENSE.txt');
      expect(IGNORED_FILE_PATTERNS).toContain('LICENSE.md');
      expect(IGNORED_FILE_PATTERNS).toContain('COPYING');
      expect(IGNORED_FILE_PATTERNS).toContain('COPYRIGHT');
      expect(IGNORED_FILE_PATTERNS).toContain('NOTICE');
      expect(IGNORED_FILE_PATTERNS).toContain('CONTRIBUTING.md');
      expect(IGNORED_FILE_PATTERNS).toContain('CODE_OF_CONDUCT.md');
      expect(IGNORED_FILE_PATTERNS).toContain('SECURITY.md');
      expect(IGNORED_FILE_PATTERNS).toContain('SUPPORT.md');
      expect(IGNORED_FILE_PATTERNS).toContain('GOVERNANCE.md');
      expect(IGNORED_FILE_PATTERNS).toContain('MAINTAINERS');
      expect(IGNORED_FILE_PATTERNS).toContain('AUTHORS');
      expect(IGNORED_FILE_PATTERNS).toContain('CHANGELOG');
      expect(IGNORED_FILE_PATTERNS).toContain('CHANGELOG.md');
      expect(IGNORED_FILE_PATTERNS).toContain('HISTORY.md');
      expect(IGNORED_FILE_PATTERNS).toContain('RELEASES.md');
      expect(IGNORED_FILE_PATTERNS).toContain('NEWS.md');
      expect(IGNORED_FILE_PATTERNS).toContain('UPGRADING.md');
      expect(IGNORED_FILE_PATTERNS).toContain('MIGRATION.md');
      expect(IGNORED_FILE_PATTERNS).toContain('BUILDING.md');
      expect(IGNORED_FILE_PATTERNS).toContain('TESTING_DOCS.md');
    });

    it('should contain generated/compiled files', () => {
      expect(IGNORED_FILE_PATTERNS).toContain('*.min.js');
      expect(IGNORED_FILE_PATTERNS).toContain('*.min.css');
      expect(IGNORED_FILE_PATTERNS).toContain('*.map');
      expect(IGNORED_FILE_PATTERNS).toContain('*.d.ts.map');
      expect(IGNORED_FILE_PATTERNS).toContain('types.d.ts');
      expect(IGNORED_FILE_PATTERNS).toContain('declarations.d.ts');
      expect(IGNORED_FILE_PATTERNS).toContain('declarations.test.d.ts');
      expect(IGNORED_FILE_PATTERNS).toContain('module.d.ts');
    });

    it('should contain IDE/Editor files', () => {
      expect(IGNORED_FILE_PATTERNS).toContain('*.swp');
      expect(IGNORED_FILE_PATTERNS).toContain('*.swo');
      expect(IGNORED_FILE_PATTERNS).toContain('*~');
      expect(IGNORED_FILE_PATTERNS).toContain('.DS_Store');
      expect(IGNORED_FILE_PATTERNS).toContain('Thumbs.db');
      expect(IGNORED_FILE_PATTERNS).toContain('*.sublime-project');
      expect(IGNORED_FILE_PATTERNS).toContain('*.sublime-workspace');
    });

    it('should contain log files', () => {
      expect(IGNORED_FILE_PATTERNS).toContain('*.log');
      expect(IGNORED_FILE_PATTERNS).toContain('npm-debug.log*');
      expect(IGNORED_FILE_PATTERNS).toContain('yarn-debug.log*');
      expect(IGNORED_FILE_PATTERNS).toContain('yarn-error.log*');
    });

    it('should contain runtime/temp files', () => {
      expect(IGNORED_FILE_PATTERNS).toContain('*.pid');
      expect(IGNORED_FILE_PATTERNS).toContain('*.seed');
      expect(IGNORED_FILE_PATTERNS).toContain('*.coverage');
      expect(IGNORED_FILE_PATTERNS).toContain('.nyc_output');
    });

    it('should contain archives', () => {
      expect(IGNORED_FILE_PATTERNS).toContain('*.zip');
      expect(IGNORED_FILE_PATTERNS).toContain('*.tar.gz');
      expect(IGNORED_FILE_PATTERNS).toContain('*.tgz');
      expect(IGNORED_FILE_PATTERNS).toContain('*.rar');
      expect(IGNORED_FILE_PATTERNS).toContain('*.7z');
    });

    it('should contain binary files', () => {
      expect(IGNORED_FILE_PATTERNS).toContain('*.exe');
      expect(IGNORED_FILE_PATTERNS).toContain('*.dll');
      expect(IGNORED_FILE_PATTERNS).toContain('*.so');
      expect(IGNORED_FILE_PATTERNS).toContain('*.dylib');
      expect(IGNORED_FILE_PATTERNS).toContain('*.jar');
      expect(IGNORED_FILE_PATTERNS).toContain('*.war');
      expect(IGNORED_FILE_PATTERNS).toContain('*.ear');
    });

    it('should contain language-specific files', () => {
      // Go language files
      expect(IGNORED_FILE_PATTERNS).toContain('go.mod');
      expect(IGNORED_FILE_PATTERNS).toContain('go.sum');
      expect(IGNORED_FILE_PATTERNS).toContain('go.work');
      expect(IGNORED_FILE_PATTERNS).toContain('go.work.sum');
      expect(IGNORED_FILE_PATTERNS).toContain('.go-version');

      // Rust language files
      expect(IGNORED_FILE_PATTERNS).toContain('Cargo.toml');
      expect(IGNORED_FILE_PATTERNS).toContain('rustfmt.toml');
      expect(IGNORED_FILE_PATTERNS).toContain('rust-bors.toml');
      expect(IGNORED_FILE_PATTERNS).toContain('triagebot.toml');
      expect(IGNORED_FILE_PATTERNS).toContain('typos.toml');
      expect(IGNORED_FILE_PATTERNS).toContain('REUSE.toml');
      expect(IGNORED_FILE_PATTERNS).toContain('bootstrap.example.toml');

      // Java/Gradle/Maven files
      expect(IGNORED_FILE_PATTERNS).toContain('build.gradle');
      expect(IGNORED_FILE_PATTERNS).toContain('settings.gradle');
      expect(IGNORED_FILE_PATTERNS).toContain('gradle.properties');
      expect(IGNORED_FILE_PATTERNS).toContain('gradlew');
      expect(IGNORED_FILE_PATTERNS).toContain('gradlew.bat');
      expect(IGNORED_FILE_PATTERNS).toContain('.sdkmanrc');
      expect(IGNORED_FILE_PATTERNS).toContain('pom.xml');
      expect(IGNORED_FILE_PATTERNS).toContain('mvnw');
      expect(IGNORED_FILE_PATTERNS).toContain('mvnw.cmd');
      expect(IGNORED_FILE_PATTERNS).toContain('eclipse.properties');
      expect(IGNORED_FILE_PATTERNS).toContain('*.setup');
      expect(IGNORED_FILE_PATTERNS).toContain('SpringRepositorySupport.groovy');

      // Python additional files
      expect(IGNORED_FILE_PATTERNS).toContain('.flake8');
      expect(IGNORED_FILE_PATTERNS).toContain('.coveragerc');
      expect(IGNORED_FILE_PATTERNS).toContain('MANIFEST.in');
      expect(IGNORED_FILE_PATTERNS).toContain('.pre-commit-config.yaml');
      expect(IGNORED_FILE_PATTERNS).toContain('.readthedocs.yml');
      expect(IGNORED_FILE_PATTERNS).toContain('mypy.ini');
      expect(IGNORED_FILE_PATTERNS).toContain('.mypy.ini');
      expect(IGNORED_FILE_PATTERNS).toContain('pytest.ini');
      expect(IGNORED_FILE_PATTERNS).toContain('requirements-test.txt');

      // Dart/Flutter files
      expect(IGNORED_FILE_PATTERNS).toContain('.ci.yaml');
      expect(IGNORED_FILE_PATTERNS).toContain('analysis_options.yaml');
      expect(IGNORED_FILE_PATTERNS).toContain('dartdoc_options.yaml');
      expect(IGNORED_FILE_PATTERNS).toContain('pubspec.yaml');
      expect(IGNORED_FILE_PATTERNS).toContain('DEPS');
      expect(IGNORED_FILE_PATTERNS).toContain('flutter_console.bat');
    });

    it('should contain project management files', () => {
      expect(IGNORED_FILE_PATTERNS).toContain('TESTOWNERS');
      expect(IGNORED_FILE_PATTERNS).toContain('CODEOWNERS');
      expect(IGNORED_FILE_PATTERNS).toContain('SECURITY_CONTACTS');
      expect(IGNORED_FILE_PATTERNS).toContain('OWNERS');
      expect(IGNORED_FILE_PATTERNS).toContain('OWNERS_ALIASES');
      expect(IGNORED_FILE_PATTERNS).toContain('dco.yml');
      expect(IGNORED_FILE_PATTERNS).toContain('labeler.yml');
      expect(IGNORED_FILE_PATTERNS).toContain('release.yml');
      expect(IGNORED_FILE_PATTERNS).toContain('FUNDING.yml');
      expect(IGNORED_FILE_PATTERNS).toContain('PATENT_GRANT');
    });
  });

  describe('MEDIA_FILE_EXTENSIONS', () => {
    it('should contain image extensions', () => {
      expect(MEDIA_FILE_EXTENSIONS).toContain('.png');
      expect(MEDIA_FILE_EXTENSIONS).toContain('.jpg');
      expect(MEDIA_FILE_EXTENSIONS).toContain('.jpeg');
      expect(MEDIA_FILE_EXTENSIONS).toContain('.gif');
      expect(MEDIA_FILE_EXTENSIONS).toContain('.svg');
      expect(MEDIA_FILE_EXTENSIONS).toContain('.ico');
      expect(MEDIA_FILE_EXTENSIONS).toContain('.webp');
      expect(MEDIA_FILE_EXTENSIONS).toContain('.bmp');
      expect(MEDIA_FILE_EXTENSIONS).toContain('.tiff');
      expect(MEDIA_FILE_EXTENSIONS).toContain('.tif');
      expect(MEDIA_FILE_EXTENSIONS).toContain('.psd');
      expect(MEDIA_FILE_EXTENSIONS).toContain('.ai');
      expect(MEDIA_FILE_EXTENSIONS).toContain('.eps');
      expect(MEDIA_FILE_EXTENSIONS).toContain('.avif');
      expect(MEDIA_FILE_EXTENSIONS).toContain('.heic');
      expect(MEDIA_FILE_EXTENSIONS).toContain('.heif');
    });

    it('should contain video extensions', () => {
      expect(MEDIA_FILE_EXTENSIONS).toContain('.mp4');
      expect(MEDIA_FILE_EXTENSIONS).toContain('.avi');
      expect(MEDIA_FILE_EXTENSIONS).toContain('.mov');
      expect(MEDIA_FILE_EXTENSIONS).toContain('.wmv');
      expect(MEDIA_FILE_EXTENSIONS).toContain('.flv');
      expect(MEDIA_FILE_EXTENSIONS).toContain('.webm');
      expect(MEDIA_FILE_EXTENSIONS).toContain('.mkv');
      expect(MEDIA_FILE_EXTENSIONS).toContain('.m4v');
      expect(MEDIA_FILE_EXTENSIONS).toContain('.3gp');
      expect(MEDIA_FILE_EXTENSIONS).toContain('.ogv');
      expect(MEDIA_FILE_EXTENSIONS).toContain('.m2v');
      expect(MEDIA_FILE_EXTENSIONS).toContain('.mpg');
      expect(MEDIA_FILE_EXTENSIONS).toContain('.mpeg');
    });

    it('should contain audio extensions', () => {
      expect(MEDIA_FILE_EXTENSIONS).toContain('.mp3');
      expect(MEDIA_FILE_EXTENSIONS).toContain('.wav');
      expect(MEDIA_FILE_EXTENSIONS).toContain('.flac');
      expect(MEDIA_FILE_EXTENSIONS).toContain('.aac');
      expect(MEDIA_FILE_EXTENSIONS).toContain('.ogg');
      expect(MEDIA_FILE_EXTENSIONS).toContain('.wma');
      expect(MEDIA_FILE_EXTENSIONS).toContain('.m4a');
      expect(MEDIA_FILE_EXTENSIONS).toContain('.opus');
      expect(MEDIA_FILE_EXTENSIONS).toContain('.aiff');
    });

    it('should contain other media/binary formats', () => {
      expect(MEDIA_FILE_EXTENSIONS).toContain('.pdf');
      expect(MEDIA_FILE_EXTENSIONS).toContain('.doc');
      expect(MEDIA_FILE_EXTENSIONS).toContain('.docx');
      expect(MEDIA_FILE_EXTENSIONS).toContain('.xls');
      expect(MEDIA_FILE_EXTENSIONS).toContain('.xlsx');
      expect(MEDIA_FILE_EXTENSIONS).toContain('.ppt');
      expect(MEDIA_FILE_EXTENSIONS).toContain('.pptx');
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

  describe('shouldIgnoreFolder', () => {
    it('should ignore exact matches', () => {
      expect(shouldIgnoreFolder('.github', '/path/to/.github')).toBe(true);
      expect(shouldIgnoreFolder('node_modules', '/path/to/node_modules')).toBe(
        true
      );
      expect(shouldIgnoreFolder('dist', '/path/to/dist')).toBe(true);
      expect(shouldIgnoreFolder('build', '/path/to/build')).toBe(true);
    });

    it('should ignore folders starting with pattern', () => {
      expect(
        shouldIgnoreFolder('.github-workflows', '/path/to/.github-workflows')
      ).toBe(true);
      expect(
        shouldIgnoreFolder(
          'node_modules_backup',
          '/path/to/node_modules_backup'
        )
      ).toBe(true);
    });

    it('should ignore folders in path', () => {
      expect(shouldIgnoreFolder('src', '/path/to/.github/src')).toBe(true); // Contains /.github/
      expect(shouldIgnoreFolder('src', '/path/to/node_modules/src')).toBe(true);
      expect(shouldIgnoreFolder('src', '/path/to/dist/src')).toBe(true);
    });

    it('should not ignore non-matching folders', () => {
      expect(shouldIgnoreFolder('src', '/path/to/src')).toBe(false);
      expect(shouldIgnoreFolder('components', '/path/to/components')).toBe(
        false
      );
      expect(shouldIgnoreFolder('utils', '/path/to/utils')).toBe(false);
    });
  });

  describe('shouldIgnoreFile', () => {
    it('should ignore exact matches', () => {
      expect(shouldIgnoreFile('.gitignore', '/path/to/.gitignore')).toBe(true);
      expect(
        shouldIgnoreFile('package-lock.json', '/path/to/package-lock.json')
      ).toBe(true);
      expect(shouldIgnoreFile('tsconfig.json', '/path/to/tsconfig.json')).toBe(
        true
      );
      expect(shouldIgnoreFile('LICENSE', '/path/to/LICENSE')).toBe(true);
    });

    it('should ignore files with wildcard patterns', () => {
      expect(shouldIgnoreFile('app.min.js', '/path/to/app.min.js')).toBe(true);
      expect(
        shouldIgnoreFile('styles.min.css', '/path/to/styles.min.css')
      ).toBe(true);
      expect(shouldIgnoreFile('bundle.map', '/path/to/bundle.map')).toBe(true);
    });

    it('should ignore files with ignored extensions', () => {
      expect(shouldIgnoreFile('debug.log', '/path/to/debug.log')).toBe(true);
      expect(shouldIgnoreFile('temp.tmp', '/path/to/temp.tmp')).toBe(true);
      expect(shouldIgnoreFile('cache.cache', '/path/to/cache.cache')).toBe(
        true
      );
      expect(shouldIgnoreFile('backup.bak', '/path/to/backup.bak')).toBe(true);
    });

    it('should ignore media files when showMedia is false', () => {
      expect(shouldIgnoreFile('image.png', '/path/to/image.png', false)).toBe(
        true
      );
      expect(shouldIgnoreFile('video.mp4', '/path/to/video.mp4', false)).toBe(
        true
      );
      expect(shouldIgnoreFile('audio.mp3', '/path/to/audio.mp3', false)).toBe(
        true
      );
      expect(
        shouldIgnoreFile('document.pdf', '/path/to/document.pdf', false)
      ).toBe(true);
    });

    it('should not ignore media files when showMedia is true', () => {
      expect(shouldIgnoreFile('image.png', '/path/to/image.png', true)).toBe(
        false
      );
      expect(shouldIgnoreFile('video.mp4', '/path/to/video.mp4', true)).toBe(
        false
      );
      expect(shouldIgnoreFile('audio.mp3', '/path/to/audio.mp3', true)).toBe(
        false
      );
      expect(
        shouldIgnoreFile('document.pdf', '/path/to/document.pdf', true)
      ).toBe(false);
    });

    it('should ignore files starting with ignored patterns', () => {
      expect(shouldIgnoreFile('.env.local', '/path/to/.env.local')).toBe(true);
      expect(
        shouldIgnoreFile('.env.production', '/path/to/.env.production')
      ).toBe(true);
    });

    it('should not ignore non-matching files', () => {
      expect(shouldIgnoreFile('index.js', '/path/to/index.js')).toBe(false);
      expect(shouldIgnoreFile('App.tsx', '/path/to/App.tsx')).toBe(false);
      expect(shouldIgnoreFile('styles.css', '/path/to/styles.css')).toBe(false);
      expect(shouldIgnoreFile('README.md', '/path/to/README.md')).toBe(false);
    });
  });

  describe('filterItems', () => {
    const mockItems = [
      { name: 'src', path: '/path/to/src', type: 'dir' },
      { name: 'components', path: '/path/to/components', type: 'dir' },
      { name: 'node_modules', path: '/path/to/node_modules', type: 'dir' },
      { name: 'dist', path: '/path/to/dist', type: 'dir' },
      { name: 'index.js', path: '/path/to/index.js', type: 'file' },
      { name: '.gitignore', path: '/path/to/.gitignore', type: 'file' },
      { name: 'package.json', path: '/path/to/package.json', type: 'file' },
      { name: 'image.png', path: '/path/to/image.png', type: 'file' },
    ];

    it('should always show important code directories', () => {
      const filtered = filterItems(mockItems);
      const importantDirs = ['src', 'components'];

      importantDirs.forEach(dir => {
        const item = filtered.find(item => item.name === dir);
        expect(item).toBeDefined();
        expect(item?.type).toBe('dir');
      });
    });

    it('should filter out ignored folders', () => {
      const filtered = filterItems(mockItems);
      const ignoredDirs = ['node_modules', 'dist'];

      ignoredDirs.forEach(dir => {
        const item = filtered.find(item => item.name === dir);
        expect(item).toBeUndefined();
      });
    });

    it('should filter out ignored files', () => {
      const filtered = filterItems(mockItems);
      const ignoredFiles = ['.gitignore'];

      ignoredFiles.forEach(file => {
        const item = filtered.find(item => item.name === file);
        expect(item).toBeUndefined();
      });
    });

    it('should keep non-ignored files', () => {
      const filtered = filterItems(mockItems);
      const keptFiles = ['index.js', 'package.json'];

      keptFiles.forEach(file => {
        const item = filtered.find(item => item.name === file);
        expect(item).toBeDefined();
        expect(item?.type).toBe('file');
      });
    });

    it('should filter out media files when showMedia is false', () => {
      const filtered = filterItems(mockItems, false);
      const mediaFiles = ['image.png'];

      mediaFiles.forEach(file => {
        const item = filtered.find(item => item.name === file);
        expect(item).toBeUndefined();
      });
    });

    it('should keep media files when showMedia is true', () => {
      const filtered = filterItems(mockItems, true);
      const mediaFiles = ['image.png'];

      mediaFiles.forEach(file => {
        const item = filtered.find(item => item.name === file);
        expect(item).toBeDefined();
        expect(item?.type).toBe('file');
      });
    });

    it('should handle empty array', () => {
      const filtered = filterItems([]);
      expect(filtered).toEqual([]);
    });

    it('should handle array with only ignored items', () => {
      const onlyIgnoredItems = [
        { name: 'node_modules', path: '/path/to/node_modules', type: 'dir' },
        { name: '.gitignore', path: '/path/to/.gitignore', type: 'file' },
      ];

      const filtered = filterItems(onlyIgnoredItems);
      expect(filtered).toEqual([]);
    });
  });
});
