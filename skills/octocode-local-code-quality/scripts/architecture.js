import * as ts from 'typescript';
import { isTestFile } from './utils.js';
function findImportLine(state, fromFile, toFile) {
    const imports = state.importedSymbolsByFile.get(fromFile);
    if (imports) {
        for (const ref of imports) {
            if (ref.resolvedModule === toFile && ref.lineStart) {
                return { lineStart: ref.lineStart, lineEnd: ref.lineEnd ?? ref.lineStart };
            }
        }
    }
    const reexports = state.reExportsByFile.get(fromFile);
    if (reexports) {
        for (const ref of reexports) {
            if (ref.resolvedModule === toFile && ref.lineStart) {
                return { lineStart: ref.lineStart, lineEnd: ref.lineEnd ?? ref.lineStart };
            }
        }
    }
    return { lineStart: 1, lineEnd: 1 };
}
export function isLikelyEntrypoint(filePath) {
    const normalized = filePath.toLowerCase();
    if (/(^|\/)(index|main|app|server|cli|public)\.[mc]?[jt]sx?$/.test(normalized))
        return true;
    if (/\.(config)\.[mc]?[jt]sx?$/.test(normalized))
        return true;
    return false;
}
// ─── Consumed-From-Module Map (for dead-code detectors) ──────────────────────
export function buildConsumedFromModule(dependencyState) {
    const consumedFromModule = new Map();
    for (const [file, imports] of dependencyState.importedSymbolsByFile.entries()) {
        if (isTestFile(file))
            continue;
        for (const symbol of imports) {
            const target = symbol.resolvedModule;
            if (!target)
                continue;
            if (!consumedFromModule.has(target))
                consumedFromModule.set(target, new Set());
            consumedFromModule.get(target).add(symbol.importedName);
        }
    }
    for (const [file, reexports] of dependencyState.reExportsByFile.entries()) {
        if (isTestFile(file))
            continue;
        for (const reexport of reexports) {
            const target = reexport.resolvedModule;
            if (!target)
                continue;
            if (!consumedFromModule.has(target))
                consumedFromModule.set(target, new Set());
            consumedFromModule.get(target).add(reexport.importedName);
        }
    }
    return consumedFromModule;
}
// ─── Duplicate Function Bodies ──────────────────────────────────────────────
export function detectDuplicateFunctionBodies(duplicates) {
    const findings = [];
    for (const group of duplicates) {
        const sample = group.locations[0];
        const reason = `Same ${group.kind} body shape appears in ${group.occurrences} places (` +
            `${group.filesCount} file${group.filesCount > 1 ? 's' : ''}).`;
        const severity = group.occurrences >= 6 ? 'high' : group.occurrences >= 3 ? 'medium' : 'low';
        findings.push({
            ...sample,
            severity,
            category: 'duplicate-function-body',
            title: `Deduplicate function body: ${group.signature}`,
            reason,
            files: group.locations.map((loc) => `${loc.file}:${loc.lineStart}-${loc.lineEnd}`),
            suggestedFix: {
                strategy: 'Create a shared helper function once and replace duplicate call sites.',
                steps: [
                    'Extract one function to a dedicated utility module.',
                    'Keep behavior unchanged by passing function-specific differences as params.',
                    'Replace duplicated blocks with calls to the shared helper.',
                    'Add/extend tests around each entry point that previously used duplicates.',
                ],
            },
            impact: `Lower maintenance cost and reduce regression risk when behavior changes.`,
        });
    }
    return findings;
}
// ─── Duplicate Flow Structures ─────────────────────────────────────────────
export function detectDuplicateFlowStructures(controlDuplicates, flowDupThreshold) {
    const findings = [];
    for (const group of controlDuplicates) {
        if (group.occurrences < flowDupThreshold)
            continue;
        const sample = group.locations[0];
        const reason = `${group.kind} structure appears ${group.occurrences} times across ${group.filesCount} file(s).`;
        const severity = group.occurrences >= 10 ? 'high' : 'medium';
        findings.push({
            ...sample,
            severity,
            category: 'duplicate-flow-structure',
            title: `Extract repeated flow structure: ${group.kind}`,
            reason,
            files: group.locations.map((loc) => `${loc.file}:${loc.lineStart}-${loc.lineEnd}`),
            suggestedFix: {
                strategy: 'Extract a reusable flow helper around the repeated structure.',
                steps: [
                    'Create one clear helper that accepts varying inputs as parameters.',
                    'Call helper from each repeated site.',
                    'Keep variable names aligned and add local adapter logic where needed.',
                    'Document expected invariants for the shared flow.',
                ],
            },
            impact: `Reduces duplicate control branches and normalizes edge-case handling.`,
        });
    }
    return findings;
}
// ─── Function Optimization ──────────────────────────────────────────────────
export function detectFunctionOptimization(fileSummaries, criticalComplexityThreshold) {
    const findings = [];
    for (const fileEntry of fileSummaries) {
        for (const fn of fileEntry.functions) {
            const alerts = [];
            if (fn.complexity >= criticalComplexityThreshold)
                alerts.push(`Cyclomatic-like complexity is high (>=${criticalComplexityThreshold}).`);
            if (fn.maxBranchDepth >= 7)
                alerts.push('Branch depth is very deep and hard to reason about.');
            if (fn.maxLoopDepth >= 4)
                alerts.push('Nested loops are high and likely expensive.');
            if (fn.statementCount >= 24)
                alerts.push('Function body is large and may be doing multiple responsibilities.');
            if (alerts.length === 0)
                continue;
            const isHigh = fn.complexity >= criticalComplexityThreshold || fn.maxBranchDepth >= 7 || fn.maxLoopDepth >= 4;
            findings.push({
                ...fn,
                severity: isHigh ? 'high' : 'medium',
                category: 'function-optimization',
                title: `Potential function refactor: ${fn.name}`,
                reason: alerts.join(' '),
                files: [`${fn.file}:${fn.lineStart}-${fn.lineEnd}`],
                suggestedFix: {
                    strategy: 'Refactor for readability and testability.',
                    steps: [
                        'Split into smaller subroutines with single responsibilities.',
                        'Convert deeply nested branches into guard clauses when safe.',
                        'Replace loops with intent-specific helpers if one loop owns most lines.',
                        'Add unit coverage for each extracted piece before deleting old logic.',
                    ],
                },
                impact: 'Cleaner flow, easier review and safer refactors.',
            });
        }
    }
    return findings;
}
// ─── Test-Only Modules ──────────────────────────────────────────────────────
export function detectTestOnlyModules(dependencySummary) {
    const findings = [];
    if (dependencySummary.testOnlyModules?.length === 0)
        return findings;
    for (const file of (dependencySummary.testOnlyModules || []).slice(0, 25)) {
        findings.push({
            severity: 'medium',
            category: 'dependency-test-only',
            file: file.file,
            lineStart: file.lineStart || 1,
            lineEnd: file.lineEnd || 1,
            title: `Module imported only from tests: ${file.file}`,
            reason: 'No production file imports this module, but tests do. Verify if this module belongs in test fixtures/helpers.',
            files: [file.file],
            suggestedFix: {
                strategy: 'Move test-only utilities to test scope or make production usage explicit.',
                steps: [
                    'Re-run import scanning after moving test-only modules to __tests__ or helper folders.',
                    'If this is shared production utility, add a non-test entrypoint/import.',
                    'Remove dead or stale production references and delete unused module if confirmed.',
                ],
            },
            impact: 'Reduces shipping of non-production-only modules and clarifies ownership boundaries.',
        });
    }
    return findings;
}
// ─── Dependency Cycle Findings ──────────────────────────────────────────────
export function detectDependencyCycles(dependencySummary, dependencyState) {
    const findings = [];
    if (dependencySummary.cycles?.length === 0)
        return findings;
    for (const cycle of (dependencySummary.cycles || []).slice(0, 15)) {
        const cycleLine = findImportLine(dependencyState, cycle.path[0], cycle.path[1]);
        findings.push({
            severity: 'high',
            category: 'dependency-cycle',
            file: cycle.path[0],
            lineStart: cycleLine.lineStart,
            lineEnd: cycleLine.lineEnd,
            title: `Dependency cycle detected (${cycle.nodeCount} node cycle)`,
            reason: `Import cycle exists across: ${cycle.path.join(' -> ')}`,
            files: cycle.path,
            suggestedFix: {
                strategy: 'Break the cycle with a lower-level abstraction or interface module.',
                steps: [
                    'Extract shared contracts/types to a dedicated contract/shared package.',
                    'Move implementation in one direction using dependency inversion.',
                    'Split stateful modules into protocol and runtime layers.',
                ],
            },
            impact: 'Cycles increase coupling and make incremental loading/debugging and refactors riskier.',
        });
    }
    return findings;
}
// ─── Critical Path Findings ──────────────────────────────────────────────────
export function detectCriticalPaths(dependencySummary, dependencyState, criticalComplexityThreshold) {
    const findings = [];
    if (dependencySummary.criticalPaths?.length === 0)
        return findings;
    for (const pathEntry of (dependencySummary.criticalPaths || []).slice(0, 10)) {
        if (pathEntry.score < (criticalComplexityThreshold * 3))
            continue;
        const chainLine = findImportLine(dependencyState, pathEntry.path[0], pathEntry.path[1]);
        findings.push({
            severity: pathEntry.score >= criticalComplexityThreshold * 6 ? 'critical' : 'high',
            category: 'dependency-critical-path',
            file: pathEntry.path[0],
            lineStart: chainLine.lineStart,
            lineEnd: chainLine.lineEnd,
            title: `Critical dependency chain risk: ${pathEntry.length} files`,
            reason: `Potentially high-change surface: ${pathEntry.path.join(' -> ')} (${pathEntry.score} weight).`,
            files: pathEntry.path,
            suggestedFix: {
                strategy: 'Reduce chain length and isolate high-complexity hotspots.',
                steps: [
                    'Split module responsibilities so high-impact file is not transitively coupled to many modules.',
                    'Add explicit interfaces for deep dependency boundaries.',
                    'Cache or memoize heavy intermediate computation in chain nodes where possible.',
                ],
            },
            impact: 'Critical refactor opportunities; shorter chains reduce blast radius of change.',
        });
    }
    return findings;
}
// ─── Dead Files ─────────────────────────────────────────────────────────────
export function detectDeadFiles(dependencySummary, dependencyState) {
    const findings = [];
    for (const file of dependencySummary.roots || []) {
        if (isTestFile(file))
            continue;
        if (isLikelyEntrypoint(file))
            continue;
        const incomingCount = (dependencyState.incoming.get(file) || new Set()).size;
        const outgoingCount = (dependencyState.outgoing.get(file) || new Set()).size;
        if (incomingCount !== 0)
            continue;
        if (outgoingCount > 0)
            continue;
        findings.push({
            severity: 'medium',
            category: 'dead-file',
            file,
            lineStart: 1,
            lineEnd: 1,
            title: `Potential dead file: ${file}`,
            reason: 'File has no inbound imports and no outbound dependencies. It may be stale or orphaned.',
            files: [file],
            suggestedFix: {
                strategy: 'Validate ownership and remove if truly unused.',
                steps: [
                    'Confirm the file is not an explicit runtime entrypoint.',
                    'Search runtime config/router/bootstrap references for this file path.',
                    'Delete file if confirmed dead and re-run scan.',
                ],
            },
            impact: 'Reduces dead surface area and maintenance overhead.',
        });
    }
    return findings;
}
// ─── Dead Exports ───────────────────────────────────────────────────────────
export function detectDeadExports(dependencyState, consumedFromModule) {
    const findings = [];
    for (const [file, exportsList] of dependencyState.declaredExportsByFile.entries()) {
        if (isTestFile(file))
            continue;
        if (isLikelyEntrypoint(file))
            continue;
        const consumed = consumedFromModule.get(file) || new Set();
        const hasNamespaceUse = consumed.has('*');
        for (const exported of exportsList) {
            if (exported.name === 'default' && isLikelyEntrypoint(file))
                continue;
            if (hasNamespaceUse || consumed.has(exported.name))
                continue;
            findings.push({
                severity: exported.kind === 'type' ? 'medium' : 'high',
                category: 'dead-export',
                file,
                lineStart: exported.lineStart || 1,
                lineEnd: exported.lineEnd || exported.lineStart || 1,
                title: `Unused export: ${exported.name}`,
                reason: `Exported symbol "${exported.name}" has no observed import or re-export usage in production files.`,
                files: [`${file}:${exported.lineStart || 1}-${exported.lineEnd || exported.lineStart || 1}`],
                suggestedFix: {
                    strategy: 'Remove or internalize unused exports.',
                    steps: [
                        'Confirm symbol is not part of intentional public API surface.',
                        'Remove export modifier or delete symbol if truly unused.',
                        'Re-run scan and tests to ensure no hidden runtime usage.',
                    ],
                },
                impact: 'Shrinks public API surface and reduces accidental coupling.',
            });
        }
    }
    return findings;
}
// ─── Dead Re-Exports, Re-Export Duplication, Re-Export Shadowed ──────────────
export function detectDeadReExports(dependencyState, consumedFromModule) {
    const findings = [];
    for (const [barrelFile, reexports] of dependencyState.reExportsByFile.entries()) {
        if (isTestFile(barrelFile))
            continue;
        const consumed = consumedFromModule.get(barrelFile) || new Set();
        const hasNamespaceUse = consumed.has('*');
        const sourceByExportedAs = new Map();
        const localExportNames = new Set((dependencyState.declaredExportsByFile.get(barrelFile) || []).map((entry) => entry.name));
        for (const ref of reexports) {
            const exportedAs = ref.exportedAs;
            if (!sourceByExportedAs.has(exportedAs))
                sourceByExportedAs.set(exportedAs, new Set());
            sourceByExportedAs.get(exportedAs).add(ref.resolvedModule || ref.sourceModule);
            const isUsed = hasNamespaceUse || consumed.has(exportedAs) || (ref.isStar && consumed.size > 0);
            if (!isUsed) {
                findings.push({
                    severity: 'medium',
                    category: 'dead-re-export',
                    file: barrelFile,
                    lineStart: ref.lineStart || 1,
                    lineEnd: ref.lineEnd || ref.lineStart || 1,
                    title: `Unused re-export: ${exportedAs}`,
                    reason: `Re-exported symbol "${exportedAs}" from ${ref.sourceModule} has no observed downstream imports from this module.`,
                    files: [`${barrelFile}:${ref.lineStart || 1}-${ref.lineEnd || ref.lineStart || 1}`],
                    suggestedFix: {
                        strategy: 'Remove stale barrel re-exports.',
                        steps: [
                            'Verify no dynamic import/runtime reflection depends on this export.',
                            'Remove the re-export clause.',
                            'Re-run scan to confirm barrel surface is still complete.',
                        ],
                    },
                    impact: 'Keeps barrel modules focused and easier to reason about.',
                });
            }
        }
        for (const [name, sources] of sourceByExportedAs.entries()) {
            if (sources.size > 1) {
                findings.push({
                    severity: 'medium',
                    category: 're-export-duplication',
                    file: barrelFile,
                    lineStart: 1,
                    lineEnd: 1,
                    title: `Duplicate re-export paths: ${name}`,
                    reason: `Symbol "${name}" is re-exported from multiple sources in the same barrel.`,
                    files: [barrelFile],
                    suggestedFix: {
                        strategy: 'Keep one canonical re-export source per symbol.',
                        steps: [
                            'Select a canonical module for the symbol.',
                            'Remove duplicate re-export paths.',
                            'Document intended public export map for the barrel.',
                        ],
                    },
                    impact: 'Reduces API ambiguity and import inconsistency.',
                });
            }
            if (name !== '*' && localExportNames.has(name)) {
                findings.push({
                    severity: 'high',
                    category: 're-export-shadowed',
                    file: barrelFile,
                    lineStart: 1,
                    lineEnd: 1,
                    title: `Shadowed export in barrel: ${name}`,
                    reason: `Barrel exports "${name}" both locally and through re-export, which can hide origin and create ambiguity.`,
                    files: [barrelFile],
                    suggestedFix: {
                        strategy: 'Disambiguate local vs re-exported symbol ownership.',
                        steps: [
                            'Pick a single source of truth for the symbol in this barrel.',
                            'Rename or remove the conflicting export path.',
                            'Update import call-sites to use the canonical export.',
                        ],
                    },
                    impact: 'Prevents subtle API conflicts and shadowing confusion.',
                });
            }
        }
    }
    return findings;
}
// ─── 2A: Instability Metric (SDP) ──────────────────────────────────────────
export function computeInstability(inboundCount, outboundCount) {
    const total = inboundCount + outboundCount;
    if (total === 0)
        return 0;
    return outboundCount / total;
}
export function detectSdpViolations(dependencyState, minDelta = 0.15) {
    const findings = [];
    const cache = new Map();
    const getI = (file) => {
        if (cache.has(file))
            return cache.get(file);
        const ca = (dependencyState.incoming.get(file) || new Set()).size;
        const ce = (dependencyState.outgoing.get(file) || new Set()).size;
        const i = computeInstability(ca, ce);
        cache.set(file, i);
        return i;
    };
    for (const file of dependencyState.files) {
        if (isTestFile(file))
            continue;
        const deps = dependencyState.outgoing.get(file) || new Set();
        const iSrc = getI(file);
        for (const dep of deps) {
            if (!dependencyState.files.has(dep) || isTestFile(dep))
                continue;
            const iTgt = getI(dep);
            const delta = iTgt - iSrc;
            if (delta > minDelta && iSrc < 0.5) {
                const importRef = findImportLine(dependencyState, file, dep);
                findings.push({
                    severity: delta > 0.3 ? 'high' : 'medium',
                    category: 'architecture-sdp-violation',
                    file,
                    lineStart: importRef.lineStart,
                    lineEnd: importRef.lineEnd,
                    title: `SDP violation: stable module depends on unstable module`,
                    reason: `"${file}" (I=${iSrc.toFixed(2)}) depends on "${dep}" (I=${iTgt.toFixed(2)}). Delta=${delta.toFixed(2)}.`,
                    files: [file, dep],
                    suggestedFix: {
                        strategy: 'Invert dependency via interface/abstraction or move shared code to a stable utility.',
                        steps: [
                            'Extract a stable interface that the stable module depends on.',
                            'Have the unstable module implement that interface.',
                            'Consider moving shared logic to a lower-instability utility module.',
                        ],
                    },
                    impact: 'Prevents cascading instability and reduces change propagation risk.',
                });
            }
        }
    }
    return findings;
}
// ─── 2B: Afferent/Efferent Coupling ────────────────────────────────────────
export function detectHighCoupling(dependencyState, threshold = 15) {
    const findings = [];
    for (const file of dependencyState.files) {
        if (isTestFile(file))
            continue;
        const ca = (dependencyState.incoming.get(file) || new Set()).size;
        const ce = (dependencyState.outgoing.get(file) || new Set()).size;
        const total = ca + ce;
        if (total > threshold) {
            findings.push({
                severity: total > 25 ? 'high' : 'medium',
                category: 'high-coupling',
                file,
                lineStart: 1,
                lineEnd: 1,
                title: `High coupling: ${file}`,
                reason: `Module has ${total} total connections (Ca=${ca}, Ce=${ce}). Threshold: ${threshold}.`,
                files: [file],
                suggestedFix: {
                    strategy: 'Reduce coupling by extracting interfaces or splitting module responsibilities.',
                    steps: [
                        'Identify groups of related imports/dependents that can be isolated.',
                        'Extract focused sub-modules with single responsibilities.',
                        'Use dependency inversion to reduce direct coupling.',
                    ],
                },
                impact: 'Lower coupling reduces change ripple effects and improves testability.',
            });
        }
    }
    return findings;
}
// ─── 2C: Fan-In / Fan-Out Thresholds ───────────────────────────────────────
export function detectGodModuleCoupling(dependencyState, fanInThreshold = 20, fanOutThreshold = 15) {
    const findings = [];
    for (const file of dependencyState.files) {
        if (isTestFile(file))
            continue;
        const fanIn = (dependencyState.incoming.get(file) || new Set()).size;
        const fanOut = (dependencyState.outgoing.get(file) || new Set()).size;
        if (fanIn > fanInThreshold) {
            findings.push({
                severity: fanIn > fanInThreshold * 1.5 ? 'high' : 'medium',
                category: 'god-module-coupling',
                file,
                lineStart: 1,
                lineEnd: 1,
                title: `High fan-in bottleneck: ${file}`,
                reason: `Module is depended on by ${fanIn} modules (threshold: ${fanInThreshold}). Changes ripple widely.`,
                files: [file],
                suggestedFix: {
                    strategy: 'Split this module into focused sub-modules to reduce blast radius.',
                    steps: [
                        'Identify distinct groups of consumers using different parts of this module.',
                        'Extract each group into a dedicated module.',
                        'Update import paths incrementally.',
                    ],
                },
                impact: 'Reduces change blast radius and improves parallel development.',
            });
        }
        if (fanOut > fanOutThreshold) {
            findings.push({
                severity: fanOut > fanOutThreshold * 1.5 ? 'high' : 'medium',
                category: 'god-module-coupling',
                file,
                lineStart: 1,
                lineEnd: 1,
                title: `High fan-out: ${file}`,
                reason: `Module depends on ${fanOut} modules (threshold: ${fanOutThreshold}). It may violate single responsibility.`,
                files: [file],
                suggestedFix: {
                    strategy: 'Reduce dependencies by introducing facade or mediator patterns.',
                    steps: [
                        'Group related imports behind a single facade module.',
                        'Consider splitting this module by responsibility.',
                        'Use dependency injection to reduce direct coupling.',
                    ],
                },
                impact: 'Cleaner architecture and easier testing through reduced dependencies.',
            });
        }
    }
    return findings;
}
// ─── 2D: Orphan Module Detection ───────────────────────────────────────────
export function detectOrphanModules(dependencyState) {
    const findings = [];
    for (const file of dependencyState.files) {
        if (isTestFile(file))
            continue;
        if (isLikelyEntrypoint(file))
            continue;
        const ca = (dependencyState.incoming.get(file) || new Set()).size;
        const ce = (dependencyState.outgoing.get(file) || new Set()).size;
        if (ca === 0 && ce === 0) {
            findings.push({
                severity: 'medium',
                category: 'orphan-module',
                file,
                lineStart: 1,
                lineEnd: 1,
                title: `Orphan module: ${file}`,
                reason: 'Module has no inbound or outbound dependencies — completely disconnected from the module graph.',
                files: [file],
                suggestedFix: {
                    strategy: 'Delete if truly unused, or wire into module graph.',
                    steps: [
                        'Check if the file is a runtime entrypoint, route, or config.',
                        'If truly disconnected, delete and re-run scan.',
                        'If needed, add an explicit import from the appropriate parent module.',
                    ],
                },
                impact: 'Removes dead surface area and clarifies module ownership.',
            });
        }
    }
    return findings;
}
// ─── 2E: Reachability Analysis ─────────────────────────────────────────────
export function detectUnreachableModules(dependencyState) {
    const findings = [];
    const entrypoints = new Set();
    for (const file of dependencyState.files) {
        if (isLikelyEntrypoint(file))
            entrypoints.add(file);
    }
    if (entrypoints.size === 0) {
        for (const file of dependencyState.files) {
            if ((dependencyState.incoming.get(file) || new Set()).size === 0) {
                entrypoints.add(file);
            }
        }
    }
    const reachable = new Set();
    const queue = [...entrypoints];
    while (queue.length > 0) {
        const current = queue.pop();
        if (reachable.has(current))
            continue;
        reachable.add(current);
        for (const dep of (dependencyState.outgoing.get(current) || new Set())) {
            if (dependencyState.files.has(dep) && !reachable.has(dep))
                queue.push(dep);
        }
    }
    for (const file of dependencyState.files) {
        if (isTestFile(file) || reachable.has(file) || isLikelyEntrypoint(file))
            continue;
        findings.push({
            severity: 'high',
            category: 'unreachable-module',
            file,
            lineStart: 1,
            lineEnd: 1,
            title: `Unreachable module: ${file}`,
            reason: 'Module is not reachable from any entrypoint via the import graph.',
            files: [file],
            suggestedFix: {
                strategy: 'Verify reachability and remove if truly dead.',
                steps: [
                    'Check if this module is loaded dynamically or via framework conventions.',
                    'Verify it is not registered as a route, plugin, or middleware.',
                    'If confirmed unreachable, delete and re-run scan.',
                ],
            },
            impact: 'Identifies potentially large sections of dead code missed by direct-import checks.',
        });
    }
    return findings;
}
// ─── 3A: Unused npm Dependencies ───────────────────────────────────────────
export function detectUnusedNpmDeps(externalDeps, packageJsonDeps, devDeps = {}) {
    const findings = [];
    const usedPackages = new Set();
    for (const depSet of externalDeps.values()) {
        for (const dep of depSet) {
            const parts = dep.split('/');
            usedPackages.add(dep.startsWith('@') && parts.length >= 2 ? `${parts[0]}/${parts[1]}` : parts[0]);
        }
    }
    for (const pkgName of Object.keys(packageJsonDeps)) {
        if (!usedPackages.has(pkgName)) {
            findings.push({
                severity: 'medium',
                category: 'unused-npm-dependency',
                file: 'package.json',
                lineStart: 1,
                lineEnd: 1,
                title: `Unused dependency: ${pkgName}`,
                reason: `Package "${pkgName}" is in dependencies but no import was found.`,
                files: ['package.json'],
                suggestedFix: {
                    strategy: 'Remove unused dependency from package.json.',
                    steps: [
                        'Verify the package is not loaded dynamically or via CLI scripts.',
                        'Check if it is a peer dependency required at runtime.',
                        'Run `npm uninstall` or remove from package.json.',
                    ],
                },
                impact: 'Reduces install size and attack surface.',
            });
        }
    }
    for (const pkgName of Object.keys(devDeps)) {
        if (!usedPackages.has(pkgName)) {
            findings.push({
                severity: 'low',
                category: 'unused-npm-dependency',
                file: 'package.json',
                lineStart: 1,
                lineEnd: 1,
                title: `Unused devDependency: ${pkgName}`,
                reason: `Package "${pkgName}" is in devDependencies but no import was found.`,
                files: ['package.json'],
                suggestedFix: {
                    strategy: 'Remove unused devDependency from package.json.',
                    steps: [
                        'Verify the package is not used by build scripts, config files, or CLI tools.',
                        'Run `npm uninstall` or remove from package.json.',
                    ],
                },
                impact: 'Reduces install size and dependency maintenance burden.',
            });
        }
    }
    return findings;
}
// ─── 3B: Package Boundary Violations ───────────────────────────────────────
export function detectBoundaryViolations(dependencyState) {
    const findings = [];
    for (const file of dependencyState.files) {
        if (isTestFile(file))
            continue;
        const fileMatch = file.match(/^packages\/([^/]+)\//);
        if (!fileMatch)
            continue;
        const filePkg = fileMatch[1];
        for (const dep of (dependencyState.outgoing.get(file) || new Set())) {
            const depMatch = dep.match(/^packages\/([^/]+)\//);
            if (!depMatch)
                continue;
            if (depMatch[1] === filePkg)
                continue;
            const isPublicApi = /^packages\/[^/]+\/(src\/)?index\.[mc]?[jt]sx?$/.test(dep);
            if (!isPublicApi) {
                const isDeep = dep.includes('/internal/') || dep.includes('/private/');
                findings.push({
                    severity: isDeep ? 'high' : 'medium',
                    category: 'package-boundary-violation',
                    file,
                    lineStart: 1,
                    lineEnd: 1,
                    title: `Cross-package import bypasses public API`,
                    reason: `"${file}" imports "${dep}" directly instead of through the package public entry.`,
                    files: [file, dep],
                    suggestedFix: {
                        strategy: 'Import through the package public API (index file).',
                        steps: [
                            'Re-export the needed symbol from the target package index.',
                            'Update the import to use the package name or index path.',
                            'If the symbol is internal, reconsider the dependency.',
                        ],
                    },
                    impact: 'Enforces clean package boundaries and prevents coupling to internals.',
                });
            }
        }
    }
    return findings;
}
// ─── 3C: Barrel Explosion / Depth ──────────────────────────────────────────
export function computeBarrelDepth(file, dependencyState, visited = new Set()) {
    if (visited.has(file))
        return 0;
    visited.add(file);
    const reexports = dependencyState.reExportsByFile.get(file);
    if (!reexports || reexports.length === 0)
        return 0;
    let maxChild = 0;
    for (const re of reexports) {
        const target = re.resolvedModule;
        if (!target)
            continue;
        const targetRe = dependencyState.reExportsByFile.get(target);
        if (targetRe && targetRe.length > 0) {
            maxChild = Math.max(maxChild, computeBarrelDepth(target, dependencyState, visited));
        }
    }
    return 1 + maxChild;
}
export function detectBarrelExplosion(dependencyState, symbolThreshold = 30) {
    const findings = [];
    for (const [file, reexports] of dependencyState.reExportsByFile.entries()) {
        if (isTestFile(file))
            continue;
        if (reexports.length === 0)
            continue;
        if (reexports.length > symbolThreshold) {
            findings.push({
                severity: reexports.length > symbolThreshold * 2 ? 'high' : 'medium',
                category: 'barrel-explosion',
                file,
                lineStart: 1,
                lineEnd: 1,
                title: `Barrel explosion: ${file}`,
                reason: `Barrel re-exports ${reexports.length} symbols (threshold: ${symbolThreshold}). Large barrels hurt bundling.`,
                files: [file],
                suggestedFix: {
                    strategy: 'Split barrel or use direct imports to reduce bundler cost.',
                    steps: [
                        'Group re-exports by domain into sub-barrels.',
                        'Let consumers import directly from source modules.',
                        'Remove unused re-exports (check dead-re-export findings).',
                    ],
                },
                impact: 'Reduces bundle size and speeds up IDE/tooling.',
            });
        }
        const depth = computeBarrelDepth(file, dependencyState);
        if (depth > 2) {
            findings.push({
                severity: 'high',
                category: 'barrel-explosion',
                file,
                lineStart: 1,
                lineEnd: 1,
                title: `Deep barrel chain: ${file} (depth ${depth})`,
                reason: `Barrel chain is ${depth} levels deep. Deep chains defeat tree-shaking.`,
                files: [file],
                suggestedFix: {
                    strategy: 'Flatten barrel chain to at most 2 levels.',
                    steps: [
                        'Re-export directly from source modules instead of intermediate barrels.',
                        'Remove intermediate barrel layers that add no value.',
                    ],
                },
                impact: 'Improves tree-shaking efficiency and import resolution speed.',
            });
        }
    }
    return findings;
}
// ─── 3D: God Module / God Function ─────────────────────────────────────────
export function detectGodModules(fileSummaries, dependencyState, stmtThreshold = 500, exportThreshold = 20) {
    const findings = [];
    for (const entry of fileSummaries) {
        if (isTestFile(entry.file))
            continue;
        const totalStmts = entry.functions.reduce((s, fn) => s + fn.statementCount, 0);
        const exportCount = (dependencyState.declaredExportsByFile.get(entry.file) || []).length;
        const reasons = [];
        if (totalStmts > stmtThreshold)
            reasons.push(`${totalStmts} statements (threshold: ${stmtThreshold})`);
        if (exportCount > exportThreshold)
            reasons.push(`${exportCount} exports (threshold: ${exportThreshold})`);
        if (reasons.length === 0)
            continue;
        findings.push({
            severity: 'high',
            category: 'god-module',
            file: entry.file,
            lineStart: 1,
            lineEnd: 1,
            title: `God module: ${entry.file}`,
            reason: `Module is excessively large: ${reasons.join('; ')}.`,
            files: [entry.file],
            suggestedFix: {
                strategy: 'Split module into focused sub-modules with single responsibilities.',
                steps: [
                    'Identify distinct functional groups within the module.',
                    'Extract each group into a dedicated module.',
                    'Create a barrel if backward compatibility is needed.',
                    'Update imports incrementally.',
                ],
            },
            impact: 'Smaller modules are easier to understand, test, and maintain.',
        });
    }
    return findings;
}
export function detectGodFunctions(fileSummaries, stmtThreshold = 100) {
    const findings = [];
    for (const entry of fileSummaries) {
        if (isTestFile(entry.file))
            continue;
        for (const fn of entry.functions) {
            if (fn.statementCount > stmtThreshold) {
                findings.push({
                    severity: 'high',
                    category: 'god-function',
                    file: entry.file,
                    lineStart: fn.lineStart,
                    lineEnd: fn.lineEnd,
                    title: `God function: ${fn.name}`,
                    reason: `Function has ${fn.statementCount} statements (threshold: ${stmtThreshold}).`,
                    files: [`${entry.file}:${fn.lineStart}-${fn.lineEnd}`],
                    suggestedFix: {
                        strategy: 'Break down into smaller, focused functions.',
                        steps: [
                            'Identify logical steps within the function.',
                            'Extract each step into a named helper.',
                            'Keep the original as a high-level orchestrator.',
                            'Test each extracted function independently.',
                        ],
                    },
                    impact: 'Improves readability, testability, and maintenance.',
                });
            }
        }
    }
    return findings;
}
// ─── 3E: Cognitive Complexity ──────────────────────────────────────────────
export function computeCognitiveComplexity(node) {
    let total = 0;
    const visit = (current, nesting) => {
        let increment = 0;
        let nestable = false;
        switch (current.kind) {
            case ts.SyntaxKind.IfStatement:
            case ts.SyntaxKind.ForStatement:
            case ts.SyntaxKind.ForInStatement:
            case ts.SyntaxKind.ForOfStatement:
            case ts.SyntaxKind.WhileStatement:
            case ts.SyntaxKind.DoStatement:
            case ts.SyntaxKind.CatchClause:
            case ts.SyntaxKind.ConditionalExpression:
            case ts.SyntaxKind.SwitchStatement:
                increment = 1;
                nestable = true;
                break;
            default:
                break;
        }
        if (current.kind === ts.SyntaxKind.BinaryExpression &&
            (current.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
                current.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
                current.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)) {
            increment = 1;
        }
        if (current.kind === ts.SyntaxKind.IfStatement && current.parent && ts.isIfStatement(current.parent) && current.parent.elseStatement === current) {
            increment = 1;
            nestable = false;
        }
        if (nestable) {
            total += increment + nesting;
            ts.forEachChild(current, (child) => visit(child, nesting + 1));
            return;
        }
        total += increment;
        ts.forEachChild(current, (child) => visit(child, nesting));
    };
    visit(node, 0);
    return total;
}
export function detectCognitiveComplexity(fileSummaries, threshold = 15) {
    const findings = [];
    for (const entry of fileSummaries) {
        if (isTestFile(entry.file))
            continue;
        for (const fn of entry.functions) {
            if (fn.cognitiveComplexity > threshold) {
                findings.push({
                    severity: fn.cognitiveComplexity > 25 ? 'high' : 'medium',
                    category: 'cognitive-complexity',
                    file: entry.file,
                    lineStart: fn.lineStart,
                    lineEnd: fn.lineEnd,
                    title: `High cognitive complexity: ${fn.name} (${fn.cognitiveComplexity})`,
                    reason: `Function cognitive complexity is ${fn.cognitiveComplexity} (threshold: ${threshold}). Nested branches compound reading difficulty.`,
                    files: [`${entry.file}:${fn.lineStart}-${fn.lineEnd}`],
                    suggestedFix: {
                        strategy: 'Reduce nesting and simplify control flow.',
                        steps: [
                            'Convert nested branches into early returns / guard clauses.',
                            'Extract deeply nested blocks into named helper functions.',
                            'Replace complex boolean chains with named predicates.',
                        ],
                    },
                    impact: 'Lower cognitive complexity directly correlates with fewer bugs and faster code reviews.',
                });
            }
        }
    }
    return findings;
}
// ─── 3F: Layer Violation Detection ─────────────────────────────────────────
export function detectLayerViolations(dependencyState, layerOrder) {
    if (layerOrder.length < 2)
        return [];
    const findings = [];
    const getLayer = (file) => {
        for (let i = 0; i < layerOrder.length; i++) {
            if (file.includes(layerOrder[i]))
                return i;
        }
        return -1;
    };
    for (const file of dependencyState.files) {
        if (isTestFile(file))
            continue;
        const srcLayer = getLayer(file);
        if (srcLayer === -1)
            continue;
        for (const dep of (dependencyState.outgoing.get(file) || new Set())) {
            if (!dependencyState.files.has(dep) || isTestFile(dep))
                continue;
            const depLayer = getLayer(dep);
            if (depLayer === -1)
                continue;
            if (depLayer < srcLayer) {
                findings.push({
                    severity: 'high',
                    category: 'layer-violation',
                    file,
                    lineStart: 1,
                    lineEnd: 1,
                    title: `Layer violation: ${layerOrder[srcLayer]} imports from ${layerOrder[depLayer]}`,
                    reason: `"${file}" (layer: ${layerOrder[srcLayer]}) imports "${dep}" (layer: ${layerOrder[depLayer]}). Layer order: ${layerOrder.join(' → ')}.`,
                    files: [file, dep],
                    suggestedFix: {
                        strategy: 'Respect layer boundaries by inverting the dependency or moving shared logic.',
                        steps: [
                            'Extract shared contracts to a lower layer that both can depend on.',
                            'Use dependency inversion: define an interface in the lower layer, implement in higher.',
                            'If the dependency is justified, reconsider your layer boundaries.',
                        ],
                    },
                    impact: 'Prevents architectural erosion and keeps dependency flow unidirectional.',
                });
            }
        }
    }
    return findings;
}
// ─── Low Cohesion Detection (LCOM via export consumer overlap) ─────────────
export function detectLowCohesion(dependencyState, minExports = 3) {
    const findings = [];
    for (const file of dependencyState.files) {
        if (isTestFile(file) || isLikelyEntrypoint(file))
            continue;
        const exports = dependencyState.declaredExportsByFile.get(file);
        if (!exports || exports.length < minExports)
            continue;
        const exportNames = new Set(exports.map(e => e.name));
        const symbolConsumers = new Map();
        for (const [consumer, imports] of dependencyState.importedSymbolsByFile.entries()) {
            for (const imp of imports) {
                if (imp.resolvedModule !== file)
                    continue;
                if (!exportNames.has(imp.importedName))
                    continue;
                if (!symbolConsumers.has(imp.importedName))
                    symbolConsumers.set(imp.importedName, new Set());
                symbolConsumers.get(imp.importedName).add(consumer);
            }
        }
        const consumedSymbols = [...symbolConsumers.keys()];
        if (consumedSymbols.length < 2)
            continue;
        const adj = new Map();
        for (const sym of consumedSymbols)
            adj.set(sym, new Set());
        for (const [consumer, imports] of dependencyState.importedSymbolsByFile.entries()) {
            const fromThisFile = imports
                .filter(i => i.resolvedModule === file && exportNames.has(i.importedName))
                .map(i => i.importedName);
            for (let i = 0; i < fromThisFile.length; i++) {
                for (let j = i + 1; j < fromThisFile.length; j++) {
                    adj.get(fromThisFile[i])?.add(fromThisFile[j]);
                    adj.get(fromThisFile[j])?.add(fromThisFile[i]);
                }
            }
        }
        const visited = new Set();
        let components = 0;
        for (const sym of consumedSymbols) {
            if (visited.has(sym))
                continue;
            components++;
            const queue = [sym];
            while (queue.length > 0) {
                const curr = queue.pop();
                if (visited.has(curr))
                    continue;
                visited.add(curr);
                for (const neighbor of adj.get(curr) || []) {
                    if (!visited.has(neighbor))
                        queue.push(neighbor);
                }
            }
        }
        if (components > 1) {
            findings.push({
                severity: components >= 4 ? 'high' : 'medium',
                category: 'low-cohesion',
                file,
                lineStart: 1,
                lineEnd: 1,
                title: `Low cohesion: ${file} (LCOM=${components})`,
                reason: `Module exports ${consumedSymbols.length} consumed symbols that form ${components} independent groups. Consumers never import symbols across groups — the module serves unrelated purposes.`,
                files: [file],
                suggestedFix: {
                    strategy: `Split into ${components} focused modules, one per cohesion group.`,
                    steps: [
                        'Identify which exports belong to each independent group.',
                        'Create a new module for each group with a descriptive name.',
                        'Move exports and their dependencies to the appropriate module.',
                        'Update consumer imports to point to the new modules.',
                    ],
                },
                impact: 'Higher cohesion = easier navigation, focused testing, and smaller change blast radius.',
            });
        }
    }
    return findings;
}
// ─── Inferred Layer Violations (auto-detect from directory structure) ───────
const INFERRED_LAYERS = [
    { level: 0, patterns: ['types', 'constants', 'interfaces', 'contracts', 'schema', 'schemas'] },
    { level: 1, patterns: ['utils', 'helpers', 'lib', 'common', 'shared', 'core'] },
    { level: 2, patterns: ['services', 'service', 'api', 'domain', 'repositories', 'repository', 'store', 'stores', 'providers'] },
    { level: 3, patterns: ['features', 'modules', 'pages', 'routes', 'components', 'views', 'handlers', 'controllers'] },
];
export function getInferredLayer(filePath) {
    const parts = filePath.split('/');
    for (const part of parts) {
        const lower = part.toLowerCase();
        for (const layer of INFERRED_LAYERS) {
            if (layer.patterns.includes(lower))
                return layer.level;
        }
    }
    return -1;
}
const LAYER_NAMES = ['foundation', 'utility', 'service', 'feature'];
export function detectInferredLayerViolations(dependencyState) {
    const findings = [];
    for (const file of dependencyState.files) {
        if (isTestFile(file))
            continue;
        const srcLayer = getInferredLayer(file);
        if (srcLayer === -1)
            continue;
        for (const dep of (dependencyState.outgoing.get(file) || new Set())) {
            if (!dependencyState.files.has(dep) || isTestFile(dep))
                continue;
            const depLayer = getInferredLayer(dep);
            if (depLayer === -1)
                continue;
            if (depLayer > srcLayer) {
                findings.push({
                    severity: 'high',
                    category: 'inferred-layer-violation',
                    file,
                    lineStart: 1,
                    lineEnd: 1,
                    title: `Layer violation: ${LAYER_NAMES[srcLayer]} → ${LAYER_NAMES[depLayer]}`,
                    reason: `"${file}" (${LAYER_NAMES[srcLayer]} layer) imports "${dep}" (${LAYER_NAMES[depLayer]} layer). Lower layers must not depend on higher layers.`,
                    files: [file, dep],
                    suggestedFix: {
                        strategy: 'Invert the dependency or extract shared contracts to a lower layer.',
                        steps: [
                            'Define an interface/type in the lower layer.',
                            'Have the higher layer implement or provide the concrete dependency.',
                            'Inject via parameter, factory, or configuration rather than direct import.',
                        ],
                    },
                    impact: 'Maintains clean architecture boundaries and prevents upward coupling.',
                });
            }
        }
    }
    return findings;
}
// ─── Hot Files (Change Risk Hotspots) ──────────────────────────────────────
export function computeHotFiles(dependencyState, dependencySummary, fileCriticalityByPath, maxResults = 20) {
    const cycleFiles = new Set();
    for (const cycle of dependencySummary.cycles) {
        for (const node of cycle.path)
            cycleFiles.add(node);
    }
    const criticalPathFiles = new Set();
    for (const cp of dependencySummary.criticalPaths) {
        for (const node of cp.path)
            criticalPathFiles.add(node);
    }
    const results = [];
    for (const file of dependencyState.files) {
        if (isTestFile(file))
            continue;
        const fanIn = (dependencyState.incoming.get(file) || new Set()).size;
        const fanOut = (dependencyState.outgoing.get(file) || new Set()).size;
        const crit = fileCriticalityByPath.get(file);
        const complexityScore = crit?.score ?? 0;
        const exportCount = (dependencyState.declaredExportsByFile.get(file) || []).length;
        const inCycle = cycleFiles.has(file);
        const onCriticalPath = criticalPathFiles.has(file);
        const riskScore = Math.round(fanIn * 3
            + complexityScore * 0.5
            + exportCount * 1.5
            + fanOut * 0.5
            + (inCycle ? 20 : 0)
            + (onCriticalPath ? 10 : 0));
        if (riskScore > 0) {
            results.push({ file, riskScore, fanIn, fanOut, complexityScore, exportCount, inCycle, onCriticalPath });
        }
    }
    results.sort((a, b) => b.riskScore - a.riskScore);
    return results.slice(0, maxResults);
}
// ─── Excessive Parameters ──────────────────────────────────────────────────
export function detectExcessiveParameters(fileSummaries, threshold = 5) {
    const findings = [];
    for (const entry of fileSummaries) {
        if (isTestFile(entry.file))
            continue;
        for (const fn of entry.functions) {
            if (fn.params == null || fn.params <= threshold)
                continue;
            findings.push({
                severity: fn.params > 7 ? 'high' : 'medium',
                category: 'excessive-parameters',
                file: entry.file,
                lineStart: fn.lineStart,
                lineEnd: fn.lineEnd,
                title: `Excessive parameters: ${fn.name} (${fn.params} params)`,
                reason: `Function has ${fn.params} parameters (threshold: ${threshold}). High parameter counts make call sites hard to read and signal the function may be doing too much.`,
                files: [`${entry.file}:${fn.lineStart}-${fn.lineEnd}`],
                suggestedFix: {
                    strategy: 'Introduce a parameter object or split the function.',
                    steps: [
                        'Group related parameters into an options/config object.',
                        'Use destructuring at the function signature for clarity.',
                        'Consider splitting into smaller, focused functions if params serve different concerns.',
                    ],
                },
                impact: 'Improves call-site readability and makes the API easier to evolve.',
            });
        }
    }
    return findings;
}
// ─── Empty Catch Blocks ────────────────────────────────────────────────────
export function detectEmptyCatchBlocks(fileSummaries) {
    const findings = [];
    for (const entry of fileSummaries) {
        if (isTestFile(entry.file))
            continue;
        if (!entry.emptyCatches || entry.emptyCatches.length === 0)
            continue;
        for (const loc of entry.emptyCatches) {
            findings.push({
                severity: 'medium',
                category: 'empty-catch',
                file: entry.file,
                lineStart: loc.lineStart,
                lineEnd: loc.lineEnd,
                title: `Empty catch block silently swallows errors`,
                reason: `Catch block at line ${loc.lineStart} has no statements — errors are silently ignored.`,
                files: [`${entry.file}:${loc.lineStart}-${loc.lineEnd}`],
                suggestedFix: {
                    strategy: 'Log, re-throw, or handle the error explicitly.',
                    steps: [
                        'Add error logging (console.error or a logger) at minimum.',
                        'Re-throw if the caller should handle the error.',
                        'Add a comment explaining why swallowing is intentional, if it truly is.',
                    ],
                },
                impact: 'Prevents silent failures that are extremely hard to debug in production.',
            });
        }
    }
    return findings;
}
// ─── Switch Without Default ────────────────────────────────────────────────
export function detectSwitchNoDefault(fileSummaries) {
    const findings = [];
    for (const entry of fileSummaries) {
        if (isTestFile(entry.file))
            continue;
        if (!entry.switchesWithoutDefault || entry.switchesWithoutDefault.length === 0)
            continue;
        for (const loc of entry.switchesWithoutDefault) {
            findings.push({
                severity: 'low',
                category: 'switch-no-default',
                file: entry.file,
                lineStart: loc.lineStart,
                lineEnd: loc.lineEnd,
                title: `Switch statement missing default case`,
                reason: `Switch at line ${loc.lineStart} has no default clause — unexpected values fall through silently.`,
                files: [`${entry.file}:${loc.lineStart}-${loc.lineEnd}`],
                suggestedFix: {
                    strategy: 'Add a default case with error handling or exhaustive check.',
                    steps: [
                        'Add a default clause that throws an unreachable error for exhaustiveness.',
                        'Or log a warning for unexpected values.',
                        'In TypeScript, use `never` type assertion for compile-time exhaustive checks.',
                    ],
                },
                impact: 'Catches unexpected values early and prevents silent logic bugs.',
            });
        }
    }
    return findings;
}
// ─── High Cyclomatic Density ───────────────────────────────────────────────
export function detectHighCyclomaticDensity(fileSummaries, threshold = 0.5) {
    const findings = [];
    for (const entry of fileSummaries) {
        if (isTestFile(entry.file))
            continue;
        for (const fn of entry.functions) {
            if (fn.statementCount < 5)
                continue;
            const density = fn.complexity / fn.statementCount;
            if (density <= threshold)
                continue;
            findings.push({
                severity: density > 1.0 ? 'high' : 'medium',
                category: 'high-cyclomatic-density',
                file: entry.file,
                lineStart: fn.lineStart,
                lineEnd: fn.lineEnd,
                title: `High cyclomatic density: ${fn.name} (${density.toFixed(2)})`,
                reason: `Function has ${fn.complexity} branches across ${fn.statementCount} statements (density=${density.toFixed(2)}, threshold: ${threshold}). Nearly every line is a decision point.`,
                files: [`${entry.file}:${fn.lineStart}-${fn.lineEnd}`],
                suggestedFix: {
                    strategy: 'Extract conditional logic into guard clauses or helper predicates.',
                    steps: [
                        'Convert nested if-else chains into early returns.',
                        'Extract boolean expressions into named predicate functions.',
                        'Consider a lookup table or strategy pattern for dense switch/if logic.',
                    ],
                },
                impact: 'Reduces the mental model needed to understand each function.',
            });
        }
    }
    return findings;
}
// ─── Unsafe `any` Usage ────────────────────────────────────────────────────
export function detectUnsafeAny(fileSummaries, threshold = 5) {
    const findings = [];
    for (const entry of fileSummaries) {
        if (isTestFile(entry.file))
            continue;
        if (entry.anyCount == null || entry.anyCount <= threshold)
            continue;
        findings.push({
            severity: entry.anyCount > 10 ? 'high' : 'medium',
            category: 'unsafe-any',
            file: entry.file,
            lineStart: 1,
            lineEnd: 1,
            title: `Excessive \`any\` usage: ${entry.file} (${entry.anyCount} occurrences)`,
            reason: `File uses \`any\` type ${entry.anyCount} times (threshold: ${threshold}). Each \`any\` disables type checking and allows silent runtime errors.`,
            files: [entry.file],
            suggestedFix: {
                strategy: 'Replace `any` with specific types, `unknown`, or generics.',
                steps: [
                    'Replace `any` with `unknown` and add type guards where needed.',
                    'Use generics for functions that operate on multiple types.',
                    'Define proper interfaces for complex data shapes.',
                    'Use `as const` assertions instead of `as any` where possible.',
                ],
            },
            impact: 'Restores TypeScript safety and catches bugs at compile time instead of runtime.',
        });
    }
    return findings;
}
// ─── Magic Numbers ─────────────────────────────────────────────────────────
export function detectMagicNumbers(fileSummaries, threshold = 3) {
    const findings = [];
    for (const entry of fileSummaries) {
        if (isTestFile(entry.file))
            continue;
        if (!entry.magicNumbers || entry.magicNumbers.length <= threshold)
            continue;
        const sample = entry.magicNumbers.slice(0, 5).map(m => `${m.value} (line ${m.lineStart})`).join(', ');
        findings.push({
            severity: entry.magicNumbers.length > 8 ? 'high' : 'medium',
            category: 'magic-number',
            file: entry.file,
            lineStart: entry.magicNumbers[0].lineStart,
            lineEnd: entry.magicNumbers[0].lineEnd,
            title: `Magic numbers: ${entry.file} (${entry.magicNumbers.length} occurrences)`,
            reason: `File contains ${entry.magicNumbers.length} magic number literals (threshold: ${threshold}). Examples: ${sample}.`,
            files: [entry.file],
            suggestedFix: {
                strategy: 'Extract magic numbers into named constants.',
                steps: [
                    'Create named constants with descriptive names (e.g. MAX_RETRY_COUNT = 3).',
                    'Group related constants in a config object or enum.',
                    'Replace inline literals with the named constant references.',
                ],
            },
            impact: 'Named constants make code self-documenting and easier to update consistently.',
        });
    }
    return findings;
}
// ─── High Halstead Effort ──────────────────────────────────────────────────
export function detectHighHalsteadEffort(fileSummaries, effortThreshold = 500_000, bugThreshold = 2.0) {
    const findings = [];
    for (const entry of fileSummaries) {
        if (isTestFile(entry.file))
            continue;
        for (const fn of entry.functions) {
            if (!fn.halstead)
                continue;
            const { effort, estimatedBugs, volume } = fn.halstead;
            if (effort <= effortThreshold && estimatedBugs <= bugThreshold)
                continue;
            const reasons = [];
            if (effort > effortThreshold)
                reasons.push(`effort=${Math.round(effort)} (threshold: ${effortThreshold})`);
            if (estimatedBugs > bugThreshold)
                reasons.push(`estimatedBugs=${estimatedBugs.toFixed(2)} (threshold: ${bugThreshold})`);
            findings.push({
                severity: effort > effortThreshold * 2 || estimatedBugs > 5 ? 'high' : 'medium',
                category: 'halstead-effort',
                file: entry.file,
                lineStart: fn.lineStart,
                lineEnd: fn.lineEnd,
                title: `High Halstead complexity: ${fn.name}`,
                reason: `Function has high implementation complexity: ${reasons.join('; ')}. Volume=${Math.round(volume)}.`,
                files: [`${entry.file}:${fn.lineStart}-${fn.lineEnd}`],
                suggestedFix: {
                    strategy: 'Reduce operator/operand count by extracting helpers and simplifying expressions.',
                    steps: [
                        'Extract complex sub-expressions into named intermediate variables.',
                        'Split into smaller functions with fewer unique operators/operands.',
                        'Replace imperative loops with declarative array methods where clearer.',
                    ],
                },
                impact: 'Lower Halstead effort correlates with fewer bugs and faster comprehension.',
            });
        }
    }
    return findings;
}
// ─── Low Maintainability Index ─────────────────────────────────────────────
export function detectLowMaintainability(fileSummaries, threshold = 20) {
    const findings = [];
    for (const entry of fileSummaries) {
        if (isTestFile(entry.file))
            continue;
        for (const fn of entry.functions) {
            if (fn.maintainabilityIndex == null || fn.maintainabilityIndex >= threshold)
                continue;
            findings.push({
                severity: fn.maintainabilityIndex < 10 ? 'critical' : 'high',
                category: 'low-maintainability',
                file: entry.file,
                lineStart: fn.lineStart,
                lineEnd: fn.lineEnd,
                title: `Low maintainability: ${fn.name} (MI=${fn.maintainabilityIndex.toFixed(1)})`,
                reason: `Maintainability Index is ${fn.maintainabilityIndex.toFixed(1)} (threshold: ${threshold}, scale 0-100). Combines Halstead volume, cyclomatic complexity, and lines of code.`,
                files: [`${entry.file}:${fn.lineStart}-${fn.lineEnd}`],
                suggestedFix: {
                    strategy: 'Reduce complexity, shorten the function, and simplify expressions.',
                    steps: [
                        'Split into smaller functions to reduce LOC and cyclomatic complexity.',
                        'Extract complex expressions to reduce Halstead volume.',
                        'Convert nested logic to early returns and guard clauses.',
                        'Consider if parts of the function belong in separate modules.',
                    ],
                },
                impact: 'Higher MI directly predicts lower maintenance cost and defect rate.',
            });
        }
    }
    return findings;
}
