import type { ToolResponse } from './types.js';

export function countToolResponseResults(response: ToolResponse): number {
  const filesCount = Array.isArray(response.files) ? response.files.length : 0;
  const repositoriesCount = Array.isArray(response.repositories)
    ? response.repositories.length
    : 0;
  const packagesCount = Array.isArray(response.packages)
    ? response.packages.length
    : 0;
  const locationsCount = Array.isArray(response.locations)
    ? response.locations.length
    : 0;

  const collectionCount =
    filesCount + repositoriesCount + packagesCount + locationsCount;

  if (collectionCount > 0) {
    return collectionCount;
  }

  return typeof response.resultCount === 'number' ? response.resultCount : 0;
}
