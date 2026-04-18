#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

import * as ts from 'typescript';

import {
  clearCache,
  createEmptyCache,
  garbageCollect,
  getCachedResult,
  isCacheHit,
  loadCache,
  saveCache,
  setCacheEntry,
} from './cache.js';
import { parseArgs } from './cli.js';
import { loadConfigFile, mergeConfigIntoDefaults } from './config-loader.js';
import { createOptions, OptionsError } from './create-options.js';
import { attachConsoleFeedback, bus } from './progress.js';
import { resolveAffectedFiles } from './affected.js';
import { saveBaseline, filterKnownFindings } from './baseline.js';
import { formatFindings } from './reporters.js';
import { collectDependencyProfile } from '../analysis/dependencies.js';
import { buildDependencySummary } from '../analysis/dependency-summary.js';
import {
  collectFiles,
  fileSummaryWithFindings,
  listWorkspacePackages,
  safeRead,
} from '../analysis/discovery.js';
import {
  buildAdvancedGraphFindings,
  computeGraphAnalytics,
} from '../analysis/graph-analytics.js';
import {
  analyzeSemanticProfile,
  collectAllAbsoluteFiles,
  createSemanticContext,
} from '../analysis/semantic.js';
import {
  analyzeTreeSitterFile,
  resolveTreeSitter,
} from '../ast/tree-sitter.js';
import {
  analyzeSourceFile,
  buildDependencyCriticality,
} from '../ast/ts-analyzer.js';
import { isDirectRun } from '../common/is-direct-run.js';
import { canonicalScriptKind, increment } from '../common/utils.js';
import { computeHotFiles } from '../detectors/index.js';
import { runSemanticDetectors } from '../detectors/semantic.js';
import { applyFindingsLimit, assignFindingIds, buildIssueCatalog } from '../index.js';
import {
  computeReportAnalysisSummary,
  enrichFileInventoryEntries,
  enrichFindings,
} from '../reporting/analysis.js';
import { diverseTopRecommendations } from '../reporting/summary-md.js';
import { generateMermaidGraph, writeMultiFileReport } from '../reporting/writer.js';
import type { GraphRenderOptions } from '../reporting/writer.js';
import { EMPTY_DEPENDENCY_PROFILE, isPythonFile, PILLAR_CATEGORIES, SEMANTIC_CATEGORIES } from '../types/index.js';

import type { SemanticProfile } from '../analysis/semantic.js';
import type {
  AnalysisOptions,
  ControlMapEntry,
  DependencyState,
  DependencySummary,
  DuplicateFlowHint,
  DuplicateGroup,
  FileCriticality,
  FileEntry,
  Finding,
  FlowMapEntry,
  PackageFileSummary,
  PackageInfo,
  RedundantFlowGroup,
  TreeEntry,
} from '../types/index.js';

function discoverPackages(
  root: string,
  packageRoot: string
): PackageInfo[] {
  let packages = listWorkspacePackages(root, packageRoot);
  if (!packages.length) {
    const rootManifest = path.join(root, 'package.json');
    if (fs.existsSync(rootManifest)) {
      try {
        const json = JSON.parse(fs.readFileSync(rootManifest, 'utf8'));
        const name =
          typeof json.name === 'string' ? json.name : path.basename(root);
        packages = [{ name, dir: root, folder: path.basename(root) }];
      } catch {
        console.error(
          `No packages found in ${packageRoot} and root package.json is unreadable`
        );
        process.exit(1);
      }
    } else {
      console.error(
        `No packages found in ${packageRoot} and no package.json in root`
      );
      process.exit(1);
    }
  }
  return packages;
}

function groupDuplicates(
  flowMap: Map<string, FlowMapEntry[]>,
  controlMap: Map<string, ControlMapEntry[]>,
  flowDupThreshold: number
): {
  duplicateFunctions: DuplicateGroup[];
  redundantFlows: RedundantFlowGroup[];
  duplicateFlowHints: DuplicateFlowHint[];
} {
  const duplicateFunctions: DuplicateGroup[] = [...flowMap.entries()]
    .map(([key, locations]) => {
      if (locations.length < 2) return null;
      const [first] = locations;
      const [hash] = key.split('|');
      const signatureName = first.name || first.kind || '<flow>';
      const files = [...new Set(locations.map(item => item.file))];
      return {
        hash,
        signature: signatureName,
        kind: first.kind,
        occurrences: locations.length,
        filesCount: files.length,
        locations: locations.slice(0, 20),
      };
    })
    .filter((item): item is DuplicateGroup => item !== null)
    .sort((a, b) => b.occurrences - a.occurrences);

  const redundantFlows: RedundantFlowGroup[] = [...controlMap.entries()]
    .map(([key, locations]) => {
      if (locations.length <= 1) return null;
      const [, kind] = key.split('|');
      const files = [...new Set(locations.map(item => item.file))];
      return {
        kind,
        occurrences: locations.length,
        filesCount: files.length,
        locations: locations.slice(0, 20),
      };
    })
    .filter((item): item is RedundantFlowGroup => item !== null)
    .sort((a, b) => b.occurrences - a.occurrences);

  const duplicateFlowHints: DuplicateFlowHint[] = [];
  for (const fn of duplicateFunctions.slice(0, 200)) {
    if (fn.occurrences >= 2) {
      duplicateFlowHints.push({
        type: 'duplicate-function-body',
        message: `Identical function body for ${fn.signature}`,
        file: fn.locations[0]?.file,
        lineStart: fn.locations[0]?.lineStart,
        lineEnd: fn.locations[0]?.lineEnd,
        details: `Occurs ${fn.occurrences} times in ${fn.filesCount} files.`,
      });
    }
  }

  for (const [index, flow] of redundantFlows.slice(0, 100).entries()) {
    if (flow.occurrences >= flowDupThreshold) {
      duplicateFlowHints.push({
        type: 'repeated-flow',
        message: `Repeated ${flow.kind} control structure`,
        file: flow.locations[0]?.file,
        lineStart: flow.locations[0]?.lineStart,
        lineEnd: flow.locations[0]?.lineEnd,
        details: `Structure appears ${flow.occurrences} times across ${flow.filesCount} file(s).`,
      });
    }
    if (index > 100) break;
  }

  return { duplicateFunctions, redundantFlows, duplicateFlowHints };
}

