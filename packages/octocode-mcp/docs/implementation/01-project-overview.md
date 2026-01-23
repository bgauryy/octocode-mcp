# Project Overview

## What is Octocode MCP?

Octocode MCP is a **Model Context Protocol (MCP) server** that provides intelligent code context for AI systems. It enables AI assistants to search, analyze, and extract insights from millions of GitHub repositories with enterprise-grade security and token efficiency.

### Primary Purpose

The project solves a critical problem: **AI assistants lack access to comprehensive, structured code exploration capabilities**. While AI models are powerful at understanding and generating code, they need tools to:

1. **Search across massive codebases** - Find relevant code, repositories, and implementations across millions of files
2. **Navigate code semantically** - Understand symbol definitions, references, and call hierarchies using Language Server Protocol (LSP)
3. **Analyze repository structure** - Explore directory layouts, file organization, and project architecture
4. **Access external code hosting platforms** - Work with both GitHub and GitLab repositories
5. **Explore local codebases** - Search and analyze code on the local filesystem with high performance
6. **Look up package information** - Find NPM and PyPI packages and their source repositories

### The MCP Connection

**Model Context Protocol (MCP)** is a standardized way for AI assistants to access external tools and data sources. Octocode MCP implements this protocol to provide:

- **Unified Tool Interface** - All 13 tools follow the MCP specification
- **Stdio Transport** - Standard input/output communication for universal compatibility
- **Type-Safe Schemas** - Validated tool inputs using Zod schemas
- **Streaming Support** - Efficient data transfer for large results
- **Multi-Client Support** - Works with Claude Desktop, Cursor IDE, Windsurf, and any MCP-compatible client

### Key Innovation: From Discovery to Deep Analysis

Octocode MCP's strength lies in enabling **seamless transitions** between different levels of code exploration:

```
Broad Discovery → Targeted Search → Deep Analysis → Implementation Understanding
```

**Example Workflow:**

1. **Discovery Phase**: "Find popular React state management libraries"
   - Uses `githubSearchRepositories` to find top repositories by stars
   - Returns: Redux, Zustand, Jotai, Recoil, MobX

2. **Targeted Search Phase**: "How does Zustand handle middleware?"
   - Uses `githubSearchCode` to find middleware implementations
   - Returns: middleware.ts files with implementation patterns

3. **Deep Analysis Phase**: "Show me the middleware implementation"
   - Uses `githubGetFileContent` to retrieve specific files
   - Returns: Complete source code with explanations

4. **Implementation Understanding**: "How does compose middleware work internally?"
   - Uses `lspGotoDefinition` and `lspFindReferences` for semantic navigation
   - Returns: Function definitions, call sites, and usage patterns

All of this happens **in a single conversation** without the AI needing to manually hunt through repositories or guess file locations.

---

## Key Features and Capabilities

### 1. Multi-Platform Code Hosting Support

Octocode MCP supports both **GitHub and GitLab** through a unified provider abstraction:

```typescript
// Automatically routes to the correct provider
{
  "provider": "github",  // or "gitlab"
  "owner": "facebook",
  "repo": "react"
}
```

**Benefits:**
- **Unified API** - Same tool interface for both platforms
- **Dynamic Routing** - Switch providers per-request with `provider` parameter
- **Instance Caching** - Efficient reuse of API clients
- **Extensible** - Easy to add new providers (Bitbucket, Azure DevOps, etc.)

**GitHub Features:**
- Repository search with filters (stars, topics, created date)
- Code search with regex patterns and file filters
- Pull request search with comprehensive filters
- File content retrieval with line ranges and string matching
- Repository structure viewing with configurable depth

**GitLab Features:**
- Project search across GitLab instances (SaaS or self-hosted)
- Code search within projects
- Merge request search and analysis
- File content retrieval
- Project structure viewing

### 2. Local Filesystem Tools

High-performance local code exploration using battle-tested system commands:

**localSearchCode** - Powered by **ripgrep (rg)**
```bash
# Fast pattern search with:
- Regex pattern matching
- File type filtering (.ts, .js, .py, etc.)
- Include/exclude globs
- Context lines (before/after matches)
- Smart case sensitivity
- Multiline matching
- Binary file handling
```

