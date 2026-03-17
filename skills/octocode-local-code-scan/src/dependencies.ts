import path from 'node:path';
import * as ts from 'typescript';
import type { AnalysisOptions, DependencyProfile, DependencyState, DependencyRecord } from './types.js';
import { isRelativeImport, resolveImportTarget, normalizeDependencyValue, addToMapSet, toRepoPath, isTestFile } from './utils.js';

export function collectModuleDependencies(sourceFile: ts.SourceFile, filePath: string, repoRoot: string): DependencyProfile {
  const currentDirectory = path.dirname(filePath);
  const internal = new Set<string>();
  const external = new Set<string>();
  const unresolved = new Set<string>();

  const addSpecifier = (specifier: string | undefined): void => {
    if (!specifier || typeof specifier !== 'string') {
      return;
    }

    if (!isRelativeImport(specifier)) {
      external.add(specifier);
      return;
    }

    const resolved = resolveImportTarget(currentDirectory, specifier);
    if (!resolved) {
      unresolved.add(specifier);
      return;
    }

    if (!resolved.startsWith(repoRoot)) {
      external.add(specifier);
      return;
    }

    const relativeResolved = normalizeDependencyValue(path.relative(repoRoot, resolved));
    internal.add(relativeResolved);
  };

  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      && node.moduleSpecifier
      && ts.isStringLiteral(node.moduleSpecifier)
    ) {
      if ('isTypeOnly' in node && node.isTypeOnly) return;
      addSpecifier(node.moduleSpecifier.text);
    }

    if (
      ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === 'require'
      && node.arguments.length === 1
      && ts.isStringLiteral(node.arguments[0])
    ) {
      addSpecifier(node.arguments[0].text);
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return {
    internalDependencies: [...internal].sort(),
    externalDependencies: [...external].sort(),
    unresolvedDependencies: [...unresolved].sort(),
  };
}

export function trackDependencyEdge(dependencyState: DependencyState, fromFile: string, toFile: string, importerIsTest: boolean): void {
  addToMapSet(dependencyState.outgoing, fromFile, toFile);
  addToMapSet(dependencyState.incoming, toFile, fromFile);
  if (importerIsTest) {
    addToMapSet(dependencyState.incomingFromTests, toFile, fromFile);
  } else {
    addToMapSet(dependencyState.incomingFromProduction, toFile, fromFile);
  }
}

export function collectDependencyProfile(sourceFile: ts.SourceFile, filePath: string, packageName: string, options: AnalysisOptions, dependencyState: DependencyState): DependencyProfile {
  const fileRelative = toRepoPath(filePath, options.root);
  dependencyState.files.add(fileRelative);

  const deps = collectModuleDependencies(sourceFile, filePath, options.root);
  const importerIsTest = isTestFile(filePath);

  for (const internalDependency of deps.internalDependencies) {
    const normalizedDep = normalizeDependencyValue(internalDependency);
    trackDependencyEdge(dependencyState, fileRelative, normalizedDep, importerIsTest);
  }

  if (deps.externalDependencies.length > 0) {
    dependencyState.externalCounts.set(fileRelative, new Set(deps.externalDependencies));
  }

  if (deps.unresolvedDependencies.length > 0) {
    dependencyState.unresolvedCounts.set(fileRelative, new Set(deps.unresolvedDependencies));
  }

  return {
    ...deps,
    package: packageName,
    file: fileRelative,
  };
}

export function dependencyProfileToRecord(fileRelative: string, dependencyState: DependencyState): DependencyRecord {
  const outbound = dependencyState.outgoing.get(fileRelative) || new Set();
  const inbound = dependencyState.incoming.get(fileRelative) || new Set();
  const prodIn = dependencyState.incomingFromProduction.get(fileRelative) || new Set();
  const testIn = dependencyState.incomingFromTests.get(fileRelative) || new Set();
  const external = dependencyState.externalCounts.get(fileRelative) || new Set();
  const unresolvedSet = dependencyState.unresolvedCounts.get(fileRelative) || new Set();

  return {
    file: fileRelative,
    outboundCount: outbound.size,
    inboundCount: inbound.size,
    inboundFromProduction: prodIn.size,
    inboundFromTests: testIn.size,
    externalDependencyCount: external.size,
    unresolvedDependencyCount: unresolvedSet.size,
  };
}
