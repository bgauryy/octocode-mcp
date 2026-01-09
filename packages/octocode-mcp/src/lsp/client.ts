/**
 * LSP Client - Spawns and communicates with language servers
 * Uses vscode-jsonrpc for JSON-RPC communication over stdin/stdout
 * @module lsp/client
 */

import { spawn, ChildProcess } from 'child_process';
import { promises as fs, realpathSync, statSync } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createRequire } from 'module';
import { URI } from 'vscode-uri';
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
 * Validates that an LSP server binary path is safe to execute.
 *
 * Security checks:
 * 1. Path must exist
 * 2. Path must be a regular file (not a directory or dangling symlink)
 * 3. Path traversal patterns are blocked
 * 4. Symlinks are resolved and their targets validated
 *
 * @param binPath - The resolved binary path to validate
 * @param baseDir - The base directory the path should be relative to
 * @returns Object with isValid flag and error message if invalid
 */
function validateLSPServerPath(
  binPath: string,
  baseDir: string
): { isValid: boolean; resolvedPath?: string; error?: string } {
  // Resolve to absolute path
  const absolutePath = path.isAbsolute(binPath)
    ? binPath
    : path.resolve(baseDir, binPath);

  // Check for path traversal attempt (relative path escaping base directory)
  if (!path.isAbsolute(binPath)) {
    // Normalize and check if it stays within baseDir
    const normalizedPath = path.normalize(absolutePath);
    if (!normalizedPath.startsWith(baseDir)) {
      return {
        isValid: false,
        error: `LSP server path escapes base directory: ${binPath}`,
      };
    }
  }

  // Resolve symlinks to get real path
  let realPath: string;
  try {
    realPath = realpathSync(absolutePath);
  } catch (error) {
    const nodeError = error as Error & { code?: string };
    if (nodeError.code === 'ENOENT') {
      return {
        isValid: false,
        error: `LSP server binary not found: ${absolutePath}`,
      };
    }
    if (nodeError.code === 'ELOOP') {
      return {
        isValid: false,
        error: `Symlink loop detected in LSP server path: ${absolutePath}`,
      };
    }
    return {
      isValid: false,
      error: `Cannot resolve LSP server path: ${absolutePath}`,
    };
  }

  // Verify it's a file (not a directory)
  try {
    const stats = statSync(realPath);
    if (!stats.isFile()) {
      return {
        isValid: false,
        error: `LSP server path is not a file: ${realPath}`,
      };
    }
  } catch {
    return {
      isValid: false,
      error: `Cannot stat LSP server binary: ${realPath}`,
    };
  }

  return { isValid: true, resolvedPath: realPath };
}

/**
 * Language server configuration
 */
