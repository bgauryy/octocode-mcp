/**
 * Folder patterns to ignore
 */
export const IGNORED_FOLDER_PATTERNS = [
  // Hidden folders (starting with .)
  '.github',
  '.git',
  '.vscode',
  '.devcontainer',
  '.config',
  '.cargo',
  '.changeset',
  '.husky',
  '.aspect',
  '.eslint-plugin-local',
  '.yarn',
  '.gemini',
  '.ng-dev',
  '.configurations',
  '.tx', // Translation files

  // Build/distribution folders
  'dist',
  'build',
  'out',
  'output',
  'target',
  'release',

  // Dependencies
  'node_modules',
  'vendor',
  'third_party',

  // Test directories (can be commented out if tests are important)
  // 'test',
  // 'tests',
  // '__tests__',
  // 'spec',

  // Documentation (can be commented out if docs are important)
  // 'docs',
  // 'doc',

  // Temporary/cache directories
  'tmp',
  'temp',
  'cache',
  '.cache',
  '.tmp',

  // Language-specific cache/build directories
  '.pytest_cache',
  '.tox',
  '.venv',
  '.mypy_cache',
  '.next',
  '.svelte-kit',
  '.turbo',
  '.angular',
  '.dart_tool',

  // IDE/Editor specific
  '.idea',
  '.idea_modules',
  '.vs',
  '.history',

  // Coverage reports
  'coverage',
  '.nyc_output',

  // Logs
  'logs',
  'log',

  // OS specific
  '.DS_Store',
];

/**
 * File patterns to ignore
 */
