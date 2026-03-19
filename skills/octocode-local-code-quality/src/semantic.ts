import fs from 'node:fs';
import path from 'node:path';

import * as ts from 'typescript';

import { isTestFile } from './utils.js';

import type { DependencyState, FileEntry } from './types.js';

export interface SemanticContext {
  service: ts.LanguageService;
  checker: ts.TypeChecker;
  program: ts.Program;
  root: string;
}

export interface UnusedParam {
  functionName: string;
  paramName: string;
  lineStart: number;
  lineEnd: number;
}

export interface InterfaceImpl {
  interfaceName: string;
  className: string;
  classFile: string;
  classLine: number;
  missingMembers: string[];
  anycastMembers: string[];
}

export interface TypeHierarchyInfo {
  name: string;
  depth: number;
  chain: string[];
  lineStart: number;
}

export interface OverrideChainInfo {
  methodName: string;
  className: string;
  depth: number;
  chain: string[];
  lineStart: number;
}

export interface ExportRefInfo {
  count: number;
  uniqueFiles: number;
  lineStart: number;
  lineEnd: number;
}

export interface LeakyReturn {
  functionName: string;
  returnType: string;
  sourceFile: string;
  lineStart: number;
}

export interface NarrowableParam {
  functionName: string;
  paramName: string;
  declaredType: string;
  actualTypes: string[];
  narrowedType: string;
  lineStart: number;
  lineEnd: number;
}

export interface SemanticProfile {
  file: string;
  referenceCountByExport: Map<string, ExportRefInfo>;
  unusedParams: UnusedParam[];
  interfaceImpls: InterfaceImpl[];
  typeHierarchyDepth: number;
  typeHierarchies: TypeHierarchyInfo[];
  overrideChains: OverrideChainInfo[];
  abstractnessRatio: number;
  unusedImports: Array<{ name: string; lineStart: number }>;
  concreteImports: Array<{ name: string; targetFile: string; lineStart: number }>;
  leakyReturns: LeakyReturn[];
  narrowableParams: NarrowableParam[];
}

function findTsConfig(root: string): ts.ParsedCommandLine | null {
  const configPath = ts.findConfigFile(root, ts.sys.fileExists, 'tsconfig.json');
  if (!configPath) return null;
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error) return null;
  return ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(configPath));
}

