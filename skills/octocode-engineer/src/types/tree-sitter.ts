import type { FlowEntry, FunctionEntry } from './core.js';
import type Parser from 'tree-sitter';


export type SyntaxNode = Parser.SyntaxNode;

export interface NodeTree {
  kind: string;
  startLine: number;
  endLine: number;
  children: NodeTree[];
  truncated?: boolean;
}

export interface TreeEntry {
  package: string;
  file: string;
  tree: NodeTree;
}

export interface TreeSitterFileEntry {
  parseEngine: string;
  nodeCount: number;
  functions: FunctionEntry[];
  flows: FlowEntry[];
  tree?: NodeTree;
}

export interface TreeSitterRuntime {
  available: boolean;
  parserTs: Parser | null;
  parserTsx: Parser | null;
  error?: string;
}

export interface NodeBudget {
  size: number;
}
