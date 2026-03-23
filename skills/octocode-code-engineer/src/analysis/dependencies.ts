import path from 'node:path';

import * as ts from 'typescript';

import {
  addToMapSet,
  isRelativeImport,
  isTestFile,
  normalizeDependencyValue,
  resolveImportTarget,
  toRepoPath,
} from '../common/utils.js';

import type {
  AnalysisOptions,
  DependencyProfile,
  DependencyRecord,
  DependencyState,
  ExportSymbol,
  ImportedSymbolRef,
  ReExportRef,
} from '../types/index.js';

function nodeLineRange(
  sourceFile: ts.SourceFile,
  node: ts.Node
): { lineStart: number; lineEnd: number } {
  return {
    lineStart:
      sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
        .line + 1,
    lineEnd:
      sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1,
  };
}

function hasExportModifier(node: ts.Node): boolean {
  if (!ts.canHaveModifiers(node)) return false;
  return Boolean(
    ts
      .getModifiers(node)
      ?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)
  );
}

interface DependencyCollectorContext {
  sourceFile: ts.SourceFile;
  importedSymbols: ImportedSymbolRef[];
  reExports: ReExportRef[];
  pushDeclaredExport: (item: ExportSymbol) => void;
  resolveSpecifier: (specifier: string | undefined) => string | null;
}

function collectImportSymbols(
  node: ts.ImportDeclaration,
  ctx: DependencyCollectorContext
): void {
  if (!node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier))
    return;
  const sourceModule = node.moduleSpecifier.text;
  const resolvedModule = ctx.resolveSpecifier(sourceModule) ?? undefined;
  const loc = nodeLineRange(ctx.sourceFile, node);
  const clause = node.importClause;
  if (!clause) return;
  if (clause.name) {
    ctx.importedSymbols.push({
      sourceModule,
      resolvedModule,
      importedName: 'default',
      localName: clause.name.text,
      isTypeOnly: clause.isTypeOnly,
      ...loc,
    });
  }
  if (!clause.namedBindings) return;
  if (ts.isNamespaceImport(clause.namedBindings)) {
    ctx.importedSymbols.push({
      sourceModule,
      resolvedModule,
      importedName: '*',
      localName: clause.namedBindings.name.text,
      isTypeOnly: clause.isTypeOnly,
      ...loc,
    });
  } else {
    for (const element of clause.namedBindings.elements) {
      ctx.importedSymbols.push({
        sourceModule,
        resolvedModule,
        importedName: element.propertyName?.text ?? element.name.text,
        localName: element.name.text,
        isTypeOnly: clause.isTypeOnly || element.isTypeOnly,
        ...loc,
      });
    }
  }
}

function collectReExportDeclaration(
  node: ts.ExportDeclaration,
  ctx: DependencyCollectorContext
): void {
  if (!node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier))
    return;
  const sourceModule = node.moduleSpecifier.text;
  const resolvedModule = ctx.resolveSpecifier(sourceModule) ?? undefined;
  if (node.exportClause && ts.isNamedExports(node.exportClause)) {
    for (const element of node.exportClause.elements) {
      ctx.reExports.push({
        sourceModule,
        resolvedModule,
        exportedAs: element.name.text,
        importedName: element.propertyName?.text ?? element.name.text,
        isStar: false,
        isTypeOnly: node.isTypeOnly || element.isTypeOnly,
        ...nodeLineRange(ctx.sourceFile, element),
      });
    }
  } else {
    ctx.reExports.push({
      sourceModule,
      resolvedModule,
      exportedAs: '*',
      importedName: '*',
      isStar: true,
      isTypeOnly: node.isTypeOnly,
      ...nodeLineRange(ctx.sourceFile, node),
    });
  }
}

function collectDeclaredExportFromNode(
  node: ts.Node,
  ctx: DependencyCollectorContext
): void {
  const loc = nodeLineRange(ctx.sourceFile, node);

  if (ts.isExportAssignment(node)) {
    ctx.pushDeclaredExport({ name: 'default', kind: 'value', isDefault: true, ...loc });
    return;
  }

  if (
    (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) &&
    hasExportModifier(node)
  ) {
    ctx.pushDeclaredExport({
      name: node.name?.text || 'default',
      kind: 'value',
      isDefault: !node.name,
      ...loc,
    });
    return;
  }

  if (ts.isEnumDeclaration(node) && hasExportModifier(node)) {
    ctx.pushDeclaredExport({ name: node.name.text, kind: 'value', ...loc });
    return;
  }

  if (
    (ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) &&
    hasExportModifier(node)
  ) {
    ctx.pushDeclaredExport({ name: node.name.text, kind: 'type', ...loc });
    return;
  }

  if (ts.isVariableStatement(node) && hasExportModifier(node)) {
    for (const decl of node.declarationList.declarations) {
      if (ts.isIdentifier(decl.name)) {
        ctx.pushDeclaredExport({
          name: decl.name.text,
          kind: 'value',
          ...nodeLineRange(ctx.sourceFile, decl),
        });
      }
    }
    return;
  }

  if (
    ts.isExportDeclaration(node) &&
    !node.moduleSpecifier &&
    node.exportClause &&
    ts.isNamedExports(node.exportClause)
  ) {
    for (const element of node.exportClause.elements) {
      ctx.pushDeclaredExport({
        name: element.name.text,
        kind: element.isTypeOnly ? 'type' : 'unknown',
        ...nodeLineRange(ctx.sourceFile, element),
      });
    }
  }
}