export function createSemanticContext(files: string[], root: string): SemanticContext {
  const parsed = findTsConfig(root);
  const compilerOptions: ts.CompilerOptions = parsed?.options ?? {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Node10,
    strict: true,
    esModuleInterop: true,
    skipLibCheck: true,
    allowJs: true,
  };

  const fileSet = new Set(files);
  const fileContents = new Map<string, string>();
  for (const f of files) {
    try {
      fileContents.set(f, fs.readFileSync(f, 'utf8'));
    } catch { /* skip unreadable */ }
  }

  const host: ts.LanguageServiceHost = {
    getScriptFileNames: () => [...fileSet],
    getScriptVersion: () => '1',
    getScriptSnapshot: (fileName) => {
      const content = fileContents.get(fileName);
      if (content != null) return ts.ScriptSnapshot.fromString(content);
      try {
        const text = fs.readFileSync(fileName, 'utf8');
        return ts.ScriptSnapshot.fromString(text);
      } catch {
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
  const program = service.getProgram()!;
  const checker = program.getTypeChecker();

  return { service, checker, program, root };
}

function getExportReferenceInfo(
  ctx: SemanticContext,
  filePath: string,
  exportName: string,
  exportLine: number,
  includeTests: boolean,
): { count: number; uniqueFiles: number } {
  const sourceFile = ctx.program.getSourceFile(filePath);
  if (!sourceFile) return { count: -1, uniqueFiles: 0 };

  const node = findSymbolAtLine(sourceFile, exportName, exportLine);
  if (!node) return { count: -1, uniqueFiles: 0 };

  const refs = ctx.service.findReferences(filePath, node.getStart(sourceFile));
  if (!refs) return { count: 0, uniqueFiles: 0 };

  let count = 0;
  const files = new Set<string>();
  for (const group of refs) {
    for (const ref of group.references) {
      if (ref.isDefinition) continue;
      if (!includeTests && isTestFile(ref.fileName)) continue;
      count++;
      files.add(ref.fileName);
    }
  }
  return { count, uniqueFiles: files.size };
}

function findSymbolAtLine(
  sourceFile: ts.SourceFile,
  name: string,
  line: number,
): ts.Node | undefined {
  const lineStart = sourceFile.getPositionOfLineAndCharacter(Math.max(0, line - 1), 0);
  const lineEnd = line < sourceFile.getLineAndCharacterOfPosition(sourceFile.getEnd()).line + 1
    ? sourceFile.getPositionOfLineAndCharacter(line, 0)
    : sourceFile.getEnd();

  let found: ts.Node | undefined;
  const visit = (node: ts.Node): void => {
    if (found) return;
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

function getInheritanceDepth(checker: ts.TypeChecker, type: ts.Type): { depth: number; chain: string[] } {
  const chain: string[] = [];
  let current = type;
  let depth = 0;
  const seen = new Set<string>();

  while (true) {
    const bases = current.getBaseTypes?.() ?? [];
    if (bases.length === 0) break;
    const base = bases[0];
    const name = checker.typeToString(base);
    if (seen.has(name)) break;
    seen.add(name);
    chain.push(name);
    depth++;
    current = base;
    if (depth > 20) break;
  }

  return { depth, chain };
}

export function analyzeSemanticProfile(
  ctx: SemanticContext,
  filePath: string,
  fileEntry: FileEntry,
  includeTests = true,
): SemanticProfile {
  const profile: SemanticProfile = {
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
  if (!sourceFile) return profile;

  const exports = fileEntry.dependencyProfile?.declaredExports ?? [];
  for (const exp of exports) {
    if (exp.lineStart == null) continue;
    const refInfo = getExportReferenceInfo(ctx, filePath, exp.name, exp.lineStart, includeTests);
    profile.referenceCountByExport.set(exp.name, {
      count: refInfo.count,
      uniqueFiles: refInfo.uniqueFiles,
      lineStart: exp.lineStart,
      lineEnd: exp.lineEnd ?? exp.lineStart,
    });
  }

  for (const fn of fileEntry.functions) {
    if (!fn.params || fn.params === 0) continue;
    if (fn.name === '<anonymous>' || fn.name === '') continue;

    const fnSourceFile = ctx.program.getSourceFile(filePath);
    if (!fnSourceFile) continue;

    const fnPos = fnSourceFile.getPositionOfLineAndCharacter(Math.max(0, fn.lineStart - 1), 0);
    let fnNode: ts.Node | undefined;
    const findFn = (node: ts.Node): void => {
      if (fnNode) return;
      if (node.getStart(fnSourceFile!) >= fnPos && node.getEnd() <= fnSourceFile!.getPositionOfLineAndCharacter(Math.min(fn.lineEnd, fnSourceFile!.getLineAndCharacterOfPosition(fnSourceFile!.getEnd()).line + 1) - 1, 0) + 200) {
        if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
          const name = node.name && ts.isIdentifier(node.name) ? node.name.text : '';
          if (name === fn.name || fn.name === '<anonymous>') {
            fnNode = node;
            return;
          }
        }
      }
      ts.forEachChild(node, findFn);
    };
    ts.forEachChild(fnSourceFile, findFn);

    if (fnNode && (ts.isFunctionDeclaration(fnNode) || ts.isMethodDeclaration(fnNode) || ts.isArrowFunction(fnNode) || ts.isFunctionExpression(fnNode))) {
      for (const param of fnNode.parameters) {
        if (!ts.isIdentifier(param.name)) continue;
        const paramName = param.name.text;
        if (paramName.startsWith('_')) continue;

        const refs = ctx.service.findReferences(filePath, param.name.getStart(sourceFile));
        let usageCount = 0;
        if (refs) {
          for (const group of refs) {
            for (const ref of group.references) {
              if (!ref.isDefinition) usageCount++;
            }
          }
        }
        if (usageCount === 0) {
          profile.unusedParams.push({
            functionName: fn.name,
            paramName,
            lineStart: fn.lineStart,
            lineEnd: fn.lineEnd,
          });
        }
      }
    }
  }

  let abstractCount = 0;
  let totalExportTypes = 0;
  const visit = (node: ts.Node): void => {
    if (ts.isClassDeclaration(node) && node.name) {
      const type = ctx.checker.getTypeAtLocation(node);
      const { depth, chain } = getInheritanceDepth(ctx.checker, type);
      if (depth > 0) {
        profile.typeHierarchies.push({
          name: node.name.text,
          depth,
          chain,
          lineStart: sourceFile!.getLineAndCharacterOfPosition(node.getStart(sourceFile!)).line + 1,
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
              const classProps = new Set((classType.getProperties?.() ?? []).map((p) => p.name));
              const missing = ifaceProps.filter((p) => !classProps.has(p.name)).map((p) => p.name);

              const anycastMembers: string[] = [];
              for (const prop of ifaceProps) {
                if (classProps.has(prop.name)) {
                  const classProp = classType.getProperty?.(prop.name);
                  if (classProp) {
                    const classPropType = ctx.checker.getTypeOfSymbolAtLocation(classProp, node);
                    const typeStr = ctx.checker.typeToString(classPropType);
                    if (typeStr === 'any') anycastMembers.push(prop.name);
                  }
                }
              }

              if (missing.length > 0 || anycastMembers.length > 0) {
                profile.interfaceImpls.push({
                  interfaceName: ifaceName,
                  className: node.name!.text,
                  classFile: fileEntry.file,
                  classLine: sourceFile!.getLineAndCharacterOfPosition(node.getStart(sourceFile!)).line + 1,
                  missingMembers: missing,
                  anycastMembers,
                });
              }
            }
          }
        }
      }

      if (node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AbstractKeyword)) {
        abstractCount++;
      }

      const baseMethods = new Map<string, number>();
      const classType = ctx.checker.getTypeAtLocation(node);
      let currentType = classType;
      let baseDepth = 0;
      while (true) {
        const bases = currentType.getBaseTypes?.() ?? [];
        if (bases.length === 0) break;
        baseDepth++;
        const baseType = bases[0];
        for (const prop of baseType.getProperties?.() ?? []) {
          const decl = prop.getDeclarations?.()?.[0];
          if (decl && (ts.isMethodDeclaration(decl) || ts.isMethodSignature(decl))) {
            baseMethods.set(prop.name, Math.max(baseMethods.get(prop.name) ?? 0, baseDepth));
          }
        }
        currentType = baseType;
        if (baseDepth > 20) break;
      }

      for (const member of node.members) {
        if (ts.isMethodDeclaration(member) && member.name && ts.isIdentifier(member.name)) {
          const methodName = member.name.text;
          const overrideDepth = baseMethods.get(methodName);
          if (overrideDepth != null && overrideDepth > 0) {
            profile.overrideChains.push({
              methodName,
              className: node.name!.text,
              depth: overrideDepth,
              chain: [],
              lineStart: sourceFile!.getLineAndCharacterOfPosition(member.getStart(sourceFile!)).line + 1,
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
  profile.abstractnessRatio = totalExportTypes > 0 ? abstractCount / totalExportTypes : 0;

  const imports = fileEntry.dependencyProfile?.importedSymbols ?? [];
  for (const imp of imports) {
    if (imp.lineStart == null) continue;
    const node = findSymbolAtLine(sourceFile, imp.localName, imp.lineStart);
    if (!node) continue;

    const refs = ctx.service.findReferences(filePath, node.getStart(sourceFile));
    let sameFileUsageCount = 0;
    if (refs) {
      for (const group of refs) {
        for (const ref of group.references) {
          if (ref.isDefinition) continue;
          if (ref.fileName !== filePath) continue;
          sameFileUsageCount++;
        }
      }
    }

    if (sameFileUsageCount === 0) {
      profile.unusedImports.push({ name: imp.localName, lineStart: imp.lineStart });
    }

    if (imp.resolvedModule) {
      const targetSrc = ctx.program.getSourceFile(path.resolve(ctx.root, imp.resolvedModule));
      if (targetSrc) {
        const sym = ctx.checker.getSymbolAtLocation(node);
        if (sym) {
          const aliased = sym.flags & ts.SymbolFlags.Alias ? ctx.checker.getAliasedSymbol(sym) : sym;
          const decl = aliased.getDeclarations?.()?.[0];
          if (decl && ts.isClassDeclaration(decl)) {
            const isAbstract = decl.modifiers?.some((m) => m.kind === ts.SyntaxKind.AbstractKeyword);
            if (!isAbstract) {
              profile.concreteImports.push({
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

  // ─── Leaky Returns: exported functions returning internal types ─────
  const exportedFns = fileEntry.functions.filter((fn) =>
    fileEntry.dependencyProfile?.declaredExports?.some((e) => e.name === fn.name),
  );
  for (const fn of exportedFns) {
    const fnPos = sourceFile.getPositionOfLineAndCharacter(Math.max(0, fn.lineStart - 1), 0);
    let fnNode: ts.FunctionDeclaration | ts.MethodDeclaration | undefined;
    const findFnDecl = (node: ts.Node): void => {
      if (fnNode) return;
      if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) &&
          node.name && ts.isIdentifier(node.name) && node.name.text === fn.name &&
          node.getStart(sourceFile!) >= fnPos) {
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
          if (retDeclFile !== filePath && !relRetFile.startsWith('node_modules') && !retDeclFile.includes('lib.')) {
            profile.leakyReturns.push({
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

  // ─── Narrowable Params: broad param types that callers always narrow ─
  for (const fn of exportedFns) {
    if (!fn.params || fn.params < 1) continue;
    const fnPos = sourceFile.getPositionOfLineAndCharacter(Math.max(0, fn.lineStart - 1), 0);
    let fnDeclNode: ts.FunctionDeclaration | undefined;
    const findDecl = (node: ts.Node): void => {
      if (fnDeclNode) return;
      if (ts.isFunctionDeclaration(node) && node.name?.text === fn.name &&
          node.getStart(sourceFile!) >= fnPos) {
        fnDeclNode = node;
        return;
      }
      ts.forEachChild(node, findDecl);
    };
    ts.forEachChild(sourceFile, findDecl);
    if (!fnDeclNode) continue;

    for (const param of fnDeclNode.parameters) {
      if (!ts.isIdentifier(param.name)) continue;
      const paramType = ctx.checker.getTypeAtLocation(param);
      if (!paramType.isUnion() && !(paramType.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown))) continue;

      const declaredStr = ctx.checker.typeToString(paramType);
      const refs = ctx.service.findReferences(filePath, fnDeclNode.name!.getStart(sourceFile));
      if (!refs) continue;

      const argTypes: string[] = [];
      let allNarrow = true;
      let callSiteCount = 0;

      for (const group of refs) {
        for (const ref of group.references) {
          if (ref.isDefinition) continue;
          const refSrc = ctx.program.getSourceFile(ref.fileName);
          if (!refSrc) continue;
          let tokenNode: ts.Node = refSrc;
          const findToken = (n: ts.Node): void => {
            if (n.getStart(refSrc!) <= ref.textSpan.start && n.getEnd() >= ref.textSpan.start + ref.textSpan.length) {
              tokenNode = n;
              ts.forEachChild(n, findToken);
            }
          };
          ts.forEachChild(refSrc, findToken);
          let callExpr: ts.CallExpression | undefined;
          let ancestor: ts.Node | undefined = tokenNode;
          while (ancestor) {
            if (ts.isCallExpression(ancestor)) { callExpr = ancestor; break; }
            ancestor = ancestor.parent;
          }
          if (!callExpr?.arguments) continue;

          const paramIdx = fnDeclNode.parameters.indexOf(param);
          if (paramIdx < 0 || paramIdx >= callExpr.arguments.length) { allNarrow = false; continue; }

          const argType = ctx.checker.getTypeAtLocation(callExpr.arguments[paramIdx]);
          const argStr = ctx.checker.typeToString(argType);
          argTypes.push(argStr);
          callSiteCount++;

          if (argStr === declaredStr || argStr === 'any' || argStr === 'unknown') {
            allNarrow = false;
          }
        }
      }

      if (allNarrow && callSiteCount >= 2 && argTypes.length > 0) {
        const uniqueArgTypes = [...new Set(argTypes)];
        if (uniqueArgTypes.length <= 2) {
          profile.narrowableParams.push({
            functionName: fn.name,
            paramName: param.name.text,
            declaredType: declaredStr,
            actualTypes: uniqueArgTypes,
            narrowedType: uniqueArgTypes.length === 1 ? uniqueArgTypes[0] : uniqueArgTypes.join(' | '),
            lineStart: fn.lineStart,
            lineEnd: fn.lineEnd,
          });
        }
      }
    }
  }

  return profile;
}

export function collectAllAbsoluteFiles(
  fileSummaries: FileEntry[],
  dependencyState: DependencyState,
  root: string,
): string[] {
  const files = new Set<string>();
  for (const entry of fileSummaries) {
    files.add(path.resolve(root, entry.file));
  }
  for (const relFile of dependencyState.files) {
    files.add(path.resolve(root, relFile));
  }
  return [...files].filter((f) => {
    try { return fs.statSync(f).isFile(); } catch { return false; }
  });
}
