import path from 'node:path';
import * as ts from 'typescript';
import type {
  AnalysisOptions, Metrics, Location, FunctionEntry, FlowEntry,
  FileEntry, PackageFileSummary, FlowMaps, TreeEntry, DependencyProfile,
  NodeBudget, FileCriticality, HalsteadMetrics, CodeLocation, MagicNumberEntry,
  SuspiciousString, TimerCall, TestProfile, TestBlock, InputSourceInfo, MockControlCall,
  TopLevelEffect,
} from './types.js';
import { TS_CONTROL_KINDS } from './types.js';
import { getLineAndCharacter, makeFingerprint, hashString, buildNodeTree, increment, isTestFile } from './utils.js';
import { computeCognitiveComplexity } from './architecture.js';

export function isFunctionLike(node: ts.Node): boolean {
  return ts.isFunctionDeclaration(node)
    || ts.isFunctionExpression(node)
    || ts.isArrowFunction(node)
    || ts.isMethodDeclaration(node)
    || ts.isConstructorDeclaration(node)
    || ts.isGetAccessor(node)
    || ts.isSetAccessor(node);
}

export function getFunctionName(node: ts.Node, sourceFile: ts.SourceFile): string {
  if ('name' in node && node.name && ts.isIdentifier(node.name as ts.Node)) return (node.name as ts.Identifier).getText(sourceFile);

  const parent = node.parent;
  if (parent && ts.isVariableDeclaration(parent) && parent.name && ts.isIdentifier(parent.name)) {
    return parent.name.getText(sourceFile);
  }

  if (parent && ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name)) {
    return parent.name.getText(sourceFile);
  }

  if (parent && ts.isPropertyDeclaration(parent) && parent.name && ts.isIdentifier(parent.name)) {
    return parent.name.getText(sourceFile);
  }

  if (parent && ts.isMethodDeclaration(parent) && parent.name) {
    return parent.name.getText(sourceFile);
  }

  if (parent && ts.isGetAccessor(parent) && parent.name) {
    return parent.name.getText(sourceFile);
  }

  if (parent && ts.isSetAccessor(parent) && parent.name) {
    return parent.name.getText(sourceFile);
  }

  return '<anonymous>';
}

export function collectMetrics(rootNode: ts.Node): Metrics {
  const metrics: Metrics = {
    complexity: 1,
    maxBranchDepth: 0,
    maxLoopDepth: 0,
    returns: 0,
    awaits: 0,
    calls: 0,
    loops: 0,
  };

  const visit = (node: ts.Node, branchDepth: number, loopDepth: number): void => {
    switch (node.kind) {
      case ts.SyntaxKind.IfStatement:
      case ts.SyntaxKind.WhileStatement:
      case ts.SyntaxKind.DoStatement:
      case ts.SyntaxKind.ForStatement:
      case ts.SyntaxKind.ForInStatement:
      case ts.SyntaxKind.ForOfStatement:
      case ts.SyntaxKind.SwitchStatement:
      case ts.SyntaxKind.CatchClause:
        metrics.complexity += 1;
        branchDepth += 1;
        metrics.maxBranchDepth = Math.max(metrics.maxBranchDepth, branchDepth);
        break;
      case ts.SyntaxKind.ConditionalExpression:
        metrics.complexity += 1;
        break;
      case ts.SyntaxKind.ReturnStatement:
      case ts.SyntaxKind.ThrowStatement:
        metrics.returns += 1;
        break;
      case ts.SyntaxKind.AwaitExpression:
        metrics.awaits += 1;
        break;
      case ts.SyntaxKind.CallExpression:
        metrics.calls += 1;
        break;
      default:
        if (
          node.kind === ts.SyntaxKind.BinaryExpression &&
          ((node as ts.BinaryExpression).operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
            (node as ts.BinaryExpression).operatorToken.kind === ts.SyntaxKind.BarBarToken)
        ) {
          metrics.complexity += 1;
        }
    }

    if (
      node.kind === ts.SyntaxKind.ForStatement ||
      node.kind === ts.SyntaxKind.ForInStatement ||
      node.kind === ts.SyntaxKind.ForOfStatement
    ) {
      const nextLoopDepth = loopDepth + 1;
      metrics.loops += 1;
      metrics.maxLoopDepth = Math.max(metrics.maxLoopDepth, nextLoopDepth);
      ts.forEachChild(node, (child) => visit(child, branchDepth, nextLoopDepth));
      return;
    }

    ts.forEachChild(node, (child) => visit(child, branchDepth, loopDepth));
  };

  visit(rootNode, 0, 0);
  return metrics;
}

const HALSTEAD_OPERATOR_KINDS = new Set([
  ts.SyntaxKind.PlusToken, ts.SyntaxKind.MinusToken, ts.SyntaxKind.AsteriskToken,
  ts.SyntaxKind.SlashToken, ts.SyntaxKind.PercentToken, ts.SyntaxKind.AsteriskAsteriskToken,
  ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken,
  ts.SyntaxKind.EqualsToken, ts.SyntaxKind.PlusEqualsToken, ts.SyntaxKind.MinusEqualsToken,
  ts.SyntaxKind.AsteriskEqualsToken, ts.SyntaxKind.SlashEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.LessThanToken, ts.SyntaxKind.GreaterThanToken,
  ts.SyntaxKind.LessThanEqualsToken, ts.SyntaxKind.GreaterThanEqualsToken,
  ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.ExclamationToken, ts.SyntaxKind.QuestionQuestionToken,
  ts.SyntaxKind.IfKeyword, ts.SyntaxKind.ElseKeyword,
  ts.SyntaxKind.ForKeyword, ts.SyntaxKind.WhileKeyword, ts.SyntaxKind.DoKeyword,
  ts.SyntaxKind.SwitchKeyword, ts.SyntaxKind.CaseKeyword,
  ts.SyntaxKind.ReturnKeyword, ts.SyntaxKind.ThrowKeyword,
  ts.SyntaxKind.NewKeyword, ts.SyntaxKind.DeleteKeyword, ts.SyntaxKind.TypeOfKeyword,
  ts.SyntaxKind.AwaitKeyword, ts.SyntaxKind.YieldKeyword,
  ts.SyntaxKind.DotToken, ts.SyntaxKind.OpenParenToken, ts.SyntaxKind.OpenBracketToken,
  ts.SyntaxKind.EqualsGreaterThanToken, ts.SyntaxKind.DotDotDotToken,
]);

