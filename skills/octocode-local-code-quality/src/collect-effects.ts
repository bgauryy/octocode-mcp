import * as ts from 'typescript';

import { isFunctionLike } from './ast-helpers.js';
import { getLineAndCharacter } from './utils.js';

import type { TopLevelEffect } from './types.js';

const SYNC_IO_TOP_LEVEL = new Set([
  'readFileSync', 'writeFileSync', 'existsSync', 'mkdirSync', 'readdirSync',
  'statSync', 'lstatSync', 'unlinkSync', 'rmdirSync', 'renameSync', 'copyFileSync',
  'accessSync', 'appendFileSync', 'chmodSync', 'chownSync', 'openSync', 'closeSync',
]);

const EXEC_SYNC_TOP_LEVEL = new Set(['execSync', 'execFileSync', 'spawnSync']);

export function collectTopLevelEffects(sourceFile: ts.SourceFile, _fileRelative: string): TopLevelEffect[] {
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


export function findParentBlock(node: ts.Node): ts.Block | ts.SourceFile | null {
  let current = node.parent;
  while (current) {
    if (ts.isBlock(current) || ts.isSourceFile(current)) return current;
    current = current.parent;
  }
  return null;
}

export function blockContainsCall(block: ts.Node, sourceFile: ts.SourceFile, callName: string): boolean {
  let found = false;
  const search = (n: ts.Node): void => {
    if (found) return;
    if (ts.isCallExpression(n) && n.expression.getText(sourceFile) === callName) { found = true; return; }
    ts.forEachChild(n, search);
  };
  ts.forEachChild(block, search);
  return found;
}

