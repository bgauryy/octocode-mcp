import path from 'node:path';

import * as ts from 'typescript';

import { getFunctionName, isFunctionLike } from './helpers.js';
import {
  collectMetrics,
  computeHalstead,
  computeMaintainabilityIndex,
  countLinesInNode,
} from './metrics.js';
import { collectMessageChains } from '../collectors/chains.js';
import { collectTopLevelEffects } from '../collectors/effects.js';
import { collectInputSourceProfile } from '../collectors/input-sources.js';
import { collectPerformanceData } from '../collectors/performance.js';
import { collectPrototypePollutionSites } from '../collectors/prototype-pollution.js';
import { collectSecurityData } from '../collectors/security.js';
import { collectTestProfile } from '../collectors/test-profile.js';
import {
  buildNodeTree,
  getLineAndCharacter,
  hashString,
  increment,
  isTestFile,
  makeFingerprint,
} from '../common/utils.js';
import { computeCognitiveComplexity } from '../detectors/index.js';
import { TS_CONTROL_KINDS } from '../types/index.js';

import type {
  AnalysisOptions,
  CodeLocation,
  DependencyProfile,
  FileCriticality,
  FileEntry,
  FlowEntry,
  FlowMaps,
  FunctionEntry,
  Location,
  MagicNumberEntry,
  Metrics,
  NodeBudget,
  PackageFileSummary,
  TreeEntry,
} from '../types/index.js';

export { isFunctionLike, getFunctionName } from './helpers.js';
export {
  collectMetrics,
  computeHalstead,
  computeMaintainabilityIndex,
  countLinesInNode,
} from './metrics.js';

export function buildDependencyCriticality(
  fileSummary: FileEntry | null,
  options: AnalysisOptions
): FileCriticality {
  if (!fileSummary || !Array.isArray(fileSummary.functions)) {
    return {
      file: fileSummary?.file || '<unknown>',
      complexityRisk: 1,
      highComplexityFunctions: 0,
      functionCount: 0,
      flows: 0,
      score: 1,
    };
  }

  let totalComplexity = 0;
  let highComplexity = 0;
  for (const fn of fileSummary.functions) {
    const complexity = Number(fn.complexity) || 0;
    totalComplexity += complexity;
    if (complexity >= options.thresholds.criticalComplexityThreshold) {
      highComplexity += 1;
    }
  }

  const flows = fileSummary.flows ? fileSummary.flows.length : 0;
  const score = Math.max(
    1,
    Math.round(
      totalComplexity * 0.7 + fileSummary.functions.length * 2 + flows * 0.2
    )
  );

  return {
    file: fileSummary.file,
    functionCount: fileSummary.functions.length,
    highComplexityFunctions: highComplexity,
    flows,
    complexitySum: totalComplexity,
    complexityRisk: highComplexity,
    score,
  };
}

function countControlFlowStatements(node: ts.Node): number {
  if (ts.isIfStatement(node)) {
    const then = node.thenStatement;
    return ts.isBlock(then) ? then.statements.length : 1;
  }
  if (ts.isSwitchStatement(node)) {
    return node.caseBlock.clauses.length;
  }
  if (ts.isTryStatement(node)) {
    return node.tryBlock.statements.length;
  }
  if (
    ts.isForStatement(node) ||
    ts.isWhileStatement(node) ||
    ts.isDoStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isForInStatement(node)
  ) {
    const stmt = node.statement;
    return ts.isBlock(stmt) ? stmt.statements.length : 1;
  }
  return 1;
}

function makeLocationFromTs(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  repoRoot: string
): Location {
  const loc = getLineAndCharacter(sourceFile, node);
  return {
    file: path.relative(repoRoot, node.getSourceFile().fileName),
    lineStart: loc.lineStart,
    lineEnd: loc.lineEnd,
    columnStart: loc.columnStart,
    columnEnd: loc.columnEnd,
  };
}

