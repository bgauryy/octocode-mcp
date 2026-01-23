# LSP Integration Architecture

The Language Server Protocol (LSP) integration in octocode-mcp provides semantic code intelligence through language servers, enabling precise navigation features like go-to-definition, find-references, and call hierarchy analysis.

## Table of Contents

- [Overview](#overview)
- [LSPClient: JSON-RPC Communication](#lspclient-json-rpc-communication)
- [Implemented LSP Methods](#implemented-lsp-methods)
- [SymbolResolver: Fuzzy Position Matching](#symbolresolver-fuzzy-position-matching)
- [Language Server Configuration](#language-server-configuration)
- [Supported Languages](#supported-languages)
- [LSP Path Validation](#lsp-path-validation)
- [Manager and Client Lifecycle](#manager-and-client-lifecycle)
- [Tool Integration](#tool-integration)

## Overview

The LSP integration enables AI assistants to perform semantic code analysis that goes beyond text search. Instead of regex-based pattern matching, LSP tools use actual language servers to understand code structure and relationships.

### Key Components

```
┌─────────────────────────────────────────────────────────────┐
│                      LSP Tools                              │
│  lspGotoDefinition, lspFindReferences, lspCallHierarchy    │
└────────────────────────┬────────────────────────────────────┘
                         │ Uses
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   SymbolResolver                            │
│  Converts fuzzy position (symbolName + lineHint)           │
│  to exact position (line + character)                      │
└────────────────────────┬────────────────────────────────────┘
                         │ Uses
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    LSP Manager                              │
│  Creates and manages LSPClient instances                    │
│  Handles language detection and server selection            │
└────────────────────────┬────────────────────────────────────┘
                         │ Creates
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                     LSPClient                               │
│  Spawns language server process                             │
│  JSON-RPC communication (vscode-jsonrpc)                    │
│  Implements LSP protocol methods                            │
└────────────────────────┬────────────────────────────────────┘
                         │ Spawns
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              Language Server Process                        │
│  typescript-language-server, pylsp, gopls, etc.            │
└─────────────────────────────────────────────────────────────┘
```

### Why LSP?

1. **Semantic Understanding**: Language servers understand code structure, not just text patterns
2. **Language-Agnostic**: Standard protocol works across 40+ languages
3. **Accurate Navigation**: Jump to actual definitions, not string matches
4. **Type-Aware**: Understands type information and inheritance
5. **IDE-Quality**: Same technology powering VSCode and other IDEs

## LSPClient: JSON-RPC Communication

The `LSPClient` class (`src/lsp/client.ts`) manages the lifecycle of a language server process and communicates using JSON-RPC over stdin/stdout.

### Class Structure

```typescript
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
}
```

### Starting a Language Server

```typescript
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
    console.error('LSP process error:', err);
  });

  this.process.stderr?.on('data', data => {
    console.debug('LSP stderr:', data.toString());
  });

  // Initialize the language server
  await this.initialize();
}
```

### LSP Initialization

The initialization follows the LSP protocol specification:

```typescript
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
```

### Document Management

Before performing LSP operations, files must be opened:

```typescript
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
```

### Shutdown

```typescript
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
```

## Implemented LSP Methods

### Go to Definition

```typescript
async gotoDefinition(
  filePath: string,
  position: ExactPosition
): Promise<CodeSnippet[]> {
  if (!this.connection || !this.initialized) {
    throw new Error('LSP client not initialized');
  }

  await this.openDocument(filePath);

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
    await this.closeDocument(filePath);
  }
}
```

### Find References

```typescript
async findReferences(
  filePath: string,
  position: ExactPosition,
  includeDeclaration = true
): Promise<CodeSnippet[]> {
  if (!this.connection || !this.initialized) {
    throw new Error('LSP client not initialized');
  }

  await this.openDocument(filePath);

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
    await this.closeDocument(filePath);
  }
}
```

### Call Hierarchy

Call hierarchy analysis requires three steps:

#### 1. Prepare Call Hierarchy

```typescript
async prepareCallHierarchy(
  filePath: string,
  position: ExactPosition
): Promise<CallHierarchyItem[]> {
  if (!this.connection || !this.initialized) {
    throw new Error('LSP client not initialized');
  }

  await this.openDocument(filePath);

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
    await this.closeDocument(filePath);
  }
}
```

#### 2. Get Incoming Calls

```typescript
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
```

#### 3. Get Outgoing Calls

```typescript
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
```

### Location to Snippet Conversion

```typescript
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
```

## SymbolResolver: Fuzzy Position Matching

LSP operations require exact positions (line + character), but AI assistants typically provide fuzzy positions (symbol name + approximate line). The `SymbolResolver` (`src/lsp/resolver.ts`) bridges this gap.

### Fuzzy Position

```typescript
export interface FuzzyPosition {
  /** Symbol name to search for (e.g., 'getUserData', 'MyClass') */
  symbolName: string;
  /** Approximate line number (1-indexed) where symbol is expected */
  lineHint: number;
  /** Which occurrence to return if multiple matches (0 = first) */
  orderHint?: number;
}
```

### Exact Position

```typescript
export interface ExactPosition {
  /** 0-indexed line number */
  line: number;
  /** 0-indexed character position */
  character: number;
}
```

### Resolution Algorithm

```typescript
export class SymbolResolver {
  private readonly lineSearchRadius: number;

  constructor(config?: SymbolResolverConfig) {
    this.lineSearchRadius = config?.lineSearchRadius ?? 2;
  }

  resolvePositionFromContent(
    content: string,
    fuzzy: FuzzyPosition
  ): ResolvedSymbol {
    const lines = content.split(/\r?\n/);
    const targetLine = fuzzy.lineHint - 1; // Convert to 0-indexed
    const orderHint = fuzzy.orderHint ?? 0;

    // Validate line number
    if (targetLine < 0 || targetLine >= lines.length) {
      throw new SymbolResolutionError(
        fuzzy.symbolName,
        fuzzy.lineHint,
        `Line ${fuzzy.lineHint} is out of range (file has ${lines.length} lines)`,
        this.lineSearchRadius
      );
    }

    // Search exact line first
    const exactLine = lines[targetLine];
    if (exactLine !== undefined) {
      const exactResult = this.findSymbolInLine(
        exactLine,
        fuzzy.symbolName,
        orderHint
      );
      if (exactResult !== null) {
        return {
          position: { line: targetLine, character: exactResult },
          foundAtLine: fuzzy.lineHint,
          lineOffset: 0,
          lineContent: exactLine,
        };
      }
    }

    // Search nearby lines (alternating above and below)
    for (let offset = 1; offset <= this.lineSearchRadius; offset++) {
      for (const delta of [-offset, offset]) {
        const searchLine = targetLine + delta;
        if (searchLine >= 0 && searchLine < lines.length) {
          const line = lines[searchLine];
          if (line !== undefined) {
            const result = this.findSymbolInLine(
              line,
              fuzzy.symbolName,
              orderHint
            );
            if (result !== null) {
              return {
                position: { line: searchLine, character: result },
                foundAtLine: searchLine + 1,
                lineOffset: delta,
                lineContent: line,
              };
            }
          }
        }
      }
    }

    throw new SymbolResolutionError(
      fuzzy.symbolName,
      fuzzy.lineHint,
      `Symbol not found in target line or within ±${this.lineSearchRadius} lines.`,
      this.lineSearchRadius
    );
  }
}
```

### Word Boundary Detection

The resolver ensures symbols are complete identifiers, not substrings:

```typescript
private findSymbolInLine(
  line: string,
  symbolName: string,
  orderHint: number
): number | null {
  let searchStart = 0;
  let occurrenceCount = 0;

  while (searchStart < line.length) {
    const index = line.indexOf(symbolName, searchStart);
    if (index === -1) return null;

    // Check for word boundary
    const isWordBoundaryStart =
      index === 0 || !this.isIdentifierChar(line[index - 1]!);
    const isWordBoundaryEnd =
      index + symbolName.length >= line.length ||
      !this.isIdentifierChar(line[index + symbolName.length]!);

    if (isWordBoundaryStart && isWordBoundaryEnd) {
      if (occurrenceCount === orderHint) {
        return index;
      }
      occurrenceCount++;
    }

    searchStart = index + 1;
  }

  return null;
}

private isIdentifierChar(char: string): boolean {
  return /[a-zA-Z0-9_$]/.test(char);
}
```

### Example

```typescript
// File content at line 42:
const result = getUserData(userId);

// Fuzzy position
const fuzzy = {
  symbolName: 'getUserData',
  lineHint: 42,
  orderHint: 0
};

// Resolved to exact position
const resolved = resolver.resolvePositionFromContent(content, fuzzy);
// {
//   position: { line: 41, character: 15 },
//   foundAtLine: 42,
//   lineOffset: 0,
//   lineContent: 'const result = getUserData(userId);'
// }
```

## Language Server Configuration

Language servers are configured through three methods with priority order:

### 1. Environment Variables (Highest Priority)

Each language has a dedicated environment variable:

```bash
export OCTOCODE_TS_SERVER_PATH="/custom/path/to/typescript-language-server"
export OCTOCODE_PYTHON_SERVER_PATH="/usr/local/bin/pylsp"
export OCTOCODE_GO_SERVER_PATH="/opt/homebrew/bin/gopls"
```

### 2. User Configuration File (Medium Priority)

Create a JSON configuration file at one of these locations:

- Path specified in `OCTOCODE_LSP_CONFIG` environment variable
- `<workspace>/.octocode/lsp-servers.json` (workspace-specific)
- `~/.octocode/lsp-servers.json` (user global)

```json
{
  "languageServers": {
    ".ts": {
      "command": "/custom/path/to/typescript-language-server",
      "args": ["--stdio"],
      "languageId": "typescript"
    },
    ".py": {
      "command": "pylsp",
      "args": [],
      "languageId": "python"
    }
  }
}
```

### 3. Default Configuration (Lowest Priority)

Built-in defaults from `src/lsp/config.ts`:

```typescript
export const LANGUAGE_SERVER_COMMANDS: Record<string, LanguageServerCommand> = {
  '.ts': {
    command: 'typescript-language-server',
    args: ['--stdio'],
    languageId: 'typescript',
    envVar: 'OCTOCODE_TS_SERVER_PATH',
  },
  '.py': {
    command: 'pylsp',
    args: [],
    languageId: 'python',
    envVar: 'OCTOCODE_PYTHON_SERVER_PATH',
  },
  // ... 40+ more languages
};
```

### Loading Configuration

```typescript
export async function getLanguageServerForFile(
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
```

## Supported Languages

Octocode supports 40+ programming languages through LSP:

### Compiled Languages

| Language | Server | Installation | Extensions |
|----------|--------|--------------|------------|
| **TypeScript/JavaScript** | typescript-language-server | Bundled | .ts, .tsx, .js, .jsx, .mjs, .cjs |
| **Go** | gopls | `go install golang.org/x/tools/gopls@latest` | .go |
| **Rust** | rust-analyzer | `rustup component add rust-analyzer` | .rs |
| **Java** | jdtls | `brew install jdtls` | .java |
| **Kotlin** | kotlin-language-server | `brew install kotlin-language-server` | .kt, .kts |
| **C/C++** | clangd | `brew install llvm` | .c, .h, .cpp, .hpp, .cc, .cxx |
| **C#** | csharp-ls | `dotnet tool install -g csharp-ls` | .cs |
| **Swift** | sourcekit-lsp | Included with Xcode | .swift |
| **Zig** | zls | [github.com/zigtools/zls](https://github.com/zigtools/zls) | .zig |

### Interpreted Languages

| Language | Server | Installation | Extensions |
|----------|--------|--------------|------------|
| **Python** | pylsp | `pip install python-lsp-server` | .py, .pyi |
| **Ruby** | solargraph | `gem install solargraph` | .rb |
| **PHP** | intelephense | `npm install -g intelephense` | .php |
| **Lua** | lua-language-server | `brew install lua-language-server` | .lua |
| **Bash** | bash-language-server | `npm install -g bash-language-server` | .sh, .bash, .zsh |

### JVM Languages

| Language | Server | Installation | Extensions |
|----------|--------|--------------|------------|
| **Scala** | metals | `cs install metals` | .scala, .sc |
| **Clojure** | clojure-lsp | `brew install clojure-lsp` | .clj, .cljs, .cljc |

### Functional Languages

| Language | Server | Installation | Extensions |
|----------|--------|--------------|------------|
| **Haskell** | haskell-language-server-wrapper | `ghcup install hls` | .hs |
| **OCaml** | ocamllsp | `opam install ocaml-lsp-server` | .ml, .mli |
| **Elixir** | elixir-ls | [github.com/elixir-lsp/elixir-ls](https://github.com/elixir-lsp/elixir-ls) | .ex, .exs |

### Web Frameworks

| Language | Server | Installation | Extensions |
|----------|--------|--------------|------------|
| **Vue** | vue-language-server | `npm install -g @vue/language-server` | .vue |
| **Svelte** | svelteserver | `npm install -g svelte-language-server` | .svelte |
| **Dart** | dart language-server | Included with Dart SDK | .dart |

### Data Languages

| Language | Server | Installation | Extensions |
|----------|--------|--------------|------------|
| **YAML** | yaml-language-server | `npm install -g yaml-language-server` | .yaml, .yml |
| **TOML** | taplo | `cargo install taplo-cli --features lsp` | .toml |
| **JSON** | vscode-json-language-server | `npm install -g vscode-langservers-extracted` | .json, .jsonc |
| **SQL** | sql-language-server | `npm install -g sql-language-server` | .sql |
| **GraphQL** | graphql-lsp | `npm install -g graphql-language-service-cli` | .graphql, .gql |

### Markup & Styling

| Language | Server | Installation | Extensions |
|----------|--------|--------------|------------|
| **HTML** | vscode-html-language-server | `npm install -g vscode-langservers-extracted` | .html |
| **CSS** | vscode-css-language-server | `npm install -g vscode-langservers-extracted` | .css, .scss, .less |

### Infrastructure as Code

| Language | Server | Installation | Extensions |
|----------|--------|--------------|------------|
| **Terraform** | terraform-ls | `brew install terraform-ls` | .tf |

## LSP Path Validation

For security, all LSP server paths are validated before execution.

### Validation Rules

Located in `src/lsp/validation.ts`:

```typescript
export interface LSPPathValidation {
  isValid: boolean;
  error?: string;
  resolvedPath?: string;
}

export function validateLSPServerPath(
  serverPath: string,
  workspaceRoot?: string
): LSPPathValidation {
  // 1. Path must not be empty
  if (!serverPath || serverPath.trim() === '') {
    return { isValid: false, error: 'Server path cannot be empty' };
  }

  // 2. Resolve to absolute path
  const resolvedPath = path.resolve(serverPath);

  // 3. Path must not contain traversal attempts
  if (serverPath.includes('..')) {
    return {
      isValid: false,
      error: 'Path traversal not allowed in LSP server paths',
    };
  }

  // 4. Path must exist
  try {
    if (!fs.existsSync(resolvedPath)) {
      return {
        isValid: false,
        error: `LSP server path does not exist: ${resolvedPath}`,
      };
    }
  } catch {
    return {
      isValid: false,
      error: `Cannot access LSP server path: ${resolvedPath}`,
    };
  }

  // 5. If workspace provided, validate it's in allowed locations
  if (workspaceRoot) {
    const normalizedWorkspace = path.resolve(workspaceRoot);
    const normalizedServer = path.resolve(resolvedPath);

    // Server must be inside workspace, node_modules, or system paths
    const isInWorkspace = normalizedServer.startsWith(normalizedWorkspace);
    const isInNodeModules = normalizedServer.includes('/node_modules/');
    const isSystemPath =
      normalizedServer.startsWith('/usr/') ||
      normalizedServer.startsWith('/opt/') ||
      normalizedServer.startsWith(process.env.HOME || '');

    if (!isInWorkspace && !isInNodeModules && !isSystemPath) {
      return {
        isValid: false,
        error: 'LSP server must be in workspace, node_modules, or system paths',
      };
    }
  }

  return { isValid: true, resolvedPath };
}
```

### Bundled TypeScript Server

Special handling for bundled typescript-language-server:

```typescript
export function resolveLanguageServer(config: {
  command: string;
  args: string[];
  envVar: string;
}): { command: string; args: string[] } {
  // Special handling for typescript-language-server
  if (config.command === 'typescript-language-server') {
    try {
      const pkgPath = require.resolve('typescript-language-server/package.json');
      const pkg = require(pkgPath);
      const pkgDir = path.dirname(pkgPath);

      const binRelativePath = pkg.bin?.['typescript-language-server'];
      if (!binRelativePath || typeof binRelativePath !== 'string') {
        return { command: config.command, args: config.args };
      }

      const binPath = path.join(pkgDir, binRelativePath);

      // SECURITY: Validate the resolved path
      const validation = validateLSPServerPath(binPath, pkgDir);
      if (!validation.isValid) {
        console.error(`LSP server path validation failed: ${validation.error}`);
        return { command: config.command, args: config.args };
      }

      return {
        command: process.execPath,
        args: [validation.resolvedPath!, ...config.args],
      };
    } catch (e) {
      console.debug('Could not resolve bundled typescript-language-server:', e);
    }
  }

  return { command: config.command, args: config.args };
}
```

## Manager and Client Lifecycle

The LSP manager (`src/lsp/manager.ts`) orchestrates client creation and cleanup:

```typescript
export async function createClient(
  filePath: string,
  workspaceRoot?: string
): Promise<LSPClient | null> {
  const workspace = workspaceRoot || path.dirname(filePath);

  const config = await getLanguageServerForFile(filePath, workspace);
  if (!config) {
    return null; // No language server available
  }

  const client = new LSPClient(config);
  await client.start();

  return client;
}
```

## Tool Integration

LSP tools (`lspGotoDefinition`, `lspFindReferences`, `lspCallHierarchy`) follow this pattern:

### Example: lspGotoDefinition

Located in `src/tools/lsp_goto_definition/execution.ts`:

```typescript
export async function lspGotoDefinitionTool(
  request: LspGotoDefinitionBulkQuery
): Promise<CallToolResult> {
  return executeBulkOperation(
    request.queries,
    async (query) => {
      // 1. Validate path
      const pathValidation = validateToolPath(query.uri);
      if (!pathValidation.isValid) {
        throw new Error(pathValidation.error);
      }

      // 2. Read file
      const content = await fs.readFile(query.uri, 'utf-8');

      // 3. Resolve fuzzy position to exact position
      const resolved = await resolveSymbolPosition(
        query.uri,
        query.symbolName,
        query.lineHint,
        query.orderHint
      );

      // 4. Try LSP first
      let results: CodeSnippet[] = [];
      let usedLSP = false;

      try {
        const client = await createClient(query.uri);
        if (client) {
          results = await client.gotoDefinition(query.uri, resolved.position);
          usedLSP = true;
          await client.stop();
        }
      } catch (error) {
        console.debug('LSP failed, falling back to text search');
      }

      // 5. Fallback to text search if LSP unavailable
      if (!usedLSP || results.length === 0) {
        // Use grep-based fallback
        results = await textSearchFallback(query.symbolName, query.uri);
      }

      // 6. Format response with hints
      return formatResponse({
        symbol: query.symbolName,
        foundAt: resolved.foundAtLine,
        definitions: results,
        usedLSP,
        hints: generateHints(usedLSP, results.length),
      });
    }
  );
}
```

## Best Practices

### For Tool Implementers

1. **Always validate paths** using `validateToolPath()` before LSP operations
2. **Implement text fallback** when LSP is unavailable
3. **Close clients properly** to avoid memory leaks
4. **Use SymbolResolver** to convert AI-provided positions to LSP positions
5. **Include hints** about LSP availability in responses

### For Users

1. **Install language servers** for languages you want semantic navigation
2. **Use environment variables** to override server paths if needed
3. **Check LSP availability** in tool hints for troubleshooting
4. **Provide accurate lineHints** to improve symbol resolution

### For Contributors

1. **Add new languages** by updating `LANGUAGE_SERVER_COMMANDS` in `src/lsp/config.ts`
2. **Test with actual LSP servers** - don't just mock
3. **Handle server failures gracefully** - always provide text fallback
4. **Document installation** for new language servers

## Summary

The LSP integration in octocode-mcp provides:

- **Semantic Navigation**: IDE-quality code navigation via Language Server Protocol
- **40+ Languages**: Support for TypeScript, Python, Go, Rust, and many more
- **Fuzzy Resolution**: Converts AI-provided approximate positions to exact locations
- **Flexible Configuration**: Environment variables, user configs, or defaults
- **Security**: Path validation prevents arbitrary code execution
- **Graceful Degradation**: Text fallback when LSP unavailable

This architecture enables AI assistants to understand code structure deeply, not just match text patterns.