function runSemanticPhase(
  fileSummaries: FileEntry[],
  dependencyState: DependencyState,
  options: AnalysisOptions,
  parseErrors: { file: string; message: string }[]
): Array<Omit<Finding, 'id'>> {
  if (!options.semantic) return [];
  const wantsAnySemantic =
    !options.features ||
    [...SEMANTIC_CATEGORIES].some(c => options.features!.has(c));
  if (!wantsAnySemantic) return [];

  try {
    const allAbsFiles = collectAllAbsoluteFiles(
      fileSummaries,
      dependencyState,
      options.root
    );
    const semanticCtx = createSemanticContext(allAbsFiles, options.root);
    const profiles: SemanticProfile[] = [];
    for (const entry of fileSummaries) {
      const absPath = path.resolve(options.root, entry.file);
      try {
        profiles.push(
          analyzeSemanticProfile(
            semanticCtx,
            absPath,
            entry,
            options.includeTests
          )
        );
      } catch {
        void 0;
      }
    }
    return runSemanticDetectors(semanticCtx, profiles, {
      overrideChainThreshold: options.thresholds.overrideChainThreshold,
      shotgunThreshold: options.thresholds.shotgunThreshold,
    });
  } catch (err: unknown) {
    parseErrors.push({
      file: '<semantic>',
      message: `Semantic analysis failed: ${String((err as Error)?.message || err)}`,
    });
    return [];
  }
}

function applyScopeFilter(
  scopedFindings: Array<Omit<Finding, 'id'>>,
  options: AnalysisOptions,
  fileSummaries: FileEntry[]
): Array<Omit<Finding, 'id'>> {
  if (!options.scope) return scopedFindings;

  const scopeMatchesRel = (file: string): boolean => {
    const absPath = path.resolve(options.root, file);
    return options.scope!.some(s => {
      const normScope = path.normalize(s);
      const normPath = path.normalize(absPath);
      return (
        normPath === normScope || normPath.startsWith(normScope + path.sep)
      );
    });
  };
  let filtered = scopedFindings.filter(
    f => scopeMatchesRel(f.file) || (f.files?.some(scopeMatchesRel) ?? false)
  );

  if (options.scopeSymbols && options.scopeSymbols.size > 0) {
    const symbolRanges: Array<{
      file: string;
      lineStart: number;
      lineEnd: number;
      name: string;
    }> = [];
    const unresolvedSymbols: string[] = [];
    for (const [absFile, symbolNames] of options.scopeSymbols) {
      const relFile = path.relative(options.root, absFile);
      const entry = fileSummaries.find(e => e.file === relFile);
      if (!entry) {
        for (const sym of symbolNames) unresolvedSymbols.push(`${relFile}:${sym}`);
        continue;
      }
      for (const sym of symbolNames) {
        const fn = entry.functions.find(f => f.name === sym);
        if (fn) {
          symbolRanges.push({
            file: relFile,
            lineStart: fn.lineStart,
            lineEnd: fn.lineEnd,
            name: sym,
          });
          continue;
        }
        const exp = entry.dependencyProfile?.declaredExports?.find(
          e => e.name === sym && e.lineStart != null && e.lineEnd != null
        );
        if (exp) {
          symbolRanges.push({
            file: relFile,
            lineStart: exp.lineStart!,
            lineEnd: exp.lineEnd!,
            name: sym,
          });
        } else {
          unresolvedSymbols.push(`${relFile}:${sym}`);
        }
      }
    }
    if (unresolvedSymbols.length > 0) {
      console.warn(
        `Warning: symbol scope could not resolve: ${unresolvedSymbols.join(', ')}. Falling back to file-level scope for those entries.`
      );
    }
    if (symbolRanges.length > 0) {
      const overlaps = (
        fLineStart: number,
        fLineEnd: number,
        rLineStart: number,
        rLineEnd: number
      ): boolean => fLineStart <= rLineEnd && fLineEnd >= rLineStart;
      filtered = filtered.filter(f =>
        symbolRanges.some(
          r =>
            f.file === r.file &&
            overlaps(f.lineStart, f.lineEnd, r.lineStart, r.lineEnd)
        )
      );
    }
  }
  return filtered;
}