**localFindFiles** - Powered by **find command**
```bash
# Metadata-based file discovery:
- Name patterns (*.config.js, *test*)
- Modification time (within 7 days, before 30 days)
- File size (>10MB, <1KB)
- Permissions (755, 644)
- File type (file, directory, symlink)
- Max/min depth for recursive search
```

**localViewStructure** - Powered by **ls command**
```bash
# Directory structure overview:
- Recursive directory listing
- File sizes (human-readable)
- Sorting (name, size, time, extension)
- Extension filtering
- Hidden file support
- Pagination for large directories
```

**localGetFileContent** - Direct file reading
```bash
# Targeted file content retrieval:
- Full content or line ranges
- String matching with context
- Regex pattern matching
- Pagination for large files
- Minification for token efficiency
```

### 3. LSP (Language Server Protocol) Integration

Semantic code navigation for **40+ programming languages**:

**lspGotoDefinition** - Navigate to symbol definitions
```typescript
// Find where a symbol is defined
{
  "uri": "/path/to/file.ts",
  "symbolName": "UserService",
  "lineHint": 15
}
// Returns: Definition location with context
```

**lspFindReferences** - Find all symbol references
```typescript
// Find everywhere a symbol is used
{
  "uri": "/path/to/file.ts",
  "symbolName": "calculateTotal",
  "lineHint": 42,
  "includeDeclaration": true
}
// Returns: All usage locations across the codebase
```

**lspCallHierarchy** - Trace function calls
```typescript
// Understand call relationships
{
  "uri": "/path/to/file.ts",
  "symbolName": "processOrder",
  "lineHint": 78,
  "direction": "incoming"  // or "outgoing"
}
// Returns: Call tree showing who calls this function
```

**Supported Languages:**
TypeScript, JavaScript, Python, Go, Rust, Java, Kotlin, C/C++, C#, Ruby, PHP, Swift, Dart, Lua, Zig, Elixir, Scala, Haskell, OCaml, Clojure, Vue, Svelte, YAML, TOML, JSON, HTML, CSS/SCSS/Less, Bash, SQL, GraphQL, Terraform, and more.

**LSP Features:**
- **Automatic Language Server Detection** - Finds installed language servers
- **Fallback Mechanisms** - Uses text search when LSP unavailable
- **Process Management** - Spawns and manages language server processes
- **Configuration** - Per-language customization via environment variables or config files
- **Symbol Resolution** - Intelligent symbol position finding

### 4. Package Registry Integration

**packageSearch** - NPM and PyPI package lookup

```typescript
// Find NPM packages
{
  "ecosystem": "npm",
  "name": "express",
  "searchLimit": 1
}
// Returns: Package metadata, repository URL, downloads, versions

// Find Python packages
{
  "ecosystem": "python",
  "name": "requests",
  "searchLimit": 1
}
// Returns: PyPI metadata, GitHub repository, release info
```

**Why this matters:**
- **Fast Repository Discovery** - Get GitHub URLs from package names
- **Dependency Research** - Understand package ecosystems
- **Alternative Discovery** - Find similar packages (searchLimit > 1)
- **Metadata Enrichment** - Downloads, versions, maintainers

### 5. Enterprise-Grade Security

Built-in security layer protects sensitive data:

**Sensitive Data Masking**
```typescript
// Automatic pattern detection and masking
const patterns = [
  'GitHub tokens (ghp_*, gho_*, ghs_*)',
  'GitLab tokens (glpat-*)',
  'AWS keys (AKIA*, aws_*)',
  'API keys (various patterns)',
  'Private keys (-----BEGIN * KEY-----)',
  'Passwords in URLs',
  'Connection strings',
  'JWT tokens',
  // ... 30+ patterns
];

// Error messages automatically sanitized
"API call failed: Authorization with ghp_abc123def456"
// Becomes:
"API call failed: Authorization with g*p*a*c*2*d*f*5*"
```

**Command Validation**
```typescript
// Prevents shell injection
validateCommand({ command: 'find', args: ['/path', '-name', '*.ts'] })
// Validates: command whitelisting, argument safety

// Blocked commands
['rm', 'mv', 'dd', 'mkfs', 'eval', 'exec']
```

**Path Validation**
```typescript
// Restricts file system access
validateToolPath('/Users/user/project/src/app.ts')
// Checks: allowed paths, no path traversal, no symlink attacks

// Default allowed paths:
['/tmp', '/Users', '/home', process.cwd()]
```