function collectRequireCall(
  node: ts.CallExpression,
  ctx: DependencyCollectorContext
): void {
  if (
    !ts.isIdentifier(node.expression) ||
    node.expression.text !== 'require' ||
    node.arguments.length !== 1 ||
    !ts.isStringLiteral(node.arguments[0])
  )
    return;
  const sourceModule = node.arguments[0].text;
  const resolvedModule = ctx.resolveSpecifier(sourceModule) ?? undefined;
  ctx.importedSymbols.push({
    sourceModule,
    resolvedModule,
    importedName: '*',
    localName: 'require',
    isTypeOnly: false,
    ...nodeLineRange(ctx.sourceFile, node),
  });
}

export function collectModuleDependencies(
  sourceFile: ts.SourceFile,
  filePath: string,
  repoRoot: string
): DependencyProfile {
  const currentDirectory = path.dirname(filePath);
  const internal = new Set<string>();
  const external = new Set<string>();
  const unresolved = new Set<string>();
  const declaredExports: ExportSymbol[] = [];

  const pushDeclaredExport = (item: ExportSymbol): void => {
    if (
      declaredExports.some(
        entry => entry.name === item.name && entry.kind === item.kind
      )
    )
      return;
    declaredExports.push(item);
  };

  const resolveSpecifier = (specifier: string | undefined): string | null => {
    if (!specifier || typeof specifier !== 'string') return null;
    if (!isRelativeImport(specifier)) {
      external.add(specifier);
      return null;
    }
    const resolved = resolveImportTarget(currentDirectory, specifier);
    if (!resolved) {
      unresolved.add(specifier);
      return null;
    }
    if (!resolved.startsWith(repoRoot)) {
      external.add(specifier);
      return null;
    }
    const relativeResolved = normalizeDependencyValue(
      path.relative(repoRoot, resolved)
    );
    internal.add(relativeResolved);
    return relativeResolved;
  };

  const ctx: DependencyCollectorContext = {
    sourceFile,
    importedSymbols: [],
    reExports: [],
    pushDeclaredExport,
    resolveSpecifier,
  };

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) collectImportSymbols(node, ctx);
    if (ts.isExportDeclaration(node) && node.moduleSpecifier) collectReExportDeclaration(node, ctx);
    collectDeclaredExportFromNode(node, ctx);
    if (ts.isCallExpression(node)) collectRequireCall(node, ctx);
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return {
    internalDependencies: [...internal].sort(),
    externalDependencies: [...external].sort(),
    unresolvedDependencies: [...unresolved].sort(),
    declaredExports,
    importedSymbols: ctx.importedSymbols,
    reExports: ctx.reExports,
  };
}

export function trackDependencyEdge(
  dependencyState: DependencyState,
  fromFile: string,
  toFile: string,
  importerIsTest: boolean
): void {
  addToMapSet(dependencyState.outgoing, fromFile, toFile);
  addToMapSet(dependencyState.incoming, toFile, fromFile);
  if (importerIsTest) {
    addToMapSet(dependencyState.incomingFromTests, toFile, fromFile);
  } else {
    addToMapSet(dependencyState.incomingFromProduction, toFile, fromFile);
  }
}

export function collectDependencyProfile(
  sourceFile: ts.SourceFile,
  filePath: string,
  packageName: string,
  options: AnalysisOptions,
  dependencyState: DependencyState
): DependencyProfile {
  const fileRelative = toRepoPath(filePath, options.root);
  dependencyState.files.add(fileRelative);

  const deps = collectModuleDependencies(sourceFile, filePath, options.root);
  const importerIsTest = isTestFile(filePath);

  for (const internalDependency of deps.internalDependencies) {
    const normalizedDep = normalizeDependencyValue(internalDependency);
    trackDependencyEdge(
      dependencyState,
      fileRelative,
      normalizedDep,
      importerIsTest
    );
  }

  if (deps.externalDependencies.length > 0) {
    dependencyState.externalCounts.set(
      fileRelative,
      new Set(deps.externalDependencies)
    );
  }

  if (deps.unresolvedDependencies.length > 0) {
    dependencyState.unresolvedCounts.set(
      fileRelative,
      new Set(deps.unresolvedDependencies)
    );
  }

  dependencyState.declaredExportsByFile.set(fileRelative, deps.declaredExports);
  dependencyState.importedSymbolsByFile.set(fileRelative, deps.importedSymbols);
  dependencyState.reExportsByFile.set(fileRelative, deps.reExports);

  return {
    ...deps,
    package: packageName,
    file: fileRelative,
  };
}

export function dependencyProfileToRecord(
  fileRelative: string,
  dependencyState: DependencyState
): DependencyRecord {
  const outbound = dependencyState.outgoing.get(fileRelative) || new Set();
  const inbound = dependencyState.incoming.get(fileRelative) || new Set();
  const prodIn =
    dependencyState.incomingFromProduction.get(fileRelative) || new Set();
  const testIn =
    dependencyState.incomingFromTests.get(fileRelative) || new Set();
  const external =
    dependencyState.externalCounts.get(fileRelative) || new Set();
  const unresolvedSet =
    dependencyState.unresolvedCounts.get(fileRelative) || new Set();

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
