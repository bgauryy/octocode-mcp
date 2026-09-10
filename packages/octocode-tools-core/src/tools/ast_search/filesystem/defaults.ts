const DEFAULT_EXCLUDE_DIRS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  'coverage',
  'target',
  '.next',
  '.cache',
];

/** Explicit empty exclusions retain every directory; an explicit root remains searchable. */
export function computeEffectiveExcludeDirs(
  searchPath: string,
  excludeDir: string[] | undefined
): string[] {
  const pathParts = new Set(searchPath.split('/').filter(Boolean));
  return (excludeDir ?? DEFAULT_EXCLUDE_DIRS).filter(
    dir => !pathParts.has(dir)
  );
}