**Content Sanitization**
```typescript
// Removes sensitive data from tool responses
sanitizeContent(rawContent, {
  maskApiKeys: true,
  maskTokens: true,
  maskSecrets: true
})
```

### 6. Token Efficiency and Minification

Reduces token consumption for AI assistants:

**Content Minification**
```typescript
// JavaScript/TypeScript minification (using Terser)
const original = `
function calculateTotal(items) {
  // Calculate the total price
  return items.reduce((sum, item) => {
    return sum + item.price;
  }, 0);
}
`;
// Minified:
"function calculateTotal(e){return e.reduce(((e,t)=>e+t.price),0)}"

// Reduction: ~150 chars → ~65 chars (57% savings)
```

**Smart Pagination**
```typescript
// Return only what's needed
{
  "matchesPerPage": 10,      // Limit matches per file
  "filesPerPage": 20,         // Limit files per response
  "charLength": 5000,         // Limit character output
  "charOffset": 0             // Start position for pagination
}
```

**Contextual Content**
```typescript
// Return matches with context instead of full files
{
  "matchString": "export function",
  "matchStringContextLines": 5
}
// Returns: Only matching sections + 5 lines context
// Avoids: Returning entire files
```

### 7. Intelligent Caching Strategy

Multi-tiered caching with custom TTLs:

```typescript
const CACHE_TTL_CONFIG = {
  'gh-api-code': 3600,              // 1 hour - code search changes frequently
  'gh-api-repos': 7200,             // 2 hours - repository metadata
  'gh-api-prs': 1800,               // 30 minutes - PR status changes
  'gh-api-file-content': 3600,      // 1 hour - file content
  'gh-repo-structure-api': 7200,    // 2 hours - repo structure
  'github-user': 900,               // 15 minutes - user info
  'npm-search': 14400,              // 4 hours - NPM package data
  'pypi-search': 14400,             // 4 hours - PyPI package data
  'default': 86400,                 // 24 hours - everything else
};
```

**Cache Features:**
- **Version-Prefixed Keys** - Easy cache invalidation (v1-prefix:hash)
- **SHA-256 Hashing** - Secure parameter hashing for unique keys
- **Request Deduplication** - Prevents concurrent duplicate API calls
- **Automatic Expiration** - Removes stale entries every hour
- **Memory Management** - Max 5000 keys with LRU eviction
- **Statistics Tracking** - Hit rate, misses, sets for monitoring

### 8. Bulk Query Pattern

Execute multiple queries in parallel:

```typescript
// Single tool call, multiple queries
{
  "queries": [
    {
      "mainResearchGoal": "Understand React hooks",
      "researchGoal": "Find useState implementation",
      "reasoning": "Core hook used everywhere",
      "owner": "facebook",
      "repo": "react",
      "path": "packages/react",
      "keywordsToSearch": ["useState"]
    },
    {
      "mainResearchGoal": "Understand React hooks",
      "researchGoal": "Find useEffect implementation",
      "reasoning": "Side effect management",
      "owner": "facebook",
      "repo": "react",
      "path": "packages/react",
      "keywordsToSearch": ["useEffect"]
    }
    // ... up to 3-5 queries depending on tool
  ]
}
```

**Benefits:**
- **Reduced Latency** - Parallel execution instead of sequential
- **Research Workflows** - Compare multiple files/repos/patterns
- **Consistency** - Single response with unified formatting
- **Context Preservation** - mainResearchGoal tracks overall objective

---

## The 13 MCP Tools

Octocode MCP provides exactly **13 MCP tools** organized into 4 categories:

### GitHub/GitLab Tools (6 tools)

1. **githubSearchCode** - Search code across repositories
   - Keywords, file extensions, paths
   - Regex patterns with fixed-string mode
   - Match by file content or path
   - Text match highlighting

2. **githubGetFileContent** - Fetch file content
   - Full content or line ranges (startLine/endLine)
   - String matching with context (matchString)
   - Branch selection
   - Pagination for large files

3. **githubViewRepoStructure** - View repository structure
   - Configurable depth (1-2 levels)
   - Entry pagination
   - Branch selection
   - Directory filtering

4. **githubSearchRepositories** - Search repositories
   - Keywords and topics
   - Stars, created date, size filters
   - Match by name, description, or README
   - Sort by stars, forks, updated, or relevance

