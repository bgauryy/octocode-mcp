import * as ts from 'typescript';
import type {
  DependencyState,
  FileEntry,
  Finding,
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
