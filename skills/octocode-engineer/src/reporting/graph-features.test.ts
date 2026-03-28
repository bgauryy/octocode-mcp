import { describe, expect, it } from 'vitest';

import {
  collectFocusNeighborhood,
  collapseToFolderDepth,
  generateMermaidGraph,
} from './writer.js';
import type { DependencyState, DependencySummary } from '../types/index.js';

function makeDependencyState(
  outgoing: Record<string, string[]>,
  incoming: Record<string, string[]>
): DependencyState {
  return {
    outgoing: new Map(
      Object.entries(outgoing).map(([k, v]) => [k, new Set(v)])
    ),
    incoming: new Map(
      Object.entries(incoming).map(([k, v]) => [k, new Set(v)])
    ),
    files: new Set([...Object.keys(outgoing), ...Object.keys(incoming)]),
    externalImports: new Map(),
    packageJsonDeps: new Map(),
    packageJsonDevDeps: new Map(),
  } as unknown as DependencyState;
}

function makeMinimalSummary(): DependencySummary {
  return {
    totalModules: 0,
    totalEdges: 0,
    rootsCount: 0,
    leavesCount: 0,
    cycles: [],
    criticalModules: [],
    criticalPaths: [],
    outgoingTop: [],
    inboundTop: [],
    testOnlyModules: [],
    unresolvedEdgeCount: 0,
  } as unknown as DependencySummary;
}

describe('collectFocusNeighborhood', () => {
  it('returns the focus module and its direct neighbors at depth 1', () => {
    const state = makeDependencyState(
      {
        'src/a.ts': ['src/b.ts', 'src/c.ts'],
        'src/b.ts': [],
        'src/c.ts': ['src/d.ts'],
        'src/d.ts': [],
      },
      {
        'src/b.ts': ['src/a.ts'],
        'src/c.ts': ['src/a.ts'],
        'src/d.ts': ['src/c.ts'],
      }
    );

    const result = collectFocusNeighborhood('src/a.ts', 1, state);
    expect(result.has('src/a.ts')).toBe(true);
    expect(result.has('src/b.ts')).toBe(true);
    expect(result.has('src/c.ts')).toBe(true);
    expect(result.has('src/d.ts')).toBe(false);
  });

  it('returns friends-of-friends at depth 2', () => {
    const state = makeDependencyState(
      {
        'src/a.ts': ['src/b.ts'],
        'src/b.ts': ['src/c.ts'],
        'src/c.ts': [],
      },
      {
        'src/b.ts': ['src/a.ts'],
        'src/c.ts': ['src/b.ts'],
      }
    );

    const result = collectFocusNeighborhood('src/a.ts', 2, state);
    expect(result.has('src/a.ts')).toBe(true);
    expect(result.has('src/b.ts')).toBe(true);
    expect(result.has('src/c.ts')).toBe(true);
  });

  it('returns empty set for non-existent focus module', () => {
    const state = makeDependencyState(
      { 'src/a.ts': ['src/b.ts'] },
      { 'src/b.ts': ['src/a.ts'] }
    );

    const result = collectFocusNeighborhood('nonexistent.ts', 1, state);
    expect(result.size).toBe(0);
  });

  it('matches partial path via endsWith', () => {
    const state = makeDependencyState(
      { 'packages/mcp/src/session.ts': ['packages/mcp/src/utils.ts'] },
      { 'packages/mcp/src/utils.ts': ['packages/mcp/src/session.ts'] }
    );

    const result = collectFocusNeighborhood('src/session.ts', 1, state);
    expect(result.has('packages/mcp/src/session.ts')).toBe(true);
    expect(result.has('packages/mcp/src/utils.ts')).toBe(true);
  });

  it('includes incoming neighbors (dependents)', () => {
    const state = makeDependencyState(
      {
        'src/a.ts': [],
        'src/caller.ts': ['src/a.ts'],
      },
      {
        'src/a.ts': ['src/caller.ts'],
      }
    );

    const result = collectFocusNeighborhood('src/a.ts', 1, state);
    expect(result.has('src/caller.ts')).toBe(true);
  });

  it('handles cycles without infinite loop', () => {
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

    const result = collectFocusNeighborhood('src/a.ts', 5, state);
    expect(result.size).toBe(2);
  });

  it('depth 0 returns only the focus module itself', () => {
    const state = makeDependencyState(
      { 'src/a.ts': ['src/b.ts'] },
      { 'src/b.ts': ['src/a.ts'] }
    );

    const result = collectFocusNeighborhood('src/a.ts', 0, state);
    expect(result.size).toBe(1);
    expect(result.has('src/a.ts')).toBe(true);
  });
});

