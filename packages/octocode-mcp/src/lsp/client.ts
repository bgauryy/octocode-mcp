/**
 * LSP Client - Spawns and communicates with language servers
 * Uses vscode-jsonrpc for JSON-RPC communication over stdin/stdout
 * @module lsp/client
 */

import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';
import { createRequire } from 'module';
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
  DidOpenTextDocumentParams,
  DidCloseTextDocumentParams,
  TextDocumentItem,
  SymbolKind as LSPSymbolKind,
} from 'vscode-languageserver-protocol';
import type {
  ExactPosition,
  CodeSnippet,
  CallHierarchyItem,
  IncomingCall,
  OutgoingCall,
  SymbolKind,
} from './types.js';

const require = createRequire(import.meta.url);

/**
 * Language server configuration
 */
export interface LanguageServerConfig {
  /** Command to spawn the language server */
  command: string;
  /** Arguments for the command */
  args?: string[];
  /** Working directory (workspace root) */
  workspaceRoot: string;
  /** Language ID (typescript, javascript, python, go, etc.) */
  languageId?: string;
}

/**
 * Default language server commands by file extension
 */
const LANGUAGE_SERVER_COMMANDS: Record<
  string,
  { command: string; args: string[]; languageId: string; envVar: string }
> = {
  '.ts': {
    command: 'typescript-language-server',
    args: ['--stdio'],
    languageId: 'typescript',
    envVar: 'OCTOCODE_TS_SERVER_PATH',
  },
  '.tsx': {
    command: 'typescript-language-server',
    args: ['--stdio'],
    languageId: 'typescriptreact',
    envVar: 'OCTOCODE_TS_SERVER_PATH',
  },
  '.js': {
    command: 'typescript-language-server',
    args: ['--stdio'],
    languageId: 'javascript',
    envVar: 'OCTOCODE_TS_SERVER_PATH',
  },
  '.jsx': {
    command: 'typescript-language-server',
    args: ['--stdio'],
    languageId: 'javascriptreact',
    envVar: 'OCTOCODE_TS_SERVER_PATH',
  },
  '.py': {
    command: 'pylsp',
    args: [],
    languageId: 'python',
    envVar: 'OCTOCODE_PYTHON_SERVER_PATH',
  },
  '.go': {
    command: 'gopls',
    args: ['serve'],
    languageId: 'go',
    envVar: 'OCTOCODE_GO_SERVER_PATH',
  },
  '.rs': {
    command: 'rust-analyzer',
    args: [],
    languageId: 'rust',
    envVar: 'OCTOCODE_RUST_SERVER_PATH',
  },
};

/**
 * Resolve language server command from env vars or bundled packages
 */
function resolveLanguageServer(config: {
  command: string;
  args: string[];
  envVar: string;
}): { command: string; args: string[] } {
  // 1. Check Env Var
  if (process.env[config.envVar]) {
    return { command: process.env[config.envVar]!, args: config.args };
  }

  // 2. Special handling for typescript-language-server (use bundled if available)
  if (config.command === 'typescript-language-server') {
    try {
      const pkgPath =
        require.resolve('typescript-language-server/package.json');
      const pkg = require(pkgPath);
      const binPath = path.join(
        path.dirname(pkgPath),
        pkg.bin['typescript-language-server']
      );
      return { command: process.execPath, args: [binPath, ...config.args] };
    } catch (e) {
      // eslint-disable-next-line no-console
      console.debug('Could not resolve bundled typescript-language-server:', e);
    }
  }

  return { command: config.command, args: config.args };
}

/**
 * Detect language ID from file extension
 */
function detectLanguageId(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return LANGUAGE_SERVER_COMMANDS[ext]?.languageId ?? 'plaintext';
}

/**
 * Get language server config for a file
 */
function getLanguageServerForFile(
  filePath: string,
  workspaceRoot: string
): LanguageServerConfig | null {
  const ext = path.extname(filePath).toLowerCase();
  const serverInfo = LANGUAGE_SERVER_COMMANDS[ext];
  if (!serverInfo) return null;

  const { command, args } = resolveLanguageServer(serverInfo);

  return {
    command,
    args,
    workspaceRoot,
    languageId: serverInfo.languageId,
  };
}

/**
 * Convert LSP SymbolKind to our SymbolKind
 */
