import * as ts from 'typescript';

import { getLineAndCharacter } from './utils.js';

import type { HalsteadMetrics, Metrics } from './types.js';

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

  const visit = (
    node: ts.Node,
    branchDepth: number,
    loopDepth: number
  ): void => {
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
          ((node as ts.BinaryExpression).operatorToken.kind ===
            ts.SyntaxKind.AmpersandAmpersandToken ||
            (node as ts.BinaryExpression).operatorToken.kind ===
              ts.SyntaxKind.BarBarToken)
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
      ts.forEachChild(node, child => visit(child, branchDepth, nextLoopDepth));
      return;
    }

    ts.forEachChild(node, child => visit(child, branchDepth, loopDepth));
  };

  visit(rootNode, 0, 0);
  return metrics;
}

const HALSTEAD_OPERATOR_KINDS = new Set([
  ts.SyntaxKind.PlusToken,
  ts.SyntaxKind.MinusToken,
  ts.SyntaxKind.AsteriskToken,
  ts.SyntaxKind.SlashToken,
  ts.SyntaxKind.PercentToken,
  ts.SyntaxKind.AsteriskAsteriskToken,
  ts.SyntaxKind.PlusPlusToken,
  ts.SyntaxKind.MinusMinusToken,
  ts.SyntaxKind.EqualsToken,
  ts.SyntaxKind.PlusEqualsToken,
  ts.SyntaxKind.MinusEqualsToken,
  ts.SyntaxKind.AsteriskEqualsToken,
  ts.SyntaxKind.SlashEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.LessThanToken,
  ts.SyntaxKind.GreaterThanToken,
  ts.SyntaxKind.LessThanEqualsToken,
  ts.SyntaxKind.GreaterThanEqualsToken,
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.ExclamationToken,
  ts.SyntaxKind.QuestionQuestionToken,
  ts.SyntaxKind.IfKeyword,
  ts.SyntaxKind.ElseKeyword,
  ts.SyntaxKind.ForKeyword,
  ts.SyntaxKind.WhileKeyword,
  ts.SyntaxKind.DoKeyword,
  ts.SyntaxKind.SwitchKeyword,
  ts.SyntaxKind.CaseKeyword,
  ts.SyntaxKind.ReturnKeyword,
  ts.SyntaxKind.ThrowKeyword,
  ts.SyntaxKind.NewKeyword,
  ts.SyntaxKind.DeleteKeyword,
  ts.SyntaxKind.TypeOfKeyword,
  ts.SyntaxKind.AwaitKeyword,
  ts.SyntaxKind.YieldKeyword,
  ts.SyntaxKind.DotToken,
  ts.SyntaxKind.OpenParenToken,
  ts.SyntaxKind.OpenBracketToken,
  ts.SyntaxKind.EqualsGreaterThanToken,
  ts.SyntaxKind.DotDotDotToken,
]);

export function computeHalstead(node: ts.Node): HalsteadMetrics {
  const operatorBag = new Map<string, number>();
  const operandBag = new Map<string, number>();

  const walk = (n: ts.Node): void => {
    if (ts.isIdentifier(n) || ts.isPrivateIdentifier(n)) {
      const text = n.text;
      operandBag.set(text, (operandBag.get(text) || 0) + 1);
    } else if (
      ts.isNumericLiteral(n) ||
      ts.isStringLiteral(n) ||
      ts.isNoSubstitutionTemplateLiteral(n)
    ) {
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
  const difficulty =
    distinctOperands > 0
      ? (distinctOperators / 2) * (operands / distinctOperands)
      : 0;
  const effort = volume * difficulty;
  const time = effort / 18;
  const estimatedBugs = volume / 3000;

  return {
    operators,
    operands,
    distinctOperators,
    distinctOperands,
    vocabulary,
    length,
    volume,
    difficulty,
    effort,
    time,
    estimatedBugs,
  };
}

export function computeMaintainabilityIndex(
  halsteadVolume: number,
  cyclomaticComplexity: number,
  linesOfCode: number
): number {
  const safeVolume = Math.max(halsteadVolume, 1);
  const safeLOC = Math.max(linesOfCode, 1);
  const raw =
    171 -
    5.2 * Math.log(safeVolume) -
    0.23 * cyclomaticComplexity -
    16.2 * Math.log(safeLOC);
  return Math.max(0, (raw * 100) / 171);
}

export function countLinesInNode(
  sourceFile: ts.SourceFile,
  node: ts.Node
): number {
  const loc = getLineAndCharacter(sourceFile, node);
  return Math.max(1, loc.lineEnd - loc.lineStart + 1);
}
