import * as ts from 'typescript';
import type {
  DependencyState,
  DependencySummary,
  FileEntry,
  FileCriticality,
  Finding,
  HotFile,
  FunctionEntry,
} from './types.js';
import { isTestFile } from './utils.js';

type FindingDraft = Omit<Finding, 'id'>;

function isLikelyEntrypoint(filePath: string): boolean {
  const normalized = filePath.toLowerCase();
  return /(^|\/)(index|main|app|server|cli)\.[mc]?[jt]sx?$/.test(normalized);
}

// ─── 2A: Instability Metric (SDP) ──────────────────────────────────────────

export function computeInstability(inboundCount: number, outboundCount: number): number {
  const total = inboundCount + outboundCount;
  if (total === 0) return 0;
  return outboundCount / total;
}

export function detectSdpViolations(
  dependencyState: DependencyState,
  minDelta: number = 0.15,
): FindingDraft[] {
  const findings: FindingDraft[] = [];
  const cache = new Map<string, number>();

  const getI = (file: string): number => {
    if (cache.has(file)) return cache.get(file)!;
    const ca = (dependencyState.incoming.get(file) || new Set()).size;
    const ce = (dependencyState.outgoing.get(file) || new Set()).size;
    const i = computeInstability(ca, ce);
    cache.set(file, i);
    return i;
  };

  for (const file of dependencyState.files) {
    if (isTestFile(file)) continue;
    const deps = dependencyState.outgoing.get(file) || new Set();
    const iSrc = getI(file);

    for (const dep of deps) {
      if (!dependencyState.files.has(dep) || isTestFile(dep)) continue;
      const iTgt = getI(dep);
      const delta = iTgt - iSrc;

      if (delta > minDelta && iSrc < 0.5) {
        findings.push({
          severity: delta > 0.3 ? 'high' : 'medium',
          category: 'architecture-sdp-violation',
          file,
          lineStart: 1,
          lineEnd: 1,
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

export function detectHighCoupling(
  dependencyState: DependencyState,
  threshold: number = 15,
): FindingDraft[] {
  const findings: FindingDraft[] = [];

  for (const file of dependencyState.files) {
    if (isTestFile(file)) continue;
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

export function detectGodModuleCoupling(
  dependencyState: DependencyState,
  fanInThreshold: number = 20,
  fanOutThreshold: number = 15,
): FindingDraft[] {
  const findings: FindingDraft[] = [];

  for (const file of dependencyState.files) {
    if (isTestFile(file)) continue;
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

export function detectOrphanModules(
  dependencyState: DependencyState,
): FindingDraft[] {
  const findings: FindingDraft[] = [];

  for (const file of dependencyState.files) {
    if (isTestFile(file)) continue;
    if (isLikelyEntrypoint(file)) continue;

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

export function detectUnreachableModules(
  dependencyState: DependencyState,
): FindingDraft[] {
  const findings: FindingDraft[] = [];

  const entrypoints = new Set<string>();
  for (const file of dependencyState.files) {
    if (isLikelyEntrypoint(file)) entrypoints.add(file);
  }
  if (entrypoints.size === 0) {
    for (const file of dependencyState.files) {
      if ((dependencyState.incoming.get(file) || new Set()).size === 0) {
        entrypoints.add(file);
      }
    }
  }

  const reachable = new Set<string>();
  const queue = [...entrypoints];
  while (queue.length > 0) {
    const current = queue.pop()!;
    if (reachable.has(current)) continue;
    reachable.add(current);
    for (const dep of (dependencyState.outgoing.get(current) || new Set())) {
      if (dependencyState.files.has(dep) && !reachable.has(dep)) queue.push(dep);
    }
  }

  for (const file of dependencyState.files) {
    if (isTestFile(file) || reachable.has(file) || isLikelyEntrypoint(file)) continue;
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

export function detectUnusedNpmDeps(
  externalDeps: Map<string, Set<string>>,
  packageJsonDeps: Record<string, string>,
  devDeps: Record<string, string> = {},
): FindingDraft[] {
  const findings: FindingDraft[] = [];

  const usedPackages = new Set<string>();
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

export function detectBoundaryViolations(
  dependencyState: DependencyState,
): FindingDraft[] {
  const findings: FindingDraft[] = [];

  for (const file of dependencyState.files) {
    if (isTestFile(file)) continue;

    const fileMatch = file.match(/^packages\/([^/]+)\//);
    if (!fileMatch) continue;
    const filePkg = fileMatch[1];

    for (const dep of (dependencyState.outgoing.get(file) || new Set())) {
      const depMatch = dep.match(/^packages\/([^/]+)\//);
      if (!depMatch) continue;
      if (depMatch[1] === filePkg) continue;

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

export function computeBarrelDepth(
  file: string,
  dependencyState: DependencyState,
  visited: Set<string> = new Set(),
): number {
  if (visited.has(file)) return 0;
  visited.add(file);

  const reexports = dependencyState.reExportsByFile.get(file);
  if (!reexports || reexports.length === 0) return 0;

  let maxChild = 0;
  for (const re of reexports) {
    const target = re.resolvedModule;
    if (!target) continue;
    const targetRe = dependencyState.reExportsByFile.get(target);
    if (targetRe && targetRe.length > 0) {
      maxChild = Math.max(maxChild, computeBarrelDepth(target, dependencyState, visited));
    }
  }

  return 1 + maxChild;
}

export function detectBarrelExplosion(
  dependencyState: DependencyState,
  symbolThreshold: number = 30,
): FindingDraft[] {
  const findings: FindingDraft[] = [];

  for (const [file, reexports] of dependencyState.reExportsByFile.entries()) {
    if (isTestFile(file)) continue;
    if (reexports.length === 0) continue;

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

export function detectGodModules(
  fileSummaries: FileEntry[],
  dependencyState: DependencyState,
  stmtThreshold: number = 500,
  exportThreshold: number = 20,
): FindingDraft[] {
  const findings: FindingDraft[] = [];

  for (const entry of fileSummaries) {
    if (isTestFile(entry.file)) continue;
    const totalStmts = entry.functions.reduce((s, fn) => s + fn.statementCount, 0);
    const exportCount = (dependencyState.declaredExportsByFile.get(entry.file) || []).length;
    const reasons: string[] = [];
    if (totalStmts > stmtThreshold) reasons.push(`${totalStmts} statements (threshold: ${stmtThreshold})`);
    if (exportCount > exportThreshold) reasons.push(`${exportCount} exports (threshold: ${exportThreshold})`);
    if (reasons.length === 0) continue;

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

export function detectGodFunctions(
  fileSummaries: FileEntry[],
  stmtThreshold: number = 100,
): FindingDraft[] {
  const findings: FindingDraft[] = [];

  for (const entry of fileSummaries) {
    if (isTestFile(entry.file)) continue;
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

export function computeCognitiveComplexity(node: ts.Node): number {
  let total = 0;

  const visit = (current: ts.Node, nesting: number): void => {
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

    if (
      current.kind === ts.SyntaxKind.BinaryExpression &&
      ((current as ts.BinaryExpression).operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
        (current as ts.BinaryExpression).operatorToken.kind === ts.SyntaxKind.BarBarToken ||
        (current as ts.BinaryExpression).operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
    ) {
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

export function detectCognitiveComplexity(
  fileSummaries: FileEntry[],
  threshold: number = 15,
): FindingDraft[] {
  const findings: FindingDraft[] = [];

  for (const entry of fileSummaries) {
    if (isTestFile(entry.file)) continue;
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

export function detectLayerViolations(
  dependencyState: DependencyState,
  layerOrder: string[],
): FindingDraft[] {
  if (layerOrder.length < 2) return [];

  const findings: FindingDraft[] = [];

  const getLayer = (file: string): number => {
    for (let i = 0; i < layerOrder.length; i++) {
      if (file.includes(layerOrder[i])) return i;
    }
    return -1;
  };

  for (const file of dependencyState.files) {
    if (isTestFile(file)) continue;
    const srcLayer = getLayer(file);
    if (srcLayer === -1) continue;

    for (const dep of (dependencyState.outgoing.get(file) || new Set())) {
      if (!dependencyState.files.has(dep) || isTestFile(dep)) continue;
      const depLayer = getLayer(dep);
      if (depLayer === -1) continue;

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

export function detectLowCohesion(
  dependencyState: DependencyState,
  minExports: number = 3,
): FindingDraft[] {
  const findings: FindingDraft[] = [];

  for (const file of dependencyState.files) {
    if (isTestFile(file) || isLikelyEntrypoint(file)) continue;

    const exports = dependencyState.declaredExportsByFile.get(file);
    if (!exports || exports.length < minExports) continue;

    const exportNames = new Set(exports.map(e => e.name));

    const symbolConsumers = new Map<string, Set<string>>();
    for (const [consumer, imports] of dependencyState.importedSymbolsByFile.entries()) {
      for (const imp of imports) {
        if (imp.resolvedModule !== file) continue;
        if (!exportNames.has(imp.importedName)) continue;
        if (!symbolConsumers.has(imp.importedName)) symbolConsumers.set(imp.importedName, new Set());
        symbolConsumers.get(imp.importedName)!.add(consumer);
      }
    }

    const consumedSymbols = [...symbolConsumers.keys()];
    if (consumedSymbols.length < 2) continue;

    const adj = new Map<string, Set<string>>();
    for (const sym of consumedSymbols) adj.set(sym, new Set());

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

    const visited = new Set<string>();
    let components = 0;
    for (const sym of consumedSymbols) {
      if (visited.has(sym)) continue;
      components++;
      const queue = [sym];
      while (queue.length > 0) {
        const curr = queue.pop()!;
        if (visited.has(curr)) continue;
        visited.add(curr);
        for (const neighbor of adj.get(curr) || []) {
          if (!visited.has(neighbor)) queue.push(neighbor);
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

const INFERRED_LAYERS: { level: number; patterns: string[] }[] = [
  { level: 0, patterns: ['types', 'constants', 'interfaces', 'contracts', 'schema', 'schemas'] },
  { level: 1, patterns: ['utils', 'helpers', 'lib', 'common', 'shared', 'core'] },
  { level: 2, patterns: ['services', 'service', 'api', 'domain', 'repositories', 'repository', 'store', 'stores', 'providers'] },
  { level: 3, patterns: ['features', 'modules', 'pages', 'routes', 'components', 'views', 'handlers', 'controllers'] },
];

export function getInferredLayer(filePath: string): number {
  const parts = filePath.split('/');
  for (const part of parts) {
    const lower = part.toLowerCase();
    for (const layer of INFERRED_LAYERS) {
      if (layer.patterns.includes(lower)) return layer.level;
    }
  }
  return -1;
}

const LAYER_NAMES = ['foundation', 'utility', 'service', 'feature'];

export function detectInferredLayerViolations(
  dependencyState: DependencyState,
): FindingDraft[] {
  const findings: FindingDraft[] = [];

  for (const file of dependencyState.files) {
    if (isTestFile(file)) continue;
    const srcLayer = getInferredLayer(file);
    if (srcLayer === -1) continue;

    for (const dep of (dependencyState.outgoing.get(file) || new Set())) {
      if (!dependencyState.files.has(dep) || isTestFile(dep)) continue;
      const depLayer = getInferredLayer(dep);
      if (depLayer === -1) continue;

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

export function computeHotFiles(
  dependencyState: DependencyState,
  dependencySummary: DependencySummary,
  fileCriticalityByPath: Map<string, FileCriticality>,
  maxResults: number = 20,
): HotFile[] {
  const cycleFiles = new Set<string>();
  for (const cycle of dependencySummary.cycles) {
    for (const node of cycle.path) cycleFiles.add(node);
  }

  const criticalPathFiles = new Set<string>();
  for (const cp of dependencySummary.criticalPaths) {
    for (const node of cp.path) criticalPathFiles.add(node);
  }

  const results: HotFile[] = [];
  for (const file of dependencyState.files) {
    if (isTestFile(file)) continue;

    const fanIn = (dependencyState.incoming.get(file) || new Set()).size;
    const fanOut = (dependencyState.outgoing.get(file) || new Set()).size;
    const crit = fileCriticalityByPath.get(file);
    const complexityScore = crit?.score ?? 0;
    const exportCount = (dependencyState.declaredExportsByFile.get(file) || []).length;
    const inCycle = cycleFiles.has(file);
    const onCriticalPath = criticalPathFiles.has(file);

    const riskScore = Math.round(
      fanIn * 3
      + complexityScore * 0.5
      + exportCount * 1.5
      + fanOut * 0.5
      + (inCycle ? 20 : 0)
      + (onCriticalPath ? 10 : 0),
    );

    if (riskScore > 0) {
      results.push({ file, riskScore, fanIn, fanOut, complexityScore, exportCount, inCycle, onCriticalPath });
    }
  }

  results.sort((a, b) => b.riskScore - a.riskScore);
  return results.slice(0, maxResults);
}

// ─── Excessive Parameters ──────────────────────────────────────────────────

export function detectExcessiveParameters(
  fileSummaries: FileEntry[],
  threshold: number = 5,
): FindingDraft[] {
  const findings: FindingDraft[] = [];
  for (const entry of fileSummaries) {
    if (isTestFile(entry.file)) continue;
    for (const fn of entry.functions) {
      if (fn.params == null || fn.params <= threshold) continue;
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

export function detectEmptyCatchBlocks(
  fileSummaries: FileEntry[],
): FindingDraft[] {
  const findings: FindingDraft[] = [];
  for (const entry of fileSummaries) {
    if (isTestFile(entry.file)) continue;
    if (!entry.emptyCatches || entry.emptyCatches.length === 0) continue;
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

export function detectSwitchNoDefault(
  fileSummaries: FileEntry[],
): FindingDraft[] {
  const findings: FindingDraft[] = [];
  for (const entry of fileSummaries) {
    if (isTestFile(entry.file)) continue;
    if (!entry.switchesWithoutDefault || entry.switchesWithoutDefault.length === 0) continue;
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

export function detectHighCyclomaticDensity(
  fileSummaries: FileEntry[],
  threshold: number = 0.5,
): FindingDraft[] {
  const findings: FindingDraft[] = [];
  for (const entry of fileSummaries) {
    if (isTestFile(entry.file)) continue;
    for (const fn of entry.functions) {
      if (fn.statementCount < 5) continue;
      const density = fn.complexity / fn.statementCount;
      if (density <= threshold) continue;
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

export function detectUnsafeAny(
  fileSummaries: FileEntry[],
  threshold: number = 5,
): FindingDraft[] {
  const findings: FindingDraft[] = [];
  for (const entry of fileSummaries) {
    if (isTestFile(entry.file)) continue;
    if (entry.anyCount == null || entry.anyCount <= threshold) continue;
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

export function detectMagicNumbers(
  fileSummaries: FileEntry[],
  threshold: number = 3,
): FindingDraft[] {
  const findings: FindingDraft[] = [];
  for (const entry of fileSummaries) {
    if (isTestFile(entry.file)) continue;
    if (!entry.magicNumbers || entry.magicNumbers.length <= threshold) continue;
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

export function detectHighHalsteadEffort(
  fileSummaries: FileEntry[],
  effortThreshold: number = 500_000,
  bugThreshold: number = 2.0,
): FindingDraft[] {
  const findings: FindingDraft[] = [];
  for (const entry of fileSummaries) {
    if (isTestFile(entry.file)) continue;
    for (const fn of entry.functions) {
      if (!fn.halstead) continue;
      const { effort, estimatedBugs, volume } = fn.halstead;
      if (effort <= effortThreshold && estimatedBugs <= bugThreshold) continue;
      const reasons: string[] = [];
      if (effort > effortThreshold) reasons.push(`effort=${Math.round(effort)} (threshold: ${effortThreshold})`);
      if (estimatedBugs > bugThreshold) reasons.push(`estimatedBugs=${estimatedBugs.toFixed(2)} (threshold: ${bugThreshold})`);
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

export function detectLowMaintainability(
  fileSummaries: FileEntry[],
  threshold: number = 20,
): FindingDraft[] {
  const findings: FindingDraft[] = [];
  for (const entry of fileSummaries) {
    if (isTestFile(entry.file)) continue;
    for (const fn of entry.functions) {
      if (fn.maintainabilityIndex == null || fn.maintainabilityIndex >= threshold) continue;
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
