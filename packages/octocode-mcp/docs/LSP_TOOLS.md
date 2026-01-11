# LSP Tools - Language Server Protocol Integration

> **Location**: `packages/octocode-mcp/docs/LSP_TOOLS.md`

Octocode MCP includes LSP (Language Server Protocol) tools that provide semantic code intelligence features like go-to-definition, find-references, and call hierarchy analysis.

---

## Overview

LSP tools leverage language servers to provide **semantic** code analysis beyond simple text search:

| Tool | Description | Use Case |
|------|-------------|----------|
| `lspGotoDefinition` | Jump to symbol definition | "Where is this function defined?" |
| `lspFindReferences` | Find all usages of a symbol | "Who calls this function?" |
| `lspCallHierarchy` | Trace call relationships | "What's the call graph for this?" |

### Key Benefits

- **Semantic accuracy**: Ignores comments, strings, and similarly-named symbols
- **Cross-file navigation**: Traces imports and definitions across files
- **Type-aware**: Understands language semantics, not just text patterns

---

## How It Works

### Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  MCP Client     │────▶│  Octocode MCP    │────▶│ Language Server │
│  (AI Agent)     │     │  (LSP Client)    │     │ (spawned)       │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                              │                         │
                              │  JSON-RPC over stdio    │
                              └─────────────────────────┘
