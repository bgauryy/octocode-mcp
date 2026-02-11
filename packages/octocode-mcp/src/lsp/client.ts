/**
 * LSP Client - Spawns and communicates with language servers
 * Uses vscode-jsonrpc for JSON-RPC communication over stdin/stdout
 * @module lsp/client
 */

import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import {
  createMessageConnection,
  MessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
} from 'vscode-jsonrpc/node.js';
import {
  InitializeParams,
  InitializeResult,
  InitializedParams,
} from 'vscode-languageserver-protocol';
import type {
  ExactPosition,
  CodeSnippet,
  CallHierarchyItem,
  IncomingCall,
  OutgoingCall,
  LanguageServerConfig,
} from './types.js';
import { toUri } from './uri.js';
import { LSPDocumentManager } from './lspDocumentManager.js';
import { LSPOperations } from './lspOperations.js';
import {
  buildChildProcessEnv,
  TOOLING_ALLOWED_ENV_VARS,
} from '../utils/exec/spawn.js';

/**
 * LSP Client class
 * Manages connection to a language server process
 */
export class LSPClient {
  private process: ChildProcess | null = null;
  private connection: MessageConnection | null = null;
  private initialized = false;
  private config: LanguageServerConfig;
  private initializeResult: InitializeResult | null = null;
  private documentManager: LSPDocumentManager;
  private operations: LSPOperations;

  constructor(config: LanguageServerConfig) {
    this.config = config;
    this.documentManager = new LSPDocumentManager(config);
    this.operations = new LSPOperations(this.documentManager);
  }

  /**
   * Start the language server and initialize connection
   */
  async start(): Promise<void> {
    if (this.process) {
      throw new Error('LSP client already started');
    }

    // Spawn the language server process
    this.process = spawn(this.config.command, this.config.args ?? [], {
      cwd: this.config.workspaceRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: buildChildProcessEnv({}, TOOLING_ALLOWED_ENV_VARS),
    });

    if (!this.process.stdin || !this.process.stdout) {
      throw new Error('Failed to create language server process pipes');
    }

    // Create JSON-RPC connection
    this.connection = createMessageConnection(
      new StreamMessageReader(this.process.stdout),
      new StreamMessageWriter(this.process.stdin)
    );

    // Start listening
    this.connection.listen();

    // Handle process errors silently - errors propagate through the connection
    this.process.on('error', () => {
      // Errors are handled by the connection layer
    });

    // Ignore stderr - language servers often write debug info there
    this.process.stderr?.on('data', () => {});

    // Initialize the language server
    await this.initialize();
  }

  /**
   * Initialize the language server
   */
  private async initialize(): Promise<void> {
    if (!this.connection) {
      throw new Error('Connection not established');
    }

    const initParams: InitializeParams = {
      processId: process.pid,
      rootUri: toUri(this.config.workspaceRoot),
      capabilities: {
        textDocument: {
          synchronization: {
            dynamicRegistration: true,
            willSave: false,
            willSaveWaitUntil: false,
            didSave: true,
          },
          definition: {
            dynamicRegistration: true,
            linkSupport: true,
          },
          references: {
            dynamicRegistration: true,
          },
          callHierarchy: {
            dynamicRegistration: true,
          },
          publishDiagnostics: {
            relatedInformation: true,
          },
        },
        workspace: {
          workspaceFolders: true,
          configuration: true,
        },
      },
      workspaceFolders: [
        {
          uri: toUri(this.config.workspaceRoot),
          name: path.basename(this.config.workspaceRoot),
        },
      ],
    };

    this.initializeResult = (await Promise.race([
      this.connection.sendRequest('initialize', initParams),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('LSP initialize timed out after 30s')),
          30_000
        )
      ),
    ])) as InitializeResult;

    // Send initialized notification
    const initializedParams: InitializedParams = {};
    await this.connection.sendNotification('initialized', initializedParams);

    this.initialized = true;

    // Update document manager and operations with connection
    this.documentManager.setConnection(this.connection, this.initialized);
    this.operations.setConnection(this.connection, this.initialized);
  }

  /**
   * Open a text document (required before LSP operations)
   */
  async openDocument(filePath: string): Promise<void> {
    return this.documentManager.openDocument(filePath);
  }

  /**
   * Close a text document
   */
  async closeDocument(filePath: string): Promise<void> {
    return this.documentManager.closeDocument(filePath);
  }

  /**
   * Go to definition
   */
  async gotoDefinition(
    filePath: string,
    position: ExactPosition
  ): Promise<CodeSnippet[]> {
    return this.operations.gotoDefinition(filePath, position);
  }

  /**
   * Find references
   */
  async findReferences(
    filePath: string,
    position: ExactPosition,
    includeDeclaration = true
  ): Promise<CodeSnippet[]> {
    return this.operations.findReferences(
      filePath,
      position,
      includeDeclaration
    );
  }

  /**
   * Prepare call hierarchy (get item at position)
   */
  async prepareCallHierarchy(
    filePath: string,
    position: ExactPosition
  ): Promise<CallHierarchyItem[]> {
    return this.operations.prepareCallHierarchy(filePath, position);
  }

  /**
   * Get incoming calls (who calls this function)
   */
  async getIncomingCalls(item: CallHierarchyItem): Promise<IncomingCall[]> {
    return this.operations.getIncomingCalls(item);
  }

  /**
   * Get outgoing calls (what this function calls)
   */
  async getOutgoingCalls(item: CallHierarchyItem): Promise<OutgoingCall[]> {
    return this.operations.getOutgoingCalls(item);
  }

  /**
   * Check if server supports a capability
   */
  hasCapability(capability: string): boolean {
    if (!this.initializeResult?.capabilities) return false;
    const caps = this.initializeResult.capabilities as Record<string, unknown>;
    return !!caps[capability];
  }

  /**
   * Shutdown and close the language server
   */
  async stop(): Promise<void> {
    if (!this.connection) return;

    try {
      // Close all open documents
      await this.documentManager.closeAllDocuments();

      // Send shutdown request (with timeout to avoid hanging)
      await Promise.race([
        this.connection.sendRequest('shutdown'),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('LSP shutdown timed out')), 5_000)
        ),
      ]);

      // Send exit notification
      await this.connection.sendNotification('exit');
    } catch {
      // Ignore errors during shutdown
    } finally {
      this.connection.dispose();
      this.connection = null;
      this.process?.kill();
      this.process = null;
      this.initialized = false;

      // Clear connection from managers
      this.documentManager.setConnection(
        null as unknown as MessageConnection,
        false
      );
      this.operations.setConnection(
        null as unknown as MessageConnection,
        false
      );
    }
  }
}