describe('collapseToFolderDepth', () => {
  it('collapses files to folder depth 1', () => {
    const state = makeDependencyState(
      {
        'src/a.ts': ['lib/b.ts'],
        'lib/b.ts': [],
      },
      { 'lib/b.ts': ['src/a.ts'] }
    );
    const moduleSet = new Set(['src/a.ts', 'lib/b.ts']);

    const { nodes, edges } = collapseToFolderDepth(moduleSet, state, 1);
    expect(nodes.has('src')).toBe(true);
    expect(nodes.has('lib')).toBe(true);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({ from: 'src', to: 'lib', weight: 1 });
  });

  it('removes self-edges (same folder)', () => {
    const state = makeDependencyState(
      {
        'src/a.ts': ['src/b.ts'],
        'src/b.ts': [],
      },
      { 'src/b.ts': ['src/a.ts'] }
    );
    const moduleSet = new Set(['src/a.ts', 'src/b.ts']);

    const { edges } = collapseToFolderDepth(moduleSet, state, 1);
    expect(edges).toHaveLength(0);
  });

  it('accumulates edge weights for multiple files in same folder pair', () => {
    const state = makeDependencyState(
      {
        'src/a.ts': ['lib/x.ts'],
        'src/b.ts': ['lib/y.ts'],
        'lib/x.ts': [],
        'lib/y.ts': [],
      },
      {
        'lib/x.ts': ['src/a.ts'],
        'lib/y.ts': ['src/b.ts'],
      }
    );
    const moduleSet = new Set([
      'src/a.ts',
      'src/b.ts',
      'lib/x.ts',
      'lib/y.ts',
    ]);

    const { edges } = collapseToFolderDepth(moduleSet, state, 1);
    const srcToLib = edges.find(e => e.from === 'src' && e.to === 'lib');
    expect(srcToLib).toBeDefined();
    expect(srcToLib!.weight).toBe(2);
  });

  it('collapses to depth 2 (two path segments)', () => {
    const state = makeDependencyState(
      {
        'packages/mcp/src/a.ts': ['packages/cli/src/b.ts'],
        'packages/cli/src/b.ts': [],
      },
      { 'packages/cli/src/b.ts': ['packages/mcp/src/a.ts'] }
    );
    const moduleSet = new Set([
      'packages/mcp/src/a.ts',
      'packages/cli/src/b.ts',
    ]);

    const { nodes, edges } = collapseToFolderDepth(moduleSet, state, 2);
    expect(nodes.has('packages/mcp')).toBe(true);
    expect(nodes.has('packages/cli')).toBe(true);
    expect(edges).toHaveLength(1);
  });
});

describe('generateMermaidGraph with renderOpts', () => {
  it('includes focus comment when focus is specified', () => {
    const state = makeDependencyState(
      { 'src/a.ts': ['src/b.ts'] },
      { 'src/b.ts': ['src/a.ts'] }
    );

    const result = generateMermaidGraph(
      state,
      makeMinimalSummary(),
      new Map(),
      { focus: 'src/a.ts', focusDepth: 1 }
    );

    expect(result).toContain('Focus: src/a.ts');
  });

  it('produces collapsed output when collapse is specified', () => {
    const state = makeDependencyState(
      { 'src/a.ts': ['lib/b.ts'], 'lib/b.ts': [] },
      { 'lib/b.ts': ['src/a.ts'] }
    );

    const summary = {
      ...makeMinimalSummary(),
      outgoingTop: [{ file: 'src/a.ts' }],
      inboundTop: [{ file: 'lib/b.ts' }],
    } as unknown as DependencySummary;

    const result = generateMermaidGraph(state, summary, new Map(), {
      collapse: 1,
    });

    expect(result).toContain('Collapsed to folder depth');
  });

  it('renders standard graph when no renderOpts', () => {
    const state = makeDependencyState(
      { 'src/a.ts': [] },
      {}
    );
    const summary = {
      ...makeMinimalSummary(),
      outgoingTop: [{ file: 'src/a.ts' }],
    } as unknown as DependencySummary;

    const result = generateMermaidGraph(state, summary, new Map());
    expect(result).toContain('graph LR');
    expect(result).not.toContain('Collapsed');
    expect(result).not.toContain('Focus:');
  });
});
