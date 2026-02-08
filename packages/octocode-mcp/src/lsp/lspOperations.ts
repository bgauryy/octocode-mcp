/**
 * LSP Operations
 *
 * LSP protocol operations (goto definition, find references, call hierarchy, etc.)
 */

import { promises as fs } from 'fs';
import { MessageConnection } from 'vscode-jsonrpc/node.js';
import {
  DefinitionParams,
  ReferenceParams,
  Location,
  LocationLink,
  Position,
  TextDocumentIdentifier,
  CallHierarchyPrepareParams,
  CallHierarchyItem as LSPCallHierarchyItem,
  CallHierarchyIncomingCallsParams,
  CallHierarchyOutgoingCallsParams,
  CallHierarchyIncomingCall,
  CallHierarchyOutgoingCall,
  SymbolKind as LSPSymbolKind,
} from 'vscode-languageserver-protocol';
import { toUri, fromUri } from './uri.js';
import { convertSymbolKind } from './symbols.js';
import type {
  ExactPosition,
  CodeSnippet,
  CallHierarchyItem,
  IncomingCall,
  OutgoingCall,
} from './types.js';
import { LSPDocumentManager } from './lspDocumentManager.js';

/**
 * LSP operations handler
 */
export class LSPOperations {
  private connection: MessageConnection | null = null;
  private initialized = false;
  private documentManager: LSPDocumentManager;

  constructor(documentManager: LSPDocumentManager) {
    this.documentManager = documentManager;
  }

  /**
   * Set the connection and initialization status
   */
  setConnection(connection: MessageConnection, initialized: boolean): void {
    this.connection = connection;
    this.initialized = initialized;
  }

  /**
   * Go to definition
   */
  async gotoDefinition(
    filePath: string,
    position: ExactPosition
  ): Promise<CodeSnippet[]> {
    if (!this.connection || !this.initialized) {
      throw new Error('LSP client not initialized');
    }

    await this.documentManager.openDocument(filePath);

    try {
      const params: DefinitionParams = {
        textDocument: { uri: toUri(filePath) } as TextDocumentIdentifier,
        position: {
          line: position.line,
          character: position.character,
        } as Position,
      };

      const result = (await this.connection.sendRequest(
        'textDocument/definition',
        params
      )) as Location | Location[] | LocationLink[] | null;

      return this.locationsToSnippets(result);
    } finally {
      // Close document to prevent memory leak
      await this.documentManager.closeDocument(filePath);
    }
  }

  /**
   * Find references
   */
  async findReferences(
    filePath: string,
    position: ExactPosition,
    includeDeclaration = true
  ): Promise<CodeSnippet[]> {
    if (!this.connection || !this.initialized) {
      throw new Error('LSP client not initialized');
    }

    await this.documentManager.openDocument(filePath);

    try {
      const params: ReferenceParams = {
        textDocument: { uri: toUri(filePath) } as TextDocumentIdentifier,
        position: {
          line: position.line,
          character: position.character,
        } as Position,
        context: { includeDeclaration },
      };

      const result = (await this.connection.sendRequest(
        'textDocument/references',
        params
      )) as Location[] | null;

      return this.locationsToSnippets(result);
    } finally {
      // Close document to prevent memory leak
      await this.documentManager.closeDocument(filePath);
    }
  }

  /**
   * Prepare call hierarchy (get item at position)
   */
  async prepareCallHierarchy(
    filePath: string,
    position: ExactPosition
  ): Promise<CallHierarchyItem[]> {
    if (!this.connection || !this.initialized) {
      throw new Error('LSP client not initialized');
    }

    await this.documentManager.openDocument(filePath);

    try {
      const params: CallHierarchyPrepareParams = {
        textDocument: { uri: toUri(filePath) } as TextDocumentIdentifier,
        position: {
          line: position.line,
          character: position.character,
        } as Position,
      };

      const result = await this.connection.sendRequest(
        'textDocument/prepareCallHierarchy',
        params
      );

      if (!result || !Array.isArray(result)) {
        return [];
      }

      return (result as LSPCallHierarchyItem[]).map(item =>
        this.convertCallHierarchyItem(item)
      );
    } finally {
      // Close document to prevent memory leak
      await this.documentManager.closeDocument(filePath);
    }
  }

