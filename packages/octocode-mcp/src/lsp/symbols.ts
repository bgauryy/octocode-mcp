/**
 * Symbol kind conversion utilities for LSP
 * Maps LSP SymbolKind to internal representation
 * @module lsp/symbols
 */

import { SymbolKind as LSPSymbolKind } from 'vscode-languageserver-protocol';
import type { SymbolKind } from './types.js';

/**
 * Convert LSP SymbolKind enum to our internal SymbolKind string type.
 *
 * @param kind - LSP SymbolKind enum value
 * @returns Internal SymbolKind string
 *
 * @example
 * convertSymbolKind(LSPSymbolKind.Function) // 'function'
 * convertSymbolKind(LSPSymbolKind.Class)    // 'class'
 * convertSymbolKind(99)                     // 'unknown'
 */
export function convertSymbolKind(kind: LSPSymbolKind): SymbolKind {
  switch (kind) {
    case LSPSymbolKind.Function:
      return 'function';
    case LSPSymbolKind.Method:
      return 'method';
    case LSPSymbolKind.Class:
      return 'class';
    case LSPSymbolKind.Interface:
      return 'interface';
    case LSPSymbolKind.Variable:
      return 'variable';
    case LSPSymbolKind.Constant:
      return 'constant';
    case LSPSymbolKind.Property:
      return 'property';
    case LSPSymbolKind.Enum:
      return 'enum';
    case LSPSymbolKind.Module:
      return 'module';
    case LSPSymbolKind.Namespace:
      return 'namespace';
    case LSPSymbolKind.TypeParameter:
      return 'type';
    default:
      return 'unknown';
  }
}

/**
 * Reverse mapping: convert internal SymbolKind to LSP SymbolKind.
 * Useful when sending data back to the language server.
 *
 * @param kind - Internal SymbolKind string
 * @returns LSP SymbolKind enum value (defaults to Function)
 */
export function toLSPSymbolKind(kind: SymbolKind): LSPSymbolKind {
  switch (kind) {
    case 'function':
      return LSPSymbolKind.Function;
    case 'method':
      return LSPSymbolKind.Method;
    case 'class':
      return LSPSymbolKind.Class;
    case 'interface':
      return LSPSymbolKind.Interface;
    case 'variable':
      return LSPSymbolKind.Variable;
    case 'constant':
      return LSPSymbolKind.Constant;
    case 'property':
      return LSPSymbolKind.Property;
    case 'enum':
      return LSPSymbolKind.Enum;
    case 'module':
      return LSPSymbolKind.Module;
    case 'namespace':
      return LSPSymbolKind.Namespace;
    case 'type':
      return LSPSymbolKind.TypeParameter;
    default:
      return LSPSymbolKind.Function;
  }
}