export function computeHalstead(node: ts.Node): HalsteadMetrics {
  const operatorBag = new Map<string, number>();
  const operandBag = new Map<string, number>();

  const walk = (n: ts.Node): void => {
    if (ts.isIdentifier(n) || ts.isPrivateIdentifier(n)) {
      const text = n.text;
      operandBag.set(text, (operandBag.get(text) || 0) + 1);
    } else if (ts.isNumericLiteral(n) || ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      const text = n.getText();
      operandBag.set(text, (operandBag.get(text) || 0) + 1);
    } else if (ts.isToken(n) && HALSTEAD_OPERATOR_KINDS.has(n.kind)) {
      const key = ts.SyntaxKind[n.kind];
      operatorBag.set(key, (operatorBag.get(key) || 0) + 1);
    }
    ts.forEachChild(n, walk);
  };
  walk(node);

  const distinctOperators = operatorBag.size;
  const distinctOperands = operandBag.size;
  let operators = 0;
  for (const v of operatorBag.values()) operators += v;
  let operands = 0;
  for (const v of operandBag.values()) operands += v;

  const vocabulary = distinctOperators + distinctOperands;
  const length = operators + operands;
  const volume = vocabulary > 0 ? length * Math.log2(vocabulary) : 0;
  const difficulty = distinctOperands > 0
    ? (distinctOperators / 2) * (operands / distinctOperands)
    : 0;
  const effort = volume * difficulty;
  const time = effort / 18;
  const estimatedBugs = volume / 3000;

  return {
    operators, operands, distinctOperators, distinctOperands,
    vocabulary, length, volume, difficulty, effort, time, estimatedBugs,
  };
}

export function computeMaintainabilityIndex(
  halsteadVolume: number,
  cyclomaticComplexity: number,
  linesOfCode: number,
): number {
  const safeVolume = Math.max(halsteadVolume, 1);
  const safeLOC = Math.max(linesOfCode, 1);
  const raw = 171
    - 5.2 * Math.log(safeVolume)
    - 0.23 * cyclomaticComplexity
    - 16.2 * Math.log(safeLOC);
  return Math.max(0, raw * 100 / 171);
}

export function buildDependencyCriticality(fileSummary: FileEntry | null, options: AnalysisOptions): FileCriticality {
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
    if (complexity >= options.criticalComplexityThreshold) {
      highComplexity += 1;
    }
  }

  const flows = fileSummary.flows ? fileSummary.flows.length : 0;
  const score = Math.max(
    1,
    Math.round(totalComplexity * 0.7 + fileSummary.functions.length * 2 + flows * 0.2),
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
  if (ts.isForStatement(node) || ts.isWhileStatement(node) || ts.isDoStatement(node)
      || ts.isForOfStatement(node) || ts.isForInStatement(node)) {
    const stmt = node.statement;
    return ts.isBlock(stmt) ? stmt.statements.length : 1;
  }
  return 1;
}

export function countLinesInNode(sourceFile: ts.SourceFile, node: ts.Node): number {
  const loc = getLineAndCharacter(sourceFile, node);
  return Math.max(1, loc.lineEnd - loc.lineStart + 1);
}

