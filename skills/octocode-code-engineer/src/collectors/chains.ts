import * as ts from 'typescript';

import { getLineAndCharacter } from '../common/utils.js';

import type { FileEntry, MessageChainEntry } from '../types/index.js';

/** Minimum property-access depth to flag as a message chain (Law of Demeter). */
const MIN_CHAIN_DEPTH = 4;

/**
 * Walk a property-access or element-access expression to its root and return
 * the full chain text and depth (number of dot-steps).
 *
 * Handles: a.b.c.d    a?.b?.c?.d    a['b']['c']['d']
 */
function measureChain(node: ts.Node, sourceFile: ts.SourceFile): { text: string; depth: number } | null {
  let depth = 0;
  let current: ts.Node = node;

  while (
    ts.isPropertyAccessExpression(current) ||
    ts.isElementAccessExpression(current)
  ) {
    depth++;
    current = (current as ts.PropertyAccessExpression | ts.ElementAccessExpression).expression;
  }

  if (depth < MIN_CHAIN_DEPTH) return null;

  // Avoid reporting intermediate nodes — only report the outermost chain.
  // (The outermost node is the one whose parent is NOT itself a property/element access)
  const parent = node.parent;
  if (
    ts.isPropertyAccessExpression(parent) ||
    ts.isElementAccessExpression(parent)
  ) {
    return null; // This is an intermediate node; the outermost will be visited.
  }

  return { text: node.getText(sourceFile), depth };
}

export function collectMessageChains(
  sourceFile: ts.SourceFile,
  _fileRelative: string,
  fileEntry: FileEntry
): void {
  const chains: MessageChainEntry[] = [];

  const visit = (node: ts.Node): void => {
    if (
      ts.isPropertyAccessExpression(node) ||
      ts.isElementAccessExpression(node)
    ) {
      const result = measureChain(node, sourceFile);
      if (result) {
        const loc = getLineAndCharacter(sourceFile, node);
        chains.push({
          chain: result.text.slice(0, 80),
          depth: result.depth,
          lineStart: loc.lineStart,
          lineEnd: loc.lineEnd,
        });
      }
    }
    ts.forEachChild(node, visit);
  };

  ts.forEachChild(sourceFile, visit);

  if (chains.length > 0) {
    fileEntry.messageChains = chains;
  }
}
