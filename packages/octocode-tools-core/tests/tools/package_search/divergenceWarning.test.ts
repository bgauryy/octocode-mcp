import { describe, expect, it } from 'vitest';
import { formatPackageData } from '../../../src/tools/package_search/npm.js';

describe('artifact metadata evidence boundary', () => {
  it('preserves published version and source without inventing a repository tag or success hint', () => {
    const data = formatPackageData({
      name: 'typescript',
      version: '7.0.2',
      npmUrl: 'https://www.npmjs.com/package/typescript',
      repoUrl: 'https://github.com/microsoft/TypeScript',
      weeklyDownloads: 42,
    });
    expect(data).toMatchObject({
      type: 'npm',
      name: 'typescript',
      version: '7.0.2',
      repository: 'https://github.com/microsoft/TypeScript',
    });
    for (const field of ['tag', 'warnings', 'next', 'downloads'])
      expect(data).not.toHaveProperty(field);
  });
  it('omits unknown versions and absent repositories', () => {
    const data = formatPackageData({
      name: 'x',
      version: 'unknown',
      npmUrl: 'https://www.npmjs.com/package/x',
    });
    expect(data).not.toHaveProperty('version');
    expect(data).not.toHaveProperty('repository');
  });
});
