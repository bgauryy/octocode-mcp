/**
 * Folder names to ignore (exact matches)
 */
export const IGNORED_FOLDER_NAMES = [
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
  '.tx',

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
  '__pycache__',
  '.ruff_cache',
  '.nox',
  'htmlcov',
  'cover',

  // Java/Kotlin/Scala
  '.gradle',
  '.m2',
  '.sbt',
  '.bloop',
  '.metals',
  '.bsp',

  // .NET/C#
  'bin',
  'obj',
  'TestResults',
  'BenchmarkDotNet.Artifacts',

  // Go
  '.vendor-new',
  'Godeps',

  // PHP
  'composer.phar',
  '.phpunit.result.cache',

  // Ruby
  '.bundle',
  '.byebug_history',
  '.rspec_status',

  // Maven/Gradle specific
  '.mvn',

  // Cloud/AWS/GCP
  '.aws',
  '.gcp',

  // Fastlane
  'fastlane',

  // Swift/iOS
  'DerivedData',
  'xcuserdata',

  // Android
  'local.properties',
  '.navigation',
  'captures',
  '.externalNativeBuild',
  '.cxx',

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

export const IGNORED_FILE_NAMES = [
  // Lock files (dependency management)
  'package-lock.json',

  // Sensitive files (API keys, certificates, secrets)
  '.secrets',
  '.secret',
  'secrets.json',
  'secrets.yaml',
  'secrets.yml',
  'credentials.json',
  'credentials.yaml',
  'credentials.yml',
  'auth.json',
  'auth.yaml',
  'auth.yml',
  'api-keys.json',
  'api_keys.json',
  'service-account.json',
  'service_account.json',
  'private-key.pem',
  'private_key.pem',
  'id_rsa',
  'id_dsa',
  'id_ecdsa',
  'id_ed25519',
  'keyfile',
  'keyfile.json',
  'gcloud-service-key.json',
  'firebase-adminsdk.json',
  'google-services.json',
  'GoogleService-Info.plist',

  // OS/IDE specific files
  '.DS_Store',
  'Thumbs.db',

  // Binary database files (large and not searchable)
  'db.sqlite3',
  'db.sqlite3-journal',

  // Cache files that are regenerated
  '.eslintcache',
  '.stylelintcache',
  '.node_repl_history',
  '.yarn-integrity',
  'celerybeat-schedule',
  'celerybeat.pid',

  // Large generated notice/license files
  'ThirdPartyNoticeText.txt',
  'ThirdPartyNotices.txt',
  'cglicenses.json',
  'cgmanifest.json',
];

/**
 * File extensions to ignore
 */
export const IGNORED_FILE_EXTENSIONS = [
  // Lock files (dependency management)
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
  '.pid',
  '.seed',
  '.old',
  '.save',
  '.temporary',

  // Compiled/binary files
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.a',
  '.lib',
  '.o',
  '.obj',
  '.bin',
  '.class',
  '.pdb',
  '.dSYM',
  '.pyc',
  '.pyo',
  '.pyd',
  '.jar',
  '.war',
  '.ear',
  '.nar',

  // Database files
  '.db',
  '.sqlite',
  '.sqlite3',
  '.mdb',
  '.accdb',

  // Archive files
  '.zip',
  '.tar',
  '.gz',
  '.bz2',
  '.xz',
  '.lz',
  '.lzma',
  '.Z',
  '.tgz',
  '.rar',
  '.7z',

  // Package files
  '.deb',
  '.rpm',
  '.pkg',
  '.dmg',
  '.msi',
  '.appx',
  '.snap',

  // Map files
  '.map',
  '.d.ts.map',

  // Minified files
  '.min.js',
  '.min.css',

  // Certificate/key files
  '.key',
  '.pem',
  '.p12',
  '.pfx',
  '.crt',
  '.cer',
  '.der',
  '.csr',
  '.jks',
  '.keystore',
  '.truststore',

  // IDE/Editor specific
  '.kate-swp',
  '.gnome-desktop',
  '.sublime-project',
  '.sublime-workspace',
  '.iml',
  '.iws',
  '.ipr',

  // Version control
  '.patch',
  '.diff',

  // Profiling/debugging
  '.prof',
  '.profile',
  '.trace',
  '.perf',
  '.coverage',

  // Language specific
  '.egg-info',
  '.egg',
  '.mo',
  '.pot',
  '.setup',
  '.paket.template',
];

/**
 * Check if a directory should be ignored based on folder name
 */
export function shouldIgnoreDir(folderName: string): boolean {
  return IGNORED_FOLDER_NAMES.includes(folderName);
}

/**
 * Check if a file should be ignored based on file name, extension, and path
 * Optimized order: extension (fastest) → file name → path (most expensive)
 * @param filePath - Full file path (e.g., ".yarn/x/y/z.js")
 */
export function shouldIgnoreFile(filePath: string): boolean {
  // Extract file name from path (do this once)
  const fileName = filePath.split('/').pop() || '';

  // 1. Check file extension first (fastest - simple string operations)
  for (const ext of IGNORED_FILE_EXTENSIONS) {
    if (fileName.endsWith(ext)) {
      return true;
    }
  }

  // 2. Check if file name is ignored (fast - single array lookup)
  if (IGNORED_FILE_NAMES.includes(fileName)) {
    return true;
  }

  // 3. Check if file is in an ignored directory (most expensive - path traversal)
  const pathParts = filePath.split('/');
  for (const part of pathParts) {
    if (IGNORED_FOLDER_NAMES.includes(part)) {
      return true;
    }
  }

  return false;
}
