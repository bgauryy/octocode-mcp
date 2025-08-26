# Octocode Usage Guide

Transform your code research and development workflow with AI-powered GitHub intelligence and package discovery.

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
- Extract rich context from code, docs, PRs, commits, issues, and packages
- **Beta Feature**: Automatic code explanation via AI sampling 
- Analyze real implementations for patterns and best practices
- Navigate repository history and code evolution
- Universal support for all programming languages and frameworks
- Create comprehensive documentation from any source

### 🏢 **Enterprise & Organization Intelligence**
- Access private repositories and internal projects seamlessly
- **OAuth Authentication**: Secure GitHub access with web-based authentication
- **Audit Logging**: Enterprise-grade access logging and monitoring
- **Rate Limiting**: Configurable API usage controls
- Map dependencies and data flows across multiple repositories
- Discover organizational patterns and coding standards
- Extract institutional knowledge from development history

### 🔍 **Research & Analysis**
- Compare repository versions across time periods
- Deep dive into PR discussions and code diffs with file changes
- Multi-dimensional code discovery with semantic search
- Extract best practices from high-quality codebases
- **Bulk Operations**: Execute up to 10 parallel queries for comprehensive research

### 🏗️ **Project Intelligence**
- Smart repository discovery with quality boosting
- Project architecture mapping and navigation
- Multi-repository comparison and analysis
- Repository structure exploration with filtering
- Seamless access to both public and private repositories

### 📦 **Package Intelligence**
- **NPM & Python**: Comprehensive package discovery across ecosystems
- Repository linking and integration
- Dependency relationship analysis and mapping
- Version tracking and metadata extraction
- Bridge packages to their source repositories for code analysis

## 🛠️ Available Tools

Octocode provides 7 specialized tools for comprehensive code research:

| Tool | Description | Default |
|------|-------------|---------|
| **`githubSearchRepositories`** | Search and discover GitHub repositories with quality ranking | ✅ |
| **`githubSearchCode`** | Search code across repositories with semantic matching and snippets | ✅ |
| **`githubGetFileContent`** | Fetch file content with smart context extraction and Beta AI explanations | ✅ |
| **`githubViewRepoStructure`** | View repository structure and navigation with filtering | ✅ |
| **`githubSearchCommits`** | Search commit history and change analysis with optional diffs | ⚙️ |
| **`githubSearchPullRequests`** | Search pull requests and code reviews with file changes | ⚙️ |
| **`packageSearch`** | Search NPM and Python packages with repository integration | ⚙️ |

**Legend**: ✅ = Default enabled | ⚙️ = Optional (enable via configuration)

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

### 📦 **Package Discovery & Analysis**
```
Search for Node.js HTTP client libraries and compare their GitHub repositories
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

### 🎯 **Be Specific**
- **Good**: "Redis caching patterns in TypeScript microservices"
- **Better**: "Redis caching in {{my-org}} Node.js services"

Octocode performs better with specific identifiers like organization names, repository names, or technology stacks.

### 🔧 **Tool Configuration**
Customize tool availability via environment variables:
- `ENABLE_TOOLS="tool1,tool2"` - Enable specific tools
- `DISABLE_TOOLS="tool1,tool2"` - Disable specific tools
- Default tools are automatically enabled unless disabled

### 🤖 **Beta Features**
Enable advanced features with `BETA=1`:
- **AI Sampling**: Automatic code explanations
- **Enhanced Analysis**: Advanced research capabilities

### 🏢 **Enterprise Features**
Configure for enterprise use:
- **Audit Logging**: `AUDIT_ALL_ACCESS=true`
- **Rate Limiting**: Set `RATE_LIMIT_API_HOUR`, `RATE_LIMIT_AUTH_HOUR`
- **OAuth Authentication**: Configure `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`

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
| **Security Auditing** | Identify vulnerabilities and access control patterns with audit logging | `githubSearchCode`, `githubGetFileContent` + `AUDIT_ALL_ACCESS=true` |
| **Architecture Analysis** | Trace data flows and service dependencies | `githubViewRepoStructure`, `packageSearch`, `githubSearchCode` |
| **Knowledge Extraction** | Capture institutional knowledge from commit histories | `githubSearchCommits`, `githubSearchPullRequests` |
| **Package Governance** | Track and audit package usage across repositories | `packageSearch`, `githubSearchCode` |

## 🚀 Getting Started

### Quick Start
1. **Configure Authentication**: Set `GITHUB_TOKEN` or configure OAuth with `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`
2. **Start Specific**: Begin with your organization or specific repository
3. **Build Context**: Use bulk operations to gather comprehensive information
4. **Enable Beta**: Set `BETA=1` for AI-enhanced code explanations

### Authentication Options
- **GitHub Token**: Set `GITHUB_TOKEN` or `GH_TOKEN` environment variable
- **OAuth (Enterprise)**: Configure web-based authentication for shared access
- **GitHub CLI**: Uses existing `gh auth login` tokens automatically

### Configuration Examples
```bash
# Basic setup
export GITHUB_TOKEN=your_token_here

# Enterprise setup with OAuth
export GITHUB_CLIENT_ID=your_client_id
export GITHUB_CLIENT_SECRET=your_client_secret
export BASE_URL=https://your-domain.com

# Beta features + Enterprise monitoring
export BETA=1
export AUDIT_ALL_ACCESS=true
export RATE_LIMIT_API_HOUR=5000
```

---

*Transform your development process with intelligent code research, AI-enhanced analysis, and enterprise-grade security.*
