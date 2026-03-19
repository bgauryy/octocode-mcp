import path from 'node:path';
import * as ts from 'typescript';
import { addToMapSet, isRelativeImport, isTestFile, normalizeDependencyValue, resolveImportTarget, toRepoPath } from './utils.js';
export function collectModuleDependencies(sourceFile, filePath, repoRoot) {
    const currentDirectory = path.dirname(filePath);
    const internal = new Set();
    const external = new Set();
    const unresolved = new Set();
    const declaredExports = [];
    const importedSymbols = [];
    const reExports = [];
    const hasExportModifier = (node) => {
        if (!ts.canHaveModifiers(node))
            return false;
        return Boolean(ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword));
    };
    const pushDeclaredExport = (item) => {
        if (declaredExports.some((entry) => entry.name === item.name && entry.kind === item.kind))
            return;
        declaredExports.push(item);
    };
    const resolveSpecifier = (specifier) => {
        if (!specifier || typeof specifier !== 'string') {
            return null;
        }
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
        const relativeResolved = normalizeDependencyValue(path.relative(repoRoot, resolved));
        internal.add(relativeResolved);
        return relativeResolved;
    };
    const importLine = (node) => {
        const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
        return { lineStart: start.line + 1, lineEnd: end.line + 1 };
    };
    const visit = (node) => {
        if (ts.isImportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
            const sourceModule = node.moduleSpecifier.text;
            const resolvedModule = resolveSpecifier(sourceModule) ?? undefined;
            const loc = importLine(node);
            const clause = node.importClause;
            if (clause) {
                if (clause.name) {
                    importedSymbols.push({
                        sourceModule,
                        resolvedModule,
                        importedName: 'default',
                        localName: clause.name.text,
                        isTypeOnly: clause.isTypeOnly,
                        ...loc,
                    });
                }
                if (clause.namedBindings) {
                    if (ts.isNamespaceImport(clause.namedBindings)) {
                        importedSymbols.push({
                            sourceModule,
                            resolvedModule,
                            importedName: '*',
                            localName: clause.namedBindings.name.text,
                            isTypeOnly: clause.isTypeOnly,
                            ...loc,
                        });
                    }
                    else {
                        for (const element of clause.namedBindings.elements) {
                            importedSymbols.push({
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
            }
        }
        if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
            const sourceModule = node.moduleSpecifier.text;
            const resolvedModule = resolveSpecifier(sourceModule) ?? undefined;
            if (node.exportClause && ts.isNamedExports(node.exportClause)) {
                for (const element of node.exportClause.elements) {
                    reExports.push({
                        sourceModule,
                        resolvedModule,
                        exportedAs: element.name.text,
                        importedName: element.propertyName?.text ?? element.name.text,
                        isStar: false,
                        isTypeOnly: node.isTypeOnly || element.isTypeOnly,
                        lineStart: sourceFile.getLineAndCharacterOfPosition(element.getStart(sourceFile)).line + 1,
                        lineEnd: sourceFile.getLineAndCharacterOfPosition(element.getEnd()).line + 1,
                    });
                }
            }
            else {
                reExports.push({
                    sourceModule,
                    resolvedModule,
                    exportedAs: '*',
                    importedName: '*',
                    isStar: true,
                    isTypeOnly: node.isTypeOnly,
                    lineStart: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
                    lineEnd: sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1,
                });
            }
        }
        if (ts.isExportAssignment(node)) {
            pushDeclaredExport({
                name: 'default',
                kind: 'value',
                isDefault: true,
                lineStart: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
                lineEnd: sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1,
            });
        }
        if (ts.isFunctionDeclaration(node) && hasExportModifier(node)) {
            pushDeclaredExport({
                name: node.name?.text || 'default',
                kind: 'value',
                isDefault: node.name ? false : true,
                lineStart: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
                lineEnd: sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1,
            });
        }
        if (ts.isClassDeclaration(node) && hasExportModifier(node)) {
            pushDeclaredExport({
                name: node.name?.text || 'default',
                kind: 'value',
                isDefault: node.name ? false : true,
                lineStart: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
                lineEnd: sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1,
            });
        }
        if (ts.isEnumDeclaration(node) && hasExportModifier(node)) {
            pushDeclaredExport({
                name: node.name.text,
                kind: 'value',
                lineStart: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
                lineEnd: sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1,
            });
        }
        if ((ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) && hasExportModifier(node)) {
            pushDeclaredExport({
                name: node.name.text,
                kind: 'type',
                lineStart: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
                lineEnd: sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1,
            });
        }
        if (ts.isVariableStatement(node) && hasExportModifier(node)) {
            for (const decl of node.declarationList.declarations) {
                if (ts.isIdentifier(decl.name)) {
                    pushDeclaredExport({
                        name: decl.name.text,
                        kind: 'value',
                        lineStart: sourceFile.getLineAndCharacterOfPosition(decl.getStart(sourceFile)).line + 1,
                        lineEnd: sourceFile.getLineAndCharacterOfPosition(decl.getEnd()).line + 1,
                    });
                }
            }
        }
        if (ts.isExportDeclaration(node) && !node.moduleSpecifier && node.exportClause && ts.isNamedExports(node.exportClause)) {
            for (const element of node.exportClause.elements) {
                pushDeclaredExport({
                    name: element.name.text,
                    kind: element.isTypeOnly ? 'type' : 'unknown',
                    lineStart: sourceFile.getLineAndCharacterOfPosition(element.getStart(sourceFile)).line + 1,
                    lineEnd: sourceFile.getLineAndCharacterOfPosition(element.getEnd()).line + 1,
                });
            }
        }
        if (ts.isCallExpression(node)
            && ts.isIdentifier(node.expression)
            && node.expression.text === 'require'
            && node.arguments.length === 1
            && ts.isStringLiteral(node.arguments[0])) {
            const sourceModule = node.arguments[0].text;
            const resolvedModule = resolveSpecifier(sourceModule) ?? undefined;
            importedSymbols.push({
                sourceModule,
                resolvedModule,
                importedName: '*',
                localName: 'require',
                isTypeOnly: false,
                ...importLine(node),
            });
        }
        ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return {
        internalDependencies: [...internal].sort(),
        externalDependencies: [...external].sort(),
        unresolvedDependencies: [...unresolved].sort(),
        declaredExports,
        importedSymbols,
        reExports,
    };
}
export function trackDependencyEdge(dependencyState, fromFile, toFile, importerIsTest) {
    addToMapSet(dependencyState.outgoing, fromFile, toFile);
    addToMapSet(dependencyState.incoming, toFile, fromFile);
    if (importerIsTest) {
        addToMapSet(dependencyState.incomingFromTests, toFile, fromFile);
    }
    else {
        addToMapSet(dependencyState.incomingFromProduction, toFile, fromFile);
    }
}
export function collectDependencyProfile(sourceFile, filePath, packageName, options, dependencyState) {
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
    dependencyState.declaredExportsByFile.set(fileRelative, deps.declaredExports);
    dependencyState.importedSymbolsByFile.set(fileRelative, deps.importedSymbols);
    dependencyState.reExportsByFile.set(fileRelative, deps.reExports);
    return {
        ...deps,
        package: packageName,
        file: fileRelative,
    };
}
export function dependencyProfileToRecord(fileRelative, dependencyState) {
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