function printConsoleResults(
  summary: { totalFiles: number; totalFunctions: number; totalFlows: number; totalDependencyFiles: number },
  duplicateFunctions: DuplicateGroup[],
  redundantFlows: RedundantFlowGroup[],
  dependencySummary: DependencySummary,
  findings: Finding[],
  parseErrors: { file: string; message: string }[],
  options: AnalysisOptions,
  parserEffective: string
): void {
  console.log(
    `AST analysis complete: ${summary.totalFiles} files, ${summary.totalFunctions} functions, ${summary.totalFlows} flow nodes`
  );
  if (summary.totalDependencyFiles !== summary.totalFiles) {
    console.log(
      `Dependency scan analyzed ${summary.totalDependencyFiles} files (including tests where present).`
    );
  }
  console.log(`Duplicate function bodies: ${duplicateFunctions.length}`);
  for (const item of duplicateFunctions.slice(0, 20)) {
    console.log(
      `- ${item.kind} "${item.signature}" occurs ${item.occurrences}x in ${item.filesCount} file(s)`
    );
  }

  console.log(`\nRepeated control-flow structures: ${redundantFlows.length}`);
  for (const item of redundantFlows.slice(0, 20)) {
    console.log(
      `- ${item.kind} appears ${item.occurrences}x across ${item.filesCount} file(s)`
    );
  }

  console.log(
    `\nDependency graph: ${dependencySummary.totalModules} modules, ${dependencySummary.totalEdges} import edges`
  );
  if (dependencySummary.totalModules > 0) {
    console.log(
      `- Critical chains: ${dependencySummary.criticalPaths.length} (showing top ${Math.min(options.deepLinkTopN, dependencySummary.criticalPaths.length)})`
    );
    console.log(
      `- Root modules: ${dependencySummary.rootsCount}, Leaf modules: ${dependencySummary.leavesCount}`
    );
    console.log(
      `- Test-only modules: ${dependencySummary.testOnlyModules.length}`
    );
    console.log(`- Cycles: ${dependencySummary.cycles.length}`);
  }

  console.log(`\nAgent Findings: ${findings.length}`);
  for (const item of findings.slice(0, 20)) {
    console.log(`- [${item.severity.toUpperCase()}] ${item.title}`);
    console.log(`  - ${item.reason}`);
    console.log(`  - fix: ${item.suggestedFix.strategy}`);
  }

  if (parseErrors.length > 0) {
    console.log(`\nParse errors: ${parseErrors.length}`);
    parseErrors.slice(0, 10).forEach(error => {
      console.log(`- ${error.file}: ${error.message}`);
    });
  }

  console.log(`\nParser engine used: ${parserEffective}`);
}

interface ScanState {
  options: AnalysisOptions;
  packages: PackageInfo[];
  effectiveParser: string;
  useTreeSitter: boolean;
  summary: {
    totalPackages: number;
    totalFiles: number;
    totalNodes: number;
    totalFunctions: number;
    totalFlows: number;
    totalDependencyFiles: number;
    byPackage: Record<
      string,
      {
        files: number;
        nodes: number;
        functions: number;
        flows: number;
        topKinds: [string, number][];
        rootPath: string;
      }
    >;
  };
  flowMap: Map<string, FlowMapEntry[]>;
  controlMap: Map<string, ControlMapEntry[]>;
  trees: TreeEntry[];
  fileSummaries: FileEntry[];
  parseErrors: { file: string; message: string }[];
  dependencyState: DependencyState;
  packageFileStats: Record<string, PackageFileSummary>;
  allPkgJsonDeps: Record<string, string>;
  allPkgJsonDevDeps: Record<string, string>;
  cacheHits: number;
  isLegacyMode: boolean;
  outputDir: string | null;
  outputPath: string | null;
  treeSitterAvailable: boolean;
  treeSitterError: string | null;
}