```

1. **Tool Request**: AI agent calls `lspGotoDefinition` with file path, symbol name, and line hint
2. **Server Spawn**: Octocode spawns the appropriate language server (if not cached)
3. **LSP Communication**: JSON-RPC messages over stdin/stdout
4. **Result Formatting**: Locations converted to code snippets with context

### No IDE Required

The LSP client is **completely standalone**:

- Spawns language servers as child processes
- Communicates via stdin/stdout (JSON-RPC)
- Works in CLI, CI/CD, containers, servers
- No VS Code or IDE dependency

---

## Supported Languages

### Bundled (Works Out-of-Box)

| Language | Extensions | Server | Notes |
|----------|------------|--------|-------|
| **TypeScript** | `.ts`, `.tsx` | `typescript-language-server` | Bundled with package |
| **JavaScript** | `.js`, `.jsx`, `.mjs`, `.cjs` | `typescript-language-server` | Bundled with package |

### Requires Installation

| Language | Extensions | Server | Install Command |
|----------|------------|--------|-----------------|
| **Python** | `.py`, `.pyi` | `pylsp` | `pip install python-lsp-server` |
| **Go** | `.go` | `gopls` | `go install golang.org/x/tools/gopls@latest` |
| **Rust** | `.rs` | `rust-analyzer` | `rustup component add rust-analyzer` |
| **Java** | `.java` | `jdtls` | `brew install jdtls` |
| **Kotlin** | `.kt`, `.kts` | `kotlin-language-server` | `brew install kotlin-language-server` |
| **C/C++** | `.c`, `.cpp`, `.cc`, `.cxx`, `.h`, `.hpp` | `clangd` | `brew install llvm` |
| **C#** | `.cs` | `csharp-ls` | `dotnet tool install -g csharp-ls` |
| **Ruby** | `.rb` | `solargraph` | `gem install solargraph` |
| **PHP** | `.php` | `intelephense` | `npm install -g intelephense` |
| **Swift** | `.swift` | `sourcekit-lsp` | Included with Xcode |
| **Dart** | `.dart` | `dart` | `dart pub global activate dart_language_server` |
| **Lua** | `.lua` | `lua-language-server` | `brew install lua-language-server` |
| **Zig** | `.zig` | `zls` | [github.com/zigtools/zls](https://github.com/zigtools/zls) |
| **Elixir** | `.ex`, `.exs` | `elixir-ls` | [github.com/elixir-lsp/elixir-ls](https://github.com/elixir-lsp/elixir-ls) |
| **Scala** | `.scala`, `.sc` | `metals` | `cs install metals` |
| **Haskell** | `.hs` | `haskell-language-server-wrapper` | `ghcup install hls` |
| **OCaml** | `.ml`, `.mli` | `ocamllsp` | `opam install ocaml-lsp-server` |
| **Clojure** | `.clj`, `.cljs`, `.cljc` | `clojure-lsp` | `brew install clojure-lsp` |
| **Vue** | `.vue` | `vue-language-server` | `npm install -g @vue/language-server` |
| **Svelte** | `.svelte` | `svelteserver` | `npm install -g svelte-language-server` |
| **YAML** | `.yaml`, `.yml` | `yaml-language-server` | `npm install -g yaml-language-server` |
| **TOML** | `.toml` | `taplo` | `cargo install taplo-cli --features lsp` |
| **JSON** | `.json`, `.jsonc` | `vscode-json-language-server` | `npm install -g vscode-langservers-extracted` |
| **HTML** | `.html` | `vscode-html-language-server` | `npm install -g vscode-langservers-extracted` |
| **CSS** | `.css`, `.scss`, `.less` | `vscode-css-language-server` | `npm install -g vscode-langservers-extracted` |
| **Bash** | `.sh`, `.bash`, `.zsh` | `bash-language-server` | `npm install -g bash-language-server` |
| **SQL** | `.sql` | `sql-language-server` | `npm install -g sql-language-server` |
| **GraphQL** | `.graphql`, `.gql` | `graphql-lsp` | `npm install -g graphql-language-service-cli` |
| **Terraform** | `.tf` | `terraform-ls` | `brew install terraform-ls` |

---

## Custom Configuration

You can configure custom language servers via a JSON config file. No pre-installation required - just define the servers you need.

### Config File Locations

Config files are loaded in priority order (first found wins):

1. **Environment variable**: `OCTOCODE_LSP_CONFIG=/path/to/config.json`
2. **Workspace-level**: `.octocode/lsp-servers.json`
3. **User-level**: `~/.octocode/lsp-servers.json`

### Config File Format

```json
{
  "languageServers": {
    ".py": {
      "command": "pylsp",
      "args": [],
      "languageId": "python"
    },
    ".java": {
      "command": "/opt/jdtls/bin/jdtls",
      "args": [],
      "languageId": "java"
    },
    ".custom": {
      "command": "my-custom-lsp",
      "args": ["--stdio", "--verbose"],
      "languageId": "customlang"
    }
  }
}
```

### Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `languageServers` | object | Yes | Map of file extensions to server configs |
| `command` | string | Yes | Command to spawn the language server |
| `args` | string[] | No | Arguments passed to the command (default: `[]`) |
| `languageId` | string | Yes | LSP language identifier (e.g., "python", "java") |

### Example: Workspace-Level Config

Create `.octocode/lsp-servers.json` in your project root:

```json
{
  "languageServers": {
    ".py": {
      "command": "pyright-langserver",
      "args": ["--stdio"],
      "languageId": "python"
    }
  }
}
```

### Priority

1. **User config** takes priority over built-in defaults
2. **Environment variable** path takes priority over file-based configs
3. Built-in defaults are used as fallback when no user config exists

---

## Environment Variables

Override default language server paths with environment variables:

| Variable | Language | Example |
|----------|----------|---------|
| `OCTOCODE_TS_SERVER_PATH` | TypeScript/JavaScript | `/custom/path/to/tsserver` |
| `OCTOCODE_PYTHON_SERVER_PATH` | Python | `/usr/local/bin/pylsp` |
| `OCTOCODE_GO_SERVER_PATH` | Go | `/home/user/go/bin/gopls` |
| `OCTOCODE_RUST_SERVER_PATH` | Rust | `/usr/local/bin/rust-analyzer` |
| `OCTOCODE_JAVA_SERVER_PATH` | Java | `/opt/jdtls/bin/jdtls` |
| `OCTOCODE_KOTLIN_SERVER_PATH` | Kotlin | `/usr/local/bin/kotlin-language-server` |
| `OCTOCODE_CLANGD_SERVER_PATH` | C/C++ | `/usr/bin/clangd` |
| `OCTOCODE_CSHARP_SERVER_PATH` | C# | `~/.dotnet/tools/csharp-ls` |
| `OCTOCODE_RUBY_SERVER_PATH` | Ruby | `/usr/local/bin/solargraph` |
| `OCTOCODE_PHP_SERVER_PATH` | PHP | `/usr/local/bin/intelephense` |
| `OCTOCODE_SWIFT_SERVER_PATH` | Swift | `/usr/bin/sourcekit-lsp` |
| `OCTOCODE_DART_SERVER_PATH` | Dart | `/usr/bin/dart` |
| `OCTOCODE_LUA_SERVER_PATH` | Lua | `/usr/local/bin/lua-language-server` |
| ... | ... | ... |

---

## Cross-Platform Support

LSP tools work on **all platforms**:

| Platform | Command Detection | Status |
|----------|-------------------|--------|
| **macOS** | `which` | ✅ Supported |
| **Linux** | `which` | ✅ Supported |
| **Windows** | `where` | ✅ Supported |

### Graceful Degradation

If a language server is not installed:

1. `isLanguageServerAvailable()` returns `false`
2. Tool returns helpful error with installation instructions
3. **No crashes** - other tools continue working

---

## Tool Reference

### `lspGotoDefinition`

Navigate to symbol definition.

```typescript
// Input
{
  uri: "src/utils.ts",        // File containing the symbol
  symbolName: "fetchData",    // EXACT symbol name (case-sensitive, max 255 chars)
  lineHint: 42,               // 1-indexed line number (searches ±2 lines)
  orderHint?: 0,              // Which occurrence if multiple on same line (default: 0)
  contextLines?: 5            // Lines of context around definition (0-20, default: 5)
}

