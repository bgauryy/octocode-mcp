import { dependencyProfileToRecord } from './dependencies.js';
import { isTestFile } from './utils.js';

import type {
  AnalysisOptions,
  CriticalPath,
  Cycle,
  DependencyState,
  DependencySummary,
  FileCriticality,
  ModuleCount,
  WalkResult,
} from './types.js';

export function buildDependencySummary(
  dependencyState: DependencyState,
  fileCriticalityByPath: Map<string, FileCriticality>,
  options: AnalysisOptions
): DependencySummary {
  const allFiles = [...dependencyState.files].sort();
  let totalEdges = 0;
  let unresolvedEdgeCount = 0;
  const outgoingCounts: ModuleCount[] = [];
  const inboundCounts: ModuleCount[] = [];

  for (const file of allFiles) {
    totalEdges += dependencyState.outgoing.get(file)?.size || 0;
    const record = dependencyProfileToRecord(file, dependencyState);
    const crit = fileCriticalityByPath.get(file) || { score: 1 };
    outgoingCounts.push({
      file,
      count: record.outboundCount,
      score: crit.score,
    });
    inboundCounts.push({ file, count: record.inboundCount, score: crit.score });
    unresolvedEdgeCount += record.unresolvedDependencyCount;
  }

  const roots = allFiles.filter(file => {
    const inCount = (dependencyState.incoming.get(file) || new Set()).size;
    return inCount === 0;
  });

  const leaves = allFiles.filter(file => {
    const outCount = (dependencyState.outgoing.get(file) || new Set()).size;
    return outCount === 0;
  });

  const testOnlyModules = allFiles
    .filter(file => !isTestFile(file))
    .filter(file => {
      const prodIn = dependencyState.incomingFromProduction.get(file);
      const testIn = dependencyState.incomingFromTests.get(file);
      return (!prodIn || prodIn.size === 0) && testIn && testIn.size > 0;
    })
    .map(file => ({
      ...dependencyProfileToRecord(file, dependencyState),
    }))
    .sort((a, b) => a.file.localeCompare(b.file));

  const criticalNodes = allFiles
    .map(file => ({
      ...dependencyProfileToRecord(file, dependencyState),
      ...(fileCriticalityByPath.get(file) || ({} as Partial<FileCriticality>)),
    }))
    .filter(
      node =>
        (node.score || 0) > 12 ||
        node.outboundCount > 5 ||
        node.inboundCount > 8
    )
    .sort(
      (a, b) =>
        (b.score || 0) +
        b.inboundCount * 0.8 +
        b.outboundCount * 0.4 -
        ((a.score || 0) + a.inboundCount * 0.8 + a.outboundCount * 0.4)
    )
    .slice(0, 150)
    .map(node => ({
      ...node,
      score: Math.round(node.score || 0),
      riskBand:
        (node.score || 0) >= 60
          ? 'high'
          : (node.score || 0) >= 30
            ? 'medium'
            : 'low',
    }));

  const cycles = computeDependencyCycles(dependencyState);
  const criticalPaths = computeDependencyCriticalPaths(
    dependencyState,
    fileCriticalityByPath,
    options
  );

  return {
    totalModules: allFiles.length,
    totalEdges,
    unresolvedEdgeCount,
    externalDependencyFiles: [...dependencyState.externalCounts.keys()].length,
    rootsCount: roots.length,
    leavesCount: leaves.length,
    roots: roots.slice(0, 20),
    leaves: leaves.slice(0, 20),
    criticalModules: criticalNodes.slice(
      0,
      20
    ) as import('./types.js').CriticalModule[],
    testOnlyModules: testOnlyModules.slice(0, 50),
    unresolvedSample:
      unresolvedEdgeCount > 0
        ? [...dependencyState.unresolvedCounts.keys()].slice(0, 40)
        : [],
    outgoingTop: outgoingCounts.sort((a, b) => b.count - a.count).slice(0, 20),
    inboundTop: inboundCounts.sort((a, b) => b.count - a.count).slice(0, 20),
    cycles: cycles.slice(0, 20),
    criticalPaths: criticalPaths.slice(0, Math.max(1, options.deepLinkTopN)),
  };
}

