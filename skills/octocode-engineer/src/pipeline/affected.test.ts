import { describe, expect, it, vi, beforeEach } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { resolveAffectedFiles } from './affected.js';
import type { DependencyState } from '../types/index.js';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

function makeDependencyState(
  outgoing: Record<string, string[]>,
  incoming: Record<string, string[]>
): DependencyState {
  return {
    outgoing: new Map(Object.entries(outgoing).map(([k, v]) => [k, new Set(v)])),
    incoming: new Map(Object.entries(incoming).map(([k, v]) => [k, new Set(v)])),
    files: new Set([...Object.keys(outgoing), ...Object.keys(incoming)]),
    externalImports: new Map(),
    packageJsonDeps: new Map(),
    packageJsonDevDeps: new Map(),
  } as unknown as DependencyState;
}

describe('resolveAffectedFiles', () => {
  beforeEach(() => {
    vi.mocked(execSync).mockReset();
  });

  it('returns empty when git returns no changed files', () => {
    vi.mocked(execSync).mockReturnValue('');
    const state = makeDependencyState({}, {});
    expect(resolveAffectedFiles('/repo', 'HEAD', state)).toEqual([]);
  });

  it('returns changed files and their transitive dependents as relative paths', () => {
    vi.mocked(execSync).mockReturnValue('src/a.ts\nsrc/b.ts\n');
    const state = makeDependencyState(
      { 'src/a.ts': ['src/c.ts'], 'src/c.ts': [] },
      {
        'src/a.ts': ['src/d.ts'],
        'src/d.ts': ['src/e.ts'],
      }
    );

    const result = resolveAffectedFiles('/repo', 'HEAD', state);
    expect(result).toContain('src/a.ts');
    expect(result).toContain('src/b.ts');
    expect(result).toContain('src/d.ts');
    expect(result).toContain('src/e.ts');
    for (const p of result) {
      expect(path.isAbsolute(p)).toBe(false);
    }
  });

  it('returns empty when git command fails', () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('git failed');
    });
    const state = makeDependencyState({}, {});
    expect(resolveAffectedFiles('/repo', 'main', state)).toEqual([]);
  });

  it('filters non-ts/js files from git output', () => {
    vi.mocked(execSync).mockReturnValue('README.md\nsrc/a.ts\npackage.json\n');
    const state = makeDependencyState({}, {});

    const result = resolveAffectedFiles('/repo', 'HEAD', state);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('src/a.ts');
  });

  it('passes the revision argument to git diff', () => {
    vi.mocked(execSync).mockReturnValue('');
    const state = makeDependencyState({}, {});

    resolveAffectedFiles('/repo', 'main~5', state);

    expect(execSync).toHaveBeenCalledWith(
      'git diff --name-only --diff-filter=ACMRT main~5',
      expect.objectContaining({ cwd: '/repo' })
    );
  });

  it('returns only changed file when it has no dependents', () => {
    vi.mocked(execSync).mockReturnValue('src/isolated.ts\n');
    const state = makeDependencyState(
      { 'src/other.ts': ['src/isolated.ts'] },
      {}
    );

    const result = resolveAffectedFiles('/repo', 'HEAD', state);
    expect(result).toEqual(['src/isolated.ts']);
  });

  it('handles cycles in dependency graph without infinite loop', () => {
    vi.mocked(execSync).mockReturnValue('src/a.ts\n');
    const state = makeDependencyState(
      {
        'src/a.ts': ['src/b.ts'],
        'src/b.ts': ['src/a.ts'],
      },
      {
        'src/a.ts': ['src/b.ts'],
        'src/b.ts': ['src/a.ts'],
      }
    );

    const result = resolveAffectedFiles('/repo', 'HEAD', state);
    expect(result).toContain('src/a.ts');
    expect(result).toContain('src/b.ts');
    expect(result.length).toBe(2);
  });

  it('follows deep transitive chains (A→B→C→D)', () => {
    vi.mocked(execSync).mockReturnValue('src/a.ts\n');
    const state = makeDependencyState(
      {},
      {
        'src/a.ts': ['src/b.ts'],
        'src/b.ts': ['src/c.ts'],
        'src/c.ts': ['src/d.ts'],
      }
    );

    const result = resolveAffectedFiles('/repo', 'HEAD', state);
    expect(result).toHaveLength(4);
    expect(result).toContain('src/a.ts');
    expect(result).toContain('src/b.ts');
    expect(result).toContain('src/c.ts');
    expect(result).toContain('src/d.ts');
  });

  it('accepts .jsx, .tsx, .js, .mjs, .cjs extensions', () => {
    vi.mocked(execSync).mockReturnValue(
      'src/a.ts\nsrc/b.tsx\nsrc/c.js\nsrc/d.jsx\nsrc/e.mjs\nsrc/f.cjs\ndata.csv\n'
    );
    const state = makeDependencyState({}, {});

    const result = resolveAffectedFiles('/repo', 'HEAD', state);
    expect(result.length).toBeGreaterThanOrEqual(4);
    expect(result.some(r => r.endsWith('.ts'))).toBe(true);
    expect(result.some(r => r.endsWith('.tsx'))).toBe(true);
    expect(result.some(r => r.endsWith('.js'))).toBe(true);
    expect(result.every(r => !r.endsWith('.csv'))).toBe(true);
  });
});