// Output
{
  status: "hasResults",
  locations: [{
    uri: "/workspace/src/api/client.ts",
    range: { start: { line: 15, character: 0 }, end: { line: 25, character: 1 } },
    content: "16\texport async function fetchData(url: string) {\n17\t  const response = await fetch(url);\n..."
  }]
}
```

### `lspFindReferences`

Find all usages of a symbol.

```typescript
// Input
{
  uri: "src/api/client.ts",
  symbolName: "fetchData",
  lineHint: 15,
  orderHint?: 0,              // Which occurrence if multiple on same line (default: 0)
  includeDeclaration?: true,  // Include definition in results (default: true)
  contextLines?: 2,           // Lines of context (0-10, default: 2)
  referencesPerPage?: 20,     // Results per page (1-50, default: 20)
  page?: 1
}

// Output
{
  status: "hasResults",
  locations: [
    { uri: "src/components/UserList.tsx", range: {...}, content: "..." },
    { uri: "src/hooks/useData.ts", range: {...}, content: "..." },
    // ...
  ],
  pagination: { currentPage: 1, totalPages: 3, totalResults: 45 }
}
```

### `lspCallHierarchy`

Trace function call relationships with recursive traversal.

```typescript
// Input
{
  uri: "src/api/handler.ts",
  symbolName: "processRequest",
  lineHint: 50,
  direction: "incoming",  // "incoming" = who calls this, "outgoing" = what this calls
  orderHint?: 0,          // Which occurrence if multiple on same line (default: 0)
  depth?: 1,              // Recursion depth (1-3, default: 1, higher = slower)
  contextLines?: 2,       // Lines of context (0-10, default: 2)
  callsPerPage?: 15,      // Results per page (1-30, default: 15)
  page?: 1
}

// Output
{
  status: "hasResults",
  item: { name: "processRequest", kind: "function", uri: "...", range: {...} },
  incomingCalls: [
    { from: { name: "handleHTTP", uri: "src/server.ts", ... }, fromRanges: [...] },
    { from: { name: "handleWebSocket", uri: "src/ws.ts", ... }, fromRanges: [...] }
  ]
}
```

**Depth Parameter:**

The `depth` parameter enables transitive call tracing:

| Depth | Behavior | Use Case |
|-------|----------|----------|
| `1` (default) | Direct calls only | Fast, most common |
| `2` | Direct + transitive (A→B→C) | Understanding call chains |
| `3` | Deep traversal | Full call graph (slow) |

**Cycle Detection:** The tool automatically detects and skips circular call patterns (A→B→A) to prevent infinite loops.

---

## Best Practices

### 1. Use `localSearchCode` First

Find the symbol location before using LSP tools:

```
1. localSearchCode(pattern="fetchData", filesOnly=true)  → Find files
2. localGetFileContent(path="found/file.ts", matchString="fetchData")  → Get line number
3. lspGotoDefinition(uri="found/file.ts", symbolName="fetchData", lineHint=42)  → Jump to definition
```

### 2. Symbol Name Must Be Exact

```typescript
// ✅ Correct
symbolName: "fetchData"