export function computeDependencyCycles(
  dependencyState: DependencyState
): Cycle[] {
  const cycles: Cycle[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const activeStack: string[] = [];
  const seenCycles = new Set<string>();

  const canonicalizeCycle = (cyclePath: string[]): string => {
    const rotated = [...cyclePath];
    let best = rotated.slice();
    for (let i = 1; i < rotated.length; i++) {
      const candidate = [...rotated.slice(i), ...rotated.slice(0, i)];
      if (candidate.join(' => ') < best.join(' => ')) {
        best = candidate;
      }
    }
    return best.join(' => ');
  };

  const visit = (node: string): void => {
    if (visited.has(node)) return;
    if (visiting.has(node)) return;

    visiting.add(node);
    activeStack.push(node);

    const outgoing = dependencyState.outgoing.get(node) || new Set();
    for (const dep of outgoing) {
      const idx = activeStack.indexOf(dep);
      if (idx !== -1) {
        const rawCycle = [...activeStack.slice(idx), dep];
        const normalized = canonicalizeCycle(rawCycle);
        if (!seenCycles.has(normalized)) {
          seenCycles.add(normalized);
          cycles.push({
            path: rawCycle,
            nodeCount: rawCycle.length - 1,
          });
        }
        continue;
      }

      if (dependencyState.files.has(dep)) {
        visit(dep);
      }
    }

    activeStack.pop();
    visiting.delete(node);
    visited.add(node);
  };

  for (const node of dependencyState.files) {
    visit(node);
  }

  return cycles.sort((a, b) => b.nodeCount - a.nodeCount);
}

export function computeDependencyCriticalPaths(
  dependencyState: DependencyState,
  fileCriticalityByPath: Map<string, FileCriticality>,
  options: AnalysisOptions
): CriticalPath[] {
  const memo = new Map<string, WalkResult>();
  const visiting = new Set<string>();

  const nodeScore = (file: string): number => {
    const entry = fileCriticalityByPath.get(file);
    return entry ? entry.score : 1;
  };

  const walk = (file: string): WalkResult => {
    if (memo.has(file)) return memo.get(file)!;
    if (visiting.has(file)) {
      return {
        path: [file],
        score: nodeScore(file) * 0.5,
        containsCycle: true,
      };
    }

    visiting.add(file);
    const edges = dependencyState.outgoing.get(file) || new Set();
    let bestPath: WalkResult = {
      path: [file],
      score: nodeScore(file),
      containsCycle: false,
    };

    for (const dep of edges) {
      if (!dependencyState.files.has(dep)) continue;
      const candidate = walk(dep);
      const candidateScore = nodeScore(file) + candidate.score;
      if (
        candidateScore > bestPath.score ||
        (candidateScore === bestPath.score &&
          candidate.path.length > bestPath.path.length)
      ) {
        bestPath = {
          path: [file, ...candidate.path],
          score: candidateScore,
          containsCycle: candidate.containsCycle,
        };
      }
    }

    visiting.delete(file);
    memo.set(file, bestPath);
    return bestPath;
  };

  const all: CriticalPath[] = [];
  for (const file of dependencyState.files) {
    const pathEntry = walk(file);
    all.push({
      start: file,
      path: pathEntry.path,
      score: Math.round(pathEntry.score),
      length: pathEntry.path.length,
      containsCycle: pathEntry.containsCycle,
    });
  }

  return all
    .filter(item => item.length > 1)
    .sort((a, b) => {
      const byScore = b.score - a.score;
      if (byScore !== 0) return byScore;
      return b.length - a.length;
    })
    .slice(0, Math.max(1, options.deepLinkTopN));
}
