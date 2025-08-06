# Octocode MCP

**The Perfect AI Code Assistant - Advanced Search & Discovery Across GitHub**

<div align="center">
  <a href="https://github.com/modelcontextprotocol/servers">
    <img src="https://avatars.githubusercontent.com/u/182288589?s=48&v=4" width="20" height="20" alt="MCP Logo" style="vertical-align: middle; margin-right: 6px;">
    <img src="https://img.shields.io/badge/Model_Context_Protocol-Official_Community_Server-blue?style=flat-square" alt="MCP Community Server" style="vertical-align: middle;">
  </a>
</div>

<div align="center">
  <img src="./assets/logo_white.png" width="400px">
</div>

<div align="center">
  
  
  [![Version](https://img.shields.io/badge/version-4.0.0-blue.svg)](./package.json)
  [![License](https://img.shields.io/badge/license-MIT-green.svg)](./package.json)
  [![X/Twitter](https://img.shields.io/badge/X-Follow%20@guy__bary-1DA1F2.svg?logo=x&logoColor=white)](https://x.com/guy_bary)

</div>

## 📋 Quick Links
- 🌐 **Website**: [octocode.ai](https://octocode.ai)
- 📚 **Technical Details**: [Technical Summary](./docs/summary.md)
- 🐳 **Docker Setup**: [Docker Guide](./docker/README.Docker.md)
- 🐦 **Follow**: [@guy_bary on X](https://x.com/guy_bary)

## 🚀 What is Octocode MCP?

**The perfect AI code assistant for understanding anything in any codebase.** Transform your AI assistant into an expert code researcher with instant access to millions of repositories and packages across GitHub and npm ecosystems. 

**🎯 Generate Quality Context from Any Resource** - Octocode automatically extracts and synthesizes comprehensive context from repositories, issues, PRs, commits, and packages to power superior code analysis, generation, and documentation creation. Turn any codebase into actionable intelligence for your AI assistant.

Discover code through natural language descriptions and intelligent context generation. Perfect for AI-assisted development workflows.

**What Octocode Can Do:**
- **🎯 Create Perfect AI Context** for vibecoding, custom documentation, and complex flow analysis
- **🏢 Works on Private & Public Organizations** - seamlessly access your team's repositories
- **🔄 Cross-Repository Analysis** - understand connections and dependencies across multiple projects
- **💻 Generate Code** - leverage comprehensive context for superior code generation
- **📚 Custom Documentation** - automatically create docs from any codebase or resource

> **🚀 See Octocode in Action:** 
> 
> **Three.js Example Generation:**
> *"Use Octocode to search for Three.js examples, get top examples from top repositories, then create a stunning, hyper-realistic video of a man walking through a futuristic city. Be creative! Blow my mind!"*
> 
>
> **Live Code Example:** [View the generated Three.js implementation →](https://gist.github.com/bgauryy/093f9125937f30b00eac03fba688c008)


## ✨ Key Features & Benefits

**🔄 Dual GitHub Integration** - Works with both GitHub CLI (`gh`) and API tokens (`GITHUB_TOKEN`) for maximum reliability and flexibility (local and hosted)

**🧠 AI-Optimized Design** - Built specifically for AI assistants with:
- **Quality Context Generation** from any repository (private / public), issue, PR, commit, or package
- **Token-efficient responses** 
- **Progressive discovery workflows** that guide exploration
- **Intelligent context synthesis** for superior code analysis and generation
- **Smart hint system** for next-step recommendations

**🛡️ Production-Ready Security** - Automatic secret detection, content sanitization, and organizational permission respect

**🌐 Universal Compatibility** - Cross-platform native support (Windows, macOS, Linux) with multiple deployment options

**🎯 Vibe Coding Excellence** - Perfect for modern AI-assisted development with natural language code discovery

## 🌟 Featured On

### Official MCP Server
[![GitHub stars](https://img.shields.io/github/stars/modelcontextprotocol/servers?style=social)](https://github.com/modelcontextprotocol/servers) **modelcontextprotocol/servers**

### Community Collections
- [![GitHub stars](https://img.shields.io/github/stars/punkpeye/awesome-mcp-servers?style=social)](https://github.com/punkpeye/awesome-mcp-servers) **punkpeye/awesome-mcp-servers**
- [![GitHub stars](https://img.shields.io/github/stars/appcypher/awesome-mcp-servers?style=social)](https://github.com/appcypher/awesome-mcp-servers) **appcypher/awesome-mcp-servers**
- [![GitHub stars](https://img.shields.io/github/stars/Puliczek/awesome-mcp-security?style=social)](https://github.com/Puliczek/awesome-mcp-security) **Puliczek/awesome-mcp-security**

### MCP Directories & Tools
- [![MCP.so](https://img.shields.io/badge/MCP.so-Server%20Directory-green.svg?logo=web)](https://mcp.so/server/octocode/bgauryy)
- [![PulseMCP](https://img.shields.io/badge/PulseMCP-Server%20Registry-red.svg?logo=pulse)](https://www.pulsemcp.com/servers/bgauryy-octocode)
- [![DevTool.io](https://img.shields.io/badge/DevTool.io-Development%20Tool-teal.svg?logo=tools)](https://devtool.io/tool/octocode-mcp)

## 🎯 Who Is This For?

### For Developers
Navigate complex multi-repo architectures, understand organizational issues at scale, and generate custom documentation on-demand from real code examples. Create contextual documentation directly in your IDE, or ask OctoCode to learn from any repository and implement similar patterns in your current project.

### For Product & Engineering Managers
Gain unprecedented visibility into application behavior through semantic code search, track development progress across teams, and understand the real implementation behind product features.

### For Security Researchers
Discover security patterns, vulnerabilities, and compliance issues across both public and private repositories with advanced pattern matching and cross-codebase analysis.

### For Large Organizations
Dramatically increase development velocity by enabling teams to instantly learn from existing codebases, understand cross-team implementations, and replicate proven patterns—transforming institutional knowledge into actionable development acceleration.

### For Beginners & Advanced Vibe Coders
- **Beginners**: Take code from anywhere and understand it deeply. Learn from production codebases, discover proven patterns, and build confidence by seeing how experienced developers solve problems.
- **Advanced Vibe Coders**: Leverage quality context for superior code generation. Use comprehensive understanding from issues, PRs, and documentation to generate production-ready code that follows established patterns.

## 🚀 Installation

**Octocode supports dual GitHub authentication** - works with both GitHub tokens and GitHub CLI for maximum flexibility.

### Quick Install
```bash
# Add to Claude Desktop (recommended)
claude mcp add octocode npx 'octocode-mcp@latest'
```

### Authentication Options

**Option 1: GitHub Token (Best for Production)**
1. Create token at [GitHub Settings > Personal access tokens](https://github.com/settings/tokens)
2. Add to MCP configuration:
```json
"octocode": {
  "command": "npx",
  "args": ["octocode-mcp"],
  "env": {
    "GITHUB_TOKEN": "ghp_YOUR_TOKEN"
  }
}
```

**Option 2: GitHub CLI (Best for Local Development)**
1. Install GitHub CLI: `brew install gh` (macOS) or `winget install GitHub.cli` (Windows)
2. Authenticate: `gh auth login`
3. Add to MCP configuration:
```json
"octocode": {
  "command": "npx",
  "args": ["octocode-mcp"]
}
```

**How It Works:**
- **Token Priority**: `GITHUB_TOKEN` → `GH_TOKEN` → GitHub CLI token (automatic fallback)
- **API Integration**: All GitHub operations use Octokit API with the retrieved token
- **CLI Integration**: GitHub CLI is used only for token retrieval, not for operations
- **Seamless Fallback**: Automatically switches between authentication methods

### Requirements
- **Node.js**: v20+
- **GitHub Authentication**: Token OR GitHub CLI
- **NPM (Optional)**: For package research

## 📦 DXT Extension

This project is available as a **Desktop Extension (DXT)** for easy installation in AI applications like Claude Desktop.

### Quick DXT Setup

```bash
# Install dependencies
yarn install

# Build the DXT package
yarn dxt:pack
```

The generated `octocode-mcp.dxt` file can be installed in Claude Desktop by simply clicking on it.

**DXT Scripts:**
- `yarn dxt:validate` - Validate the manifest.json file
- `yarn dxt:pack` - Build and package the extension
- `yarn dxt:release` - Full release pipeline (build → pack → sign → verify)

## 🛠️ What You Can Do

### 🧠 **Generate Context from Anything, Anywhere**
- **Universal Context Generation** - Extract rich context from ANY resource: live code, PR diffs, commit changes, issue discussions, package docs, or architectural decisions
- **Code-First Best Practices** - Analyze actual implementations (not just docs) to discover real-world patterns, anti-patterns, and proven solutions from top repositories
- **Time-Travel Code Analysis** - Navigate through repository history, compare different versions, and understand how code evolved across commits and releases
- **PR & Commit Content Mining** - Get actual code changes, review comments, and implementation details from pull requests and commit histories
- **Language & Project Universal** - Generate context from any programming language, framework, or project type without configuration

### 🏢 **Organization Intelligence**
- **Private Repository Mastery** - Deep insights into organizational codebases with full access to private repositories and internal projects
- **Cross-Repository Flow Understanding** - Map complex dependencies, data flows, and architectural connections between multiple repositories
- **Enterprise Pattern Recognition** - Discover organizational coding standards, architectural patterns, and best practices across teams
- **Team Knowledge Mining** - Extract institutional knowledge from commit histories, code reviews, and development discussions

### 🔍 **Deep Research & Time-Travel Capabilities**
- **Version Comparison & Time-Travel** - Compare any repository versions across time, analyze how implementations changed, and understand architectural evolution
- **Live Code vs Historical Analysis** - Examine current implementations alongside their historical development through commits and PR changes
- **Best Practices from Real Code** - Extract proven patterns directly from high-quality codebases, not documentation - see how top developers actually implement solutions
- **PR & Commit Deep Dive** - Access actual code diffs, review discussions, implementation rationale, and the complete context behind every change
- **Multi-Dimensional Discovery** - Find implementations using semantic search, code patterns, commit messages, or PR discussions with full context

### 🏗️ **Repository & Project Intelligence**
- **Smart Discovery & Ranking** - Find the most relevant repositories by topic, language, activity, or quality metrics with advanced filtering
- **Project Architecture Mapping** - Navigate and understand complex project structures with intelligent filtering that focuses on essential code
- **Multi-Repository Comparison** - Analyze approaches, patterns, and implementations across multiple projects simultaneously
- **Access & Permission Validation** - Seamlessly work with both public and private organizational repositories

### 📦 **Ecosystem & Dependency Intelligence**
- **Multi-Platform Package Discovery** - Search and analyze NPM, Python, and other ecosystem packages with comprehensive metadata
- **Dependency Flow Analysis** - Understand how packages connect, their repository relationships, and ecosystem interactions
- **Version & Evolution Tracking** - Monitor how packages and their dependencies change over time
- **Repository Bridge Technology** - Seamlessly connect package discoveries to their source repositories for deeper code analysis

## 🏗️ Architecture & Deployment Options

## 🛠️ Available Tools

Octocode provides 8 specialized tools for comprehensive code research:

1. **`github_search_repositories`** - Discover repositories by topic, language, stars, or activity
2. **`github_search_code`** - Find code implementations with semantic search and actual snippets
3. **`github_fetch_content`** - Retrieve complete files or specific sections with context
4. **`github_view_repo_structure`** - Explore project architecture and directory layouts
5. **`github_search_commits`** - Analyze commit history and code evolution with diffs
6. **`github_search_issues`** - Research bugs, features, and project challenges
7. **`github_search_pull_requests`** - Examine code reviews, discussions, and implementations
8. **`package_search`** - Discover NPM and Python packages with repository connections

## 💡 Best Practices & Prompting Guide

### 🚀 **Essential Prompting Patterns**

**1. Start with Octocode Context**
```
Use Octocode to research [your topic]. Do a deep research across repositories, 
PRs, commits, and documentation to generate comprehensive context.
```

**2. Private Organization Access**
```
Focus on repositories from "your-private-organization" organization. 
Analyze internal patterns and organizational best practices.
```

**3. Complex Flow Analysis**
```
Check package X from frontend, trace how it interacts with servers, 
and identify which database schema stores the audit trail. 
Map the complete data flow across repositories.
```

**4. Deep Research Directive**
```
Do a deep research - don't just find surface-level information. 
Analyze commits, PRs, issues, and actual implementations. 
Compare different approaches and extract proven patterns.
```

**5. Documentation Generation**
```
Create a comprehensive .md document from this research. 
Include code examples, architectural decisions, and implementation patterns. 
Use this documentation as context for further analysis.
```

**6. Follow-up Research Strategy**
```
Based on the previous research, now investigate [specific aspect]. 
Build upon the existing context rather than starting from scratch.
```

**7. PR Review with Rules**
```
Review this PR against our documented coding standards and security guidelines. 
Check for compliance with organizational patterns and best practices.
```

**8. Security & Pattern Auditing**
```
Scan our organization's repositories for security vulnerabilities and 
anti-patterns. Focus on authentication, data handling, and access controls.
```

### 🎯 **Smart Prompting Strategy**

**Octocode is built with smart fallbacks and error handling** - it will guide you through research automatically. However, **if you know what you need, help it avoid wasting LLM context on redundant searching:**

#### ✅ **Efficient Prompting**
- **Be Specific**: "Search for Redis caching patterns in TypeScript microservices" vs "Find caching examples"
- **Set Scope**: "Focus on repositories from organization 'company-name'" vs broad searches
- **Define Goals**: "Generate API documentation" vs "Research this API"
- **Use Context**: "Based on the previous research about auth patterns, now find rate limiting implementations"

#### ❌ **Avoid Context Waste**
- Don't repeat broad searches if you already have repository context
- Don't ask for general overviews when you need specific implementations
- Don't search across all repositories when you know the target organization
- Don't start from scratch if you have existing research context

### 🔄 **Progressive Research Workflow**

**Phase 1: Discovery & Context**
```
Use Octocode to discover repositories related to [topic] in [organization]. 
Focus on active projects with recent commits and good documentation.
```

**Phase 2: Deep Analysis**
```
From the discovered repositories, analyze the implementation patterns for [specific feature]. 
Get actual code examples, PR discussions, and commit history.
```

**Phase 3: Documentation & Synthesis**
```
Create comprehensive documentation from the research. Include:
- Architecture overview
- Code examples with explanations  
- Best practices and patterns
- Security considerations
```

**Phase 4: Application & Review**
```
Use the generated documentation to review [new code/PR/implementation]. 
Check for compliance with discovered patterns and organizational standards.
```

### 🏢 **Enterprise Research Patterns**

#### **Organization Intelligence**
- Map coding standards across teams
- Discover internal libraries and shared patterns
- Analyze architectural evolution over time
- Extract institutional knowledge from commit histories

#### **Security Auditing**
- Scan for vulnerability patterns across repositories
- Check compliance with security guidelines
- Analyze access control implementations
- Review authentication and authorization patterns

#### **Cross-Repository Analysis**
- Trace data flows between microservices
- Understand service dependencies and interactions
- Map API contracts and communication patterns
- Analyze deployment and infrastructure patterns



### Hosted/Production Deployment
**Perfect for:** Team environments, Docker containers, CI/CD, hosted AI services

- **Authentication:** GitHub Personal Access Tokens or GitHub App tokens
- **Rate Limits:** 5,000 requests/hour (can be higher with GitHub Apps)
- **Access:** Controlled by token scope and permissions
- **Setup:** Set `GITHUB_TOKEN` environment variable

## 🐳 Docker Support

Run Octocode MCP in a Docker container while maintaining full GitHub authentication. Perfect for consistent environments and deployment.

[**See Docker Setup Guide →**](./docker/README.Docker.md)


> **📚 For detailed technical architecture, tool specifications, and implementation details, see [Technical Summary](./docs/summary.md)**

## 🛡️ Security & Privacy

### Enterprise Security
- **🛡️ Advanced Content Protection** - Multi-layer input validation and intelligent content sanitization
- **🔐 Comprehensive Secret Detection** - Automatic detection and redaction of API keys, tokens, credentials, and sensitive patterns
- **⚪ Safe Commands Only** - Pre-approved GitHub CLI and NPM commands with parameter validation
- **🧹 Malicious Content Filtering** - Automatic detection and sanitization of potentially harmful code patterns
- **🔍 Security Pattern Analysis** - Built-in tools for identifying security vulnerabilities and compliance issues

> **📚 For comprehensive security architecture details, see [Technical Summary](./docs/summary.md)**

## 📄 License

MIT License - See [LICENSE](./LICENSE.md) for details.

---