function convertSymbolKind(kind: LSPSymbolKind): SymbolKind {
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
 * Convert file path to LSP URI
 */
function toUri(filePath: string): string {
  if (filePath.startsWith('file://')) return filePath;
  return `file://${path.resolve(filePath)}`;
}

/**
 * Convert LSP URI to file path
 */
function fromUri(uri: string): string {
  if (uri.startsWith('file://')) {
    return uri.slice(7);
  }
  return uri;
}

/**
 * LSP Client class
 * Manages connection to a language server process
 */
export class LSPClient {
  private process: ChildProcess | null = null;
  private connection: MessageConnection | null = null;
  private initialized = false;
  private openFiles = new Map<string, number>(); // uri -> version
  private config: LanguageServerConfig;
  private initializeResult: InitializeResult | null = null;

  constructor(config: LanguageServerConfig) {
    this.config = config;
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
      env: process.env,
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

    // Handle process errors
    this.process.on('error', err => {
      // eslint-disable-next-line no-console
      console.error('LSP process error:', err);
    });

    this.process.stderr?.on('data', data => {
      // Log stderr for debugging but don't fail
      // eslint-disable-next-line no-console
      console.debug('LSP stderr:', data.toString());
    });

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

    this.initializeResult = await this.connection.sendRequest(
      'initialize',
      initParams
    );

    // Send initialized notification
    const initializedParams: InitializedParams = {};
    await this.connection.sendNotification('initialized', initializedParams);

    this.initialized = true;
  }

  /**
   * Open a text document (required before LSP operations)
   */
  async openDocument(filePath: string): Promise<void> {
    if (!this.connection || !this.initialized) {
      throw new Error('LSP client not initialized');
    }

    const uri = toUri(filePath);

    // Already open?
    if (this.openFiles.has(uri)) {
      return;
    }

    const content = await fs.readFile(filePath, 'utf-8');
    const languageId = this.config.languageId ?? detectLanguageId(filePath);

    const params: DidOpenTextDocumentParams = {
      textDocument: {
        uri,
        languageId,
        version: 1,
        text: content,
      } as TextDocumentItem,
    };

    await this.connection.sendNotification('textDocument/didOpen', params);
    this.openFiles.set(uri, 1);
  }

  /**
   * Close a text document
   */
  async closeDocument(filePath: string): Promise<void> {
    if (!this.connection || !this.initialized) {
      return;
    }

    const uri = toUri(filePath);
    if (!this.openFiles.has(uri)) {
      return;
    }

    const params: DidCloseTextDocumentParams = {
      textDocument: { uri } as TextDocumentIdentifier,
    };

    await this.connection.sendNotification('textDocument/didClose', params);
    this.openFiles.delete(uri);
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

    await this.openDocument(filePath);

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

    await this.openDocument(filePath);

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

    await this.openDocument(filePath);

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
      for (const uri of Array.from(this.openFiles.keys())) {
        const filePath = fromUri(uri);
        await this.closeDocument(filePath);
      }

      // Send shutdown request
      await this.connection.sendRequest('shutdown');

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
    }
  }
}

/**
 * Client cache to reuse connections
 */
const clientCache = new Map<string, LSPClient>();

/**
 * Get or create an LSP client for a workspace
 */
export async function getOrCreateClient(
  workspaceRoot: string,
  filePath: string
): Promise<LSPClient | null> {
  const serverConfig = getLanguageServerForFile(filePath, workspaceRoot);
  if (!serverConfig) {
    return null;
  }

  const cacheKey = `${serverConfig.command}:${workspaceRoot}`;

  let client = clientCache.get(cacheKey);
  if (client) {
    return client;
  }

  client = new LSPClient(serverConfig);

  try {
    await client.start();
    clientCache.set(cacheKey, client);
    return client;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to start LSP client:', error);
    return null;
  }
}

/**
 * Check if a language server is available for the given file
 */
export async function isLanguageServerAvailable(
  filePath: string
): Promise<boolean> {
  const ext = path.extname(filePath).toLowerCase();
  const serverInfo = LANGUAGE_SERVER_COMMANDS[ext];
  if (!serverInfo) return false;

  const { command } = resolveLanguageServer(serverInfo);

  // If command is node (process.execPath), assume it works (bundled)
  if (command === process.execPath) {
    return true;
  }

  // If command is absolute path, check existence
  if (path.isAbsolute(command)) {
    try {
      await fs.access(command);
      return true;
    } catch {
      return false;
    }
  }

  // Check if command exists in PATH
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);

  try {
    await execAsync(`which ${command}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Shutdown all cached clients
 */
export async function shutdownAllClients(): Promise<void> {
  for (const client of Array.from(clientCache.values())) {
    await client.stop();
  }
  clientCache.clear();
}