function makeLocationFromTs(node: ts.Node, sourceFile: ts.SourceFile, repoRoot: string): Location {
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
  dependencyProfile: DependencyProfile,
): FileEntry {
  const filePath = sourceFile.fileName;
  const fileRelative = path.relative(options.root, filePath);
  packageFileSummary.fileCount += 1;
  packageFileSummary.nodeCount += 1;
  packageFileSummary.kindCounts.SourceFile = (packageFileSummary.kindCounts.SourceFile || 0) + 1;

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
    const tree = buildNodeTree(sourceFile, sourceFile, options.treeDepth, nodeBudget);
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
    packageFileSummary.kindCounts[kind] = (packageFileSummary.kindCounts[kind] || 0) + 1;

    if (ts.isCatchClause(node)) {
      const block = node.block;
      if (block.statements.length === 0) {
        const loc = getLineAndCharacter(sourceFile, node);
        emptyCatches.push({ file: fileRelative, lineStart: loc.lineStart, lineEnd: loc.lineEnd });
      }
    }

    if (ts.isSwitchStatement(node)) {
      const hasDefault = node.caseBlock.clauses.some(c => c.kind === ts.SyntaxKind.DefaultClause);
      if (!hasDefault) {
        const loc = getLineAndCharacter(sourceFile, node);
        switchesWithoutDefault.push({ file: fileRelative, lineStart: loc.lineStart, lineEnd: loc.lineEnd });
      }
    }

    if (node.kind === ts.SyntaxKind.AnyKeyword) {
      anyCount += 1;
    }
    if (ts.isAsExpression(node) && node.type.kind === ts.SyntaxKind.AnyKeyword) {
      anyCount += 1;
    }

    if (ts.isAsExpression(node)) {
      if (node.type.kind === ts.SyntaxKind.AnyKeyword) {
        const loc = getLineAndCharacter(sourceFile, node);
        asAnyLocs.push({ file: fileRelative, lineStart: loc.lineStart, lineEnd: loc.lineEnd });
      }
      if (ts.isAsExpression(node.expression) && node.expression.type.kind === ts.SyntaxKind.UnknownKeyword) {
        const loc = getLineAndCharacter(sourceFile, node);
        doubleAssertionLocs.push({ file: fileRelative, lineStart: loc.lineStart, lineEnd: loc.lineEnd });
      }
    }
    if (ts.isNonNullExpression(node)) {
      const loc = getLineAndCharacter(sourceFile, node);
      nonNullLocs.push({ file: fileRelative, lineStart: loc.lineStart, lineEnd: loc.lineEnd });
    }

    if (ts.isNumericLiteral(node)) {
      const value = Number(node.text);
      if (!MAGIC_EXCLUDED.has(value)) {
        const parent = node.parent;
        const inConst = parent && ts.isVariableDeclaration(parent) &&
          parent.parent && ts.isVariableDeclarationList(parent.parent) &&
          (parent.parent.flags & ts.NodeFlags.Const) !== 0;
        const inEnum = parent && ts.isEnumMember(parent);
        if (!inConst && !inEnum) {
          const loc = getLineAndCharacter(sourceFile, node);
          magicNumbers.push({ value, file: fileRelative, lineStart: loc.lineStart, lineEnd: loc.lineEnd });
        }
      }
    }

    if (isFunctionLike(node)) {
      const funcNode = node as ts.FunctionLikeDeclaration;
      const body = funcNode.body;
      const statementCount = body && ts.isBlock(body) ? body.statements.length : 1;
      const loc = makeLocationFromTs(node, sourceFile, options.root);
      const signature = getFunctionName(node, sourceFile);
      const metrics: Metrics = body ? collectMetrics(body) : {
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
          entry.lengthLines,
        );
      }

      if (ts.isFunctionDeclaration(node)) {
        entry.declared = true;
      }

      if (statementCount >= options.minFunctionStatements) {
        const bodyHash = body ? makeFingerprint(body) : hashString(fileRelative);
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

      if (statementCount >= options.minFlowStatements) {
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
  fileEntry.typeAssertionEscapes = { asAny: asAnyLocs, doubleAssertion: doubleAssertionLocs, nonNull: nonNullLocs };

  const asyncWithoutAwait: Array<{ name: string; lineStart: number; lineEnd: number }> = [];
  const unprotectedAsync: Array<{ name: string; awaitCount: number; lineStart: number; lineEnd: number }> = [];
  for (const fn of fileEntry.functions) {
    if (fn.awaits === 0) continue;
    const fnStart = sourceFile.getPositionOfLineAndCharacter(Math.max(0, fn.lineStart - 1), 0);
    let fnAstNode: ts.Node | undefined;
    const findFnNode = (node: ts.Node): void => {
      if (fnAstNode) return;
      if (isFunctionLike(node) && node.getStart(sourceFile) >= fnStart) {
        const fnLoc = getLineAndCharacter(sourceFile, node);
        if (fnLoc.lineStart === fn.lineStart) { fnAstNode = node; return; }
      }
      ts.forEachChild(node, findFnNode);
    };
    ts.forEachChild(sourceFile, findFnNode);
    if (!fnAstNode) continue;
    const isAsync = (fnAstNode as ts.FunctionLikeDeclaration).modifiers?.some((m: ts.ModifierLike) => m.kind === ts.SyntaxKind.AsyncKeyword);
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
      asyncWithoutAwait.push({ name: fn.name, lineStart: fn.lineStart, lineEnd: fn.lineEnd });
    } else if (!hasTryCatch && !hasCatchChain) {
      unprotectedAsync.push({ name: fn.name, awaitCount, lineStart: fn.lineStart, lineEnd: fn.lineEnd });
    }
  }
  fileEntry.asyncWithoutAwait = asyncWithoutAwait;
  fileEntry.unprotectedAsync = unprotectedAsync;

  collectSecurityData(sourceFile, fileRelative, fileEntry);
  if (!isTestFile(fileRelative)) {
    collectInputSourceProfile(sourceFile, fileRelative, fileEntry);
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

  return fileEntry;
}

const SECRET_PATTERNS = [
  /password\s*[:=]\s*['"`]/i,
  /api[_-]?key\s*[:=]\s*['"`]/i,
  /secret\s*[:=]\s*['"`]/i,
  /token\s*[:=]\s*['"`]/i,
  /-----BEGIN.*KEY/,
  /private[_-]?key\s*[:=]\s*['"`]/i,
  /auth[_-]?token\s*[:=]\s*['"`]/i,
];

const SQL_KEYWORDS = /\b(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE)\b/i;

/** Strings that look like placeholders, not real secrets */
const PLACEHOLDER_PATTERN = /^(YOUR_|REPLACE_ME|<[a-z_-]+>|\$\{|{{)/i;
/** UUID pattern: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isInsideRegexLiteral(node: ts.Node): boolean {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isRegularExpressionLiteral(current)) return true;
    // Check if inside a new RegExp() call
    if (ts.isNewExpression(current) && current.expression.getText(node.getSourceFile()) === 'RegExp') return true;
    current = current.parent;
  }
  return false;
}

function isPlaceholderOrUuid(value: string): boolean {
  return PLACEHOLDER_PATTERN.test(value) || UUID_PATTERN.test(value);
}

/** Skip strings inside finding metadata fields (suggestedFix, reason, impact, etc.) */
const METADATA_PROP_NAMES = new Set([
  'suggestedFix', 'strategy', 'steps', 'reason', 'impact', 'expectedResult', 'title',
]);

function isInsideMetadataProperty(node: ts.Node): boolean {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isPropertyAssignment(current) && ts.isIdentifier(current.name)) {
      if (METADATA_PROP_NAMES.has(current.name.text)) return true;
    }
    current = current.parent;
  }
  return false;
}
const NESTED_QUANTIFIER_RE = /(\(.+[+*]\))[+*]|(\(.+\?\))\{/;

function computeShannonEntropy(s: string): number {
  const freq = new Map<string, number>();
  for (const ch of s) freq.set(ch, (freq.get(ch) || 0) + 1);
  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / s.length;
    if (p > 0) entropy -= p * Math.log2(p);
  }
  return entropy;
}

function collectSecurityData(sourceFile: ts.SourceFile, fileRelative: string, fileEntry: FileEntry): void {
  const evalUsages: CodeLocation[] = [];
  const unsafeHtmlAssignments: CodeLocation[] = [];
  const suspiciousStrings: SuspiciousString[] = [];
  const regexLiterals: Array<{ lineStart: number; lineEnd: number; pattern: string }> = [];

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const text = node.expression.getText(sourceFile);
      if (text === 'eval' || text === 'Function') {
        const loc = getLineAndCharacter(sourceFile, node);
        evalUsages.push({ file: fileRelative, lineStart: loc.lineStart, lineEnd: loc.lineEnd });
      }
      if (text === 'new Function') {
        const loc = getLineAndCharacter(sourceFile, node);
        evalUsages.push({ file: fileRelative, lineStart: loc.lineStart, lineEnd: loc.lineEnd });
      }
      if ((text === 'setTimeout' || text === 'setInterval') && node.arguments.length > 0) {
        const firstArg = node.arguments[0];
        if (ts.isStringLiteral(firstArg) || ts.isNoSubstitutionTemplateLiteral(firstArg)) {
          const loc = getLineAndCharacter(sourceFile, node);
          evalUsages.push({ file: fileRelative, lineStart: loc.lineStart, lineEnd: loc.lineEnd });
        }
      }
      if (text === 'document.write' || text === 'document.writeln') {
        const loc = getLineAndCharacter(sourceFile, node);
        unsafeHtmlAssignments.push({ file: fileRelative, lineStart: loc.lineStart, lineEnd: loc.lineEnd });
      }
    }

    if (ts.isNewExpression(node) && node.expression.getText(sourceFile) === 'Function') {
      const loc = getLineAndCharacter(sourceFile, node);
      evalUsages.push({ file: fileRelative, lineStart: loc.lineStart, lineEnd: loc.lineEnd });
    }

    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      if (ts.isPropertyAccessExpression(node.left)) {
        const prop = node.left.name.getText(sourceFile);
        if (prop === 'innerHTML' || prop === 'outerHTML') {
          const loc = getLineAndCharacter(sourceFile, node);
          unsafeHtmlAssignments.push({ file: fileRelative, lineStart: loc.lineStart, lineEnd: loc.lineEnd });
        }
      }
    }

    if (ts.isJsxAttribute(node) && node.name.getText(sourceFile) === 'dangerouslySetInnerHTML') {
      const loc = getLineAndCharacter(sourceFile, node);
      unsafeHtmlAssignments.push({ file: fileRelative, lineStart: loc.lineStart, lineEnd: loc.lineEnd });
    }

    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (!isInsideMetadataProperty(node) && !isInsideRegexLiteral(node)) {
        const value = node.text;
        if (!isPlaceholderOrUuid(value)) {
          for (const pattern of SECRET_PATTERNS) {
            if (pattern.test(value)) {
              const loc = getLineAndCharacter(sourceFile, node);
              suspiciousStrings.push({ lineStart: loc.lineStart, lineEnd: loc.lineEnd, kind: 'hardcoded-secret', snippet: value.slice(0, 40), context: 'literal' });
              break;
            }
          }
          if (value.length >= 20 && computeShannonEntropy(value) > 4.5) {
            const loc = getLineAndCharacter(sourceFile, node);
            suspiciousStrings.push({ lineStart: loc.lineStart, lineEnd: loc.lineEnd, kind: 'hardcoded-secret', context: 'literal' });
          }
        }
      }
    }

    if (ts.isRegularExpressionLiteral(node)) {
      // Tag regex-definition context for strings inside regex that match secret patterns
      const regexText = node.getText(sourceFile);
      for (const pattern of SECRET_PATTERNS) {
        if (pattern.test(regexText)) {
          // This is a regex that mentions secret keywords — NOT a real secret
          // Mark as regex-definition so the detector can skip it
          const loc = getLineAndCharacter(sourceFile, node);
          suspiciousStrings.push({ lineStart: loc.lineStart, lineEnd: loc.lineEnd, kind: 'hardcoded-secret', snippet: regexText.slice(0, 40), context: 'regex-definition' });
          break;
        }
      }
    }

    if (ts.isTemplateExpression(node)) {
      if (!isInsideMetadataProperty(node)) {
        const fullText = node.getText(sourceFile);
        if (SQL_KEYWORDS.test(fullText) && node.templateSpans.length > 0) {
          const loc = getLineAndCharacter(sourceFile, node);
          suspiciousStrings.push({ lineStart: loc.lineStart, lineEnd: loc.lineEnd, kind: 'sql-injection', snippet: fullText.slice(0, 60) });
        }
      }
    }

    if (ts.isRegularExpressionLiteral(node)) {
      const pattern = node.text;
      const loc = getLineAndCharacter(sourceFile, node);
      regexLiterals.push({ lineStart: loc.lineStart, lineEnd: loc.lineEnd, pattern });
    }

    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sourceFile, visit);

  fileEntry.evalUsages = evalUsages;
  fileEntry.unsafeHtmlAssignments = unsafeHtmlAssignments;
  fileEntry.suspiciousStrings = suspiciousStrings;
  fileEntry.regexLiterals = regexLiterals;
}

const HIGH_CONFIDENCE_PARAM = /^(req|request|body|rawBody|formData|payload|query|headers|params)$/i;
const MEDIUM_CONFIDENCE_PARAM = /^(input|event|message)$/i;
const SOURCE_PARAM_PATTERNS = /^(req|request|body|input|payload|data|params|query|headers|event|message|ctx|context|args|rawBody|formData)/i;

function getParamConfidence(params: string[]): 'high' | 'medium' | 'low' {
  let hasMedium = false;
  for (const p of params) {
    if (HIGH_CONFIDENCE_PARAM.test(p)) return 'high';
    if (MEDIUM_CONFIDENCE_PARAM.test(p)) hasMedium = true;
  }
  return hasMedium ? 'medium' : 'low';
}

const SINK_CALL_PATTERNS: Array<{ pattern: RegExp; kind: string }> = [
  { pattern: /^eval$/, kind: 'eval' },
  { pattern: /^Function$/, kind: 'eval' },
  { pattern: /\.exec(Sync)?$/, kind: 'exec' },
  { pattern: /^child_process\.(exec|spawn|fork)/, kind: 'exec' },
  { pattern: /^execSync$|^spawnSync$/, kind: 'exec' },
  { pattern: /^cp\.exec$|^cp\.spawn$/, kind: 'exec' },
  { pattern: /\.innerHTML$|\.outerHTML$/, kind: 'innerHTML' },
  { pattern: /dangerouslySetInnerHTML/, kind: 'innerHTML' },
  { pattern: /\.query$|\.execute$/, kind: 'sql' },
  { pattern: /\.redirect$/, kind: 'redirect' },
  { pattern: /\.send$|\.json$|\.write$/, kind: 'response' },
  { pattern: /fs\.(writeFile|appendFile)/, kind: 'fs-write' },
  { pattern: /writeFileSync|appendFileSync/, kind: 'fs-write' },
  // Path traversal sinks
  { pattern: /fs\.(readFile|readFileSync|createReadStream)/, kind: 'fs-read' },
  { pattern: /readFileSync|readFile/, kind: 'fs-read' },
  { pattern: /path\.(resolve|join)/, kind: 'path-resolve' },
  // SSRF sinks
  { pattern: /^fetch$/, kind: 'ssrf' },
  { pattern: /^(http|https)\.(request|get)/, kind: 'ssrf' },
  { pattern: /axios\.(get|post|put|delete|request)/, kind: 'ssrf' },
];

const SCHEMA_VALIDATOR_PATTERNS = /\.(validate|parse|safeParse|parseAsync|check|verify)\s*\(/;
const VALIDATOR_LIB_PATTERNS = /^(z|zod|Joi|yup|ajv|validator|superstruct|io-ts)\./;

function collectInputSourceProfile(sourceFile: ts.SourceFile, _fileRelative: string, fileEntry: FileEntry): void {
  const inputSources: InputSourceInfo[] = [];

  const visitFn = (node: ts.Node): void => {
    if (!isFunctionLike(node)) {
      ts.forEachChild(node, visitFn);
      return;
    }

    const fnNode = node as ts.FunctionLikeDeclaration;
    const params = fnNode.parameters;
    const sourceParams: string[] = [];
    for (const p of params) {
      const name = p.name.getText(sourceFile);
      if (SOURCE_PARAM_PATTERNS.test(name)) sourceParams.push(name);
    }
    if (sourceParams.length === 0) {
      ts.forEachChild(node, visitFn);
      return;
    }

    const body = fnNode.body;
    if (!body) {
      ts.forEachChild(node, visitFn);
      return;
    }

    const sinkKinds = new Set<string>();
    let hasValidation = false;
    const callsWithInputArgs: Array<{ callee: string; lineStart: number }> = [];
    const sourceParamSet = new Set(sourceParams);

    const walkBody = (child: ts.Node): void => {
      if (isFunctionLike(child) && child !== node) return;

      if (ts.isCallExpression(child)) {
        const callText = child.expression.getText(sourceFile);
        for (const sink of SINK_CALL_PATTERNS) {
          if (sink.pattern.test(callText)) {
            sinkKinds.add(sink.kind);
            break;
          }
        }
        if (SCHEMA_VALIDATOR_PATTERNS.test(callText) || VALIDATOR_LIB_PATTERNS.test(callText)) {
          hasValidation = true;
        }
        for (const arg of child.arguments) {
          const argText = arg.getText(sourceFile);
          for (const sp of sourceParamSet) {
            if (argText === sp || argText.startsWith(sp + '.') || argText.startsWith(sp + '[')) {
              const loc = getLineAndCharacter(sourceFile, child);
              callsWithInputArgs.push({ callee: callText, lineStart: loc.lineStart });
              break;
            }
          }
        }
      }

      if (ts.isTypeOfExpression(child)) {
        const operand = child.expression.getText(sourceFile);
        if (sourceParamSet.has(operand)) hasValidation = true;
      }

      if (ts.isPrefixUnaryExpression(child) && child.operator === ts.SyntaxKind.ExclamationToken) {
        const operand = child.operand.getText(sourceFile);
        if (sourceParamSet.has(operand)) hasValidation = true;
      }

      if (ts.isIfStatement(child) || ts.isConditionalExpression(child)) {
        const cond = ts.isIfStatement(child) ? child.expression : child.condition;
        const condText = cond.getText(sourceFile);
        for (const sp of sourceParamSet) {
          if (condText.includes(sp)) { hasValidation = true; break; }
        }
      }

      if (ts.isCallExpression(child) && child.expression.getText(sourceFile).endsWith('instanceof')) {
        hasValidation = true;
      }

      if (ts.isBinaryExpression(child) && child.operatorToken.kind === ts.SyntaxKind.InstanceOfKeyword) {
        const leftText = child.left.getText(sourceFile);
        if (sourceParamSet.has(leftText)) hasValidation = true;
      }

      ts.forEachChild(child, walkBody);
    };
    ts.forEachChild(body, walkBody);

    if (ts.isTemplateExpression(body) || ts.isBlock(body)) {
      const bodyText = body.getText(sourceFile);
      for (const sp of sourceParamSet) {
        if (bodyText.includes(sp + '?.')) { hasValidation = true; break; }
      }
    }

    const fnLoc = getLineAndCharacter(sourceFile, node);
    const fnName = getFunctionName(node, sourceFile);
    inputSources.push({
      functionName: fnName,
      lineStart: fnLoc.lineStart,
      lineEnd: fnLoc.lineEnd,
      sourceParams,
      hasSinkInBody: sinkKinds.size > 0,
      sinkKinds: [...sinkKinds],
      hasValidation,
      callsWithInputArgs,
      paramConfidence: getParamConfidence(sourceParams),
    });

    ts.forEachChild(node, visitFn);
  };
  ts.forEachChild(sourceFile, visitFn);

  fileEntry.inputSources = inputSources;
}

const SYNC_IO_METHODS = new Set([
  'readFileSync', 'writeFileSync', 'existsSync', 'mkdirSync', 'readdirSync',
  'statSync', 'lstatSync', 'unlinkSync', 'rmdirSync', 'renameSync', 'copyFileSync',
  'accessSync', 'appendFileSync', 'chmodSync', 'chownSync', 'openSync', 'closeSync',
  'execSync', 'execFileSync', 'spawnSync',
]);

function collectPerformanceData(sourceFile: ts.SourceFile, fileRelative: string, fileEntry: FileEntry): void {
  const awaitInLoopLocations: CodeLocation[] = [];
  const syncIoCalls: Array<{ name: string; lineStart: number; lineEnd: number }> = [];
  const timerCalls: TimerCall[] = [];
  const listenerRegistrations: CodeLocation[] = [];
  const listenerRemovals: CodeLocation[] = [];

  const isInsideLoop = (node: ts.Node): boolean => {
    let current = node.parent;
    while (current) {
      if (ts.isForStatement(current) || ts.isWhileStatement(current) || ts.isDoStatement(current)
          || ts.isForOfStatement(current) || ts.isForInStatement(current)) return true;
      if (isFunctionLike(current)) return false;
      current = current.parent;
    }
    return false;
  };

  const visit = (node: ts.Node): void => {
    if (ts.isAwaitExpression(node) && isInsideLoop(node)) {
      const loc = getLineAndCharacter(sourceFile, node);
      awaitInLoopLocations.push({ file: fileRelative, lineStart: loc.lineStart, lineEnd: loc.lineEnd });
    }

    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const methodName = node.expression.name.getText(sourceFile);
      if (SYNC_IO_METHODS.has(methodName)) {
        const loc = getLineAndCharacter(sourceFile, node);
        syncIoCalls.push({ name: methodName, lineStart: loc.lineStart, lineEnd: loc.lineEnd });
      }
      if (methodName === 'addEventListener' || methodName === 'on' || methodName === 'addListener') {
        const loc = getLineAndCharacter(sourceFile, node);
        listenerRegistrations.push({ file: fileRelative, lineStart: loc.lineStart, lineEnd: loc.lineEnd });
      }
      if (methodName === 'removeEventListener' || methodName === 'off' || methodName === 'removeListener') {
        const loc = getLineAndCharacter(sourceFile, node);
        listenerRemovals.push({ file: fileRelative, lineStart: loc.lineStart, lineEnd: loc.lineEnd });
      }
    }

    if (ts.isCallExpression(node)) {
      const text = node.expression.getText(sourceFile);
      if (text === 'setInterval' || text === 'setTimeout') {
        const loc = getLineAndCharacter(sourceFile, node);
        const clearName = text === 'setInterval' ? 'clearInterval' : 'clearTimeout';
        const parentBlock = findParentBlock(node);
        const hasCleanup = parentBlock ? blockContainsCall(parentBlock, sourceFile, clearName) : false;
        timerCalls.push({
          kind: text as 'setInterval' | 'setTimeout',
          lineStart: loc.lineStart,
          lineEnd: loc.lineEnd,
          hasCleanup,
        });
      }
    }

    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sourceFile, visit);

  fileEntry.awaitInLoopLocations = awaitInLoopLocations;
  fileEntry.syncIoCalls = syncIoCalls;
  fileEntry.timerCalls = timerCalls;
  fileEntry.listenerRegistrations = listenerRegistrations;
  fileEntry.listenerRemovals = listenerRemovals;
}

const SYNC_IO_TOP_LEVEL = new Set([
  'readFileSync', 'writeFileSync', 'existsSync', 'mkdirSync', 'readdirSync',
  'statSync', 'lstatSync', 'unlinkSync', 'rmdirSync', 'renameSync', 'copyFileSync',
  'accessSync', 'appendFileSync', 'chmodSync', 'chownSync', 'openSync', 'closeSync',
]);

const EXEC_SYNC_TOP_LEVEL = new Set(['execSync', 'execFileSync', 'spawnSync']);

function collectTopLevelEffects(sourceFile: ts.SourceFile, _fileRelative: string): TopLevelEffect[] {
  const effects: TopLevelEffect[] = [];

  for (const stmt of sourceFile.statements) {
    if (ts.isImportDeclaration(stmt)) {
      if (!stmt.importClause) {
        const spec = stmt.moduleSpecifier;
        const moduleName = ts.isStringLiteral(spec) ? spec.text : '<unknown>';
        const loc = getLineAndCharacter(sourceFile, stmt);
        effects.push({
          kind: 'side-effect-import',
          lineStart: loc.lineStart,
          lineEnd: loc.lineEnd,
          detail: `import '${moduleName}'`,
          weight: 3,
          confidence: 'medium',
        });
      }
      continue;
    }

    if (ts.isExportDeclaration(stmt) || ts.isExportAssignment(stmt)) continue;
    if (ts.isTypeAliasDeclaration(stmt) || ts.isInterfaceDeclaration(stmt) || ts.isEnumDeclaration(stmt)) continue;
    if (ts.isModuleDeclaration(stmt)) continue;

    if (isFunctionLike(stmt) || ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt)) continue;

    if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (decl.initializer) {
          scanExpressionForEffects(decl.initializer, sourceFile, effects);
        }
      }
      continue;
    }

    if (ts.isExpressionStatement(stmt)) {
      scanExpressionForEffects(stmt.expression, sourceFile, effects);
      continue;
    }

    if (ts.isIfStatement(stmt) || ts.isForStatement(stmt) || ts.isWhileStatement(stmt)
        || ts.isDoStatement(stmt) || ts.isForOfStatement(stmt) || ts.isForInStatement(stmt)
        || ts.isSwitchStatement(stmt) || ts.isTryStatement(stmt)) {
      scanNodeForEffects(stmt, sourceFile, effects);
    }
  }

  return effects;
}

function scanExpressionForEffects(expr: ts.Expression, sourceFile: ts.SourceFile, effects: TopLevelEffect[]): void {
  if (ts.isAwaitExpression(expr)) {
    const loc = getLineAndCharacter(sourceFile, expr);
    effects.push({
      kind: 'top-level-await',
      lineStart: loc.lineStart,
      lineEnd: loc.lineEnd,
      detail: 'top-level await',
      weight: 4,
      confidence: 'high',
    });
    return;
  }

  if (ts.isCallExpression(expr)) {
    classifyCall(expr, sourceFile, effects);
    return;
  }

  if (ts.isNewExpression(expr) && expr.expression.getText(sourceFile) === 'Function') {
    const loc = getLineAndCharacter(sourceFile, expr);
    effects.push({
      kind: 'eval',
      lineStart: loc.lineStart,
      lineEnd: loc.lineEnd,
      detail: 'new Function()',
      weight: 8,
      confidence: 'high',
    });
    return;
  }

  if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
    if (ts.isCallExpression(expr.right)) {
      classifyCall(expr.right, sourceFile, effects);
    }
  }
}

function classifyCall(call: ts.CallExpression, sourceFile: ts.SourceFile, effects: TopLevelEffect[]): void {
  const text = call.expression.getText(sourceFile);
  const loc = getLineAndCharacter(sourceFile, call);

  if (text === 'eval' || text === 'Function') {
    effects.push({ kind: 'eval', lineStart: loc.lineStart, lineEnd: loc.lineEnd, detail: `${text}()`, weight: 8, confidence: 'high' });
    return;
  }

  if (text === 'setInterval' || text === 'setTimeout') {
    effects.push({ kind: 'timer', lineStart: loc.lineStart, lineEnd: loc.lineEnd, detail: `${text}()`, weight: 4, confidence: 'high' });
    return;
  }

  if (ts.isPropertyAccessExpression(call.expression)) {
    const method = call.expression.name.getText(sourceFile);
    const obj = call.expression.expression.getText(sourceFile);

    if (EXEC_SYNC_TOP_LEVEL.has(method) || EXEC_SYNC_TOP_LEVEL.has(text)) {
      effects.push({ kind: 'exec-sync', lineStart: loc.lineStart, lineEnd: loc.lineEnd, detail: text, weight: 8, confidence: 'high' });
      return;
    }

    if (SYNC_IO_TOP_LEVEL.has(method)) {
      effects.push({ kind: 'sync-io', lineStart: loc.lineStart, lineEnd: loc.lineEnd, detail: text, weight: 5, confidence: 'high' });
      return;
    }

    if (obj === 'process' && (method === 'on' || method === 'once' || method === 'addListener')) {
      effects.push({ kind: 'process-handler', lineStart: loc.lineStart, lineEnd: loc.lineEnd, detail: `${text}()`, weight: 4, confidence: 'high' });
      return;
    }

    if (method === 'addEventListener' || method === 'on' || method === 'addListener') {
      effects.push({ kind: 'listener', lineStart: loc.lineStart, lineEnd: loc.lineEnd, detail: `${text}()`, weight: 4, confidence: 'medium' });
      return;
    }
  }

  if (ts.isCallExpression(call.expression) || text === 'import') {
    if (text.startsWith('import(') || (ts.isCallExpression(call) && call.expression.kind === ts.SyntaxKind.ImportKeyword)) {
      effects.push({ kind: 'dynamic-import', lineStart: loc.lineStart, lineEnd: loc.lineEnd, detail: 'dynamic import()', weight: 3, confidence: 'medium' });
    }
  }
}

function scanNodeForEffects(node: ts.Node, sourceFile: ts.SourceFile, effects: TopLevelEffect[]): void {
  if (isFunctionLike(node) || ts.isClassDeclaration(node)) return;
  if (ts.isCallExpression(node)) {
    classifyCall(node, sourceFile, effects);
    return;
  }
  if (ts.isAwaitExpression(node)) {
    const loc = getLineAndCharacter(sourceFile, node);
    effects.push({ kind: 'top-level-await', lineStart: loc.lineStart, lineEnd: loc.lineEnd, detail: 'top-level await', weight: 4, confidence: 'high' });
    return;
  }
  if (ts.isNewExpression(node) && node.expression.getText(sourceFile) === 'Function') {
    const loc = getLineAndCharacter(sourceFile, node);
    effects.push({ kind: 'eval', lineStart: loc.lineStart, lineEnd: loc.lineEnd, detail: 'new Function()', weight: 8, confidence: 'high' });
    return;
  }
  ts.forEachChild(node, (child) => scanNodeForEffects(child, sourceFile, effects));
}

// ─── Prototype Pollution Risk Sites ─────────────────────────────────────────

const DEEP_MERGE_NAMES = new Set([
  'merge', 'deepMerge', 'deepAssign', 'extend', 'deepExtend',
  'defaults', 'defaultsDeep', 'assign', 'mixin',
]);

/** Check if a computed-property-write key comes from a for..of/for..in loop over known internal iteration */
function isKeyFromInternalIteration(node: ts.ElementAccessExpression, sourceFile: ts.SourceFile): boolean {
  const keyExpr = node.argumentExpression;
  if (!keyExpr || !ts.isIdentifier(keyExpr)) return false;
  const keyName = keyExpr.getText(sourceFile);

  // Walk up to find a for-of/for-in loop that declares this key
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isForOfStatement(current) || ts.isForInStatement(current)) {
      const init = current.initializer;
      if (init) {
        const initText = init.getText(sourceFile);
        if (initText.includes(keyName)) {
          // Check if the iterable is a known-safe internal source
          const expr = current.expression.getText(sourceFile);
          if (/Object\.(keys|values|entries|getOwnPropertyNames)\(/.test(expr) ||
              /\.keys\(\)|\.values\(\)|\.entries\(\)/.test(expr) ||
              /Array\.from\(/.test(expr)) {
            return true;
          }
        }
      }
    }
    if (isFunctionLike(current)) break;
    current = current.parent;
  }
  return false;
}

/** Check if the containing block has a __proto__/constructor/prototype key guard */
function hasProtoKeyGuard(node: ts.Node, sourceFile: ts.SourceFile): boolean {
  const block = findParentBlock(node);
  if (!block) return false;
  const blockText = block.getText(sourceFile);
  return /__proto__|constructor|prototype/.test(blockText) &&
    (blockText.includes('===') || blockText.includes('!==') ||
     blockText.includes('includes(') || blockText.includes('hasOwnProperty'));
}

/** Check if the target object was created with Object.create(null) or is Map/Set */
function isTargetSafeObject(node: ts.ElementAccessExpression, sourceFile: ts.SourceFile): boolean {
  const objText = node.expression.getText(sourceFile);
  // Walk up to find variable declaration
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isBlock(current) || ts.isSourceFile(current)) {
      // Search for Object.create(null) or new Map/Set assignment for this object
      const text = current.getText(sourceFile);
      const createNullPattern = new RegExp(`${objText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=\\s*Object\\.create\\(null\\)`);
      const mapSetPattern = new RegExp(`${objText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=\\s*new\\s+(Map|Set)\\b`);
      if (createNullPattern.test(text) || mapSetPattern.test(text)) return true;
      break;
    }
    current = current.parent;
  }
  return false;
}

