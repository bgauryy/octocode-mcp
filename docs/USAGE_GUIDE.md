# Octocode MCP Usage Guide

Transform your code research and development workflow with AI-powered GitHub intelligence and package discovery through the Model Context Protocol (MCP).

<div align="center">
  <a href="https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/docs/TOOL_SCHEMAS.md" 
  style="font-size: 1.2em; font-weight: bold; text-decoration: none;">
    📋 View Tool Schemas → Master Advanced Querying
  </a>
  <br>
  <em style="font-size: 0.9em; color: #666; margin-top: 8px; display: block;">
    Understanding tool schemas unlocks precise parameter control, bulk operations, and advanced filtering for dramatically better query results
  </em>
</div>

## 🚀 Core Capabilities

### 🧠 **Context Generation & AI Enhancement**
- Extract rich context from code, docs, PRs, commits, and packages
- **Beta Feature**: AI sampling for automatic code explanations (requires `BETA=1`)
- Analyze real implementations for patterns and best practices
- Navigate repository history and code evolution
- Universal support for all programming languages and frameworks
- Create comprehensive documentation from any source

### 🏢 **Enterprise & Organization Intelligence**
- Access private repositories and internal projects seamlessly
- **GitHub CLI Integration**: Automatic token detection from `gh auth login`
- **Audit Logging**: Enterprise-grade access logging and monitoring
- **Rate Limiting**: Built-in API usage controls and throttling
- Map dependencies and data flows across multiple repositories
- Discover organizational patterns and coding standards
- Extract institutional knowledge from development history

### 🔍 **Research & Analysis**
- Compare repository versions across time periods
- Deep dive into PR discussions and code diffs with file changes
- Multi-dimensional code discovery with semantic search
- Extract best practices from high-quality codebases
- **Bulk Operations**: Execute up to 10 parallel queries for comprehensive research
- **Progressive Refinement**: Start broad, then narrow based on findings

### 🏗️ **Project Intelligence**
- Smart repository discovery with quality ranking
- Project architecture mapping and navigation
- Multi-repository comparison and analysis
- Repository structure exploration with intelligent filtering
- Seamless access to both public and private repositories

### 📦 **Package Intelligence**
- Bridge to GitHub repositories for package source analysis
- Repository linking and integration analysis
- Dependency relationship mapping through GitHub code search
- Version tracking through GitHub releases and tags

## 🛠️ Available Tools

Octocode MCP provides 5 specialized tools for comprehensive code research:

| Tool | Description | Default | Type |
|------|-------------|---------|------|
| **`githubSearchRepositories`** | Search and discover GitHub repositories with quality ranking | ✅ | search |
| **`githubSearchCode`** | Search code across repositories with semantic matching and snippets | ✅ | search |
| **`githubGetFileContent`** | Fetch file content with smart context extraction and Beta AI explanations | ✅ | content |
| **`githubViewRepoStructure`** | View repository structure and navigation with intelligent filtering | ✅ | content |
| **`githubSearchPullRequests`** | Search pull requests and code reviews with file changes | ⚙️ | history |

**Legend**: ✅ = Default enabled | ⚙️ = Optional (enable via configuration)

### Tool Configuration
- **Default Tools**: Automatically enabled unless explicitly disabled
- **Optional Tools**: Must be explicitly enabled via `ENABLE_TOOLS` environment variable
- **Bulk Operations**: All tools support up to 10 parallel queries for comprehensive research
- **Caching**: Built-in 24-hour caching with intelligent TTL management

## 💡 Prompt Examples

### 🏢 **Organization-Specific Research**
```
Use Octocode to research authentication patterns from {{my-org}} repositories
```

### 🔄 **Architecture Flow Analysis**
```
Search for front-end application {{app-name}}. Check which backend services it uses, 
trace the full flow to the database schema, and explain the complete architecture.
```

### 📚 **Examples & Best Practices**
```
Show examples and best practices for implementing Zustand state management in React applications
```

### 🤖 **AI-Enhanced Code Analysis (Beta)**
```
Fetch the main authentication file from {{my-org}}/auth-service and explain how it works
```

### 📖 **Documentation Generation**
```
Create comprehensive documentation for implementing Zustand in a React 18 application
```

### 🔍 **Code Review & Analysis**
```
Check PR #123 from microsoft/vscode and review the changes against our coding standards
```

### 📦 **Library Discovery & Analysis**
```
Search GitHub for Node.js HTTP client libraries and compare their implementations
```

### 🎨 **Exploratory Research**
```
Research Three.js documentation and examples for creating 3D walking person animations
```