5. **githubSearchPullRequests** - Search pull requests
   - State (open/closed), merged status
   - Author, assignee, reviewer filters
   - Labels, milestone, project
   - Comments, commits, files changed
   - Date ranges (created, updated, merged, closed)

6. **packageSearch** - Search NPM/PyPI packages
   - Package name search
   - Repository URL extraction
   - Metadata (downloads, versions, maintainers)
   - Alternative packages (searchLimit > 1)

### Local Code Search Tools (4 tools)

7. **localSearchCode** - Search local code with ripgrep
   - Regex patterns with Perl regex support
   - File type filtering (.ts, .js, .py, etc.)
   - Include/exclude globs
   - Context lines (before/after)
   - Smart case, fixed string, whole word
   - Multiline matching

8. **localViewStructure** - Browse directory structure
   - Recursive listing with depth control
   - Sorting (name, size, time, extension)
   - Extension filtering
   - Hidden files support
   - Summary statistics
   - Pagination

9. **localFindFiles** - Find files by metadata
   - Name patterns (*.js, *test*)
   - Modification time (within/before)
   - File size (greater/less)
   - Permissions matching
   - File type (file/directory/symlink)
   - Depth control

10. **localGetFileContent** - Read local files
    - Full content or line ranges
    - String matching with context
    - Regex pattern matching
    - Pagination (charLength/charOffset)
    - Minification support

### LSP Tools (3 tools)

11. **lspGotoDefinition** - Navigate to definitions
    - Symbol name and line hint
    - Context lines around definition
    - Multiple definition support (orderHint)
    - Fallback to text search

12. **lspFindReferences** - Find all references
    - Include/exclude declaration
    - Context lines per reference
    - Pagination (referencesPerPage)
    - Cross-file reference tracking

13. **lspCallHierarchy** - Analyze call relationships
    - Incoming calls (who calls this?)
    - Outgoing calls (what does this call?)
    - Configurable depth (1-3 levels)
    - Context lines per call site
    - Pagination support

---

## Target Users

### Primary: AI Assistants and AI Systems

Octocode MCP is designed for **AI assistants** that need code exploration capabilities:

1. **Claude Desktop** - Anthropic's official AI assistant
   - Desktop application with MCP support
   - Configuration via `claude_desktop_config.json`
   - OAuth authentication support

2. **Cursor IDE** - AI-powered code editor
   - Built-in MCP client
   - Deep IDE integration
   - Live code context

3. **Windsurf** - Development environment
   - MCP-compatible IDE
   - Code intelligence features

4. **VS Code with Cline/Roo-Cline** - Popular extensions
   - MCP server integration
   - Editor-native experience

5. **Any MCP-Compatible Client**
   - Uses stdio transport (standard MCP)
   - Implements MCP protocol specification
   - Can register and invoke tools

### Secondary: Human Developers (via AI)

While Octocode MCP is a tool for AI systems, human developers benefit indirectly:

**Use Cases:**
- **Code Research** - "How does React implement hooks?"
- **Architecture Understanding** - "Show me the middleware pattern in Express"
- **Dependency Discovery** - "Find alternatives to lodash for utility functions"
- **Bug Investigation** - "Find all references to the broken function"
- **API Exploration** - "What REST APIs are available for stock market data?"
- **Implementation Planning** - "Research how to build a chat application with WebSockets"
- **Security Audits** - "Find all files with authentication logic"
- **Migration Planning** - "How do repositories migrate from class components to hooks?"

**Developer Benefits:**
- **Faster Research** - AI does the searching and analysis
- **Comprehensive Answers** - Multiple sources cross-referenced
- **Code Examples** - Real implementations from popular repositories
- **Context Preservation** - Conversation history tracks research flow
- **Token Efficiency** - Minified responses reduce reading time

### Integration Methods

**Interactive CLI (Recommended)**
```bash
npx octocode-cli
```
- Detects installed IDEs
- Configures MCP server automatically
- Handles GitHub authentication
- Verifies environment

**Manual Configuration**
```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["octocode-mcp@latest"],
      "env": {
        "GITHUB_TOKEN": "ghp_your_token_here"
      }
    }
  }
}
```

**Command Line Tools**
```bash
# Claude Code CLI
claude mcp add octocode npx octocode-mcp@latest

# Amp CLI
amp mcp add octocode -- npx octocode-mcp@latest

# Codex CLI
codex mcp add octocode npx "octocode-mcp@latest"
```