function collectPrototypePollutionSites(
  sourceFile: ts.SourceFile,
): Array<{ kind: string; detail: string; lineStart: number; lineEnd: number; guarded: boolean }> {
  const sites: Array<{ kind: string; detail: string; lineStart: number; lineEnd: number; guarded: boolean }> = [];

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const text = node.expression.getText(sourceFile);
      if (text === 'Object.assign' && node.arguments.length >= 2) {
        const loc = getLineAndCharacter(sourceFile, node);
        sites.push({ kind: 'object-assign', detail: `Object.assign() merges properties without __proto__ guard`, lineStart: loc.lineStart, lineEnd: loc.lineEnd, guarded: false });
      }
      const calleeName = text.split('.').pop() || '';
      if (DEEP_MERGE_NAMES.has(calleeName) && node.arguments.length >= 1) {
        const loc = getLineAndCharacter(sourceFile, node);
        sites.push({ kind: 'deep-merge', detail: `${calleeName}() deep-merges without prototype guard`, lineStart: loc.lineStart, lineEnd: loc.lineEnd, guarded: false });
      }
    }

    if (
      ts.isElementAccessExpression(node) &&
      node.argumentExpression &&
      !ts.isStringLiteral(node.argumentExpression) &&
      !ts.isNumericLiteral(node.argumentExpression) &&
      node.parent && ts.isBinaryExpression(node.parent) &&
      node.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      node.parent.left === node
    ) {
      const guarded = isKeyFromInternalIteration(node, sourceFile) ||
                       hasProtoKeyGuard(node, sourceFile) ||
                       isTargetSafeObject(node, sourceFile);
      const loc = getLineAndCharacter(sourceFile, node);
      sites.push({ kind: 'computed-property-write', detail: `Dynamic bracket assignment: ${node.getText(sourceFile).slice(0, 40)}`, lineStart: loc.lineStart, lineEnd: loc.lineEnd, guarded });
    }

    ts.forEachChild(node, visit);
  };

  ts.forEachChild(sourceFile, visit);
  return sites;
}

