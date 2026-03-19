#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import * as ts from 'typescript';
import { computeHotFiles } from './architecture.js';
import { clearCache, createEmptyCache, garbageCollect, getCachedResult, isCacheHit, loadCache, saveCache, setCacheEntry, } from './cache.js';
import { parseArgs } from './cli.js';
import { collectDependencyProfile } from './dependencies.js';
import { buildDependencySummary } from './dependency-summary.js';
import { collectFiles, fileSummaryWithFindings, listWorkspacePackages, safeRead } from './discovery.js';
import { buildAdvancedGraphFindings, computeGraphAnalytics } from './graph-analytics.js';
import { buildIssueCatalog } from './index.js';
import { computeReportAnalysisSummary, enrichFileInventoryEntries, enrichFindings } from './report-analysis.js';
import { generateMermaidGraph, writeMultiFileReport } from './report-writer.js';
import { runSemanticDetectors } from './semantic-detectors.js';
import { analyzeSemanticProfile, collectAllAbsoluteFiles, createSemanticContext } from './semantic.js';
import { diverseTopRecommendations } from './summary-md.js';
import { analyzeTreeSitterFile, resolveTreeSitter } from './tree-sitter-analyzer.js';
import { analyzeSourceFile, buildDependencyCriticality } from './ts-analyzer.js';
import { SEMANTIC_CATEGORIES } from './types.js';
import { canonicalScriptKind, increment } from './utils.js';
async function main() {
    const options = parseArgs(process.argv.slice(2));
    if (options.clearCache) {
        clearCache(options.root);
        console.error('Cache cleared.');
        return;
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const isLegacyMode = options.out?.endsWith('.json');
    const outputDir = isLegacyMode ? null : (options.out || path.join(options.root, '.octocode', 'scan', timestamp));
    const outputPath = isLegacyMode ? options.out : null;
    let packages = listWorkspacePackages(options.root, options.packageRoot);
    if (!packages.length) {
        // Fallback: treat root as a single package if it has a package.json
        const rootManifest = path.join(options.root, 'package.json');
        if (fs.existsSync(rootManifest)) {
            try {
                const json = JSON.parse(fs.readFileSync(rootManifest, 'utf8'));
                const name = typeof json.name === 'string' ? json.name : path.basename(options.root);
                packages = [{ name, dir: options.root, folder: path.basename(options.root) }];
            }
            catch {
                console.error(`No packages found in ${options.packageRoot} and root package.json is unreadable`);
                process.exit(1);
            }
        }
        else {
            console.error(`No packages found in ${options.packageRoot} and no package.json in root`);
            process.exit(1);
        }
    }
    let effectiveParser = options.parser;
    const parserProbe = options.parser === 'tree-sitter' || options.parser === 'auto' ? await resolveTreeSitter() : { available: false, error: null, parserTs: null, parserTsx: null };
    const useTreeSitter = (options.parser === 'tree-sitter' || options.parser === 'auto') && Boolean(parserProbe?.available);
    if (options.parser === 'tree-sitter' && !parserProbe?.available) {
        console.warn(`Tree-sitter requested but unavailable: ${parserProbe?.error || 'missing parser modules'}`);
        console.warn('Falling back to TypeScript parser for duplicate detection.');
        effectiveParser = 'typescript';
    }
    if (options.parser === 'tree-sitter' && parserProbe?.available) {
        effectiveParser = 'tree-sitter (primary) + typescript (dependencies)';
    }
    if (options.parser === 'auto' && parserProbe?.available) {
        effectiveParser = 'typescript (primary) + tree-sitter (node count)';
    }
    const summary = {
        totalPackages: packages.length,
        totalFiles: 0,
        totalNodes: 0,
        totalFunctions: 0,
        totalFlows: 0,
        totalDependencyFiles: 0,
        byPackage: {},
    };
    const flowMap = new Map();
    const controlMap = new Map();
    const trees = [];
    const fileSummaries = [];
    const cache = options.noCache ? null : loadCache(options.root);
    const newCache = createEmptyCache(options.root);
    let cacheHits = 0;
    const parseErrors = [];
    const dependencyState = {
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
    };
    const packageFileStats = Object.fromEntries(packages.map((pkg) => ([pkg.name, {
            fileCount: 0,
            nodeCount: 0,
            functionCount: 0,
            flowCount: 0,
            kindCounts: {},
            functions: [],
            flows: [],
        }])));
    const allPkgJsonDeps = {};
    const allPkgJsonDevDeps = {};
    for (const pkg of packages) {
        try {
            const manifest = JSON.parse(fs.readFileSync(path.join(pkg.dir, 'package.json'), 'utf8'));
            Object.assign(allPkgJsonDeps, manifest.dependencies || {});
            Object.assign(allPkgJsonDevDeps, manifest.devDependencies || {});
        }
        catch { /* skip unreadable */ }
    }
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
        const dependencyFiles = collectFiles(pkg.dir, { ...options, includeTests: true });
        const scopeMatchesPath = (absPath) => options.scope != null && options.scope.some((s) => {
            const normScope = path.normalize(s);
            const normPath = path.normalize(absPath);
            return normPath === normScope || normPath.startsWith(normScope + path.sep);
        });
        const scopedPackageFiles = options.scope
            ? packageFiles.filter((f) => scopeMatchesPath(f))
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
            const source = ts.createSourceFile(filePath, text, ts.ScriptTarget.ESNext, true, canonicalScriptKind(ext));
            try {
                const dependencyProfile = collectDependencyProfile(source, filePath, pkg.name, options, dependencyState);
                if (!analysisFileSet.has(filePath))
                    continue;
                const relPath = path.relative(options.root, filePath);
                const stat = fs.statSync(filePath);
                const statKey = { mtimeMs: stat.mtimeMs, size: stat.size };
                if (cache && isCacheHit(cache, relPath, statKey)) {
                    const raw = getCachedResult(cache, relPath);
                    if (raw?.fileEntry) {
                        for (const [key, entries] of raw.flowMapEntries ?? []) {
                            for (const entry of entries)
                                increment(flowMap, key, entry);
                        }
                        for (const [key, entries] of raw.controlMapEntries ?? []) {
                            for (const entry of entries)
                                increment(controlMap, key, entry);
                        }
                        const fileSummary = { ...raw.fileEntry, dependencyProfile };
                        packageStats.fileCount += 1;
                        packageStats.nodeCount += fileSummary.nodeCount;
                        packageStats.functionCount += fileSummary.functions.length;
                        packageStats.flowCount += fileSummary.flows.length;
                        for (const [k, count] of Object.entries(fileSummary.kindCounts)) {
                            packageStats.kindCounts[k] = (packageStats.kindCounts[k] || 0) + count;
                        }
                        for (const fn of fileSummary.functions)
                            packageStats.functions.push(fn);
                        if (raw.treeEntry)
                            trees.push(raw.treeEntry);
                        summary.totalFiles += 1;
                        summary.totalNodes += fileSummary.nodeCount;
                        summary.totalFunctions += fileSummary.functions.length;
                        summary.totalFlows += fileSummary.flows.length;
                        fileSummaries.push(fileSummary);
                        setCacheEntry(newCache, relPath, statKey, raw);
                        cacheHits++;
                        continue;
                    }
                }
                const fileFlowMap = new Map();
                const fileControlMap = new Map();
                const treeSitterPrimary = useTreeSitter && options.parser === 'tree-sitter';
                let fileSummary;
                if (treeSitterPrimary) {
                    const treeSitterEntry = analyzeTreeSitterFile(filePath, text, options, pkg.name, { flowMap: fileFlowMap, controlMap: fileControlMap });
                    if (!treeSitterEntry) {
                        const fallback = analyzeSourceFile(source, pkg.name, packageStats, options, { flowMap: fileFlowMap, controlMap: fileControlMap }, trees, dependencyProfile);
                        fallback.parserFallback = 'typescript (tree-sitter failed)';
                        fileSummary = fallback;
                    }
                    else {
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
                            trees.push({ package: pkg.name, file: fileRelative, tree: treeSitterEntry.tree });
                        }
                        packageStats.fileCount += 1;
                        packageStats.nodeCount += treeSitterEntry.nodeCount;
                        packageStats.functionCount += treeSitterEntry.functions.length;
                        packageStats.flowCount += treeSitterEntry.flows.length;
                        for (const fn of treeSitterEntry.functions) {
                            packageStats.functions.push(fn);
                        }
                    }
                }
                else {
                    fileSummary = analyzeSourceFile(source, pkg.name, packageStats, options, { flowMap: fileFlowMap, controlMap: fileControlMap }, trees, dependencyProfile);
                    if (useTreeSitter) {
                        try {
                            const treeSitterEntry = analyzeTreeSitterFile(filePath, text, options, pkg.name, null);
                            if (treeSitterEntry) {
                                fileSummary.treeSitterNodeCount = treeSitterEntry.nodeCount;
                            }
                        }
                        catch (error) {
                            fileSummary.treeSitterError = String(error?.message || error);
                        }
                    }
                }
                for (const [key, entries] of fileFlowMap) {
                    for (const entry of entries)
                        increment(flowMap, key, entry);
                }
                for (const [key, entries] of fileControlMap) {
                    for (const entry of entries)
                        increment(controlMap, key, entry);
                }
                const treeEntry = options.emitTree ? trees.find((t) => t.file === relPath) : undefined;
                const toCache = {
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
            }
            catch (error) {
                parseErrors.push({
                    file: path.relative(options.root, filePath),
                    message: String(error?.message || error),
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
    if (cacheHits > 0 && !options.json) {
        console.error(`Cache: ${cacheHits} hits, ${fileSummaries.length - cacheHits} misses`);
    }
    summary.totalDependencyFiles = dependencyState.files.size;
    const duplicateFunctions = [...flowMap.entries()]
        .map(([key, locations]) => {
        if (locations.length < 2)
            return null;
        const [first] = locations;
        const [hash] = key.split('|');
        const signatureName = first.name || first.kind || '<flow>';
        const files = [...new Set(locations.map((item) => item.file))];
        return {
            hash,
            signature: signatureName,
            kind: first.kind,
            occurrences: locations.length,
            filesCount: files.length,
            locations: locations.slice(0, 20),
        };
    })
        .filter((item) => item !== null)
        .sort((a, b) => b.occurrences - a.occurrences);
    const redundantFlows = [...controlMap.entries()]
        .map(([key, locations]) => {
        if (locations.length <= 1)
            return null;
        const [, kind] = key.split('|');
        const files = [...new Set(locations.map((item) => item.file))];
        return {
            kind,
            occurrences: locations.length,
            filesCount: files.length,
            locations: locations.slice(0, 20),
        };
    })
        .filter((item) => item !== null)
        .sort((a, b) => b.occurrences - a.occurrences);
    const duplicateFlowHints = [];
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
        if (flow.occurrences >= options.flowDupThreshold) {
            duplicateFlowHints.push({
                type: 'repeated-flow',
                message: `Repeated ${flow.kind} control structure`,
                file: flow.locations[0]?.file,
                lineStart: flow.locations[0]?.lineStart,
                lineEnd: flow.locations[0]?.lineEnd,
                details: `Structure appears ${flow.occurrences} times across ${flow.filesCount} file(s).`,
            });
        }
        if (index > 100)
            break;
    }
    const fileCriticalityByPath = new Map(fileSummaries.map((item) => [item.file, buildDependencyCriticality(item, options)]));
    const dependencySummary = buildDependencySummary(dependencyState, fileCriticalityByPath, options);
    const graphAnalytics = computeGraphAnalytics(dependencyState, dependencySummary, fileCriticalityByPath);
    const advancedGraphFindings = options.graphAdvanced
        ? buildAdvancedGraphFindings(graphAnalytics, dependencyState, fileSummaries)
        : [];
    // ─── Semantic Analysis Phase (--semantic) ───────────────────────────
    let semanticFindings = [];
    if (options.semantic) {
        const wantsAnySemantic = !options.features || [...SEMANTIC_CATEGORIES].some((c) => options.features.has(c));
        if (wantsAnySemantic) {
            try {
                const allAbsFiles = collectAllAbsoluteFiles(fileSummaries, dependencyState, options.root);
                const semanticCtx = createSemanticContext(allAbsFiles, options.root);
                const profiles = [];
                for (const entry of fileSummaries) {
                    const absPath = path.resolve(options.root, entry.file);
                    try {
                        profiles.push(analyzeSemanticProfile(semanticCtx, absPath, entry, options.includeTests));
                    }
                    catch { /* skip files that fail semantic analysis */ }
                }
                semanticFindings = runSemanticDetectors(semanticCtx, profiles, {
                    overrideChainThreshold: options.overrideChainThreshold,
                });
            }
            catch (err) {
                parseErrors.push({ file: '<semantic>', message: `Semantic analysis failed: ${String(err?.message || err)}` });
            }
        }
    }
    const catalog = buildIssueCatalog(duplicateFunctions, redundantFlows, fileSummaries, dependencySummary, dependencyState, options, allPkgJsonDeps, allPkgJsonDevDeps, fileCriticalityByPath, semanticFindings, flowMap, advancedGraphFindings);
    let findings = catalog.findings;
    let byFile = catalog.byFile;
    const { totalBeforeTruncation, droppedCategories } = catalog;
    if (options.scope) {
        const scopeMatchesRel = (file) => {
            const absPath = path.resolve(options.root, file);
            return options.scope.some((s) => {
                const normScope = path.normalize(s);
                const normPath = path.normalize(absPath);
                return normPath === normScope || normPath.startsWith(normScope + path.sep);
            });
        };
        findings = findings.filter((f) => scopeMatchesRel(f.file) || (f.files?.some(scopeMatchesRel) ?? false));
        byFile = new Map([...byFile.entries()].filter(([file]) => scopeMatchesRel(file)));
        if (options.scopeSymbols && options.scopeSymbols.size > 0) {
            const symbolRanges = [];
            for (const [absFile, symbolNames] of options.scopeSymbols) {
                const relFile = path.relative(options.root, absFile);
                const entry = fileSummaries.find((e) => e.file === relFile);
                if (!entry)
                    continue;
                for (const sym of symbolNames) {
                    const fn = entry.functions.find((f) => f.name === sym);
                    if (fn) {
                        symbolRanges.push({ file: relFile, lineStart: fn.lineStart, lineEnd: fn.lineEnd, name: sym });
                        continue;
                    }
                    const exp = entry.dependencyProfile?.declaredExports?.find((e) => e.name === sym && e.lineStart != null && e.lineEnd != null);
                    if (exp) {
                        symbolRanges.push({ file: relFile, lineStart: exp.lineStart, lineEnd: exp.lineEnd, name: sym });
                    }
                }
            }
            if (symbolRanges.length > 0) {
                const overlaps = (fLineStart, fLineEnd, rLineStart, rLineEnd) => fLineStart <= rLineEnd && fLineEnd >= rLineStart;
                findings = findings.filter((f) => symbolRanges.some((r) => f.file === r.file && overlaps(f.lineStart, f.lineEnd, r.lineStart, r.lineEnd)));
            }
        }
    }
    const enrichedFileSummaries = enrichFileInventoryEntries(fileSummaries, { flowEnabled: !!options.flow });
    const hotFiles = computeHotFiles(dependencyState, dependencySummary, fileCriticalityByPath);
    findings = enrichFindings(findings, enrichedFileSummaries, hotFiles, graphAnalytics, { flowEnabled: !!options.flow });
    const reportAnalysis = computeReportAnalysisSummary(findings, enrichedFileSummaries, hotFiles, graphAnalytics);
    const enhancedFileSummaries = fileSummaryWithFindings(enrichedFileSummaries, byFile);
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
            treeSitterAvailable: !!parserProbe?.available,
            treeSitterError: parserProbe?.available ? null : parserProbe?.error || null,
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
        dependencyFindings: findings.filter((item) => item.category?.startsWith('dependency')),
        agentOutput: {
            totalFindings: findings.length,
            totalBeforeTruncation,
            droppedCategories,
            analysisSummary: {
                strongestGraphSignal: reportAnalysis.strongestGraphSignal,
                strongestAstSignal: reportAnalysis.strongestAstSignal,
                combinedSignals: reportAnalysis.combinedSignals,
                recommendedValidation: reportAnalysis.recommendedValidation,
            },
            highPriority: findings.filter((f) => f.severity === 'high' || f.severity === 'critical').length,
            mediumPriority: findings.filter((f) => f.severity === 'medium').length,
            lowPriority: findings.filter((f) => f.severity === 'low' || f.severity === 'info').length,
            topRecommendations: diverseTopRecommendations(findings, 20, options.maxRecsPerCategory).map((f) => ({
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
        astTrees: undefined,
        graphAnalytics,
        reportAnalysis,
    };
    if (options.emitTree) {
        report.astTrees = trees;
    }
    if (options.json) {
        console.log(JSON.stringify(report, null, 2));
    }
    else {
        console.log(`AST analysis complete: ${summary.totalFiles} files, ${summary.totalFunctions} functions, ${summary.totalFlows} flow nodes`);
        if (summary.totalDependencyFiles !== summary.totalFiles) {
            console.log(`Dependency scan analyzed ${summary.totalDependencyFiles} files (including tests where present).`);
        }
        console.log(`Duplicate function bodies: ${duplicateFunctions.length}`);
        for (const item of duplicateFunctions.slice(0, 20)) {
            console.log(`- ${item.kind} "${item.signature}" occurs ${item.occurrences}x in ${item.filesCount} file(s)`);
        }
        console.log(`\nRepeated control-flow structures: ${redundantFlows.length}`);
        for (const item of redundantFlows.slice(0, 20)) {
            console.log(`- ${item.kind} appears ${item.occurrences}x across ${item.filesCount} file(s)`);
        }
        console.log(`\nDependency graph: ${dependencySummary.totalModules} modules, ${dependencySummary.totalEdges} import edges`);
        if (dependencySummary.totalModules > 0) {
            console.log(`- Critical chains: ${dependencySummary.criticalPaths.length} (showing top ${Math.min(options.deepLinkTopN, dependencySummary.criticalPaths.length)})`);
            console.log(`- Root modules: ${dependencySummary.rootsCount}, Leaf modules: ${dependencySummary.leavesCount}`);
            console.log(`- Test-only modules: ${dependencySummary.testOnlyModules.length}`);
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
            parseErrors.slice(0, 10).forEach((error) => {
                console.log(`- ${error.file}: ${error.message}`);
            });
        }
        console.log(`\nParser engine used: ${report.parser.effective}`);
    }
    if (isLegacyMode && outputPath) {
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8');
        if (!options.json) {
            console.log(`\nFull report written to ${path.relative(options.root, outputPath)}`);
        }
        if (options.graph) {
            const graphMd = generateMermaidGraph(dependencyState, dependencySummary, fileCriticalityByPath);
            const graphPath = outputPath.replace(/\.json$/, '-graph.md');
            fs.writeFileSync(graphPath, graphMd, 'utf8');
            if (!options.json) {
                console.log(`Dependency graph written to ${path.relative(options.root, graphPath)}`);
            }
        }
    }
    else if (outputDir) {
        const outputFiles = writeMultiFileReport(outputDir, report, options, dependencyState, dependencySummary, fileCriticalityByPath);
        if (!options.json) {
            const relDir = path.relative(options.root, outputDir);
            console.log(`\nReport written to ${relDir}/`);
            for (const [key, file] of Object.entries(outputFiles)) {
                console.log(`  ${key}: ${file}`);
            }
        }
    }
}
export { main };
const isDirectRun = process.argv[1] && (import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))
    || import.meta.url.endsWith('/scripts/index.js')
    || import.meta.url.endsWith('/scripts/pipeline.js'));
if (isDirectRun) {
    main().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}