export function analyzeSourceFile(
  sourceFile: ts.SourceFile,
  packageName: string,
  packageFileSummary: PackageFileSummary,
  options: AnalysisOptions,
  maps: FlowMaps,
  trees: TreeEntry[],
  dependencyProfile: DependencyProfile
): FileEntry {
  const filePath = sourceFile.fileName;
  const fileRelative = path.relative(options.root, filePath);
  packageFileSummary.fileCount += 1;
  packageFileSummary.nodeCount += 1;
  packageFileSummary.kindCounts.SourceFile =
    (packageFileSummary.kindCounts.SourceFile || 0) + 1;

  const fileEntry: FileEntry = {
    package: packageName,
    file: fileRelative,
    parseEngine: 'typescript',
    nodeCount: 0,
    kindCounts: {},
    functions: [],
    flows: [],
    dependencyProfile,
  };

  if (options.emitTree) {
    const nodeBudget: NodeBudget = { size: 8000 };
    const tree = buildNodeTree(
      sourceFile,
      sourceFile,
      options.treeDepth,
      nodeBudget
    );
    if (tree) {
      trees.push({
        package: packageName,
        file: fileRelative,
        tree,
      });
    }
  }

  const controlKinds = TS_CONTROL_KINDS;
  const emptyCatches: CodeLocation[] = [];
  const switchesWithoutDefault: CodeLocation[] = [];
  const magicNumbers: MagicNumberEntry[] = [];
  let anyCount = 0;
  const asAnyLocs: CodeLocation[] = [];
  const doubleAssertionLocs: CodeLocation[] = [];
  const nonNullLocs: CodeLocation[] = [];
  const MAGIC_EXCLUDED = new Set([0, 1, -1, 2, 100]);

  const visit = (node: ts.Node): void => {
    fileEntry.nodeCount += 1;
    packageFileSummary.nodeCount += 1;
    const kind = ts.SyntaxKind[node.kind] || 'UNKNOWN';
    fileEntry.kindCounts[kind] = (fileEntry.kindCounts[kind] || 0) + 1;
    packageFileSummary.kindCounts[kind] =
      (packageFileSummary.kindCounts[kind] || 0) + 1;

    if (ts.isCatchClause(node)) {
      const block = node.block;
      if (block.statements.length === 0) {
        const loc = getLineAndCharacter(sourceFile, node);
        emptyCatches.push({
          file: fileRelative,
          lineStart: loc.lineStart,
          lineEnd: loc.lineEnd,
        });
      }
    }

    if (ts.isSwitchStatement(node)) {
      const hasDefault = node.caseBlock.clauses.some(
        c => c.kind === ts.SyntaxKind.DefaultClause
      );
      if (!hasDefault) {
        const loc = getLineAndCharacter(sourceFile, node);
        switchesWithoutDefault.push({
          file: fileRelative,
          lineStart: loc.lineStart,
          lineEnd: loc.lineEnd,
        });
      }
    }

    if (node.kind === ts.SyntaxKind.AnyKeyword) {
      anyCount += 1;
    }
    if (
      ts.isAsExpression(node) &&
      node.type.kind === ts.SyntaxKind.AnyKeyword
    ) {
      anyCount += 1;
    }

    if (ts.isAsExpression(node)) {
      if (node.type.kind === ts.SyntaxKind.AnyKeyword) {
        const loc = getLineAndCharacter(sourceFile, node);
        asAnyLocs.push({
          file: fileRelative,
          lineStart: loc.lineStart,
          lineEnd: loc.lineEnd,
        });
      }
      if (
        ts.isAsExpression(node.expression) &&
        node.expression.type.kind === ts.SyntaxKind.UnknownKeyword
      ) {
        const loc = getLineAndCharacter(sourceFile, node);
        doubleAssertionLocs.push({
          file: fileRelative,
          lineStart: loc.lineStart,
          lineEnd: loc.lineEnd,
        });
      }
    }
    if (ts.isNonNullExpression(node)) {
      const loc = getLineAndCharacter(sourceFile, node);
      nonNullLocs.push({
        file: fileRelative,
        lineStart: loc.lineStart,
        lineEnd: loc.lineEnd,
      });
    }

    if (ts.isNumericLiteral(node)) {
      const value = Number(node.text);
      if (!MAGIC_EXCLUDED.has(value)) {
        const parent = node.parent;
        const inConst =
          parent &&
          ts.isVariableDeclaration(parent) &&
          parent.parent &&
          ts.isVariableDeclarationList(parent.parent) &&
          (parent.parent.flags & ts.NodeFlags.Const) !== 0;
        const inEnum = parent && ts.isEnumMember(parent);
        if (!inConst && !inEnum) {
          const loc = getLineAndCharacter(sourceFile, node);
          magicNumbers.push({
            value,
            file: fileRelative,
            lineStart: loc.lineStart,
            lineEnd: loc.lineEnd,
          });
        }
      }
    }

    if (isFunctionLike(node)) {
      const funcNode = node as ts.FunctionLikeDeclaration;
      const body = funcNode.body;
      const statementCount =
        body && ts.isBlock(body) ? body.statements.length : 1;
      const loc = makeLocationFromTs(node, sourceFile, options.root);
      const signature = getFunctionName(node, sourceFile);
      const metrics: Metrics = body
        ? collectMetrics(body)
        : {
            complexity: 1,
            maxBranchDepth: 0,
            maxLoopDepth: 0,
            returns: 0,
            awaits: 0,
            calls: 0,
            loops: 0,
          };

      const entry: FunctionEntry = {
        kind,
        name: signature,
        nameHint: signature,
        file: fileRelative,
        lineStart: loc.lineStart,
        lineEnd: loc.lineEnd,
        columnStart: loc.columnStart,
        columnEnd: loc.columnEnd,
        statementCount,
        complexity: metrics.complexity,
        maxBranchDepth: metrics.maxBranchDepth,
        maxLoopDepth: metrics.maxLoopDepth,
        returns: metrics.returns,
        awaits: metrics.awaits,
        calls: metrics.calls,
        loops: metrics.loops,
        lengthLines: countLinesInNode(sourceFile, node),
        cognitiveComplexity: body ? computeCognitiveComplexity(body) : 0,
      };

      if (body) {
        entry.halstead = computeHalstead(body);
        entry.maintainabilityIndex = computeMaintainabilityIndex(
          entry.halstead.volume,
          metrics.complexity,
          entry.lengthLines
        );
      }

      if (ts.isFunctionDeclaration(node)) {
        entry.declared = true;
      }

      if (statementCount >= options.thresholds.minFunctionStatements) {
        const bodyHash = body
          ? makeFingerprint(body)
          : hashString(fileRelative);
        increment(maps.flowMap, `${bodyHash}|${node.kind}`, {
          ...entry,
          hash: bodyHash,
          metrics,
        });
      }

      if (funcNode.parameters) {
        entry.params = funcNode.parameters.length;
      }

      fileEntry.functions.push(entry);
      packageFileSummary.functions.push(entry);
      packageFileSummary.functionCount += 1;
    }

    if (controlKinds.has(node.kind)) {
      const statementCount = countControlFlowStatements(node);
      const loc = makeLocationFromTs(node, sourceFile, options.root);
      const flowEntry: FlowEntry = {
        kind,
        file: fileRelative,
        lineStart: loc.lineStart,
        lineEnd: loc.lineEnd,
        columnStart: loc.columnStart,
        columnEnd: loc.columnEnd,
        statementCount,
      };
      fileEntry.flows.push(flowEntry);
      packageFileSummary.flowCount += 1;

      if (statementCount >= options.thresholds.minFlowStatements) {
        const flowHash = makeFingerprint(node);
        increment(maps.controlMap, `${flowHash}|${node.kind}`, {
          ...flowEntry,
          hash: flowHash,
        });
      }
    }

    ts.forEachChild(node, visit);
  };

  ts.forEachChild(sourceFile, visit);

  fileEntry.emptyCatches = emptyCatches;
  fileEntry.switchesWithoutDefault = switchesWithoutDefault;
  fileEntry.anyCount = anyCount;
  fileEntry.magicNumbers = magicNumbers;
  fileEntry.typeAssertionEscapes = {
    asAny: asAnyLocs,
    doubleAssertion: doubleAssertionLocs,
    nonNull: nonNullLocs,
  };

  analyzeAsyncPatterns(sourceFile, fileEntry);
  collectFileProfiles(sourceFile, fileRelative, fileEntry);

  return fileEntry;
}