function findParentBlock(node: ts.Node): ts.Block | ts.SourceFile | null {
  let current = node.parent;
  while (current) {
    if (ts.isBlock(current) || ts.isSourceFile(current)) return current;
    current = current.parent;
  }
  return null;
}

function blockContainsCall(block: ts.Node, sourceFile: ts.SourceFile, callName: string): boolean {
  let found = false;
  const search = (n: ts.Node): void => {
    if (found) return;
    if (ts.isCallExpression(n) && n.expression.getText(sourceFile) === callName) { found = true; return; }
    ts.forEachChild(n, search);
  };
  ts.forEachChild(block, search);
  return found;
}

const ASSERTION_PATTERNS = new Set(['expect', 'assert', 'should']);
const MOCK_PATTERNS = ['jest.mock', 'vi.mock', 'sinon.stub', 'jest.spyOn', 'vi.spyOn', 'sinon.mock'];
const RESTORE_PATTERNS = new Set([
  'jest.restoreAllMocks',
  'vi.restoreAllMocks',
]);
const SETUP_PATTERNS = new Set(['beforeAll', 'beforeEach', 'afterAll', 'afterEach']);
const FOCUSED_PATTERNS = new Set(['it.only', 'test.only', 'describe.only', 'it.skip', 'test.skip', 'describe.skip', 'it.todo', 'test.todo']);
const USE_FAKE_TIMER_PATTERNS = new Set(['jest.useFakeTimers', 'vi.useFakeTimers']);
const USE_REAL_TIMER_PATTERNS = new Set(['jest.useRealTimers', 'vi.useRealTimers']);

