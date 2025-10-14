# Claude Code Plugins & Marketplace Examples

> A curated list of Claude Code plugins, marketplaces, and resources for building AI-powered development tools.

**Last Updated**: October 14, 2025

---

## 📚 Table of Contents

- [Official Resources](#official-resources)
- [Official Anthropic Plugins](#official-anthropic-plugins)
- [Community Plugins](#community-plugins)
- [Marketplace Examples](#marketplace-examples)
- [Plugin Structure Examples](#plugin-structure-examples)
- [Integration Examples](#integration-examples)
- [Learning Resources](#learning-resources)

---

## 🏛️ Official Resources

### Documentation
- **Official Docs**: https://docs.anthropic.com/en/docs/claude-code/overview
- **Plugin Reference**: https://docs.anthropic.com/en/docs/claude-code/plugins-reference
- **Plugin Marketplaces Guide**: https://github.com/ericbuess/claude-code-docs/blob/main/docs/plugin-marketplaces.md
- **Official Repository**: https://github.com/anthropics/claude-code

### Schema & Specifications
- **Marketplace Schema**: https://anthropic.com/claude-code/marketplace.schema.json
- **CLI Reference**: https://docs.anthropic.com/en/docs/claude-code/cli-reference

### Installation
```bash
npm install -g @anthropic-ai/claude-code
```

### Community
- **Discord**: https://anthropic.com/discord
- **NPM Package**: https://www.npmjs.com/package/@anthropic-ai/claude-code
- **GitHub Issues**: https://github.com/anthropics/claude-code/issues

---

## 🎯 Official Anthropic Plugins

These are the official plugins maintained by Anthropic, serving as excellent reference implementations.

### 1. Agent SDK Development
- **Repository**: https://github.com/anthropics/claude-code/tree/main/plugins/agent-sdk-dev
- **Description**: Development kit for working with the Claude Agent SDK
- **Category**: Development
- **Features**:
  - SDK verifier agents (Python & TypeScript)
  - New SDK app scaffolding commands
  - Development workflow automation

### 2. Feature Development
- **Repository**: https://github.com/anthropics/claude-code/tree/main/plugins/feature-dev
- **Description**: Comprehensive feature development workflow with specialized agents
- **Category**: Development
- **Author**: Sid Bidasaria
- **Features**:
  - Code Explorer agent - traces through code comprehensively
  - Code Architect agent - designs feature architectures
  - Code Reviewer agent - ensures quality and best practices
  - Multi-phase development workflow
  - Progressive refinement approach

**Key Agents**:
```markdown
- code-explorer.md: Maps architecture and abstractions
- code-architect.md: Designs implementation blueprints
- code-reviewer.md: Reviews for simplicity, bugs, and conventions
```

### 3. PR Review Toolkit
- **Repository**: https://github.com/anthropics/claude-code/tree/main/plugins/pr-review-toolkit
- **Description**: Comprehensive PR review agents
- **Category**: Productivity
- **Features**:
  - Comment quality analysis
  - Test coverage review
  - Error handling verification
  - Type design assessment
  - Code quality checks
  - Code simplification suggestions

### 4. Commit Commands
- **Repository**: https://github.com/anthropics/claude-code/tree/main/plugins/commit-commands
- **Description**: Git commit workflow automation
- **Category**: Productivity
- **Features**:
  - Smart commit message generation
  - Automated push workflows
  - PR creation helpers

### 5. Security Guidance
- **Repository**: https://github.com/anthropics/claude-code/tree/main/plugins/security-guidance
- **Description**: Security reminder hooks for code editing
- **Category**: Security
- **Author**: David Dworken
- **Features**:
  - Command injection detection
  - XSS vulnerability warnings
  - Unsafe code pattern detection
  - Real-time security alerts

---

## 🌟 Community Plugins

### Knowledge Management

#### Tesseract Knowledge System
- **Repository**: https://github.com/HermeticOrmus/tesseract-knowledge-system
- **Author**: Ormus
- **Stars**: ⭐ Active development
- **Description**: Self-updating documentation and best practices system
- **Features**:
  - Auto-fetch Claude Code updates weekly
  - Relevance filtering (0-1 score)
  - Guided implementation
  - Adoption tracking
  - Best practices curation
- **Keywords**: knowledge-management, documentation, auto-update, learning
- **Installation**:
  ```bash
  /plugin marketplace add HermeticOrmus/tesseract-knowledge-system
  /plugin install tesseract-knowledge-system
  ```

### Development Tools

#### Firebase Genkit Plugin
- **Repository**: https://github.com/amitpatole/claude-genkit-plugin
- **Author**: Amit Patole
- **Stars**: ⭐ 3
- **Description**: Firebase Genkit integration for Claude Code
- **Category**: Development
- **Use Case**: AI-powered Firebase application development

#### Context Manager (DotAI)
- **Repository**: https://github.com/udecode/dotai
- **Stars**: ⭐ 1,036
- **Description**: Context Manager for Claude Code Plugins + Codex + Cursor
- **Features**:
  - Cross-platform context management
  - Plugin coordination
  - Enhanced context awareness
- **Keywords**: productivity, automation, context-management

### Code Review & Quality

#### Review Toolkit
- **Repository**: https://github.com/revsystem/claude-code-plugins
- **Description**: Document and code review plugins
- **Features**:
  - Article reviewer agent
  - Official document checker
  - AWS documentation MCP server integration
- **Structure**:
  ```
  .claude-plugin/
    marketplace.json
  agents/
    article-reviewer.md
    official-document-checker.md
  commands/
    document-reviewer.md
  mcps/
    aws-documentation-mcp-server.json
  ```

---

## 🏪 Marketplace Examples

### Official Anthropic Marketplace
**Source**: https://github.com/anthropics/claude-code/blob/main/.claude-plugin/marketplace.json

```json
{
  "$schema": "https://anthropic.com/claude-code/marketplace.schema.json",
  "name": "claude-code-plugins",
  "version": "1.0.0",
  "description": "Bundled plugins for Claude Code",
  "owner": {
    "name": "Anthropic",
    "email": "support@anthropic.com"
  },
  "plugins": [
    {
      "name": "agent-sdk-dev",
      "description": "Development kit for Claude Agent SDK",
      "source": "./plugins/agent-sdk-dev",
      "category": "development"
    },
    {
      "name": "pr-review-toolkit",
      "description": "Comprehensive PR review agents",
      "version": "1.0.0",
      "source": "./plugins/pr-review-toolkit",
      "category": "productivity"
    },
    {
      "name": "commit-commands",
      "description": "Git commit workflows",
      "version": "1.0.0",
      "source": "./plugins/commit-commands",
      "category": "productivity"
    },
    {
      "name": "feature-dev",
      "description": "Feature development workflow",
      "version": "1.0.0",
      "source": "./plugins/feature-dev",
      "category": "development"
    },
    {
      "name": "security-guidance",
      "description": "Security reminder hooks",
      "version": "1.0.0",
      "source": "./plugins/security-guidance",
      "category": "security"
    }
  ]
}
```

### Community Marketplace Examples

#### Personal Plugin Collections
- **kimgyurae**: https://github.com/kimgyurae/claude-code-plugins
- **dviersel**: https://github.com/dviersel/claude-code-plugins
- **lambda-hj**: https://github.com/lambda-hj/codeplugins
- **comeonzhj**: https://github.com/comeonzhj/comeonzhj-cc-marketplace
- **Kamalnrf**: https://github.com/Kamalnrf/claude-plugins (Manage all plugins in one place)
- **dennisxnew**: https://github.com/dennisxnew/claude_code_plugin

#### Team/Organization Marketplaces
- **UtakataKyosui**: https://github.com/UtakataKyosui/UtakataClaudePlugin (Japanese language plugins)

---

## 🏗️ Plugin Structure Examples

### Minimal Plugin Structure
```
my-plugin/
├── .claude-plugin/
│   └── plugin.json          # Required
├── agents/
│   └── my-agent.md
└── README.md
```

**Example plugin.json**:
```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "Brief plugin description",
  "author": {
    "name": "Your Name",
    "email": "email@example.com"
  }
}
```

### Complete Plugin Structure
```
enterprise-plugin/
├── .claude-plugin/
│   ├── plugin.json          # Plugin manifest
│   └── marketplace.json     # Marketplace config
├── agents/
│   ├── security-reviewer.md
│   ├── code-explorer.md
│   └── architect.md
├── commands/
│   ├── core/
│   │   └── deploy.md
│   └── experimental/
│       └── preview.md
├── hooks/
│   └── post-write.md
├── mcps/
│   └── database-server.json
├── scripts/
│   └── validate.sh
├── config/
│   └── config.json
├── README.md
├── LICENSE
└── CHANGELOG.md
```

### Agent Definition Example

**File**: `agents/code-architect.md`

```markdown
---
name: code-architect
description: Designs feature architectures by analyzing existing patterns
tools: Glob, Grep, LS, Read, WebFetch, TodoWrite
model: sonnet
color: green
---

You are a senior software architect who delivers comprehensive, 
actionable architecture blueprints.

## Core Process

1. **Codebase Pattern Analysis**
   Extract existing patterns and conventions

2. **Architecture Design**
   Design complete feature architecture

3. **Implementation Blueprint**
   Specify files, components, and integration points

## Output Guidance

Deliver decisive, complete architecture blueprint including:
- Patterns & Conventions Found
- Architecture Decision
- Component Design
- Implementation Map
- Build Sequence
```

### Command Definition Example

**File**: `commands/feature-dev.md`

```markdown
---
description: Guided feature development workflow
argument-hint: Optional feature description
---

# Feature Development

You are helping implement a new feature. Follow systematic approach:

## Phase 1: Discovery
- Understand requirements
- Create todo list

## Phase 2: Codebase Exploration
- Launch code-explorer agents
- Map architecture

## Phase 3: Architecture Design
- Design implementation
- Present options

## Phase 4: Implementation
- Build feature
- Follow conventions
```

---

## 🔌 Integration Examples

### Editor Integrations

#### Neovim Integration
- **Repository**: https://github.com/greggh/claude-code.nvim
- **Stars**: ⭐ 1,434
- **Description**: Seamless Claude Code integration for Neovim
- **Cost**: Built using Claude Code for $5.42 with 17m 12.9s API time
- **Features**:
  - Native Neovim integration
  - Command palette
  - Real-time AI assistance

#### VSCode/Cursor Integration
- **Context Manager (dotai)**: https://github.com/udecode/dotai
- **Description**: Works across Claude Code Plugins, Codex, and Cursor

### Game Engine Integrations

#### Unity MCP
- **Repository**: https://github.com/CoderGamester/mcp-unity
- **Stars**: ⭐ 1,024
- **Description**: Model Context Protocol plugin for Unity Editor
- **Support**: OpenAI, Gemini, Claude, Deepseek, Grok
- **Features**:
  - Unity Editor integration
  - Scene manipulation
  - Game development automation

#### Unity MCP Alternative
- **Repository**: https://github.com/IvanMurzak/Unity-MCP
- **Stars**: ⭐ 451
- **Description**: MCP Server + Plugin for Unity Editor and games
- **Features**:
  - Client connection support (Claude Desktop, Cursor, etc.)
  - Game runtime integration

### Research & Academic Tools

#### Zotero Integration
- **Repository**: https://github.com/papersgpt/papersgpt-for-zotero
- **Stars**: ⭐ 1,903
- **Description**: Powerful Zotero AI and MCP plugin
- **AI Support**: ChatGPT, Gemini, Claude, Grok, DeepSeek, OpenRouter, and more
- **Use Case**: Academic research and paper management

---

## 📖 Learning Resources

### Comprehensive Guides

#### Official Documentation
1. **Plugin Development Guide**: https://docs.anthropic.com/en/docs/claude-code/plugins
2. **Plugin Reference**: https://docs.anthropic.com/en/docs/claude-code/plugins-reference
3. **Marketplace Guide**: https://github.com/ericbuess/claude-code-docs/blob/main/docs/plugin-marketplaces.md
4. **Settings Reference**: https://docs.anthropic.com/en/docs/claude-code/settings

#### Community Resources
- **Awesome Claude Code**: https://github.com/ericbuess/claude-code-docs/blob/main/docs/awesome/awesome-claude-code.md
- **Claude Code Templates**: https://github.com/davila7/claude-code-templates

### Development Workflow Documentation

#### Testing & Validation
```bash
# Validate plugin syntax
claude plugin validate .

# Add marketplace for testing
/plugin marketplace add ./path/to/marketplace

# Install test plugin
/plugin install test-plugin@marketplace-name
```

#### Team Setup
**File**: `.claude/settings.json`
```json
{
  "extraKnownMarketplaces": {
    "team-tools": {
      "source": {
        "source": "github",
        "repo": "your-org/claude-plugins"
      }
    }
  },
  "enabledPlugins": ["team-plugin-1", "team-plugin-2"]
}
```

---

## 🚀 Quick Start Guide

### For Plugin Users

1. **Install Claude Code**:
   ```bash
   npm install -g @anthropic-ai/claude-code
   ```

2. **Add a marketplace**:
   ```bash
   claude
   /plugin marketplace add anthropics/claude-code
   ```

3. **Browse and install plugins**:
   ```bash
   /plugin
   /plugin install feature-dev
   ```

### For Plugin Developers

1. **Create plugin structure**:
   ```bash
   mkdir -p my-plugin/.claude-plugin
   cd my-plugin
   ```

2. **Create plugin.json**:
   ```json
   {
     "name": "my-plugin",
     "version": "1.0.0",
     "description": "My awesome plugin",
     "author": {
       "name": "Your Name"
     }
   }
   ```

3. **Add agents/commands**:
   ```bash
   mkdir agents commands
   # Create .md files with YAML frontmatter
   ```

4. **Test locally**:
   ```bash
   /plugin marketplace add ./my-plugin
   /plugin install my-plugin
   ```

5. **Publish to GitHub**:
   ```bash
   git init
   git add .
   git commit -m "Initial plugin"
   git remote add origin https://github.com/user/my-plugin.git
   git push -u origin main
   ```

6. **Share with others**:
   ```bash
   /plugin marketplace add user/my-plugin
   ```

---

## 🎯 Plugin Categories

### By Use Case

**Development**:
- agent-sdk-dev (Official)
- feature-dev (Official)
- Firebase Genkit Plugin

**Productivity**:
- pr-review-toolkit (Official)
- commit-commands (Official)
- Tesseract Knowledge System

**Security**:
- security-guidance (Official)

**Quality Assurance**:
- Code review agents
- Testing automation

**Documentation**:
- Document review systems
- Knowledge management

**Integration**:
- Unity MCP
- Zotero Integration
- Neovim Integration

### By Technology

**Game Development**:
- Unity MCP (2 implementations)

**Research & Academic**:
- Zotero Integration

**Editor Integration**:
- Neovim
- VSCode/Cursor (via dotai)

**Backend Services**:
- Firebase Genkit
- AWS Documentation MCP

---

## 📊 Statistics & Insights

### Most Popular Plugins (by GitHub Stars)
1. Zotero Integration - ⭐ 1,903
2. Neovim Integration - ⭐ 1,434
3. DotAI (Context Manager) - ⭐ 1,036
4. Unity MCP (CoderGamester) - ⭐ 1,024
5. Unity MCP (IvanMurzak) - ⭐ 451

### Official Plugins Adoption
All official Anthropic plugins are bundled with Claude Code installation, providing immediate access to:
- Feature development workflows
- PR review automation
- Git commit helpers
- Security guidance
- SDK development tools

---

## 🔗 Additional Resources

### MCP (Model Context Protocol) Resources
- **MCP Documentation**: https://modelcontextprotocol.io/
- **MCP TypeScript SDK**: https://github.com/modelcontextprotocol/typescript-sdk
- **MCP Server Examples**: https://github.com/anthropics/anthropic-quickstarts

### Related Projects
- **AI Workspace (AIaW)**: https://github.com/NitroRCr/AIaW (⭐ 1,363)
- **GPT Neovim**: https://github.com/Robitx/gp.nvim (⭐ 1,280)
- **PyGPT Desktop**: https://github.com/szczyglis-dev/py-gpt (⭐ 1,269)

---

## 🤝 Contributing

### To This Document
This document is maintained as part of the Octocode-MCP project. To contribute:
1. Submit issues or PRs to https://github.com/bgauryy/octocode-mcp
2. Add new plugin examples with complete information
3. Update outdated links or descriptions
4. Share your own plugin implementations

### To Claude Code Ecosystem
1. Create plugins following official guidelines
2. Share on GitHub with clear documentation
3. Submit to community marketplaces
4. Join Claude Developers Discord
5. Report bugs via `/bug` command

---

## 📝 Notes

- All examples are as of October 14, 2025
- Star counts are approximate at time of documentation
- Official plugins are maintained by Anthropic
- Community plugins are maintained by their respective authors
- Always verify plugin security before installation
- Test plugins in development environment first

---

## 📄 License

This documentation is part of the Octocode-MCP project and follows the same license.

For Claude Code license information, see: https://www.anthropic.com/legal/commercial-terms

---

**Maintained by**: Guy Bary (bgauryy@gmail.com)  
**Project**: Octocode-MCP  
**Repository**: https://github.com/bgauryy/octocode-mcp

