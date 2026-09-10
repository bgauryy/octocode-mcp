import { describe, expect, it } from 'vitest';

import { buildFilesNextMap } from '../../../../../src/tools/ast_search/filesystem/filesNext.js';
import type { AstFilesEntry } from '@octocodeai/octocode-core/types';

const file = (path: string): AstFilesEntry => ({ path, type: 'file' });
const dir = (path: string): AstFilesEntry => ({
  path,
  type: 'directory',
});

describe('buildFilesNextMap', () => {
  it('points fetch at the first file with its absolute path, meta-free', () => {
    const map = buildFilesNextMap([
      dir('/repo/src'),
      file('/repo/src/a.ts'),
      file('/repo/src/b.ts'),
    ]);

    expect(map?.fetch?.tool).toBe('localFetch');
    expect(map?.fetch?.query).toEqual({
      path: '/repo/src/a.ts',
      minify: 'none',
    });
    expect(map?.fetch?.confidence).toBe('exact');
    // No auto-filled per-call metadata leaks into a from-scratch hint query.
    for (const k of ['id', 'researchGoal', 'mainResearchGoal', 'reasoning']) {
      expect(map?.fetch?.query).not.toHaveProperty(k);
    }
    expect(map).not.toHaveProperty('viewStructure');
  });

  it('falls back to a viewFilesystemTree hint when the page is all directories', () => {
    const map = buildFilesNextMap([dir('/repo/a'), dir('/repo/b')]);

    expect(map?.viewStructure?.tool).toBe('astSearch');
    expect(map?.viewStructure?.query).toEqual({
      operation: 'tree',
      treeKind: 'filesystem',
      path: '/repo/a',
    });
    expect(map).not.toHaveProperty('fetch');
  });

  it('returns undefined when there is nothing to point at', () => {
    expect(buildFilesNextMap([])).toBeUndefined();
  });
});
