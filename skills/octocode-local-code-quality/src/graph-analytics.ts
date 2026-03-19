import type {
  Chokepoint,
  DependencyState,
  DependencySummary,
  FileCriticality,
  FileEntry,
  Finding,
  PackageGraphNode,
  PackageGraphSummary,
  PackageHotspot,
  SccCluster,
} from './types.js';

type FindingDraft = Omit<Finding, 'id'>;

export interface GraphAnalyticsSummary {
  sccClusters: SccCluster[];
  chokepoints: Chokepoint[];
  packageGraphSummary: PackageGraphSummary;
  articulationPoints: string[];
  bridgeEdges: Array<{ from: string; to: string }>;
}

export function packageKeyForFile(file: string): string {
  const normalized = file.replace(/\\/g, '/').replace(/^\.?\//, '');
  const pkgMatch = normalized.match(/^packages\/([^/]+)/);
  if (pkgMatch) return `packages/${pkgMatch[1]}`;
  const [top] = normalized.split('/');
  return top || '<root>';
}

export function computeSccClusters(dependencyState: DependencyState): SccCluster[] {
  const nodes = [...dependencyState.files].sort();
  const indexMap = new Map<string, number>();
  const lowLink = new Map<string, number>();
  const stack: string[] = [];
  const inStack = new Set<string>();
  let index = 0;
  const clusters: SccCluster[] = [];

  const strongConnect = (node: string): void => {
    indexMap.set(node, index);
    lowLink.set(node, index);
    index += 1;
    stack.push(node);
    inStack.add(node);

    const outgoing = dependencyState.outgoing.get(node) || new Set<string>();
    for (const next of outgoing) {
      if (!dependencyState.files.has(next)) continue;
      if (!indexMap.has(next)) {
        strongConnect(next);
        lowLink.set(node, Math.min(lowLink.get(node)!, lowLink.get(next)!));
      } else if (inStack.has(next)) {
        lowLink.set(node, Math.min(lowLink.get(node)!, indexMap.get(next)!));
      }
    }

    if (lowLink.get(node) !== indexMap.get(node)) return;

    const component: string[] = [];
    while (stack.length > 0) {
      const current = stack.pop()!;
      inStack.delete(current);
      component.push(current);
      if (current === node) break;
    }

    const hasSelfLoop = (dependencyState.outgoing.get(node) || new Set()).has(node);
    if (component.length <= 1 && !hasSelfLoop) return;

    const componentSet = new Set(component);
    let edgeCount = 0;
    let entryEdges = 0;
    let exitEdges = 0;
    for (const file of component) {
      for (const dep of dependencyState.outgoing.get(file) || new Set<string>()) {
        if (!dependencyState.files.has(dep)) continue;
        if (componentSet.has(dep)) edgeCount += 1;
        else exitEdges += 1;
      }
      for (const incoming of dependencyState.incoming.get(file) || new Set<string>()) {
        if (!componentSet.has(incoming)) entryEdges += 1;
      }
    }

    const hubFiles = [...component]
      .sort((a, b) => {
        const aScore = ((dependencyState.incoming.get(a) || new Set()).size * 2) + (dependencyState.outgoing.get(a) || new Set()).size;
        const bScore = ((dependencyState.incoming.get(b) || new Set()).size * 2) + (dependencyState.outgoing.get(b) || new Set()).size;
        return bScore - aScore;
      })
      .slice(0, 3);

    clusters.push({
      id: `scc-${clusters.length + 1}`,
      files: component.sort(),
      nodeCount: component.length,
      edgeCount,
      entryEdges,
      exitEdges,
      hubFiles,
    });
  };

  for (const node of nodes) {
    if (!indexMap.has(node)) strongConnect(node);
  }

  return clusters.sort((a, b) => b.nodeCount - a.nodeCount || b.edgeCount - a.edgeCount);
}

export function computePackageGraphSummary(dependencyState: DependencyState): PackageGraphSummary {
  const nodeMap = new Map<string, PackageGraphNode>();
  const edgeMap = new Map<string, number>();

  for (const file of dependencyState.files) {
    const pkg = packageKeyForFile(file);
    if (!nodeMap.has(pkg)) nodeMap.set(pkg, { package: pkg, inbound: 0, outbound: 0, internalFiles: 0 });
    nodeMap.get(pkg)!.internalFiles += 1;
  }

  for (const [from, outgoing] of dependencyState.outgoing.entries()) {
    const fromPkg = packageKeyForFile(from);
    for (const to of outgoing) {
      if (!dependencyState.files.has(to)) continue;
      const toPkg = packageKeyForFile(to);
      if (fromPkg === toPkg) continue;
      const key = `${fromPkg}=>${toPkg}`;
      edgeMap.set(key, (edgeMap.get(key) || 0) + 1);
      nodeMap.get(fromPkg)!.outbound += 1;
      nodeMap.get(toPkg)!.inbound += 1;
    }
  }

  const hotspots: PackageHotspot[] = [...edgeMap.entries()]
    .map(([key, edges]) => {
      const [from, to] = key.split('=>');
      return { from, to, edges };
    })
    .sort((a, b) => b.edges - a.edges)
    .slice(0, 20);

  return {
    packageCount: nodeMap.size,
    edgeCount: [...edgeMap.values()].reduce((sum, count) => sum + count, 0),
    packages: [...nodeMap.values()].sort((a, b) => (b.inbound + b.outbound) - (a.inbound + a.outbound)),
    hotspots,
  };
}

function computeArticulationAndBridges(dependencyState: DependencyState): {
  articulationPoints: Set<string>;
  bridgeEdges: Array<{ from: string; to: string }>;
} {
  const nodes = [...dependencyState.files].sort();
  const adjacency = new Map<string, Set<string>>();
  for (const node of nodes) adjacency.set(node, new Set());
  for (const [from, outgoing] of dependencyState.outgoing.entries()) {
    for (const to of outgoing) {
      if (!dependencyState.files.has(to)) continue;
      adjacency.get(from)!.add(to);
      adjacency.get(to)!.add(from);
    }
  }

  const visited = new Set<string>();
  const disc = new Map<string, number>();
  const low = new Map<string, number>();
  const parent = new Map<string, string | null>();
  const articulationPoints = new Set<string>();
  const bridgeEdges: Array<{ from: string; to: string }> = [];
  let time = 0;

  const dfs = (node: string): void => {
    visited.add(node);
    disc.set(node, time);
    low.set(node, time);
    time += 1;
    let children = 0;

    for (const next of adjacency.get(node) || new Set<string>()) {
      if (!visited.has(next)) {
        children += 1;
        parent.set(next, node);
        dfs(next);
        low.set(node, Math.min(low.get(node)!, low.get(next)!));

        if (parent.get(node) == null && children > 1) articulationPoints.add(node);
        if (parent.get(node) != null && low.get(next)! >= disc.get(node)!) articulationPoints.add(node);
        if (low.get(next)! > disc.get(node)!) {
          bridgeEdges.push(node < next ? { from: node, to: next } : { from: next, to: node });
        }
      } else if (next !== parent.get(node)) {
        low.set(node, Math.min(low.get(node)!, disc.get(next)!));
      }
    }
  };

  for (const node of nodes) {
    if (!visited.has(node)) {
      parent.set(node, null);
      dfs(node);
    }
  }

  return { articulationPoints, bridgeEdges };
}

export function computeChokepoints(
  dependencyState: DependencyState,
  dependencySummary: DependencySummary,
  fileCriticalityByPath: Map<string, FileCriticality>,
  sccClusters: SccCluster[],
): Chokepoint[] {
  const { articulationPoints, bridgeEdges } = computeArticulationAndBridges(dependencyState);
  const criticalPathFiles = new Set<string>();
  for (const chain of dependencySummary.criticalPaths || []) {
    for (const file of chain.path) criticalPathFiles.add(file);
  }

  const cycleMembership = new Map<string, number>();
  for (const cluster of sccClusters) {
    for (const file of cluster.files) {
      cycleMembership.set(file, (cycleMembership.get(file) || 0) + 1);
    }
  }

  const bridgeCounts = new Map<string, number>();
  for (const bridge of bridgeEdges) {
    bridgeCounts.set(bridge.from, (bridgeCounts.get(bridge.from) || 0) + 1);
    bridgeCounts.set(bridge.to, (bridgeCounts.get(bridge.to) || 0) + 1);
  }

  return [...dependencyState.files]
    .map((file) => {
      const fanIn = (dependencyState.incoming.get(file) || new Set()).size;
      const fanOut = (dependencyState.outgoing.get(file) || new Set()).size;
      const articulation = articulationPoints.has(file);
      const bridgeCount = bridgeCounts.get(file) || 0;
      const cycleClusterCount = cycleMembership.get(file) || 0;
      const onCriticalPath = criticalPathFiles.has(file);
      const criticality = fileCriticalityByPath.get(file)?.score || 0;
      const score = Math.round(
        fanIn * 3 +
        fanOut * 1.2 +
        criticality / 10 +
        (articulation ? 12 : 0) +
        bridgeCount * 4 +
        cycleClusterCount * 6 +
        (onCriticalPath ? 8 : 0),
      );
      const reasons: string[] = [];
      if (fanIn >= 8) reasons.push(`high fan-in (${fanIn})`);
      if (fanOut >= 6) reasons.push(`high fan-out (${fanOut})`);
      if (articulation) reasons.push('articulation point');
      if (bridgeCount > 0) reasons.push(`${bridgeCount} bridge edge(s)`);
      if (cycleClusterCount > 0) reasons.push(`in ${cycleClusterCount} cycle cluster(s)`);
      if (onCriticalPath) reasons.push('on critical path');
      if (criticality >= 20) reasons.push(`high complexity risk (${criticality})`);
      return {
        file,
        score,
        reasons,
        fanIn,
        fanOut,
        articulation,
        bridgeCount,
        cycleClusterCount,
        onCriticalPath,
      };
    })
    .filter((entry) => entry.score > 0 && entry.reasons.length > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 40);
}

export function computeGraphAnalytics(
  dependencyState: DependencyState,
  dependencySummary: DependencySummary,
  fileCriticalityByPath: Map<string, FileCriticality>,
): GraphAnalyticsSummary {
  const sccClusters = computeSccClusters(dependencyState);
  const { articulationPoints, bridgeEdges } = computeArticulationAndBridges(dependencyState);
  const chokepoints = computeChokepoints(dependencyState, dependencySummary, fileCriticalityByPath, sccClusters);
  return {
    sccClusters,
    chokepoints,
    packageGraphSummary: computePackageGraphSummary(dependencyState),
    articulationPoints: [...articulationPoints].sort(),
    bridgeEdges,
  };
}

function findImportLine(state: DependencyState, fromFile: string, toFile?: string): { lineStart: number; lineEnd: number } {
  const imports = state.importedSymbolsByFile.get(fromFile) || [];
  for (const ref of imports) {
    if (!toFile || ref.resolvedModule === toFile) {
      return { lineStart: ref.lineStart || 1, lineEnd: ref.lineEnd || ref.lineStart || 1 };
    }
  }
  return { lineStart: 1, lineEnd: 1 };
}

export function buildAdvancedGraphFindings(
  graphAnalytics: GraphAnalyticsSummary,
  dependencyState: DependencyState,
  fileSummaries: FileEntry[],
): FindingDraft[] {
  const findings: FindingDraft[] = [];

  for (const cluster of graphAnalytics.sccClusters.slice(0, 6)) {
    if (cluster.nodeCount < 3) continue;
    const anchor = cluster.hubFiles[0] || cluster.files[0];
    const loc = findImportLine(dependencyState, anchor);
    findings.push({
      severity: cluster.nodeCount >= 5 ? 'high' : 'medium',
      category: 'cycle-cluster',
      file: anchor,
      lineStart: loc.lineStart,
      lineEnd: loc.lineEnd,
      title: `Cycle cluster detected (${cluster.nodeCount} files)`,
      reason: `Strongly connected cluster ${cluster.id} has ${cluster.nodeCount} files, ${cluster.entryEdges} entry edge(s), and ${cluster.exitEdges} exit edge(s).`,
      files: cluster.files,
      suggestedFix: {
        strategy: 'Break the cluster at one of the hub files and move shared contracts lower.',
        steps: [
          'Inspect the hub files first.',
          'Extract shared interfaces or types from the cluster.',
          'Remove at least one high-traffic edge to split the SCC.',
        ],
      },
      impact: 'Large cycle clusters spread change risk across multiple files and hide the true architectural boundary.',
      tags: ['architecture', 'cycle', 'graph', 'change-risk'],
      ruleId: 'architecture.cycle-cluster',
      confidence: 'high',
      evidence: {
        clusterId: cluster.id,
        nodeCount: cluster.nodeCount,
        entryEdges: cluster.entryEdges,
        exitEdges: cluster.exitEdges,
        hubFiles: cluster.hubFiles,
      },
    });
  }

  for (const point of graphAnalytics.chokepoints.slice(0, 8)) {
    if (point.fanIn < 3 || point.fanOut < 3 || point.score < 18) continue;
    const loc = findImportLine(dependencyState, point.file);
    findings.push({
      severity: point.articulation || point.score >= 30 ? 'high' : 'medium',
      category: 'broker-module',
      file: point.file,
      lineStart: loc.lineStart,
      lineEnd: loc.lineEnd,
      title: `Broker module chokepoint: ${point.file}`,
      reason: `Module concentrates dependency traffic (${point.reasons.join(', ')}).`,
      files: [point.file],
      suggestedFix: {
        strategy: 'Split orchestration responsibilities and reduce fan-in/fan-out through narrower seams.',
        steps: [
          'Identify which consumers rely on this file for unrelated concerns.',
          'Extract narrower APIs or introduce an internal facade.',
          'Move side-effectful or persistence-specific logic into dedicated modules.',
        ],
      },
      impact: 'Broker modules silently become architecture bottlenecks — a small change cascades broadly.',
      tags: ['architecture', 'graph', 'chokepoint', 'coupling'],
      ruleId: 'architecture.broker-module',
      confidence: point.articulation ? 'high' : 'medium',
      evidence: {
        score: point.score,
        reasons: point.reasons,
        fanIn: point.fanIn,
        fanOut: point.fanOut,
      },
    });
  }

  for (const point of graphAnalytics.chokepoints.filter((entry) => entry.articulation).slice(0, 8)) {
    const loc = findImportLine(dependencyState, point.file);
    findings.push({
      severity: point.bridgeCount >= 2 ? 'high' : 'medium',
      category: 'bridge-module',
      file: point.file,
      lineStart: loc.lineStart,
      lineEnd: loc.lineEnd,
      title: `Bridge module detected: ${point.file}`,
      reason: `Module acts as a graph articulation point with ${point.bridgeCount} bridge edge(s).`,
      files: [point.file],
      suggestedFix: {
        strategy: 'Reduce the amount of architecture that depends on this single bridge module.',
        steps: [
          'Split unrelated responsibilities out of the bridge module.',
          'Add lower-level contracts so adjacent subsystems do not all route through one file.',
          'Prefer explicit package boundaries over central catch-all utilities.',
        ],
      },
      impact: 'Bridge modules are structurally brittle — they become the single point where subsystem changes collide.',
      tags: ['architecture', 'graph', 'bridge', 'fragility'],
      ruleId: 'architecture.bridge-module',
      confidence: 'high',
      evidence: {
        score: point.score,
        bridgeCount: point.bridgeCount,
        reasons: point.reasons,
      },
    });
  }

  for (const hotspot of graphAnalytics.packageGraphSummary.hotspots.slice(0, 5)) {
    if (hotspot.edges < 4) continue;
    findings.push({
      severity: hotspot.edges >= 8 ? 'high' : 'medium',
      category: 'package-boundary-chatter',
      file: hotspot.from,
      lineStart: 1,
      lineEnd: 1,
      title: `Heavy package chatter: ${hotspot.from} -> ${hotspot.to}`,
      reason: `Detected ${hotspot.edges} cross-package dependency edge(s) between these package groups.`,
      files: [hotspot.from, hotspot.to],
      suggestedFix: {
        strategy: 'Reduce cross-package chatter by consolidating APIs or introducing a narrower shared contract.',
        steps: [
          'Map the symbols crossing this boundary most often.',
          'Promote a smaller public API surface between the packages.',
          'Move implementation detail imports behind a dedicated package boundary.',
        ],
      },
      impact: 'High package chatter is a sign of architectural erosion — packages stop behaving like isolated subsystems.',
      tags: ['architecture', 'packages', 'boundary', 'graph'],
      ruleId: 'architecture.package-boundary-chatter',
      confidence: 'medium',
      evidence: hotspot,
    });
  }

  const chokepointMap = new Map(graphAnalytics.chokepoints.map((entry) => [entry.file, entry]));
  for (const entry of fileSummaries) {
    const effects = entry.topLevelEffects || [];
    if (effects.length === 0) continue;
    const point = chokepointMap.get(entry.file);
    if (!point || point.fanIn < 8 || point.score < 18) continue;
    const first = effects[0];
    findings.push({
      severity: point.fanIn >= 20 ? 'high' : 'medium',
      category: 'startup-risk-hub',
      file: entry.file,
      lineStart: first.lineStart,
      lineEnd: first.lineEnd,
      title: `Startup risk hub: ${entry.file}`,
      reason: `Module performs ${effects.length} import-time effect(s) and also behaves as a chokepoint (${point.reasons.join(', ')}).`,
      files: [entry.file],
      suggestedFix: {
        strategy: 'Move import-time work behind explicit initialization and reduce inbound dependency pressure.',
        steps: [
          'Extract side effects into init() or lazy code paths.',
          'Avoid importing this module from broad utility or entrypoint chains.',
          'Keep only declarations and light configuration at module scope.',
        ],
      },
      impact: 'Import-time side effects in a high fan-in hub create startup latency, hidden ordering bugs, and broad runtime blast radius.',
      tags: ['architecture', 'startup', 'side-effects', 'graph'],
      ruleId: 'architecture.startup-risk-hub',
      confidence: 'high',
      evidence: {
        fanIn: point.fanIn,
        chokepointScore: point.score,
        topLevelEffects: effects.map((effect) => effect.kind),
      },
    });
  }

  return findings;
}