function getSpyOrStubKind(call: ts.CallExpression, sourceFile: ts.SourceFile): MockControlCall['kind'] | undefined {
  if (!ts.isPropertyAccessExpression(call.expression)) return undefined;
  const methodName = call.expression.name.getText(sourceFile);
  const receiver = call.expression.expression.getText(sourceFile);

  if ((receiver === 'jest' || receiver === 'vi') && methodName === 'spyOn') return 'spy';
  if (receiver === 'sinon' && (methodName === 'stub' || methodName === 'mock')) return 'stub';
  return undefined;
}

function getMockControlTarget(node: ts.Node, sourceFile: ts.SourceFile): string | undefined {
  let current = node;
  while (current.parent) {
    const parent = current.parent;

    if (ts.isVariableDeclaration(parent) && parent.initializer === current && ts.isIdentifier(parent.name)) {
      return parent.name.getText(sourceFile);
    }

    if (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.EqualsToken && parent.right === current) {
      return parent.left.getText(sourceFile).trim();
    }

    current = parent;
  }

  return undefined;
}

function getMockRestoreTarget(node: ts.CallExpression, sourceFile: ts.SourceFile): string | undefined {
  if (!ts.isPropertyAccessExpression(node.expression)) return undefined;
  return node.expression.expression.getText(sourceFile).trim();
}

