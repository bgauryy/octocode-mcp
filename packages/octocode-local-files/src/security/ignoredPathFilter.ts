/**
 * Path and file filtering for security and relevance
 * Prevents access to sensitive files and commonly ignored directories
 */

/**
 * Directories and paths that should be ignored
 * These are typically build artifacts, dependencies, and version control
 */
const IGNORED_PATH_PATTERNS: RegExp[] = [
  // Version control
  /^\.git$/,
  /^\.git\//,
  /^\.svn$/,
  /^\.svn\//,
  /^\.hg$/,
  /^\.hg\//,

  // Dependencies and modules
  /^node_modules$/,
  /^node_modules\//,
  /\/node_modules$/,
  /\/node_modules\//,
  /^bower_components$/,
  /^bower_components\//,
  /^vendor$/,
  /^vendor\//,
  /^packages\/.*\/node_modules$/,
  /^__pycache__$/,
  /^__pycache__\//,
  /\.egg-info$/,
  /\.egg-info\//,

  // Build outputs (verbose/large)
  /^dist$/,
  /^dist\//,
  /^build$/,
  /^build\//,
  /^out$/,
  /^out\//,
  /^target$/,
  /^target\//,
  /^\.next$/,
  /^\.next\//,
  /^\.nuxt$/,
  /^\.nuxt\//,
  /^\.output$/,
  /^\.output\//,

  // IDE and editor directories
  /^\.vscode$/,
  /^\.vscode\//,
  /^\.idea$/,
  /^\.idea\//,
  /^\.vs$/,
  /^\.vs\//,
  /^\.eclipse$/,
  /^\.eclipse\//,

  // Cache and temporary directories
  /^\.cache$/,
  /^\.cache\//,
  /^\.tmp$/,
  /^\.tmp\//,
  /^tmp$/,
  /^tmp\//,
  /^temp$/,
  /^temp\//,
  /^\.temp$/,
  /^\.temp\//,
  /^coverage$/,
  /^coverage\//,
  /^\.nyc_output$/,
  /^\.nyc_output\//,

  // OS-specific
  /^\.DS_Store$/,
  /^\.Spotlight-V100$/,
  /^\.Trashes$/,
  /^Thumbs\.db$/,
  /^desktop\.ini$/,
];

/**
 * Files that should be ignored for security and relevance reasons
 */
const IGNORED_FILE_PATTERNS: RegExp[] = [
  // Environment and configuration files with secrets (SENSITIVE)
  /^\.env$/,
  /^\.env\.local$/,
  /^\.env\.development$/,
  /^\.env\.production$/,
  /^\.env\.test$/,
  /^\.env\..+$/,
  /\.env$/,
  /\.env\.local$/,
  /\.env\..+$/,

  // Lock files (verbose/large, low signal)
  /^package-lock\.json$/,
  /^yarn\.lock$/,
  /^pnpm-lock\.yaml$/,
  /^Gemfile\.lock$/,
  /^Cargo\.lock$/,
  /^poetry\.lock$/,
  /^composer\.lock$/,
  /^Pipfile\.lock$/,

  // Credentials and keys (SENSITIVE)
  /^\.npmrc$/,
  /^\.pypirc$/,
  /^\.netrc$/,
  /^\.dockercfg$/,
  /^\.docker\/config\.json$/,
  /^credentials$/,
  /^\.credentials$/,
  /^\.aws\/credentials$/,
  /^\.ssh\/.*$/,
  /\.pem$/,
  /\.key$/,
  /\.keystore$/,
  /\.p12$/,
  /\.pfx$/,
  /\.jks$/,
  /private.*\.key$/,
  /.*_rsa$/,
  /.*_dsa$/,
  /.*_ecdsa$/,
  /.*_ed25519$/,

  // Database files (verbose/large)
  /\.db$/,
  /\.sqlite$/,
  /\.sqlite3$/,
  /\.db3$/,

  // Binary and compiled files (verbose/large)
  /\.exe$/,
  /\.dll$/,
  /\.so$/,
  /\.dylib$/,
  /\.bin$/,
  /\.o$/,
  /\.obj$/,
  /\.pyc$/,
  /\.pyo$/,
  /\.class$/,
  /\.jar$/,
  /\.war$/,
  /\.ear$/,

  // OS-specific files
  /^\.DS_Store$/,
  /^Thumbs\.db$/,
  /^desktop\.ini$/,

  // Git internal files
  /^\.gitignore$/,
  /^\.gitattributes$/,
  /^\.gitmodules$/,

  // IDE temporary files
  /\.swp$/,
  /\.swo$/,
  /~$/,
  /\.bak$/,
];

/**
 * Checks if a path should be ignored
 * @param pathToCheck - The path to check (relative or absolute)
 * @returns true if the path should be ignored
 */
export function shouldIgnorePath(pathToCheck: string): boolean {
  if (!pathToCheck || pathToCheck.trim() === '') {
    return true;
  }

  // Normalize path separators
  const normalizedPath = pathToCheck.replace(/\\/g, '/');

  // Extract the last component for directory name checking
  const pathParts = normalizedPath.split('/');

  // Check each part of the path
  for (const part of pathParts) {
    if (IGNORED_PATH_PATTERNS.some((pattern) => pattern.test(part))) {
      return true;
    }
  }

  // Check the full path
  if (IGNORED_PATH_PATTERNS.some((pattern) => pattern.test(normalizedPath))) {
    return true;
  }

  return false;
}

/**
 * Checks if a file should be ignored
 * @param fileName - The file name or full path to check
 * @returns true if the file should be ignored
 */
export function shouldIgnoreFile(fileName: string): boolean {
  if (!fileName || fileName.trim() === '') {
    return true;
  }

  // Normalize path separators
  const normalizedPath = fileName.replace(/\\/g, '/');

  // Extract just the filename
  const fileNameOnly = normalizedPath.split('/').pop() || '';

  // Check against file patterns
  if (IGNORED_FILE_PATTERNS.some((pattern) => pattern.test(fileNameOnly))) {
    return true;
  }

  // Check against full path for files in specific directories (e.g., .ssh/)
  if (IGNORED_FILE_PATTERNS.some((pattern) => pattern.test(normalizedPath))) {
    return true;
  }

  return false;
}

/**
 * Combined check for both path and file filtering
 * @param fullPath - The full path to check
 * @returns true if the path or file should be ignored
 */
export function shouldIgnore(fullPath: string): boolean {
  return shouldIgnorePath(fullPath) || shouldIgnoreFile(fullPath);
}

/**
 * Filters an array of paths, removing ignored ones
 * @param paths - Array of paths to filter
 * @returns Filtered array with ignored paths removed
 */
export function filterPaths(paths: string[]): string[] {
  return paths.filter((p) => !shouldIgnore(p));
}