async function initScanState(
  prebuiltOptions?: AnalysisOptions
): Promise<ScanState | null> {
  let options: AnalysisOptions;
  if (prebuiltOptions) {
    options = prebuiltOptions;
  } else {
    const { DEFAULT_OPTS } = await import('../types/constants.js');
    const cliArgs = createOptions({ args: parseArgs(process.argv.slice(2)) });
    const config = loadConfigFile(cliArgs.root, cliArgs.configFile);
    options = config
      ? mergeConfigIntoDefaults(DEFAULT_OPTS, config, cliArgs)
      : cliArgs;
  }

  if (!options.json && !prebuiltOptions) {
    attachConsoleFeedback();
  }

  bus.progress('startup', 'Options parsed', `root=${options.root}`);

  if (options.clearCache) {
    clearCache(options.root);
    console.error('Cache cleared.');
    return null;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const isLegacyMode = options.out?.endsWith('.json') ?? false;
  const outputDir = isLegacyMode
    ? null
    : options.out || path.join(options.root, '.octocode', 'scan', timestamp);
  const outputPath = isLegacyMode ? (options.out ?? null) : null;

  const packages = discoverPackages(options.root, options.packageRoot);

  let effectiveParser = options.parser as string;
  const parserProbe =
    options.parser === 'tree-sitter' || options.parser === 'auto'
      ? await resolveTreeSitter()
      : { available: false, error: null, parserTs: null, parserTsx: null };
  const useTreeSitter =
    (options.parser === 'tree-sitter' || options.parser === 'auto') &&
    Boolean(parserProbe?.available);

  if (options.parser === 'tree-sitter' && !parserProbe?.available) {
    console.warn(
      `Tree-sitter requested but unavailable: ${parserProbe?.error || 'missing parser modules'}`
    );
    console.warn('Falling back to TypeScript parser for duplicate detection.');
    effectiveParser = 'typescript';
  }

  if (options.parser === 'tree-sitter' && parserProbe?.available) {
    effectiveParser = 'tree-sitter (primary) + typescript (dependencies)';
  }

  if (options.parser === 'auto' && parserProbe?.available) {
    effectiveParser = 'typescript (primary) + tree-sitter (node count)';
  }

  const allPkgJsonDeps: Record<string, string> = {};
  const allPkgJsonDevDeps: Record<string, string> = {};
  for (const pkg of packages) {
    try {
      const manifest = JSON.parse(
        fs.readFileSync(path.join(pkg.dir, 'package.json'), 'utf8')
      );
      Object.assign(allPkgJsonDeps, manifest.dependencies || {});
      Object.assign(allPkgJsonDevDeps, manifest.devDependencies || {});
    } catch {
      void 0;
    }
  }

  bus.progress('discovery', `Found ${packages.length} package(s)`, packages.map(p => p.name).join(', '));

  return {
    options,
    packages,
    effectiveParser,
    useTreeSitter,
    summary: {
      totalPackages: packages.length,
      totalFiles: 0,
      totalNodes: 0,
      totalFunctions: 0,
      totalFlows: 0,
      totalDependencyFiles: 0,
      byPackage: {},
    },
    flowMap: new Map(),
    controlMap: new Map(),
    trees: [],
    fileSummaries: [],
    parseErrors: [],
    dependencyState: {
      files: new Set(),
      outgoing: new Map(),
      incoming: new Map(),
      incomingFromTests: new Map(),
      incomingFromProduction: new Map(),
      externalCounts: new Map(),
      unresolvedCounts: new Map(),
      declaredExportsByFile: new Map(),
      importedSymbolsByFile: new Map(),
      reExportsByFile: new Map(),
    },
    packageFileStats: Object.fromEntries(
      packages.map(pkg => [
        pkg.name,
        {
          fileCount: 0,
          nodeCount: 0,
          functionCount: 0,
          flowCount: 0,
          kindCounts: {},
          functions: [],
          flows: [],
        },
      ])
    ),
    allPkgJsonDeps,
    allPkgJsonDevDeps,
    cacheHits: 0,
    isLegacyMode,
    outputDir,
    outputPath,
    treeSitterAvailable: useTreeSitter,
    treeSitterError: parserProbe?.available ? null : (parserProbe?.error || null),
  };
}

type CachedResult = {
  fileEntry: FileEntry;
  flowMapEntries: [string, FlowMapEntry[]][];
  controlMapEntries: [string, ControlMapEntry[]][];
  treeEntry?: TreeEntry;
};

type NewCache = Parameters<typeof setCacheEntry>[0];

function applyCachedResult(
  raw: CachedResult,
  state: ScanState,
  packageStats: PackageFileSummary,
  newCache: NewCache,
  relPath: string,
  statKey: { mtimeMs: number; size: number },
  dependencyProfile: FileEntry['dependencyProfile'],
): void {
  const { flowMap, controlMap, trees, fileSummaries, summary } = state;
  for (const [key, entries] of raw.flowMapEntries ?? []) {
    for (const entry of entries) increment(flowMap, key, entry);
  }
  for (const [key, entries] of raw.controlMapEntries ?? []) {
    for (const entry of entries) increment(controlMap, key, entry);
  }
  const fileSummary: FileEntry = { ...raw.fileEntry, dependencyProfile };
  packageStats.fileCount += 1;
  packageStats.nodeCount += fileSummary.nodeCount;
  packageStats.functionCount += fileSummary.functions.length;
  packageStats.flowCount += fileSummary.flows.length;
  for (const [k, count] of Object.entries(fileSummary.kindCounts)) {
    packageStats.kindCounts[k] = (packageStats.kindCounts[k] || 0) + count;
  }
  for (const fn of fileSummary.functions) packageStats.functions.push(fn);
  if (raw.treeEntry) trees.push(raw.treeEntry);
  summary.totalFiles += 1;
  summary.totalNodes += fileSummary.nodeCount;
  summary.totalFunctions += fileSummary.functions.length;
  summary.totalFlows += fileSummary.flows.length;
  fileSummaries.push(fileSummary);
  setCacheEntry(newCache, relPath, statKey, raw);
  state.cacheHits++;
}

function collectFileData(state: ScanState): void {
  const { options, packages, useTreeSitter, summary, flowMap, controlMap, trees, fileSummaries, parseErrors, dependencyState, packageFileStats } = state;
  bus.progress('cache-check', options.noCache ? 'Cache disabled' : 'Loading cache');
  const cache = options.noCache ? null : loadCache(options.root);
  const newCache = createEmptyCache(options.root);

  for (const pkg of packages) {
    let packageStats = packageFileStats[pkg.name];
    if (!packageStats) {
      packageStats = {
        fileCount: 0,
        nodeCount: 0,
        functionCount: 0,
        flowCount: 0,
        kindCounts: {},
        functions: [],
        flows: [],
      };
      packageFileStats[pkg.name] = packageStats;
    }
    const packageFiles = collectFiles(pkg.dir, options);
    const dependencyFiles = collectFiles(pkg.dir, {
      ...options,
      includeTests: true,
    });
    const scopeMatchesPath = (absPath: string): boolean =>
      options.scope != null &&
      options.scope.some(s => {
        const normScope = path.normalize(s);
        const normPath = path.normalize(absPath);
        return (
          normPath === normScope || normPath.startsWith(normScope + path.sep)
        );
      });
    const scopedPackageFiles = options.scope
      ? packageFiles.filter(f => scopeMatchesPath(f))
      : packageFiles;
    const analysisFileSet = new Set(scopedPackageFiles);

    for (const filePath of dependencyFiles) {
      const text = safeRead(filePath);
      if (text === null) {
        parseErrors.push({
          file: path.relative(options.root, filePath),
          message: 'Failed to read file',
        });
        continue;
      }

      const ext = path.extname(filePath);

      if (isPythonFile(ext)) {
        if (!analysisFileSet.has(filePath)) continue;
        const relPath = path.relative(options.root, filePath);
        const stat = fs.statSync(filePath);
        const statKey = { mtimeMs: stat.mtimeMs, size: stat.size };

        if (cache && isCacheHit(cache, relPath, statKey)) {
          const raw = getCachedResult(cache, relPath) as CachedResult | undefined;
          if (raw?.fileEntry) {
            const profile = raw.fileEntry.dependencyProfile ?? { ...EMPTY_DEPENDENCY_PROFILE };
            applyCachedResult(raw, state, packageStats, newCache, relPath, statKey, profile);
            continue;
          }
        }

        try {
          const fileFlowMap = new Map<string, FlowMapEntry[]>();
          const fileControlMap = new Map<string, ControlMapEntry[]>();
          const treeSitterEntry = useTreeSitter
            ? analyzeTreeSitterFile(filePath, text, options, pkg.name, { flowMap: fileFlowMap, controlMap: fileControlMap })
            : null;

          if (treeSitterEntry) {
            const fileSummary: FileEntry = {
              package: pkg.name,
              file: relPath,
              parseEngine: 'tree-sitter',
              nodeCount: treeSitterEntry.nodeCount,
              kindCounts: {},
              functions: treeSitterEntry.functions,
              flows: treeSitterEntry.flows,
              dependencyProfile: { ...EMPTY_DEPENDENCY_PROFILE },
            };
            if (treeSitterEntry.tree && options.emitTree) {
              trees.push({ package: pkg.name, file: relPath, tree: treeSitterEntry.tree });
            }
            packageStats.fileCount += 1;
            packageStats.nodeCount += treeSitterEntry.nodeCount;
            packageStats.functionCount += treeSitterEntry.functions.length;
            packageStats.flowCount += treeSitterEntry.flows.length;
            for (const fn of treeSitterEntry.functions) packageStats.functions.push(fn);

            for (const [key, entries] of fileFlowMap)
              for (const entry of entries) increment(flowMap, key, entry);
            for (const [key, entries] of fileControlMap)
              for (const entry of entries) increment(controlMap, key, entry);

            const toCache: CachedResult = {
              fileEntry: fileSummary,
              flowMapEntries: [...fileFlowMap.entries()],
              controlMapEntries: [...fileControlMap.entries()],
              ...(treeSitterEntry.tree && options.emitTree && { treeEntry: { package: pkg.name, file: relPath, tree: treeSitterEntry.tree } }),
            };
            setCacheEntry(newCache, relPath, statKey, toCache);

            summary.totalFiles += 1;
            summary.totalNodes += treeSitterEntry.nodeCount;
            summary.totalFunctions += treeSitterEntry.functions.length;
            summary.totalFlows += treeSitterEntry.flows.length;
            fileSummaries.push(fileSummary);
          }
        } catch (error: unknown) {
          parseErrors.push({
            file: path.relative(options.root, filePath),
            message: String((error as Error)?.message || error),
          });
        }
        continue;
      }

      const source = ts.createSourceFile(
        filePath,
        text,
        ts.ScriptTarget.ESNext,
        true,
        canonicalScriptKind(ext)
      );

      try {
        const dependencyProfile = collectDependencyProfile(
          source,
          filePath,
          pkg.name,
          options,
          dependencyState
        );
        if (!analysisFileSet.has(filePath)) continue;

        const relPath = path.relative(options.root, filePath);
        const stat = fs.statSync(filePath);
        const statKey = { mtimeMs: stat.mtimeMs, size: stat.size };

        if (cache && isCacheHit(cache, relPath, statKey)) {
          const raw = getCachedResult(cache, relPath) as
            | CachedResult
            | undefined;
          if (raw?.fileEntry) {
            applyCachedResult(raw, state, packageStats, newCache, relPath, statKey, dependencyProfile);
            continue;
          }
        }

        const fileFlowMap = new Map<string, FlowMapEntry[]>();
        const fileControlMap = new Map<string, ControlMapEntry[]>();

        const treeSitterPrimary =
          useTreeSitter && options.parser === 'tree-sitter';

        let fileSummary: FileEntry;

        if (treeSitterPrimary) {
          const treeSitterEntry = analyzeTreeSitterFile(
            filePath,
            text,
            options,
            pkg.name,
            { flowMap: fileFlowMap, controlMap: fileControlMap }
          );
          if (!treeSitterEntry) {
            const fallback = analyzeSourceFile(
              source,
              pkg.name,
              packageStats,
              options,
              { flowMap: fileFlowMap, controlMap: fileControlMap },
              trees,
              dependencyProfile
            );
            fallback.parserFallback = 'typescript (tree-sitter failed)';
            fileSummary = fallback;
          } else {
            const fileRelative = path.relative(options.root, filePath);
            fileSummary = {
              package: pkg.name,
              file: fileRelative,
              parseEngine: 'tree-sitter',
              nodeCount: treeSitterEntry.nodeCount,
              kindCounts: {},
              functions: treeSitterEntry.functions,
              flows: treeSitterEntry.flows,
              dependencyProfile,
            };
            if (treeSitterEntry.tree && options.emitTree) {
              trees.push({
                package: pkg.name,
                file: fileRelative,
                tree: treeSitterEntry.tree,
              });
            }
            packageStats.fileCount += 1;
            packageStats.nodeCount += treeSitterEntry.nodeCount;
            packageStats.functionCount += treeSitterEntry.functions.length;
            packageStats.flowCount += treeSitterEntry.flows.length;
            for (const fn of treeSitterEntry.functions) {
              packageStats.functions.push(fn);
            }
          }
        } else {
          fileSummary = analyzeSourceFile(
            source,
            pkg.name,
            packageStats,
            options,
            { flowMap: fileFlowMap, controlMap: fileControlMap },
            trees,
            dependencyProfile
          );

          if (useTreeSitter) {
            try {
              const treeSitterEntry = analyzeTreeSitterFile(
                filePath,
                text,
                options,
                pkg.name,
                null
              );
              if (treeSitterEntry) {
                fileSummary.treeSitterNodeCount = treeSitterEntry.nodeCount;
              }
            } catch (error: unknown) {
              fileSummary.treeSitterError = String(
                (error as Error)?.message || error
              );
            }
          }
        }

        for (const [key, entries] of fileFlowMap) {
          for (const entry of entries) increment(flowMap, key, entry);
        }
        for (const [key, entries] of fileControlMap) {
          for (const entry of entries) increment(controlMap, key, entry);
        }

        const treeEntry = options.emitTree
          ? trees.find(t => t.file === relPath)
          : undefined;
        const toCache: CachedResult = {
          fileEntry: fileSummary,
          flowMapEntries: [...fileFlowMap.entries()],
          controlMapEntries: [...fileControlMap.entries()],
          ...(treeEntry && { treeEntry }),
        };
        setCacheEntry(newCache, relPath, statKey, toCache);

        summary.totalFiles += 1;
        summary.totalNodes += fileSummary.nodeCount;
        summary.totalFunctions += fileSummary.functions.length;
        summary.totalFlows += fileSummary.flows.length;
        fileSummaries.push(fileSummary);
      } catch (error: unknown) {
        parseErrors.push({
          file: path.relative(options.root, filePath),
          message: String((error as Error)?.message || error),
        });
      }
    }

    summary.byPackage[pkg.name] = {
      files: packageStats.fileCount,
      nodes: packageStats.nodeCount,
      functions: packageStats.functionCount,
      flows: packageStats.flowCount,
      topKinds: Object.entries(packageStats.kindCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8),
      rootPath: pkg.folder,
    };
  }

  if (!options.noCache) {
    garbageCollect(newCache);
    saveCache(options.root, newCache);
  }
  if (state.cacheHits > 0 && !options.json) {
    console.error(
      `Cache: ${state.cacheHits} hits, ${fileSummaries.length - state.cacheHits} misses`
    );
  }

  summary.totalDependencyFiles = dependencyState.files.size;
  bus.progress('parse', `Parsed ${fileSummaries.length} files`, `${state.cacheHits} cache hits`);
}

function analyzeAndReport(state: ScanState): number {
  bus.progress('detect', 'Running detectors');
  const { options, effectiveParser, summary, flowMap, controlMap, trees, fileSummaries, parseErrors, dependencyState, allPkgJsonDeps, allPkgJsonDevDeps, isLegacyMode, outputDir, outputPath, treeSitterAvailable, treeSitterError } = state;

  const { duplicateFunctions, redundantFlows, duplicateFlowHints } =
    groupDuplicates(flowMap, controlMap, options.thresholds.flowDupThreshold);

  const fileCriticalityByPath = new Map<string, FileCriticality>(
    fileSummaries.map(item => [
      item.file,
      buildDependencyCriticality(item, options),
    ])
  );
  const dependencySummary = buildDependencySummary(
    dependencyState,
    fileCriticalityByPath,
    options
  );
  bus.progress('graph', 'Computing graph analytics');
  const graphAnalytics = computeGraphAnalytics(
    dependencyState,
    dependencySummary,
    fileCriticalityByPath
  );
  const advancedGraphFindings = options.graphAdvanced
    ? buildAdvancedGraphFindings(graphAnalytics, dependencyState, fileSummaries)
    : [];

  bus.progress('semantic', options.semantic ? 'Running semantic analysis' : 'Skipping semantic (not requested)');
  const semanticFindings = runSemanticPhase(
    fileSummaries,
    dependencyState,
    options,
    parseErrors
  );

  const catalog = buildIssueCatalog(
    duplicateFunctions,
    redundantFlows,
    fileSummaries,
    dependencySummary,
    dependencyState,
    options,
    allPkgJsonDeps,
    allPkgJsonDevDeps,
    fileCriticalityByPath,
    semanticFindings,
    flowMap,
    advancedGraphFindings
  );
  let scopedFindings = catalog.allFindings;

  scopedFindings = applyScopeFilter(scopedFindings, options, fileSummaries);

  const {
    findings: limitedFindings,
    totalBeforeTruncation,
    droppedCategories,
  } = applyFindingsLimit(scopedFindings, options);
  const assigned = assignFindingIds(limitedFindings);
  let findings = assigned.findings;
  const byFile = assigned.byFile;
  const findingStats = buildFindingStats(scopedFindings);

  const enrichedFileSummaries = enrichFileInventoryEntries(fileSummaries, {
    flowEnabled: !!options.flow,
  });
  const hotFiles = computeHotFiles(
    dependencyState,
    dependencySummary,
    fileCriticalityByPath
  );
  findings = enrichFindings(
    findings,
    enrichedFileSummaries,
    hotFiles,
    graphAnalytics,
    { flowEnabled: !!options.flow }
  );
  if (options.affected) {
    const affectedPaths = resolveAffectedFiles(
      options.root, options.affected, dependencyState
    );
    if (affectedPaths.length > 0) {
      const affectedSet = new Set(affectedPaths);
      findings = findings.filter(f => affectedSet.has(f.file));
      bus.progress('detect', `--affected: ${affectedPaths.length} files in scope, ${findings.length} findings`);
    }
  }

  if (options.ignoreKnown) {
    const { filtered, suppressedCount } = filterKnownFindings(
      findings, options.ignoreKnown, options.root
    );
    if (suppressedCount > 0) {
      bus.progress('detect', `--ignore-known: suppressed ${suppressedCount} known findings`);
    }
    findings = filtered;
  }

  const reportAnalysis = computeReportAnalysisSummary(
    findings,
    enrichedFileSummaries,
    hotFiles,
    graphAnalytics
  );
  const enhancedFileSummaries = fileSummaryWithFindings(
    enrichedFileSummaries,
    byFile
  );

  const report = {
    generatedAt: new Date().toISOString(),
    repoRoot: options.root,
    options: {
      ...options,
      ignoreDirs: [...options.ignoreDirs],
    },
    parser: {
      requested: options.parser,
      effective: effectiveParser,
      treeSitterAvailable,
      treeSitterError,
    },
    summary,
    fileInventory: enhancedFileSummaries,
    duplicateFlows: {
      duplicatedFunctions: duplicateFunctions.slice(0, 200),
      duplicatedControlFlow: redundantFlows.slice(0, 200),
      totalFunctionGroups: duplicateFunctions.length,
      totalFlowGroups: redundantFlows.length,
    },
    dependencyGraph: dependencySummary,
    dependencyFindings: findings.filter(item =>
      item.category?.startsWith('dependency')
    ),
    agentOutput: {
      totalFindings: findings.length,
      totalBeforeTruncation,
      droppedCategories,
      findingStats,
      analysisSummary: {
        strongestGraphSignal: reportAnalysis.strongestGraphSignal,
        strongestAstSignal: reportAnalysis.strongestAstSignal,
        combinedSignals: reportAnalysis.combinedSignals,
        recommendedValidation: reportAnalysis.recommendedValidation,
      },
      highPriority: findings.filter(
        f => f.severity === 'high' || f.severity === 'critical'
      ).length,
      mediumPriority: findings.filter(f => f.severity === 'medium').length,
      lowPriority: findings.filter(
        f => f.severity === 'low' || f.severity === 'info'
      ).length,
      topRecommendations: diverseTopRecommendations(
        findings,
        20,
        options.maxRecsPerCategory
      ).map(f => ({
        id: f.id,
        file: f.file,
        severity: f.severity,
        category: f.category,
        title: f.title,
        reason: f.reason,
        suggestedFix: f.suggestedFix,
      })),
      filesWithIssues: [...byFile.entries()].map(([file, ids]) => ({
        file,
        issueCount: ids.length,
        issueIds: ids,
      })),
    },
    optimizationOpportunities: duplicateFlowHints,
    optimizationFindings: findings,
    parseErrors,
    astTrees: undefined as TreeEntry[] | undefined,
    graphAnalytics,
    reportAnalysis,
  };

  if (options.emitTree) {
    report.astTrees = trees;
  }

  bus.progress('report', `${findings.length} findings generated`);

  if (options.saveBaseline) {
    const baselinePath = saveBaseline(options.root, findings);
    if (!options.json) {
      console.error(`Baseline saved: ${path.relative(options.root, baselinePath)} (${findings.length} findings)`);
    }
  }

  if (options.reporter !== 'default') {
    const formatted = formatFindings(findings, options.reporter, options.root);
    process.stdout.write(formatted + '\n');
  } else if (options.json) {
    console.log(JSON.stringify(report));
  } else {
    printConsoleResults(
      summary,
      duplicateFunctions,
      redundantFlows,
      dependencySummary,
      findings,
      parseErrors,
      options,
      report.parser.effective
    );
  }

  if (isLegacyMode && outputPath) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(report), 'utf8');
    if (!options.json) {
      console.log(
        `\nFull report written to ${path.relative(options.root, outputPath)}`
      );
    }
    if (options.graph) {
      const gOpts: GraphRenderOptions = {
        focus: options.focus,
        focusDepth: options.focusDepth,
        collapse: options.collapse,
      };
      const graphMd = generateMermaidGraph(
        dependencyState,
        dependencySummary,
        fileCriticalityByPath,
        gOpts
      );
      const graphPath = outputPath.replace(/\.json$/, '-graph.md');
      fs.writeFileSync(graphPath, graphMd, 'utf8');
      if (!options.json) {
        console.log(
          `Dependency graph written to ${path.relative(options.root, graphPath)}`
        );
      }
    }
  } else if (outputDir) {
    bus.progress('write', `Writing report to ${path.relative(options.root, outputDir)}`);
    const gOpts: GraphRenderOptions = {
      focus: options.focus,
      focusDepth: options.focusDepth,
      collapse: options.collapse,
    };
    const outputFiles = writeMultiFileReport(
      outputDir,
      report,
      options,
      dependencyState,
      dependencySummary,
      fileCriticalityByPath,
      gOpts
    );
    if (!options.json) {
      const relDir = path.relative(options.root, outputDir);
      console.log(`\nReport written to ${relDir}/`);
      for (const [key, file] of Object.entries(outputFiles)) {
        console.log(`  ${key}: ${file}`);
      }
    }
  }

  bus.progress('done', 'Scan complete', `${findings.length} findings`);

  if (options.atLeast != null) {
    const totalFiles = summary.totalFiles ?? 1;
    const gateScore = computeGateScore(findings.length, totalFiles);
    if (gateScore < options.atLeast) {
      console.error(
        `Gate score ${gateScore} is below --at-least threshold ${options.atLeast}`
      );
      return -1;
    }
  }

  return findings.length;
}