function collectTestProfile(sourceFile: ts.SourceFile, fileRelative: string, fileEntry: FileEntry): void {
  const testBlocks: TestBlock[] = [];
  const mockCalls: CodeLocation[] = [];
  const setupCalls: TestProfile['setupCalls'] = [];
  const mutableStateDecls: CodeLocation[] = [];
  const focusedCalls: TestProfile['focusedCalls'] = [];
  const timerControls: TestProfile['timerControls'] = [];
  const mockRestores: TestProfile['mockRestores'] = [];
  const spyOrStubCalls: TestProfile['spyOrStubCalls'] = [];

  const visit = (node: ts.Node, insideDescribe: boolean, insideTest: boolean): void => {
    if (ts.isCallExpression(node)) {
      const callText = node.expression.getText(sourceFile);

      if (FOCUSED_PATTERNS.has(callText)) {
        const loc = getLineAndCharacter(sourceFile, node);
        focusedCalls.push({ kind: callText as TestProfile['focusedCalls'][0]['kind'], lineStart: loc.lineStart, lineEnd: loc.lineEnd });
      }

      if ((callText === 'it' || callText === 'test' || callText === 'it.only' || callText === 'test.only') && node.arguments.length >= 2) {
        const nameArg = node.arguments[0];
        const name = ts.isStringLiteral(nameArg) ? nameArg.text : callText;
        const body = node.arguments[1];
        const loc = getLineAndCharacter(sourceFile, node);
        let assertionCount = 0;
        const countAssertions = (n: ts.Node): void => {
          if (ts.isCallExpression(n)) {
            const t = n.expression.getText(sourceFile);
            if (ASSERTION_PATTERNS.has(t.split('.')[0]) || t.includes('.to.') || t.includes('.should')) assertionCount++;
          }
          ts.forEachChild(n, countAssertions);
        };
        ts.forEachChild(body, countAssertions);
        testBlocks.push({ name, lineStart: loc.lineStart, lineEnd: loc.lineEnd, assertionCount });
        ts.forEachChild(node, (child) => visit(child, insideDescribe, true));
        return;
      }

      if (MOCK_PATTERNS.some((p) => callText === p || callText.startsWith(p + '('))) {
        const loc = getLineAndCharacter(sourceFile, node);
        mockCalls.push({ file: fileRelative, lineStart: loc.lineStart, lineEnd: loc.lineEnd });
        const spyOrStubKind = getSpyOrStubKind(node, sourceFile);
        if (spyOrStubKind) {
          spyOrStubCalls.push({
            kind: spyOrStubKind,
            file: fileRelative,
            lineStart: loc.lineStart,
            lineEnd: loc.lineEnd,
            target: getMockControlTarget(node, sourceFile),
          });
        }
      }

      if (USE_FAKE_TIMER_PATTERNS.has(callText)) {
        const loc = getLineAndCharacter(sourceFile, node);
        timerControls.push({ kind: callText as TestProfile['timerControls'][0]['kind'], lineStart: loc.lineStart, lineEnd: loc.lineEnd });
      }

      if (USE_REAL_TIMER_PATTERNS.has(callText)) {
        const loc = getLineAndCharacter(sourceFile, node);
        timerControls.push({ kind: callText as TestProfile['timerControls'][0]['kind'], lineStart: loc.lineStart, lineEnd: loc.lineEnd });
      }

      if (RESTORE_PATTERNS.has(callText)) {
        const loc = getLineAndCharacter(sourceFile, node);
        mockRestores.push({
          kind: 'restoreAll',
          file: fileRelative,
          lineStart: loc.lineStart,
          lineEnd: loc.lineEnd,
        });
      } else if (callText.endsWith('.mockRestore')) {
        const loc = getLineAndCharacter(sourceFile, node);
        mockRestores.push({
          kind: 'restore',
          file: fileRelative,
          lineStart: loc.lineStart,
          lineEnd: loc.lineEnd,
          target: getMockRestoreTarget(node, sourceFile),
        });
      }

      if (SETUP_PATTERNS.has(callText)) {
        const loc = getLineAndCharacter(sourceFile, node);
        setupCalls.push({ kind: callText as TestProfile['setupCalls'][0]['kind'], lineStart: loc.lineStart });
      }

      if (callText === 'describe' || callText === 'describe.only') {
        ts.forEachChild(node, (child) => visit(child, true, insideTest));
        return;
      }
    }

    if (insideDescribe && !insideTest && ts.isVariableStatement(node)) {
      const decl = node.declarationList;
      if (decl.flags & ts.NodeFlags.Let || !(decl.flags & ts.NodeFlags.Const)) {
        const loc = getLineAndCharacter(sourceFile, node);
        mutableStateDecls.push({ file: fileRelative, lineStart: loc.lineStart, lineEnd: loc.lineEnd });
      }
    }

    ts.forEachChild(node, (child) => visit(child, insideDescribe, insideTest));
  };

  ts.forEachChild(sourceFile, (child) => visit(child, false, false));

  fileEntry.testProfile = {
    testBlocks,
    mockCalls,
    setupCalls,
    mutableStateDecls,
    focusedCalls,
    timerControls,
    mockRestores,
    spyOrStubCalls,
  };
}
