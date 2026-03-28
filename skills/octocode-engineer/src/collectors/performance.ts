import * as ts from 'typescript';

import { blockContainsCall, findParentBlock } from './effects.js';
import { isFunctionLike } from '../ast/helpers.js';
import { getLineAndCharacter } from '../common/utils.js';

import type { CodeLocation, FileEntry, TimerCall } from '../types/index.js';

const SYNC_IO_METHODS = new Set([
  'readFileSync',
  'writeFileSync',
  'existsSync',
  'mkdirSync',
  'readdirSync',
  'statSync',
  'lstatSync',
  'unlinkSync',
  'rmdirSync',
  'renameSync',
  'copyFileSync',
  'accessSync',
  'appendFileSync',
  'chmodSync',
  'chownSync',
  'openSync',
  'closeSync',
  'execSync',
  'execFileSync',
  'spawnSync',
]);

export function collectPerformanceData(
  sourceFile: ts.SourceFile,
  fileRelative: string,
  fileEntry: FileEntry
): void {
  const awaitInLoopLocations: CodeLocation[] = [];
  const syncIoCalls: Array<{
    name: string;
    lineStart: number;
    lineEnd: number;
  }> = [];
  const timerCalls: TimerCall[] = [];
  const listenerRegistrations: CodeLocation[] = [];
  const listenerRemovals: CodeLocation[] = [];

  const isInsideLoop = (node: ts.Node): boolean => {
    let current = node.parent;
    while (current) {
      if (
        ts.isForStatement(current) ||
        ts.isWhileStatement(current) ||
        ts.isDoStatement(current) ||
        ts.isForOfStatement(current) ||
        ts.isForInStatement(current)
      )
        return true;
      if (isFunctionLike(current)) return false;
      current = current.parent;
    }
    return false;
  };

  const visit = (node: ts.Node): void => {
    if (ts.isAwaitExpression(node) && isInsideLoop(node)) {
      const loc = getLineAndCharacter(sourceFile, node);
      awaitInLoopLocations.push({
        file: fileRelative,
        lineStart: loc.lineStart,
        lineEnd: loc.lineEnd,
      });
    }

    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression)
    ) {
      const methodName = node.expression.name.getText(sourceFile);
      if (SYNC_IO_METHODS.has(methodName)) {
        const loc = getLineAndCharacter(sourceFile, node);
        syncIoCalls.push({
          name: methodName,
          lineStart: loc.lineStart,
          lineEnd: loc.lineEnd,
        });
      }
      if (
        methodName === 'addEventListener' ||
        methodName === 'on' ||
        methodName === 'addListener'
      ) {
        const loc = getLineAndCharacter(sourceFile, node);
        listenerRegistrations.push({
          file: fileRelative,
          lineStart: loc.lineStart,
          lineEnd: loc.lineEnd,
        });
      }
      if (
        methodName === 'removeEventListener' ||
        methodName === 'off' ||
        methodName === 'removeListener'
      ) {
        const loc = getLineAndCharacter(sourceFile, node);
        listenerRemovals.push({
          file: fileRelative,
          lineStart: loc.lineStart,
          lineEnd: loc.lineEnd,
        });
      }
    }

    if (ts.isCallExpression(node)) {
      const text = node.expression.getText(sourceFile);
      if (text === 'setInterval' || text === 'setTimeout') {
        const loc = getLineAndCharacter(sourceFile, node);
        const clearName =
          text === 'setInterval' ? 'clearInterval' : 'clearTimeout';
        const parentBlock = findParentBlock(node);
        const hasCleanup = parentBlock
          ? blockContainsCall(parentBlock, sourceFile, clearName)
          : false;
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