export function computeGateScore(findingsCount: number, totalFiles: number): number {
  const ratio = findingsCount / Math.max(totalFiles, 1);
  return Math.round(100 / (1 + ratio / 10));
}

export const EXIT_SUCCESS = 0;
export const EXIT_FINDINGS = 1;
export const EXIT_ERROR = 2;

async function main(options?: AnalysisOptions): Promise<number> {
  const state = await initScanState(options);
  if (!state) return EXIT_SUCCESS;
  collectFileData(state);
  const findingsCount = analyzeAndReport(state);
  if (findingsCount < 0) return EXIT_FINDINGS;
  return findingsCount > 0 ? EXIT_FINDINGS : EXIT_SUCCESS;
}

export { main };

function buildFindingStats(
  findings: Array<Omit<Finding, 'id'>>
): {
  overall: {
    totalFindings: number;
    severityBreakdown: Record<string, number>;
  };
  pillars: Record<
    string,
    {
      totalFindings: number;
      severityBreakdown: Record<string, number>;
    }
  >;
} {
  const makeSeverityBreakdown = (
    entries: Array<Pick<Finding, 'severity'>>
  ): Record<string, number> => {
    const counts: Record<string, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    };
    for (const entry of entries) {
      counts[entry.severity] = (counts[entry.severity] || 0) + 1;
    }
    return counts;
  };

  const overall = {
    totalFindings: findings.length,
    severityBreakdown: makeSeverityBreakdown(findings),
  };

  const pillars = Object.fromEntries(
    Object.entries(PILLAR_CATEGORIES).map(([pillar, categories]) => {
      const categorySet = new Set(categories);
      const pillarFindings = findings.filter(f => categorySet.has(f.category));
      return [
        pillar,
        {
          totalFindings: pillarFindings.length,
          severityBreakdown: makeSeverityBreakdown(pillarFindings),
        },
      ];
    })
  );

  return { overall, pillars };
}

if (isDirectRun(import.meta.url)) {
  main()
    .then(code => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      if (error instanceof OptionsError) {
        console.error(error.message);
        process.exitCode = EXIT_ERROR;
      } else {
        console.error(error);
        process.exitCode = EXIT_ERROR;
      }
    });
}