---

## Architecture Philosophy

### Design Principles

1. **Separation of Concerns**
   - Tools are isolated modules
   - Providers abstract platform differences
   - Security layer is independent
   - Caching is transparent

2. **Extensibility**
   - Provider pattern for new platforms
   - Command builders for new operations
   - Tool metadata system for documentation
   - Plugin-like tool registration

3. **Type Safety**
   - Zod schemas for runtime validation
   - TypeScript for compile-time checks
   - Strict null checks
   - Exhaustive pattern matching

4. **Security by Default**
   - All inputs validated
   - All outputs sanitized
   - Command whitelisting
   - Path restrictions

5. **Performance Optimization**
   - Caching at multiple layers
   - Request deduplication
   - Pagination support
   - Lazy loading

6. **Error Resilience**
   - Graceful degradation (LSP fallbacks)
   - Comprehensive error handling
   - Masked error messages
   - Session error tracking

---

## Technology Choices

### Core Framework
- **Node.js >= 20.0.0** - Modern JavaScript runtime with ESM support
- **TypeScript 5.9.3** - Type safety and developer experience
- **@modelcontextprotocol/sdk 1.25.2** - Official MCP implementation

### Why These Technologies?

**Node.js 20+**
- Native ESM support (import/export)
- Performance improvements
- Better async/await handling
- Built-in test runner (used by vitest)

**TypeScript**
- Compile-time type checking
- IDE autocomplete and refactoring
- Self-documenting code
- Catches errors before runtime

**MCP SDK**
- Official protocol implementation
- Standardized communication
- Type-safe tool definitions
- Logging and debugging support

---

## Comparison with Alternatives

### vs GitHub CLI (gh)

**GitHub CLI:**
- ✅ Direct GitHub integration
- ❌ Manual command construction
- ❌ No structured output for AI
- ❌ No token efficiency features
- ❌ No LSP support
- ❌ No bulk operations

**Octocode MCP:**
- ✅ AI-native structured responses
- ✅ Token-efficient output
- ✅ Multi-platform (GitHub + GitLab)
- ✅ Local + remote code search
- ✅ LSP semantic navigation
- ✅ Bulk query patterns

### vs GitHub REST API Directly

**Direct API:**
- ✅ Full control over requests
- ❌ Complex authentication
- ❌ Rate limiting management needed
- ❌ No caching strategy
- ❌ No response formatting for AI
- ❌ Manual pagination

**Octocode MCP:**
- ✅ Automatic authentication (gh CLI, tokens, OAuth)
- ✅ Built-in rate limiting and retries
- ✅ Intelligent caching (custom TTLs)
- ✅ AI-optimized responses
- ✅ Automatic pagination

### vs GitHub Copilot

**GitHub Copilot:**
- ✅ Code completion
- ✅ Inline suggestions
- ❌ No repository search
- ❌ No cross-repo analysis
- ❌ No local file search
- ❌ No LSP navigation

**Octocode MCP:**
- ✅ Repository-wide search
- ✅ Cross-repository analysis
- ✅ Local + remote search
- ✅ Semantic code navigation
- ✅ Package discovery
- ❌ Not a code completion tool

**Complementary:** Use Copilot for writing code, Octocode MCP for researching code.

### vs Sourcegraph

**Sourcegraph:**
- ✅ Enterprise code search
- ✅ Universal code intelligence
- ❌ Requires infrastructure setup
- ❌ Not AI-native
- ❌ No MCP integration
- ❌ Expensive for teams

**Octocode MCP:**
- ✅ Zero infrastructure (runs locally)
- ✅ AI-native (MCP protocol)
- ✅ Free and open source
- ✅ Works with public + private repos
- ❌ Not a hosted service
- ❌ No code insights UI

---

## Real-World Applications

### 1. Feature Implementation Research

**Scenario:** Developer wants to add OAuth authentication to their app.

**Workflow:**
1. Search repositories: "Find popular OAuth implementations in Node.js"
2. Analyze code: "Show me how Passport.js handles OAuth strategies"
3. Explore files: "What files implement the GitHub OAuth strategy?"
4. Deep dive: "How does the OAuth callback flow work?"
5. Find patterns: "What error handling patterns do they use?"

