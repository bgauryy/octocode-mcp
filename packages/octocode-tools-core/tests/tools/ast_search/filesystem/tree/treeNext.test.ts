import { describe, expect, it } from 'vitest';

import { buildTreeNextMap } from '../../../../../src/tools/ast_search/filesystem/treeNext.js';
import type { DirectoryEntry } from '../../../../../src/tools/ast_search/filesystem/filters.js';

const file = (path: string): DirectoryEntry => ({
  name: path.split('/').pop() ?? path,
  path,
  type: 'file',
});
const dir = (path: string): DirectoryEntry => ({
  name: path.split('/').pop() ?? path,
  path,
  type: 'directory',
});

describe('buildTreeNextMap', () => {
  it('emits fetch (first file) and viewDeeper (first dir), meta-free', () => {
    const map = buildTreeNextMap([
      file('/repo/src/index.ts'),
      dir('/repo/src/utils'),
    ]);

    expect(map?.fetch?.tool).toBe('localFetch');
    expect(map?.fetch?.query).toEqual({
      path: '/repo/src/index.ts',
      minify: 'standard',
    });
    expect(map?.viewDeeper?.tool).toBe('astSearch');
    expect(map?.viewDeeper?.query).toEqual({
      operation: 'tree',
      treeKind: 'filesystem',
      path: '/repo/src/utils',
    });
    for (const k of ['id', 'researchGoal', 'mainResearchGoal', 'reasoning']) {
      expect(map?.fetch?.query).not.toHaveProperty(k);
      expect(map?.viewDeeper?.query).not.toHaveProperty(k);
    }
  });

  it('emits only fetch when there are no subdirectories', () => {
    const map = buildTreeNextMap([file('/repo/a.ts')]);
    expect(map?.fetch).toBeDefined();
    expect(map).not.toHaveProperty('viewDeeper');
  });

  it('emits only viewDeeper when there are no files', () => {
    const map = buildTreeNextMap([dir('/repo/pkgs')]);
    expect(map?.viewDeeper).toBeDefined();
    expect(map).not.toHaveProperty('fetch');
  });

  it('returns undefined for an empty listing', () => {
    expect(buildTreeNextMap([])).toBeUndefined();
  });
});