export const IGNORED_FILE_PATTERNS = [
  // Hidden configuration files (starting with .)
  '.gitignore',
  '.gitattributes',
  '.editorconfig',
  '.eslintrc',
  '.eslintignore',
  '.prettierrc',
  '.prettierignore',
  '.npmrc',
  '.nvmrc',
  '.node-version',
  '.babelrc',
  '.browserslistrc',
  '.env',
  '.env.local',
  '.env.example',
  '.dockerignore',
  '.mailmap',
  '.mention-bot',
  '.travis.yml',
  '.circleci',
  '.git-blame-ignore-revs',
  '.alexignore',
  '.alexrc',
  '.cursorindexingignore',
  '.ignore',
  '.lsifrc.json',
  '.vscode-test.js',
  '.rustfmt.toml',
  '.typos.toml',
  '.yamllint.yaml',
  '.cpplint',
  '.clang-format',
  '.jscsrc',
  '.markdown-doctest-setup.js',
  '.c8rc.json',
  '.dprint.jsonc',
  '.gulp.js',
  '.istanbul.yml',

  // Lock files
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'Cargo.lock',
  'Pipfile.lock',
  'poetry.lock',
  'composer.lock',
  'Gemfile.lock',

  // Configuration files
  'tsconfig.json',
  'tsconfig.*.json',
  'jest.config.js',
  'jest.config.ts',
  'webpack.config.js',
  'rollup.config.js',
  'vite.config.js',
  'vitest.config.js',
  'vitest.config.ts',
  'babel.config.js',
  'postcss.config.js',
  'tailwind.config.js',
  'next.config.js',
  'nuxt.config.js',
  'svelte.config.js',
  'astro.config.js',
  'remix.config.js',
  'turbo.json',
  'lerna.json',
  'rush.json',
  'tsfmt.json',
  'cspell.json',
  'knip.jsonc',
  'codecov.yml',
  'renovate.json',
  'dependabot.yml',
  'open-bot.yaml',
  'sgconfig.yml',
  'socket.yaml',
  'vercel.json',
  'netlify.toml',
  'firebase.json',
  'app.json',
  'eas.json',
  'expo.json',

  // Build/CI configuration
  'Dockerfile',
  'docker-compose.yml',
  'Makefile',
  'CMakeLists.txt',
  'meson.build',
  'BUILD.bazel',
  'WORKSPACE',
  'Herebyfile.mjs',
  'gulpfile.js',
  'Gruntfile.js',
  'angular.json',
  'nx.json',
  'project.json',
  'workspace.json',

  // Lint/format staged config
  'lint-staged.config.js',
  '.lintstagedrc',
  '.huskyrc',
  'pre-commit',
  'pre-push',
  'commit-msg',
  'prepare-commit-msg',

  // ESLint config variations
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  '.eslintrc.js',
  '.eslintrc.mjs',
  '.eslintrc.cjs',
  '.eslintrc.json',
  '.eslintrc.yml',
  '.eslintrc.yaml',

  // Documentation/Legal files
  'LICENSE',
  'LICENSE.txt',
  'LICENSE.md',
  'COPYING',
  'COPYRIGHT',
  'NOTICE',
  'CONTRIBUTING.md',
  'CODE_OF_CONDUCT.md',
  'SECURITY.md',
  'SUPPORT.md',
  'GOVERNANCE.md',
  'MAINTAINERS',
  'AUTHORS',
  'CHANGELOG',
  'CHANGELOG.md',
  'HISTORY.md',
  'RELEASES.md',
  'NEWS.md',
  'UPGRADING.md',
  'MIGRATION.md',
  'BUILDING.md',
  'TESTING_DOCS.md',
  '_SETUP.md',
  'onboarding.md',
  'glossary.md',

  // Generated/compiled files
  '*.min.js',
  '*.min.css',
  '*.map',
  '*.d.ts.map',
  'types.d.ts',
  'declarations.d.ts',
  'declarations.test.d.ts',
  'module.d.ts',

  // IDE/Editor files
  '*.swp',
  '*.swo',
  '*~',
  '.DS_Store',
  'Thumbs.db',
  '*.sublime-project',
  '*.sublime-workspace',

  // Log files
  '*.log',
  'npm-debug.log*',
  'yarn-debug.log*',
  'yarn-error.log*',

  // Runtime/temp files
  '*.pid',
  '*.seed',
  '*.coverage',
  '.nyc_output',

  // Archives
  '*.zip',
  '*.tar.gz',
  '*.tgz',
  '*.rar',
  '*.7z',

  // Binary files (usually not interesting for code structure)
  '*.exe',
  '*.dll',
  '*.so',
  '*.dylib',
  '*.jar',
  '*.war',
  '*.ear',

  // NOTE: Media files (images, videos, audio) are controlled by the showMedia parameter
  // NOTE: Test files can be filtered by uncommenting the patterns in shouldIgnoreFile function

  // Go language files
  'go.mod',
  'go.sum',
  'go.work',
  'go.work.sum',
  '.go-version',

  // Rust language files
  'Cargo.toml',
  'rustfmt.toml',
  'rust-bors.toml',
  'triagebot.toml',
  'typos.toml',
  'REUSE.toml',
  'bootstrap.example.toml',

  // Java/Gradle/Maven files
  'build.gradle',
  'settings.gradle',
  'gradle.properties',
  'gradlew',
  'gradlew.bat',
  '.sdkmanrc',
  'pom.xml',
  'mvnw',
  'mvnw.cmd',
  'eclipse.properties',
  '*.setup',
  'SpringRepositorySupport.groovy',

  // Python additional files
  '.flake8',
  '.coveragerc',
  'MANIFEST.in',
  '.pre-commit-config.yaml',
  '.readthedocs.yml',
  'mypy.ini',
  '.mypy.ini',
  'pytest.ini',
  'requirements-test.txt',

  // Dart/Flutter files
  '.ci.yaml',
  'analysis_options.yaml',
  'dartdoc_options.yaml',
  'pubspec.yaml',
  'DEPS',
  'flutter_console.bat',

  // Project management files
  'TESTOWNERS',
  'CODEOWNERS',
  'SECURITY_CONTACTS',
  'OWNERS',
  'OWNERS_ALIASES',
  'dco.yml',
  'labeler.yml',
  'release.yml',
  'FUNDING.yml',
  'PATENT_GRANT',

  // Other commonly generated files
  'ThirdPartyNoticeText.txt',
  'ThirdPartyNotices.txt',
  'cglicenses.json',
  'cgmanifest.json',
  'manifest.json',
  'BSDmakefile',
  'android-configure',
  'android_configure.py',
  'configure',
  'configure.py',
  'vcbuild.bat',
  'rust-toolchain.toml',
  'pyproject.toml',
  'setup.py',
  'setup.cfg',
  'requirements.txt',
  'requirements-dev.txt',
  'Pipfile',
  'poetry.toml',
  'tox.ini',
  'noxfile.py',
  'common.gypi',
  'node.gyp',
  'node.gypi',
  'node.gni',
  'unofficial.gni',
  'packages.bzl',
  'yarn.bzl',
  'generate-types-config.js',
  'release.js',
  'run-tests.js',
  'test-file.txt',
  'tsconfig-tsec.json',
  'tsec-exemptions.json',

  // Build scripts and shell files that are typically config/setup
  'x',
  'x.ps1',
  'x.py',
  'make.bat',

  // Additional configuration files
  '.env.*',
  '.editorconfig.*',
  'tsconfig.node.json',
  'pnpm-workspace.yaml',
  'react-native.config.js',
  'app.config.js',
  '.code-workspace',
  'Rakefile',
  'Procfile',
  'fastlane/Fastfile',

  // IDE project files
  '.project',
  '.classpath',
  '*.iml',
  '*.iws',
  '*.ipr',
  'icon.svg',
];