**Result:** Comprehensive understanding with code examples, ready to implement.

### 2. Bug Investigation

**Scenario:** Production bug in authentication middleware.

**Workflow:**
1. Local search: "Find all files that use the auth middleware"
2. LSP references: "Find all calls to validateToken function"
3. Call hierarchy: "What functions does validateToken call?"
4. GitHub search: "How do similar projects handle token validation?"
5. PR analysis: "Find recent PRs that changed auth code"

**Result:** Root cause identified with examples of proper implementations.

### 3. Architecture Understanding

**Scenario:** New developer joining a large codebase.

**Workflow:**
1. View structure: "Show me the project directory layout"
2. Find entry points: "Where is the main application entry point?"
3. Trace flows: "How does a user request flow through the system?"
4. Understand patterns: "What design patterns are used in the service layer?"
5. Explore APIs: "What REST endpoints are exposed?"

**Result:** Mental model of the entire architecture in minutes.

### 4. Dependency Upgrade

**Scenario:** Need to upgrade from React 17 to React 18.

**Workflow:**
1. Package search: "Find the React 18 repository"
2. PR analysis: "Show me PRs about migration from 17 to 18"
3. Code search: "Find breaking changes in React 18"
4. Local search: "Find all hooks usage in our codebase"
5. Impact analysis: "What files use removed lifecycle methods?"

**Result:** Complete migration plan with affected files identified.

### 5. Security Audit

**Scenario:** Security review before production deployment.

**Workflow:**
1. Local search: "Find all files with password or secret in them"
2. Pattern search: "Find hardcoded API keys or tokens"
3. Code review: "How is authentication implemented?"
4. GitHub search: "How do secure applications handle secrets?"
5. Best practices: "Find examples of proper environment variable usage"

**Result:** Security issues identified with remediation examples.

---

## Success Metrics

### Performance
- **Response Time**: < 2s for most queries (with caching)
- **Cache Hit Rate**: 60-80% for repeated queries
- **Memory Usage**: < 150MB RSS under normal load
- **Startup Time**: < 3s from launch to ready

### Reliability
- **Uptime**: 99.9% availability during client connections
- **Error Rate**: < 1% of tool invocations fail
- **Graceful Degradation**: LSP fallback success rate > 90%
- **Recovery**: Automatic reconnection on transport failures

### User Experience
- **Tool Registration**: 100% of enabled tools register successfully
- **Authentication**: Multi-method fallback (CLI > Token > OAuth)
- **Documentation**: Inline hints and error messages guide usage
- **Debugging**: Comprehensive logging with OCTOCODE_DEBUG flag

---

## Roadmap and Future Enhancements

### Planned Features

**Additional Providers**
- Bitbucket integration
- Azure DevOps repositories
- Self-hosted Git servers (Gitea, Gogs)

**Enhanced LSP Support**
- Hover information (documentation tooltips)
- Code actions (refactoring suggestions)
- Diagnostics (errors and warnings)
- Workspace symbol search

**Advanced Caching**
- Persistent cache (disk-backed)
- Cross-session cache sharing
- Cache warming for common queries
- Distributed cache for teams

**Analytics and Insights**
- Tool usage statistics
- Query pattern analysis
- Performance profiling
- Cost tracking (API calls)

**Collaboration Features**
- Shared research sessions
- Annotated code snippets
- Team knowledge base
- Cache synchronization

---

## Conclusion

Octocode MCP transforms how AI assistants interact with code. By providing a comprehensive set of tools for searching, analyzing, and understanding codebases, it enables AI to move seamlessly from broad discovery to deep implementation analysis—all within the standardized Model Context Protocol.

**Key Takeaways:**

1. **13 Powerful Tools** - GitHub/GitLab, local search, LSP navigation, package lookup
2. **Multi-Platform** - Unified interface for GitHub, GitLab, and local files
3. **Token Efficient** - Minification, pagination, and targeted content retrieval
4. **Enterprise Ready** - Security validation, secret masking, command whitelisting
5. **Performance Optimized** - Intelligent caching, bulk queries, request deduplication
6. **Developer Friendly** - Easy installation, multiple authentication methods, comprehensive docs
7. **AI Native** - Designed specifically for AI assistant workflows

Whether you're researching APIs, investigating bugs, understanding architecture, or planning implementations, Octocode MCP provides the code intelligence your AI assistant needs.