### 🔧 **Feature Understanding**
```
How does feature X from repo Y work?
```

### 🔍 **Bulk Analysis**
```
Compare authentication implementations across multiple repositories in {{my-org}}
```


## ✨ Best Practices

###  **Be Specific**
- **Good**: "Redis caching patterns in TypeScript microservices"
- **Better**: "Redis caching in {{my-org}} Node.js services"

Octocode performs better with specific identifiers like organization names, repository names, or technology stacks.

### 🔧 **Tool Configuration**
Customize tool availability via environment variables:
- `ENABLE_TOOLS="toolName"` - Enable specific optional tools
- `DISABLE_TOOLS="githubSearchCode"` - Disable specific tools (including defaults)
- `TOOLS_TO_RUN="githubSearchCode,githubGetFileContent"` - Run only specified tools
- Default tools (code search, content fetch, repo structure, repository search, pull requests) are automatically enabled unless explicitly disabled

###  **Monitoring**
Control session logging and analytics:
```bash
# Disable monitoring
export LOG=false
```

**About Session Logging:**
Octocode MCP logs errors and monitoring data to help optimize and improve research workflows.

### 🤖 **Beta Features**
Enable advanced features with `BETA=1`:
- **AI Sampling**: Automatic code explanations for file content
- **Enhanced Capabilities**: Access to experimental MCP features

### 🔧 **IDE Integration**
- Use Octocode with your IDE to improve existing code
- Search for best practices based on your current implementation
- Get context-aware suggestions for code improvements

### 📝 **Documentation Workflow**
1. Use Octocode to gather comprehensive context
2. Generate documentation with real examples (with AI explanations if Beta enabled)
3. Apply findings to your AI development workflow

### 🔄 **Progressive Research**
1. **Discover** - Find relevant repositories and context
2. **Analyze** - Examine specific implementations with bulk operations  
3. **Document** - Create comprehensive guides with examples
4. **Apply** - Review and improve your code against discovered standards

## 🏆 Enterprise Use Cases

| Use Case | Description | Tools Used |
|----------|-------------|------------|
| **Standards Mapping** | Discover and document coding patterns across teams | `githubSearchCode`, `githubSearchRepositories` |
| **Security Auditing** | Identify vulnerabilities and access control patterns | `githubSearchCode`, `githubGetFileContent` |
| **Architecture Analysis** | Trace data flows and service dependencies | `githubViewRepoStructure`, `githubSearchCode` |
| **Knowledge Extraction** | Capture institutional knowledge from pull request histories | `githubSearchPullRequests` |
| **Dependency Governance** | Track and audit dependency usage across repositories | `githubSearchCode`, `githubViewRepoStructure` |

## 🚀 Getting Started

### Quick Start
1. **Configure Authentication**: Use `gh auth login` or set `GITHUB_TOKEN`
2. **Start Specific**: Begin with your organization or specific repository
3. **Build Context**: Use bulk operations to gather comprehensive information
4. **Enable Beta**: Set `BETA=1` for AI-enhanced code explanations

### Authentication Options
- **GitHub CLI**: Automatically uses existing `gh auth login` tokens (recommended)
- **Environment Variables**: Set `GITHUB_TOKEN` or `GH_TOKEN`
- **Fallback**: Manual token configuration

### Configuration Examples
```bash
# Recommended: Use GitHub CLI
gh auth login

# Alternative: Environment variable
export GITHUB_TOKEN=your_token_here

# GitHub Enterprise Server (optional)
export GITHUB_API_URL=https://github.company.com/api/v3

# Disable specific default tools (if needed)
export DISABLE_TOOLS="githubSearchPullRequests"

# Beta features
export BETA=1

# Advanced configuration
export REQUEST_TIMEOUT=60000
export MAX_RETRIES=5
export ENABLE_LOGGING=true
```

## 🔧 MCP Integration

Octocode MCP integrates seamlessly with MCP-compatible AI assistants:

### Server Capabilities
- **Tools**: 5 specialized GitHub research tools
- **Resources**: Access to prompts and system configurations
- **Sampling**: AI-enhanced code explanations (Beta)
- **Caching**: Intelligent response caching for performance

### Response Format
All tools return structured responses with:
- **data**: Primary response content
- **hints**: Strategic guidance for next steps
- **meta**: Context and metadata for research workflows

### Error Handling
- **Graceful Degradation**: Continues operation despite individual tool failures
- **Smart Fallbacks**: Provides alternative approaches when primary methods fail
- **Recovery Hints**: Actionable suggestions for resolving issues

---

*Transform your development process with intelligent code research through the Model Context Protocol.*