  /**
   * Get incoming calls (who calls this function)
   */
  async getIncomingCalls(item: CallHierarchyItem): Promise<IncomingCall[]> {
    if (!this.connection || !this.initialized) {
      throw new Error('LSP client not initialized');
    }

    const params: CallHierarchyIncomingCallsParams = {
      item: this.toProtocolCallHierarchyItem(item),
    };

    const result = await this.connection.sendRequest(
      'callHierarchy/incomingCalls',
      params
    );

    if (!result || !Array.isArray(result)) {
      return [];
    }

    return (result as CallHierarchyIncomingCall[]).map(call => ({
      from: this.convertCallHierarchyItem(call.from),
      fromRanges: call.fromRanges.map(r => ({
        start: { line: r.start.line, character: r.start.character },
        end: { line: r.end.line, character: r.end.character },
      })),
    }));
  }

  /**
   * Get outgoing calls (what this function calls)
   */
  async getOutgoingCalls(item: CallHierarchyItem): Promise<OutgoingCall[]> {
    if (!this.connection || !this.initialized) {
      throw new Error('LSP client not initialized');
    }

    const params: CallHierarchyOutgoingCallsParams = {
      item: this.toProtocolCallHierarchyItem(item),
    };

    const result = await this.connection.sendRequest(
      'callHierarchy/outgoingCalls',
      params
    );

    if (!result || !Array.isArray(result)) {
      return [];
    }

    return (result as CallHierarchyOutgoingCall[]).map(call => ({
      to: this.convertCallHierarchyItem(call.to),
      fromRanges: call.fromRanges.map(r => ({
        start: { line: r.start.line, character: r.start.character },
        end: { line: r.end.line, character: r.end.character },
      })),
    }));
  }

  /**
   * Convert Location/LocationLink to CodeSnippet
   */
  private async locationsToSnippets(
    result: Location | Location[] | LocationLink[] | null
  ): Promise<CodeSnippet[]> {
    if (!result) return [];

    const locations = Array.isArray(result) ? result : [result];
    const snippets: CodeSnippet[] = [];

    for (const loc of locations) {
      const uri = 'targetUri' in loc ? loc.targetUri : loc.uri;
      const range = 'targetRange' in loc ? loc.targetRange : loc.range;

      const filePath = fromUri(uri);
      let content = '';

      try {
        const fileContent = await fs.readFile(filePath, 'utf-8');
        const lines = fileContent.split(/\r?\n/);
        const startLine = range.start.line;
        const endLine = range.end.line;
        content = lines
          .slice(startLine, endLine + 1)
          .map((line, i) => `${startLine + i + 1}\t${line}`)
          .join('\n');
      } catch {
        content = `[Could not read file: ${filePath}]`;
      }

      snippets.push({
        uri: filePath,
        range: {
          start: { line: range.start.line, character: range.start.character },
          end: { line: range.end.line, character: range.end.character },
        },
        content,
        displayRange: {
          startLine: range.start.line + 1,
          endLine: range.end.line + 1,
        },
      });
    }

    return snippets;
  }

  /**
   * Convert LSP CallHierarchyItem to our CallHierarchyItem
   */
  private convertCallHierarchyItem(
    item: LSPCallHierarchyItem
  ): CallHierarchyItem {
    return {
      name: item.name,
      kind: convertSymbolKind(item.kind),
      uri: fromUri(item.uri),
      range: {
        start: {
          line: item.range.start.line,
          character: item.range.start.character,
        },
        end: { line: item.range.end.line, character: item.range.end.character },
      },
      selectionRange: {
        start: {
          line: item.selectionRange.start.line,
          character: item.selectionRange.start.character,
        },
        end: {
          line: item.selectionRange.end.line,
          character: item.selectionRange.end.character,
        },
      },
      displayRange: {
        startLine: item.range.start.line + 1,
        endLine: item.range.end.line + 1,
      },
    };
  }

  /**
   * Convert our CallHierarchyItem to LSP protocol item
   */
  private toProtocolCallHierarchyItem(
    item: CallHierarchyItem
  ): LSPCallHierarchyItem {
    return {
      name: item.name,
      kind: LSPSymbolKind.Function, // Default to function
      uri: toUri(item.uri),
      range: {
        start: {
          line: item.range.start.line,
          character: item.range.start.character,
        },
        end: { line: item.range.end.line, character: item.range.end.character },
      },
      selectionRange: {
        start: {
          line: item.selectionRange.start.line,
          character: item.selectionRange.start.character,
        },
        end: {
          line: item.selectionRange.end.line,
          character: item.selectionRange.end.character,
        },
      },
    };
  }
}