// ❌ Wrong - partial match
symbolName: "fetch"

// ❌ Wrong - includes parens
symbolName: "fetchData()"

// ❌ Wrong - too long (max 255 characters)
symbolName: "aVeryLongSymbolName..."  // Will be rejected if > 255 chars
```

**Validation:** Symbol names must be 1-255 characters. Longer names are rejected at schema validation.

### 3. Line Hint Accuracy

The tool searches ±2 lines from the hint. If you get empty results:
- Verify the line number with `localGetFileContent`
- Use `localSearchCode` to find the exact location

### 4. Prefer Lower Depth for Call Hierarchy

```typescript
// ✅ Fast - direct calls only
depth: 1

// ⚠️ Slower - transitive calls
depth: 2

// ❌ Very slow - O(n^depth) complexity
depth: 3
```

---

## Troubleshooting

### "LSP server not found"

1. Check if server is installed: `which <server-command>`
2. Verify it's in PATH
3. Set custom path via environment variable

### "Symbol not found"

1. Ensure `symbolName` is exact (case-sensitive)
2. Check `lineHint` is within ±2 lines of actual position
3. Use `localSearchCode` to find correct location

### "Empty results"

1. Symbol may not exist at that location
2. File may not be in workspace
3. Language server may not support that operation

### "Timeout"

1. Large files may take longer - use smaller `depth`
2. First request may be slow (server initialization)
3. Subsequent requests use cached connection

---

## Security

LSP tools include several security measures:

### Path Validation

- **Symlink Resolution**: All file paths are resolved to real paths before access
- **Path Traversal Prevention**: Paths containing `..` that escape the workspace are blocked
- **Binary Validation**: LSP server binaries are validated before spawning

### Input Validation

- **Symbol Name Length**: Limited to 255 characters to prevent buffer overflow
- **Line Numbers**: Must be positive integers (1-indexed)
- **Depth Parameter**: Capped at 3 to prevent resource exhaustion

### Error Handling

- **Path Redaction**: When `REDACT_ERROR_PATHS=true`, full paths are hidden in error messages
- **Graceful Degradation**: Invalid inputs return helpful errors instead of crashing

---

## Adding New Languages

To add support for a new language, edit `src/lsp/config.ts`:

```typescript
export const LANGUAGE_SERVER_COMMANDS: Record<string, LanguageServerCommand> = {
  // ... existing languages ...

  '.newext': {
    command: 'new-language-server',
    args: ['--stdio'],
    languageId: 'newlang',
    envVar: 'OCTOCODE_NEWLANG_SERVER_PATH',
  },
};
```

Requirements:
- Server must support stdio communication
- Server must implement LSP protocol
- Server must be in PATH or configured via env var

## Bulk Queries

All LSP tools support processing multiple queries in a single call:

| Tool | Max Queries per Call |
|------|---------------------|
| `lspGotoDefinition` | 5 |
| `lspFindReferences` | 5 |
| `lspCallHierarchy` | 3 (expensive operation) |

## Fallback Behavior

When a language server is unavailable, tools automatically fall back to pattern matching:

- **lspGotoDefinition**: Returns symbol position found via text search
- **lspFindReferences**: Uses ripgrep to find text matches
- **lspCallHierarchy**: Uses pattern matching to trace calls

Fallback results include a hint noting that text-based search was used.

---

## References

- [Language Server Protocol Specification](https://microsoft.github.io/language-server-protocol/)
- [Helix Editor Language Configs](https://github.com/helix-editor/helix/blob/master/languages.toml)
- [Microsoft multilspy](https://github.com/microsoft/multilspy)
- [`src/lsp/client.ts`](../src/lsp/client.ts) - LSP client implementation
- [`src/lsp/types.ts`](../src/lsp/types.ts) - Type definitions

---

## Changelog

### v11.1

- **Depth recursion**: `lspCallHierarchy` now supports transitive call traversal with cycle detection
- **Symbol name validation**: Added max length validation (255 characters)
- **Security enhancements**: LSP server path validation, symlink resolution
- **Error path redaction**: Configurable via `REDACT_ERROR_PATHS` environment variable

---

*LSP Tools documentation for octocode-mcp v11.x*
