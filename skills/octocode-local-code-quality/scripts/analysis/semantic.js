import fs from 'node:fs';
import path from 'node:path';
import * as ts from 'typescript';
import { isTestFile } from '../common/utils.js';
function findTsConfig(root) {
    const configPath = ts.findConfigFile(root, ts.sys.fileExists, 'tsconfig.json');
    if (!configPath)
        return null;
    const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
    if (configFile.error)
        return null;
    return ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(configPath));
}
export function createSemanticContext(files, root) {
    const parsed = findTsConfig(root);
    const compilerOptions = parsed?.options ?? {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Node10,
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        allowJs: true,
    };
    const fileSet = new Set(files);
    const fileContents = new Map();
    for (const f of files) {
        try {
            fileContents.set(f, fs.readFileSync(f, 'utf8'));
        }
        catch {
            void 0;
        }
    }
    const host = {
        getScriptFileNames: () => [...fileSet],
        getScriptVersion: () => '1',
        getScriptSnapshot: fileName => {
            const content = fileContents.get(fileName);
            if (content != null)
                return ts.ScriptSnapshot.fromString(content);
            try {
                const text = fs.readFileSync(fileName, 'utf8');
                return ts.ScriptSnapshot.fromString(text);
            }
            catch {
                return undefined;
            }
        },
        getCurrentDirectory: () => root,
        getCompilationSettings: () => compilerOptions,
        getDefaultLibFileName: ts.getDefaultLibFilePath,
        fileExists: ts.sys.fileExists,
        readFile: ts.sys.readFile,
        readDirectory: ts.sys.readDirectory,
        directoryExists: ts.sys.directoryExists,
        getDirectories: ts.sys.getDirectories,
    };
    const service = ts.createLanguageService(host, ts.createDocumentRegistry());
    const program = service.getProgram();
    const checker = program.getTypeChecker();
    return { service, checker, program, root };
}
function getExportReferenceInfo(ctx, filePath, exportName, exportLine, includeTests) {
    const sourceFile = ctx.program.getSourceFile(filePath);
    if (!sourceFile)
        return { count: -1, uniqueFiles: 0 };
    const node = findSymbolAtLine(sourceFile, exportName, exportLine);
    if (!node)
        return { count: -1, uniqueFiles: 0 };
    const refs = ctx.service.findReferences(filePath, node.getStart(sourceFile));
    if (!refs)
        return { count: 0, uniqueFiles: 0 };
    let count = 0;
    const files = new Set();
    for (const group of refs) {
        for (const ref of group.references) {
            if (ref.isDefinition)
                continue;
            if (!includeTests && isTestFile(ref.fileName))
                continue;
            count++;
            files.add(ref.fileName);
        }
    }
    return { count, uniqueFiles: files.size };
}
function findSymbolAtLine(sourceFile, name, line) {
    const lineStart = sourceFile.getPositionOfLineAndCharacter(Math.max(0, line - 1), 0);
    const lineEnd = line <
        sourceFile.getLineAndCharacterOfPosition(sourceFile.getEnd()).line + 1
        ? sourceFile.getPositionOfLineAndCharacter(line, 0)
        : sourceFile.getEnd();
    let found;
    const visit = (node) => {
        if (found)
            return;
        if (node.getStart(sourceFile) >= lineStart && node.getEnd() <= lineEnd) {
            if (ts.isIdentifier(node) && node.text === name) {
                found = node;
                return;
            }
        }
        ts.forEachChild(node, visit);
    };
    ts.forEachChild(sourceFile, visit);
    return found;
}
function getInheritanceDepth(checker, type) {
    const chain = [];
    let current = type;
    let depth = 0;
    const seen = new Set();
    while (true) {
        const bases = current.getBaseTypes?.() ?? [];
        if (bases.length === 0)
            break;
        const base = bases[0];
        const name = checker.typeToString(base);
        if (seen.has(name))
            break;
        seen.add(name);
        chain.push(name);
        depth++;
        current = base;
        if (depth > 20)
            break;
    }
    return { depth, chain };
}
function collectExportReferences(ctx, filePath, fileEntry, includeTests) {
    const result = new Map();
    const exports = fileEntry.dependencyProfile?.declaredExports ?? [];
    for (const exp of exports) {
        if (exp.lineStart == null)
            continue;
        const refInfo = getExportReferenceInfo(ctx, filePath, exp.name, exp.lineStart, includeTests);
        result.set(exp.name, {
            count: refInfo.count,
            uniqueFiles: refInfo.uniqueFiles,
            lineStart: exp.lineStart,
            lineEnd: exp.lineEnd ?? exp.lineStart,
        });
    }
    return result;
}
function findFunctionNode(sourceFile, fnName, lineStart, lineEnd) {
    const fnPos = sourceFile.getPositionOfLineAndCharacter(Math.max(0, lineStart - 1), 0);
    let fnNode;
    const findFn = (node) => {
        if (fnNode)
            return;
        if (node.getStart(sourceFile) >= fnPos &&
            node.getEnd() <=
                sourceFile.getPositionOfLineAndCharacter(Math.min(lineEnd, sourceFile.getLineAndCharacterOfPosition(sourceFile.getEnd())
                    .line + 1) - 1, 0) +
                    200) {
            if (ts.isFunctionDeclaration(node) ||
                ts.isMethodDeclaration(node) ||
                ts.isArrowFunction(node) ||
                ts.isFunctionExpression(node)) {
                const name = node.name && ts.isIdentifier(node.name) ? node.name.text : '';
                if (name === fnName || fnName === '<anonymous>') {
                    fnNode = node;
                    return;
                }
            }
        }
        ts.forEachChild(node, findFn);
    };
    ts.forEachChild(sourceFile, findFn);
    return fnNode;
}
function collectUnusedParams(ctx, filePath, sourceFile, fileEntry) {
    const results = [];
    for (const fn of fileEntry.functions) {
        if (!fn.params || fn.params === 0)
            continue;
        if (fn.name === '<anonymous>' || fn.name === '')
            continue;
        const fnNode = findFunctionNode(sourceFile, fn.name, fn.lineStart, fn.lineEnd);
        if (!fnNode ||
            !(ts.isFunctionDeclaration(fnNode) ||
                ts.isMethodDeclaration(fnNode) ||
                ts.isArrowFunction(fnNode) ||
                ts.isFunctionExpression(fnNode)))
            continue;
        for (const param of fnNode.parameters) {
            if (!ts.isIdentifier(param.name))
                continue;
            const paramName = param.name.text;
            if (paramName.startsWith('_'))
                continue;
            const refs = ctx.service.findReferences(filePath, param.name.getStart(sourceFile));
            let usageCount = 0;
            if (refs) {
                for (const group of refs) {
                    for (const ref of group.references) {
                        if (!ref.isDefinition)
                            usageCount++;
                    }
                }
            }
            if (usageCount === 0) {
                results.push({
                    functionName: fn.name,
                    paramName,
                    lineStart: fn.lineStart,
                    lineEnd: fn.lineEnd,
                });
            }
        }
    }
    return results;
}
function analyzeTypeHierarchy(ctx, sourceFile, fileEntry, profile) {
    let abstractCount = 0;
    let totalExportTypes = 0;
    const exports = fileEntry.dependencyProfile?.declaredExports ?? [];
    const visit = (node) => {
        if (ts.isClassDeclaration(node) && node.name) {
            const type = ctx.checker.getTypeAtLocation(node);
            const { depth, chain } = getInheritanceDepth(ctx.checker, type);
            if (depth > 0) {
                profile.typeHierarchies.push({
                    name: node.name.text,
                    depth,
                    chain,
                    lineStart: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
                });
                if (depth > profile.typeHierarchyDepth) {
                    profile.typeHierarchyDepth = depth;
                }
            }
            if (node.heritageClauses) {
                for (const clause of node.heritageClauses) {
                    if (clause.token === ts.SyntaxKind.ImplementsKeyword) {
                        for (const expr of clause.types) {
                            const ifaceType = ctx.checker.getTypeAtLocation(expr);
                            const ifaceName = ctx.checker.typeToString(ifaceType);
                            const classType = ctx.checker.getTypeAtLocation(node);
                            const ifaceProps = ifaceType.getProperties?.() ?? [];
                            const classProps = new Set((classType.getProperties?.() ?? []).map(p => p.name));
                            const missing = ifaceProps
                                .filter(p => !classProps.has(p.name))
                                .map(p => p.name);
                            const anycastMembers = [];
                            for (const prop of ifaceProps) {
                                if (classProps.has(prop.name)) {
                                    const classProp = classType.getProperty?.(prop.name);
                                    if (classProp) {
                                        const classPropType = ctx.checker.getTypeOfSymbolAtLocation(classProp, node);
                                        const typeStr = ctx.checker.typeToString(classPropType);
                                        if (typeStr === 'any')
                                            anycastMembers.push(prop.name);
                                    }
                                }
                            }
                            if (missing.length > 0 || anycastMembers.length > 0) {
                                profile.interfaceImpls.push({
                                    interfaceName: ifaceName,
                                    className: node.name.text,
                                    classFile: fileEntry.file,
                                    classLine: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
                                    missingMembers: missing,
                                    anycastMembers,
                                });
                            }
                        }
                    }
                }
            }
            if (node.modifiers?.some(m => m.kind === ts.SyntaxKind.AbstractKeyword)) {
                abstractCount++;
            }
            const baseMethods = new Map();
            const classType = ctx.checker.getTypeAtLocation(node);
            let currentType = classType;
            let baseDepth = 0;
            while (true) {
                const bases = currentType.getBaseTypes?.() ?? [];
                if (bases.length === 0)
                    break;
                baseDepth++;
                const baseType = bases[0];
                for (const prop of baseType.getProperties?.() ?? []) {
                    const decl = prop.getDeclarations?.()?.[0];
                    if (decl &&
                        (ts.isMethodDeclaration(decl) || ts.isMethodSignature(decl))) {
                        baseMethods.set(prop.name, Math.max(baseMethods.get(prop.name) ?? 0, baseDepth));
                    }
                }
                currentType = baseType;
                if (baseDepth > 20)
                    break;
            }
            for (const member of node.members) {
                if (ts.isMethodDeclaration(member) &&
                    member.name &&
                    ts.isIdentifier(member.name)) {
                    const methodName = member.name.text;
                    const overrideDepth = baseMethods.get(methodName);
                    if (overrideDepth != null && overrideDepth > 0) {
                        profile.overrideChains.push({
                            methodName,
                            className: node.name.text,
                            depth: overrideDepth,
                            chain: [],
                            lineStart: sourceFile.getLineAndCharacterOfPosition(member.getStart(sourceFile)).line + 1,
                        });
                    }
                }
            }
        }
        if (ts.isInterfaceDeclaration(node)) {
            abstractCount++;
            totalExportTypes++;
        }
        if (ts.isTypeAliasDeclaration(node)) {
            totalExportTypes++;
        }
        ts.forEachChild(node, visit);
    };
    ts.forEachChild(sourceFile, visit);
    totalExportTypes += exports.length;
    return totalExportTypes > 0 ? abstractCount / totalExportTypes : 0;
}
function analyzeImports(ctx, filePath, sourceFile, fileEntry) {
    const unusedImports = [];
    const concreteImports = [];
    const imports = fileEntry.dependencyProfile?.importedSymbols ?? [];
    for (const imp of imports) {
        if (imp.lineStart == null)
            continue;
        const node = findSymbolAtLine(sourceFile, imp.localName, imp.lineStart);
        if (!node)
            continue;
        const refs = ctx.service.findReferences(filePath, node.getStart(sourceFile));
        let sameFileUsageCount = 0;
        if (refs) {
            for (const group of refs) {
                for (const ref of group.references) {
                    if (ref.isDefinition)
                        continue;
                    if (ref.fileName !== filePath)
                        continue;
                    sameFileUsageCount++;
                }
            }
        }
        if (sameFileUsageCount === 0) {
            unusedImports.push({ name: imp.localName, lineStart: imp.lineStart });
        }
        if (imp.resolvedModule) {
            const targetSrc = ctx.program.getSourceFile(path.resolve(ctx.root, imp.resolvedModule));
            if (targetSrc) {
                const sym = ctx.checker.getSymbolAtLocation(node);
                if (sym) {
                    const aliased = sym.flags & ts.SymbolFlags.Alias
                        ? ctx.checker.getAliasedSymbol(sym)
                        : sym;
                    const decl = aliased.getDeclarations?.()?.[0];
                    if (decl && ts.isClassDeclaration(decl)) {
                        const isAbstract = decl.modifiers?.some(m => m.kind === ts.SyntaxKind.AbstractKeyword);
                        if (!isAbstract) {
                            concreteImports.push({
                                name: imp.localName,
                                targetFile: imp.resolvedModule,
                                lineStart: imp.lineStart,
                            });
                        }
                    }
                }
            }
        }
    }
    return { unusedImports, concreteImports };
}
function detectLeakyReturns(ctx, filePath, sourceFile, fileEntry) {
    const results = [];
    const exportedFns = fileEntry.functions.filter(fn => fileEntry.dependencyProfile?.declaredExports?.some(e => e.name === fn.name));
    for (const fn of exportedFns) {
        const fnPos = sourceFile.getPositionOfLineAndCharacter(Math.max(0, fn.lineStart - 1), 0);
        let fnNode;
        const findFnDecl = (node) => {
            if (fnNode)
                return;
            if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) &&
                node.name &&
                ts.isIdentifier(node.name) &&
                node.name.text === fn.name &&
                node.getStart(sourceFile) >= fnPos) {
                fnNode = node;
                return;
            }
            ts.forEachChild(node, findFnDecl);
        };
        ts.forEachChild(sourceFile, findFnDecl);
        if (fnNode) {
            const sig = ctx.checker.getSignatureFromDeclaration(fnNode);
            if (sig) {
                const retType = ctx.checker.getReturnTypeOfSignature(sig);
                const retSymbol = retType.symbol || retType.aliasSymbol;
                if (retSymbol?.declarations?.[0]) {
                    const retDeclFile = retSymbol.declarations[0].getSourceFile().fileName;
                    const relRetFile = path.relative(ctx.root, retDeclFile);
                    if (retDeclFile !== filePath &&
                        !relRetFile.startsWith('node_modules') &&
                        !retDeclFile.includes('lib.')) {
                        results.push({
                            functionName: fn.name,
                            returnType: ctx.checker.typeToString(retType),
                            sourceFile: relRetFile,
                            lineStart: fn.lineStart,
                        });
                    }
                }
            }
        }
    }
    return results;
}
function detectNarrowableParams(ctx, filePath, sourceFile, fileEntry) {
    const results = [];
    const exportedFns = fileEntry.functions.filter(fn => fileEntry.dependencyProfile?.declaredExports?.some(e => e.name === fn.name));
    for (const fn of exportedFns) {
        if (!fn.params || fn.params < 1)
            continue;
        const fnPos = sourceFile.getPositionOfLineAndCharacter(Math.max(0, fn.lineStart - 1), 0);
        let fnDeclNode;
        const findDecl = (node) => {
            if (fnDeclNode)
                return;
            if (ts.isFunctionDeclaration(node) &&
                node.name?.text === fn.name &&
                node.getStart(sourceFile) >= fnPos) {
                fnDeclNode = node;
                return;
            }
            ts.forEachChild(node, findDecl);
        };
        ts.forEachChild(sourceFile, findDecl);
        if (!fnDeclNode)
            continue;
        for (const param of fnDeclNode.parameters) {
            if (!ts.isIdentifier(param.name))
                continue;
            const paramType = ctx.checker.getTypeAtLocation(param);
            if (!paramType.isUnion() &&
                !(paramType.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)))
                continue;
            const declaredStr = ctx.checker.typeToString(paramType);
            const refs = ctx.service.findReferences(filePath, fnDeclNode.name.getStart(sourceFile));
            if (!refs)
                continue;
            const argTypes = [];
            let allNarrow = true;
            let callSiteCount = 0;
            for (const group of refs) {
                for (const ref of group.references) {
                    if (ref.isDefinition)
                        continue;
                    const refSrc = ctx.program.getSourceFile(ref.fileName);
                    if (!refSrc)
                        continue;
                    let tokenNode = refSrc;
                    const findToken = (n) => {
                        if (n.getStart(refSrc) <= ref.textSpan.start &&
                            n.getEnd() >= ref.textSpan.start + ref.textSpan.length) {
                            tokenNode = n;
                            ts.forEachChild(n, findToken);
                        }
                    };
                    ts.forEachChild(refSrc, findToken);
                    let callExpr;
                    let ancestor = tokenNode;
                    while (ancestor) {
                        if (ts.isCallExpression(ancestor)) {
                            callExpr = ancestor;
                            break;
                        }
                        ancestor = ancestor.parent;
                    }
                    if (!callExpr?.arguments)
                        continue;
                    const paramIdx = fnDeclNode.parameters.indexOf(param);
                    if (paramIdx < 0 || paramIdx >= callExpr.arguments.length) {
                        allNarrow = false;
                        continue;
                    }
                    const argType = ctx.checker.getTypeAtLocation(callExpr.arguments[paramIdx]);
                    const argStr = ctx.checker.typeToString(argType);
                    argTypes.push(argStr);
                    callSiteCount++;
                    if (argStr === declaredStr ||
                        argStr === 'any' ||
                        argStr === 'unknown') {
                        allNarrow = false;
                    }
                }
            }
            if (allNarrow && callSiteCount >= 2 && argTypes.length > 0) {
                const uniqueArgTypes = [...new Set(argTypes)];
                if (uniqueArgTypes.length <= 2) {
                    results.push({
                        functionName: fn.name,
                        paramName: param.name.text,
                        declaredType: declaredStr,
                        actualTypes: uniqueArgTypes,
                        narrowedType: uniqueArgTypes.length === 1
                            ? uniqueArgTypes[0]
                            : uniqueArgTypes.join(' | '),
                        lineStart: fn.lineStart,
                        lineEnd: fn.lineEnd,
                    });
                }
            }
        }
    }
    return results;
}
export function analyzeSemanticProfile(ctx, filePath, fileEntry, includeTests = true) {
    const profile = {
        file: fileEntry.file,
        referenceCountByExport: new Map(),
        unusedParams: [],
        interfaceImpls: [],
        typeHierarchyDepth: 0,
        typeHierarchies: [],
        overrideChains: [],
        abstractnessRatio: 0,
        unusedImports: [],
        concreteImports: [],
        leakyReturns: [],
        narrowableParams: [],
    };
    const sourceFile = ctx.program.getSourceFile(filePath);
    if (!sourceFile)
        return profile;
    profile.referenceCountByExport = collectExportReferences(ctx, filePath, fileEntry, includeTests);
    profile.unusedParams = collectUnusedParams(ctx, filePath, sourceFile, fileEntry);
    profile.abstractnessRatio = analyzeTypeHierarchy(ctx, sourceFile, fileEntry, profile);
    const importResults = analyzeImports(ctx, filePath, sourceFile, fileEntry);
    profile.unusedImports = importResults.unusedImports;
    profile.concreteImports = importResults.concreteImports;
    profile.leakyReturns = detectLeakyReturns(ctx, filePath, sourceFile, fileEntry);
    profile.narrowableParams = detectNarrowableParams(ctx, filePath, sourceFile, fileEntry);
    return profile;
}
export function collectAllAbsoluteFiles(fileSummaries, dependencyState, root) {
    const files = new Set();
    for (const entry of fileSummaries) {
        files.add(path.resolve(root, entry.file));
    }
    for (const relFile of dependencyState.files) {
        files.add(path.resolve(root, relFile));
    }
    return [...files].filter(f => {
        try {
            return fs.statSync(f).isFile();
        }
        catch {
            return false;
        }
    });
}
