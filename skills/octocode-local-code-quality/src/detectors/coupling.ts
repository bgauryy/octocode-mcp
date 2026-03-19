import { findImportLine } from './shared.js';
import { canAddFinding } from './shared.js';
import { isTestFile } from '../common/utils.js';

import type { FindingDraft } from './shared.js';
import type { DependencyState } from '../types/index.js';

export function computeInstability(
  inboundCount: number,
  outboundCount: number
): number {
  const total = inboundCount + outboundCount;
  if (total === 0) return 0;
  return outboundCount / total;
}

export function detectSdpViolations(
  dependencyState: DependencyState,
  minDelta: number = 0.15
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
            strategy:
              'Invert dependency via interface/abstraction or move shared code to a stable utility.',
            steps: [
              'Extract a stable interface that the stable module depends on.',
              'Have the unstable module implement that interface.',
              'Consider moving shared logic to a lower-instability utility module.',
            ],
          },
          impact:
            'Prevents cascading instability and reduces change propagation risk.',
          tags: ['stability', 'coupling', 'architecture', 'sdp'],
        });
      }
    }
  }

  return findings;
}

export function detectHighCoupling(
  dependencyState: DependencyState,
  threshold: number = 15
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
          strategy:
            'Reduce coupling by extracting interfaces or splitting module responsibilities.',
          steps: [
            'Identify groups of related imports/dependents that can be isolated.',
            'Extract focused sub-modules with single responsibilities.',
            'Use dependency inversion to reduce direct coupling.',
          ],
        },
        impact:
          'Lower coupling reduces change ripple effects and improves testability.',
        tags: ['coupling', 'change-risk', 'architecture'],
      });
    }
  }

  return findings;
}

export function detectGodModuleCoupling(
  dependencyState: DependencyState,
  fanInThreshold: number = 20,
  fanOutThreshold: number = 15
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
          strategy:
            'Split this module into focused sub-modules to reduce blast radius.',
          steps: [
            'Identify distinct groups of consumers using different parts of this module.',
            'Extract each group into a dedicated module.',
            'Update import paths incrementally.',
          ],
        },
        impact:
          'Reduces change blast radius and improves parallel development.',
        tags: ['coupling', 'blast-radius', 'bottleneck'],
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
          strategy:
            'Reduce dependencies by introducing facade or mediator patterns.',
          steps: [
            'Group related imports behind a single facade module.',
            'Consider splitting this module by responsibility.',
            'Use dependency injection to reduce direct coupling.',
          ],
        },
        impact:
          'Cleaner architecture and easier testing through reduced dependencies.',
        tags: ['coupling', 'responsibility', 'sprawl'],
      });
    }
  }

  return findings;
}

export function detectLayerViolations(
  dependencyState: DependencyState,
  layerOrder: string[]
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

    for (const dep of dependencyState.outgoing.get(file) || new Set()) {
      if (!dependencyState.files.has(dep) || isTestFile(dep)) continue;
      const depLayer = getLayer(dep);
      if (depLayer === -1) continue;

      if (depLayer < srcLayer) {
        const importRef = findImportLine(dependencyState, file, dep);
        findings.push({
          severity: 'high',
          category: 'layer-violation',
          file,
          lineStart: importRef.lineStart,
          lineEnd: importRef.lineEnd,
          title: `Layer violation: ${layerOrder[srcLayer]} imports from ${layerOrder[depLayer]}`,
          reason: `"${file}" (layer: ${layerOrder[srcLayer]}) imports "${dep}" (layer: ${layerOrder[depLayer]}). Layer order: ${layerOrder.join(' → ')}.`,
          files: [file, dep],
          suggestedFix: {
            strategy:
              'Respect layer boundaries by inverting the dependency or moving shared logic.',
            steps: [
              'Extract shared contracts to a lower layer that both can depend on.',
              'Use dependency inversion: define an interface in the lower layer, implement in higher.',
              'If the dependency is justified, reconsider your layer boundaries.',
            ],
          },
          impact:
            'Prevents architectural erosion and keeps dependency flow unidirectional.',
          tags: ['architecture', 'layering', 'coupling'],
        });
      }
    }
  }

  return findings;
}

export function computeAbstractness(
  exports: { name: string; kind: string }[]
): number {
  if (exports.length === 0) return 0;
  const abstractCount = exports.filter(e => e.kind === 'type').length;
  return abstractCount / exports.length;
}

export function detectDistanceFromMainSequence(
  dependencyState: DependencyState,
  distanceThreshold: number = 0.7,
  minCoupling: number = 3
): FindingDraft[] {
  const findings: FindingDraft[] = [];

  for (const file of dependencyState.files) {
    if (isTestFile(file)) continue;

    const exports = dependencyState.declaredExportsByFile.get(file);
    if (!exports || exports.length === 0) continue;

    const ca = (dependencyState.incoming.get(file) || new Set()).size;
    const ce = (dependencyState.outgoing.get(file) || new Set()).size;
    if (ca + ce < minCoupling) continue;

    const I = computeInstability(ca, ce);
    const A = computeAbstractness(exports);
    const D = Math.abs(A + I - 1);

    if (D < distanceThreshold) continue;

    const isZoneOfPain = A < 0.2 && I < 0.3;
    const isZoneOfUselessness = A > 0.7 && I > 0.7;

    let zone = '';
    if (isZoneOfPain)
      zone =
        'Zone of Pain (concrete + stable): hard to extend, painful to change.';
    else if (isZoneOfUselessness)
      zone =
        'Zone of Uselessness (abstract + unstable): over-abstracted and unused.';
    else
      zone = `Far from Main Sequence: balance between abstraction and stability is off.`;

    if (!canAddFinding(findings)) break;
    findings.push({
      severity: D > 0.85 ? 'high' : 'medium',
      category: 'distance-from-main-sequence',
      file,
      lineStart: 1,
      lineEnd: 1,
      title: `Distance from Main Sequence: ${file} (D=${D.toFixed(2)})`,
      reason: `${zone} A=${A.toFixed(2)}, I=${I.toFixed(2)}, D=${D.toFixed(2)} (threshold: ${distanceThreshold}).`,
      files: [file],
      suggestedFix: {
        strategy: isZoneOfPain
          ? 'Add abstractions (interfaces/types) or reduce inbound coupling.'
          : isZoneOfUselessness
            ? 'Add concrete implementations or remove unused abstractions.'
            : 'Rebalance by adjusting abstraction level or dependency direction.',
        steps: isZoneOfPain
          ? [
              'Extract interfaces for key behaviors to increase abstractness.',
              'Consider splitting into abstract contracts + concrete implementations.',
              'Reduce inbound coupling by narrowing the public API surface.',
            ]
          : isZoneOfUselessness
            ? [
                'Verify abstractions have concrete implementations.',
                'Remove unused interfaces/types that serve no consumer.',
                'Consider consolidating with concrete modules.',
              ]
            : [
                'Review the balance between interfaces/types and concrete exports.',
                'Adjust dependency direction to move closer to the Main Sequence.',
                'Consider splitting responsibilities between abstract and concrete modules.',
              ],
      },
      impact:
        'Modules on the Main Sequence (D≈0) have optimal balance between stability and extensibility.',
      tags: ['architecture', 'stability', 'abstractness', 'sdp'],
    });
  }

  return findings;
}