/**
 * Additional file extensions to ignore
 */
/**
 * Media file extensions that can be optionally filtered
 */
export const MEDIA_FILE_EXTENSIONS = [
  // Images
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.ico',
  '.webp',
  '.bmp',
  '.tiff',
  '.tif',
  '.psd',
  '.ai',
  '.eps',
  '.avif',
  '.heic',
  '.heif',

  // Videos
  '.mp4',
  '.avi',
  '.mov',
  '.wmv',
  '.flv',
  '.webm',
  '.mkv',
  '.m4v',
  '.3gp',
  '.ogv',
  '.m2v',
  '.mpg',
  '.mpeg',

  // Audio
  '.mp3',
  '.wav',
  '.flac',
  '.aac',
  '.ogg',
  '.wma',
  '.m4a',
  '.opus',
  '.aiff',

  // Other media/binary formats
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
];

export const IGNORED_FILE_EXTENSIONS = [
  '.lock',
  '.log',
  '.tmp',
  '.temp',
  '.cache',
  '.bak',
  '.backup',
  '.orig',
  '.swp',
  '.swo',
  '.rej',
  '.obj',
  '.bin',
  '.class',
  '.pdb',
  '.dSYM',
];

/**
 * Check if a folder should be ignored based on the ignore patterns
 */
export function shouldIgnoreFolder(
  folderName: string,
  folderPath: string
): boolean {
  // Check exact matches and prefix matches
  return IGNORED_FOLDER_PATTERNS.some(pattern => {
    return (
      folderName === pattern ||
      folderName.startsWith(pattern) ||
      folderPath.includes(`/${pattern}/`)
    );
  });
}

/**
 * Check if a file should be ignored based on the ignore patterns
 */
export function shouldIgnoreFile(
  fileName: string,
  _filePath: string,
  showMedia: boolean = false
): boolean {
  // Check exact matches
  if (IGNORED_FILE_PATTERNS.some(pattern => fileName === pattern)) {
    return true;
  }

  // Check pattern matches with wildcards
  if (
    IGNORED_FILE_PATTERNS.some(pattern => {
      if (pattern.includes('*')) {
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        return regex.test(fileName);
      }
      return false;
    })
  ) {
    return true;
  }

  // Check file extensions
  if (IGNORED_FILE_EXTENSIONS.some(ext => fileName.endsWith(ext))) {
    return true;
  }

  // Check media file extensions (only if showMedia is false)
  if (!showMedia && MEDIA_FILE_EXTENSIONS.some(ext => fileName.endsWith(ext))) {
    return true;
  }

  // Check if it starts with any ignored pattern
  if (
    IGNORED_FILE_PATTERNS.some(pattern => {
      if (!pattern.includes('*') && !pattern.includes('.')) {
        return fileName.startsWith(pattern);
      }
      return false;
    })
  ) {
    return true;
  }

  return false;
}

/**
 * Filter an array of items (files or folders) based on ignore patterns
 * @param items - Array of file/folder items to filter
 * @param showMedia - If true, media files (images, videos, audio) will be shown. Default: false (media hidden)
 */
export function filterItems<
  T extends { name: string; path: string; type?: string | 'file' | 'dir' },
>(items: T[], showMedia: boolean = false): T[] {
  return items.filter(item => {
    // Always show important code directories even if they match patterns
    const importantDirs = [
      'src',
      'lib',
      'packages',
      'apps',
      'components',
      'pages',
      'api',
      'utils',
      'hooks',
      'store',
      'styles',
      'assets',
      'public',
      'static',
    ];
    if (item.type === 'dir' && importantDirs.includes(item.name)) {
      return true;
    }

    // Check if it's a folder
    if (item.type === 'dir') {
      return !shouldIgnoreFolder(item.name, item.path);
    } else {
      // It's a file - apply filtering with media control
      return !shouldIgnoreFile(item.name, item.path, showMedia);
    }
  });
}