function analyzeAsyncPatterns(
  sourceFile: ts.SourceFile,
  fileEntry: FileEntry
): void {
  const asyncWithoutAwait: Array<{
    name: string;
    lineStart: number;
    lineEnd: number;
  }> = [];
  const unprotectedAsync: Array<{
    name: string;
    awaitCount: number;
    lineStart: number;
    lineEnd: number;
  }> = [];
  for (const fn of fileEntry.functions) {
    if (fn.awaits === 0) continue;
    const fnStart = sourceFile.getPositionOfLineAndCharacter(
      Math.max(0, fn.lineStart - 1),
      0
    );
    let fnAstNode: ts.Node | undefined;
    const findFnNode = (node: ts.Node): void => {
      if (fnAstNode) return;
      if (isFunctionLike(node) && node.getStart(sourceFile) >= fnStart) {
        const fnLoc = getLineAndCharacter(sourceFile, node);
        if (fnLoc.lineStart === fn.lineStart) {
          fnAstNode = node;
          return;
        }
      }
      ts.forEachChild(node, findFnNode);
    };
    ts.forEachChild(sourceFile, findFnNode);
    if (!fnAstNode) continue;
    const isAsync = (fnAstNode as ts.FunctionLikeDeclaration).modifiers?.some(
      (m: ts.ModifierLike) => m.kind === ts.SyntaxKind.AsyncKeyword
    );
    if (!isAsync) continue;

    let awaitCount = 0;
    let hasTryCatch = false;
    let hasCatchChain = false;
    const scanBody = (child: ts.Node): void => {
      if (ts.isAwaitExpression(child)) awaitCount++;
      if (ts.isTryStatement(child)) hasTryCatch = true;
      if (
        ts.isCallExpression(child) &&
        ts.isPropertyAccessExpression(child.expression) &&
        child.expression.name.text === 'catch'
      ) {
        hasCatchChain = true;
      }
      if (isFunctionLike(child) && child !== fnAstNode) return;
      ts.forEachChild(child, scanBody);
    };
    ts.forEachChild(fnAstNode, scanBody);

    if (awaitCount === 0) {
      asyncWithoutAwait.push({
        name: fn.name,
        lineStart: fn.lineStart,
        lineEnd: fn.lineEnd,
      });
    } else if (!hasTryCatch && !hasCatchChain) {
      unprotectedAsync.push({
        name: fn.name,
        awaitCount,
        lineStart: fn.lineStart,
        lineEnd: fn.lineEnd,
      });
    }
  }
  fileEntry.asyncWithoutAwait = asyncWithoutAwait;
  fileEntry.unprotectedAsync = unprotectedAsync;
}

function collectFileProfiles(
  sourceFile: ts.SourceFile,
  fileRelative: string,
  fileEntry: FileEntry
): void {
  collectSecurityData(sourceFile, fileRelative, fileEntry);
  if (!isTestFile(fileRelative)) {
    collectInputSourceProfile(sourceFile, fileRelative, fileEntry);
    collectMessageChains(sourceFile, fileRelative, fileEntry);
  }
  collectPerformanceData(sourceFile, fileRelative, fileEntry);
  if (isTestFile(fileRelative)) {
    collectTestProfile(sourceFile, fileRelative, fileEntry);
  }

  if (!isTestFile(fileRelative)) {
    const topLevelEffects = collectTopLevelEffects(sourceFile, fileRelative);
    if (topLevelEffects.length > 0) {
      fileEntry.topLevelEffects = topLevelEffects;
    }
    const ppSites = collectPrototypePollutionSites(sourceFile);
    if (ppSites.length > 0) {
      fileEntry.prototypePollutionSites = ppSites;
    }
  }
}