interface LanguageServerConfig {
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
 * User-configurable language server entry
 */
interface UserLanguageServerConfig {
  /** Command to spawn the language server */
  command: string;
  /** Arguments for the command (default: []) */
  args?: string[];
  /** Language ID for the server (e.g., 'python', 'go') */
  languageId: string;
}

/**
 * Config file schema for user-defined language servers
 * File locations (in priority order):
 * 1. OCTOCODE_LSP_CONFIG environment variable
 * 2. .octocode/lsp-servers.json (workspace-level)
 * 3. ~/.octocode/lsp-servers.json (user-level)
 */
interface LSPConfigFile {
  /** Language servers by file extension (e.g., ".py", ".java") */
  languageServers?: Record<string, UserLanguageServerConfig>;
}

/**
 * Cache for loaded user configs (by workspace root)
 */
let userConfigCache: Record<string, UserLanguageServerConfig> | null = null;
let userConfigLoadedFrom: string | null = null;

/**
 * Load user-defined language server configs from config files.
 * Checks (in order):
 * 1. OCTOCODE_LSP_CONFIG env var
 * 2. .octocode/lsp-servers.json (workspace-level)
 * 3. ~/.octocode/lsp-servers.json (user-level)
 *
 * @param workspaceRoot - Workspace root to check for local config
 * @returns Language server configs by extension, or empty object
 */
async function loadUserConfig(
  workspaceRoot?: string
): Promise<Record<string, UserLanguageServerConfig>> {
  // Return cached if available
  if (userConfigCache !== null) {
    return userConfigCache;
  }

  const configPaths: string[] = [];

  // 1. Environment variable
  if (process.env.OCTOCODE_LSP_CONFIG) {
    configPaths.push(process.env.OCTOCODE_LSP_CONFIG);
  }

  // 2. Workspace-level config
  if (workspaceRoot) {
    configPaths.push(path.join(workspaceRoot, '.octocode', 'lsp-servers.json'));
  }

  // 3. User-level config
  configPaths.push(path.join(os.homedir(), '.octocode', 'lsp-servers.json'));

  for (const configPath of configPaths) {
    try {
      const content = await fs.readFile(configPath, 'utf-8');
      const config: LSPConfigFile = JSON.parse(content);
      if (config.languageServers) {
        userConfigCache = config.languageServers;
        userConfigLoadedFrom = configPath;
        return userConfigCache;
      }
    } catch {
      // Config file doesn't exist or is invalid, try next
    }
  }

  // No user config found
  userConfigCache = {};
  return userConfigCache;
}

/**
 * Reset user config cache (for testing or when workspace changes)
 */
export function resetUserConfigCache(): void {
  userConfigCache = null;
  userConfigLoadedFrom = null;
}

/**
 * Get the path from which user config was loaded (for debugging)
 */
export function getUserConfigPath(): string | null {
  return userConfigLoadedFrom;
}

/**
 * Default language server commands by file extension
 * Reference: https://github.com/helix-editor/helix/blob/master/languages.toml
 *            https://github.com/microsoft/multilspy
 */
const LANGUAGE_SERVER_COMMANDS: Record<
  string,
  { command: string; args: string[]; languageId: string; envVar: string }
> = {
  // TypeScript/JavaScript (bundled)
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
  '.mjs': {
    command: 'typescript-language-server',
    args: ['--stdio'],
    languageId: 'javascript',
    envVar: 'OCTOCODE_TS_SERVER_PATH',
  },
  '.cjs': {
    command: 'typescript-language-server',
    args: ['--stdio'],
    languageId: 'javascript',
    envVar: 'OCTOCODE_TS_SERVER_PATH',
  },

  // Python: pip install python-lsp-server
  '.py': {
    command: 'pylsp',
    args: [],
    languageId: 'python',
    envVar: 'OCTOCODE_PYTHON_SERVER_PATH',
  },
  '.pyi': {
    command: 'pylsp',
    args: [],
    languageId: 'python',
    envVar: 'OCTOCODE_PYTHON_SERVER_PATH',
  },

  // Go: go install golang.org/x/tools/gopls@latest
  '.go': {
    command: 'gopls',
    args: ['serve'],
    languageId: 'go',
    envVar: 'OCTOCODE_GO_SERVER_PATH',
  },

  // Rust: rustup component add rust-analyzer
  '.rs': {
    command: 'rust-analyzer',
    args: [],
    languageId: 'rust',
    envVar: 'OCTOCODE_RUST_SERVER_PATH',
  },

  // Java: brew install jdtls OR download from Eclipse
  '.java': {
    command: 'jdtls',
    args: [],
    languageId: 'java',
    envVar: 'OCTOCODE_JAVA_SERVER_PATH',
  },

  // Kotlin: brew install kotlin-language-server
  '.kt': {
    command: 'kotlin-language-server',
    args: [],
    languageId: 'kotlin',
    envVar: 'OCTOCODE_KOTLIN_SERVER_PATH',
  },
  '.kts': {
    command: 'kotlin-language-server',
    args: [],
    languageId: 'kotlin',
    envVar: 'OCTOCODE_KOTLIN_SERVER_PATH',
  },

  // C/C++: brew install llvm (includes clangd)
  '.c': {
    command: 'clangd',
    args: [],
    languageId: 'c',
    envVar: 'OCTOCODE_CLANGD_SERVER_PATH',
  },
  '.h': {
    command: 'clangd',
    args: [],
    languageId: 'c',
    envVar: 'OCTOCODE_CLANGD_SERVER_PATH',
  },
  '.cpp': {
    command: 'clangd',
    args: [],
    languageId: 'cpp',
    envVar: 'OCTOCODE_CLANGD_SERVER_PATH',
  },
  '.hpp': {
    command: 'clangd',
    args: [],
    languageId: 'cpp',
    envVar: 'OCTOCODE_CLANGD_SERVER_PATH',
  },
  '.cc': {
    command: 'clangd',
    args: [],
    languageId: 'cpp',
    envVar: 'OCTOCODE_CLANGD_SERVER_PATH',
  },
  '.cxx': {
    command: 'clangd',
    args: [],
    languageId: 'cpp',
    envVar: 'OCTOCODE_CLANGD_SERVER_PATH',
  },

  // C#: dotnet tool install -g csharp-ls
  '.cs': {
    command: 'csharp-ls',
    args: [],
    languageId: 'csharp',
    envVar: 'OCTOCODE_CSHARP_SERVER_PATH',
  },

  // Ruby: gem install solargraph
  '.rb': {
    command: 'solargraph',
    args: ['stdio'],
    languageId: 'ruby',
    envVar: 'OCTOCODE_RUBY_SERVER_PATH',
  },

  // PHP: npm install -g intelephense
  '.php': {
    command: 'intelephense',
    args: ['--stdio'],
    languageId: 'php',
    envVar: 'OCTOCODE_PHP_SERVER_PATH',
  },

  // Swift: comes with Xcode
  '.swift': {
    command: 'sourcekit-lsp',
    args: [],
    languageId: 'swift',
    envVar: 'OCTOCODE_SWIFT_SERVER_PATH',
  },

  // Dart: dart pub global activate dart_language_server
  '.dart': {
    command: 'dart',
    args: ['language-server', '--client-id=octocode'],
    languageId: 'dart',
    envVar: 'OCTOCODE_DART_SERVER_PATH',
  },

  // Lua: brew install lua-language-server
  '.lua': {
    command: 'lua-language-server',
    args: [],
    languageId: 'lua',
    envVar: 'OCTOCODE_LUA_SERVER_PATH',
  },

  // Zig: https://github.com/zigtools/zls
  '.zig': {
    command: 'zls',
    args: [],
    languageId: 'zig',
    envVar: 'OCTOCODE_ZIG_SERVER_PATH',
  },

  // Elixir: https://github.com/elixir-lsp/elixir-ls
  '.ex': {
    command: 'elixir-ls',
    args: [],
    languageId: 'elixir',
    envVar: 'OCTOCODE_ELIXIR_SERVER_PATH',
  },
  '.exs': {
    command: 'elixir-ls',
    args: [],
    languageId: 'elixir',
    envVar: 'OCTOCODE_ELIXIR_SERVER_PATH',
  },

  // Scala: cs install metals
  '.scala': {
    command: 'metals',
    args: [],
    languageId: 'scala',
    envVar: 'OCTOCODE_SCALA_SERVER_PATH',
  },
  '.sc': {
    command: 'metals',
    args: [],
    languageId: 'scala',
    envVar: 'OCTOCODE_SCALA_SERVER_PATH',
  },

  // Haskell: ghcup install hls
  '.hs': {
    command: 'haskell-language-server-wrapper',
    args: ['--lsp'],
    languageId: 'haskell',
    envVar: 'OCTOCODE_HASKELL_SERVER_PATH',
  },

  // OCaml: opam install ocaml-lsp-server
  '.ml': {
    command: 'ocamllsp',
    args: [],
    languageId: 'ocaml',
    envVar: 'OCTOCODE_OCAML_SERVER_PATH',
  },
  '.mli': {
    command: 'ocamllsp',
    args: [],
    languageId: 'ocaml',
    envVar: 'OCTOCODE_OCAML_SERVER_PATH',
  },

  // Clojure: brew install clojure-lsp
  '.clj': {
    command: 'clojure-lsp',
    args: [],
    languageId: 'clojure',
    envVar: 'OCTOCODE_CLOJURE_SERVER_PATH',
  },
  '.cljs': {
    command: 'clojure-lsp',
    args: [],
    languageId: 'clojure',
    envVar: 'OCTOCODE_CLOJURE_SERVER_PATH',
  },
  '.cljc': {
    command: 'clojure-lsp',
    args: [],
    languageId: 'clojure',
    envVar: 'OCTOCODE_CLOJURE_SERVER_PATH',
  },

  // Vue: npm install -g @vue/language-server
  '.vue': {
    command: 'vue-language-server',
    args: ['--stdio'],
    languageId: 'vue',
    envVar: 'OCTOCODE_VUE_SERVER_PATH',
  },

  // Svelte: npm install -g svelte-language-server
  '.svelte': {
    command: 'svelteserver',
    args: ['--stdio'],
    languageId: 'svelte',
    envVar: 'OCTOCODE_SVELTE_SERVER_PATH',
  },

  // YAML: npm install -g yaml-language-server
  '.yaml': {
    command: 'yaml-language-server',
    args: ['--stdio'],
    languageId: 'yaml',
    envVar: 'OCTOCODE_YAML_SERVER_PATH',
  },
  '.yml': {
    command: 'yaml-language-server',
    args: ['--stdio'],
    languageId: 'yaml',
    envVar: 'OCTOCODE_YAML_SERVER_PATH',
  },

  // TOML: cargo install taplo-cli --features lsp
  '.toml': {
    command: 'taplo',
    args: ['lsp', 'stdio'],
    languageId: 'toml',
    envVar: 'OCTOCODE_TOML_SERVER_PATH',
  },

  // JSON: npm install -g vscode-langservers-extracted
  '.json': {
    command: 'vscode-json-language-server',
    args: ['--stdio'],
    languageId: 'json',
    envVar: 'OCTOCODE_JSON_SERVER_PATH',
  },
  '.jsonc': {
    command: 'vscode-json-language-server',
    args: ['--stdio'],
    languageId: 'jsonc',
    envVar: 'OCTOCODE_JSON_SERVER_PATH',
  },

  // HTML/CSS: npm install -g vscode-langservers-extracted
  '.html': {
    command: 'vscode-html-language-server',
    args: ['--stdio'],
    languageId: 'html',
    envVar: 'OCTOCODE_HTML_SERVER_PATH',
  },
  '.css': {
    command: 'vscode-css-language-server',
    args: ['--stdio'],
    languageId: 'css',
    envVar: 'OCTOCODE_CSS_SERVER_PATH',
  },
  '.scss': {
    command: 'vscode-css-language-server',
    args: ['--stdio'],
    languageId: 'scss',
    envVar: 'OCTOCODE_CSS_SERVER_PATH',
  },
  '.less': {
    command: 'vscode-css-language-server',
    args: ['--stdio'],
    languageId: 'less',
    envVar: 'OCTOCODE_CSS_SERVER_PATH',
  },

  // Bash: npm install -g bash-language-server
  '.sh': {
    command: 'bash-language-server',
    args: ['start'],
    languageId: 'shellscript',
    envVar: 'OCTOCODE_BASH_SERVER_PATH',
  },
  '.bash': {
    command: 'bash-language-server',
    args: ['start'],
    languageId: 'shellscript',
    envVar: 'OCTOCODE_BASH_SERVER_PATH',
  },
  '.zsh': {
    command: 'bash-language-server',
    args: ['start'],
    languageId: 'shellscript',
    envVar: 'OCTOCODE_BASH_SERVER_PATH',
  },

  // SQL: npm install -g sql-language-server
  '.sql': {
    command: 'sql-language-server',
    args: ['up', '--method', 'stdio'],
    languageId: 'sql',
    envVar: 'OCTOCODE_SQL_SERVER_PATH',
  },

  // GraphQL: npm install -g graphql-language-service-cli
  '.graphql': {
    command: 'graphql-lsp',
    args: ['server', '-m', 'stream'],
    languageId: 'graphql',
    envVar: 'OCTOCODE_GRAPHQL_SERVER_PATH',
  },
  '.gql': {
    command: 'graphql-lsp',
    args: ['server', '-m', 'stream'],
    languageId: 'graphql',
    envVar: 'OCTOCODE_GRAPHQL_SERVER_PATH',
  },

  // Terraform: brew install terraform-ls
  '.tf': {
    command: 'terraform-ls',
    args: ['serve'],
    languageId: 'terraform',
    envVar: 'OCTOCODE_TERRAFORM_SERVER_PATH',
  },

  // Dockerfile: npm install -g dockerfile-language-server-nodejs
  // Note: Dockerfile has no extension, handled separately if needed
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
      const pkgDir = path.dirname(pkgPath);

      // Validate bin entry exists and is a string
      const binRelativePath = pkg.bin?.['typescript-language-server'];
      if (!binRelativePath || typeof binRelativePath !== 'string') {
        // eslint-disable-next-line no-console
        console.debug(
          'Invalid bin entry in typescript-language-server package.json'
        );
        return { command: config.command, args: config.args };
      }

      // Construct and validate the binary path
      const binPath = path.join(pkgDir, binRelativePath);

      // SECURITY: Validate the resolved path before using it
      const validation = validateLSPServerPath(binPath, pkgDir);
      if (!validation.isValid) {
        // eslint-disable-next-line no-console
        console.error(`LSP server path validation failed: ${validation.error}`);
        return { command: config.command, args: config.args };
      }

      return {
        command: process.execPath,
        args: [validation.resolvedPath!, ...config.args],
      };
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
 * Checks user config first, then falls back to defaults.
 */
async function getLanguageServerForFile(
  filePath: string,
  workspaceRoot: string
): Promise<LanguageServerConfig | null> {
  const ext = path.extname(filePath).toLowerCase();

  // 1. Check user config first
  const userConfig = await loadUserConfig(workspaceRoot);
  const userServer = userConfig[ext];
  if (userServer) {
    return {
      command: userServer.command,
      args: userServer.args ?? [],
      workspaceRoot,
      languageId: userServer.languageId,
    };
  }

  // 2. Fall back to built-in defaults
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
 * Convert a file path to a file:// URI using proper encoding.
 * Handles Windows paths, UNC paths, and special characters correctly.
 *
 * @param filePath - Absolute or relative file path
 * @returns Properly encoded file:// URI
 *
 * @example
 * toUri('/users/me/file.ts')           // 'file:///users/me/file.ts'
 * toUri('C:\\Users\\me\\file.ts')      // 'file:///c%3A/Users/me/file.ts'
 * toUri('/path/with spaces/file#1.ts') // 'file:///path/with%20spaces/file%231.ts'
 */
function toUri(filePath: string): string {
  // Already a URI - return as-is
  if (filePath.startsWith('file://')) {
    return filePath;
  }

  // Resolve to absolute path and convert to URI
  const absolutePath = path.resolve(filePath);
  return URI.file(absolutePath).toString();
}

/**
 * Convert a file:// URI back to a filesystem path.
 * Returns platform-specific path (forward slashes on Unix, backslashes on Windows).
 *
 * @param uri - A file:// URI string
 * @returns Platform-specific filesystem path
 *
 * @example
 * fromUri('file:///users/me/file.ts')           // '/users/me/file.ts'
 * fromUri('file:///c%3A/Users/me/file.ts')      // 'C:\Users\me\file.ts' (Windows)
 * fromUri('file:///path/with%20spaces/file.ts') // '/path/with spaces/file.ts'
 */
function fromUri(uri: string): string {
  // Not a file URI - return as-is
  if (!uri.startsWith('file://')) {
    return uri;
  }

  // Parse and return filesystem path
  return URI.parse(uri).fsPath;
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
  const serverConfig = await getLanguageServerForFile(filePath, workspaceRoot);
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
 * Check if a command exists in the system PATH.
 * Works cross-platform (Windows, macOS, Linux).
 *
 * @param command - The command name to check (e.g., 'node', 'python')
 * @returns Promise resolving to true if command exists, false otherwise
 *
 * @example
 * await commandExists('node')    // true (if Node.js installed)
 * await commandExists('nonexistent')  // false
 */
async function commandExists(command: string): Promise<boolean> {
  const isWindows = process.platform === 'win32';
  const checkCmd = isWindows ? 'where' : 'which';

  return new Promise(resolve => {
    const proc = spawn(checkCmd, [command], {
      stdio: 'ignore',
      shell: isWindows, // Required for 'where' on Windows
    });

    const timeout = setTimeout(() => {
      proc.kill();
      resolve(false);
    }, 5000);

    proc.on('close', code => {
      clearTimeout(timeout);
      resolve(code === 0);
    });

    proc.on('error', () => {
      clearTimeout(timeout);
      resolve(false);
    });
  });
}

/**
 * Check if a language server is available for the given file type.
 *
 * @param filePath - Path to a source file
 * @returns Promise resolving to true if an LSP server is available
 */
export async function isLanguageServerAvailable(
  filePath: string,
  workspaceRoot?: string
): Promise<boolean> {
  const ext = path.extname(filePath).toLowerCase();

  // 1. Check user config first
  const userConfig = await loadUserConfig(workspaceRoot);
  const userServer = userConfig[ext];

  let command: string;

  if (userServer) {
    command = userServer.command;
  } else {
    // 2. Fall back to built-in defaults
    const serverInfo = LANGUAGE_SERVER_COMMANDS[ext];
    if (!serverInfo) {
      return false;
    }
    command = resolveLanguageServer(serverInfo).command;
  }

  // Bundled server (typescript-language-server via node)
  if (command === process.execPath) {
    return true;
  }

  // Absolute path - check if file exists
  if (path.isAbsolute(command)) {
    try {
      await fs.access(command);
      return true;
    } catch {
      return false;
    }
  }

  // PATH lookup - cross-platform check
  return commandExists(command);
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
