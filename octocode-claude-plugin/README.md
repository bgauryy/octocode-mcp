# 🏗️ Octocode Claude Plugin

[![Version](https://img.shields.io/badge/version-1.0.0--beta-orange.svg)](https://github.com/bgauryy/octocode-mcp)
[![Status](https://img.shields.io/badge/status-BETA-yellow.svg)](https://github.com/bgauryy/octocode-mcp)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-%3E%3D1.0.0-purple.svg)](https://claude.com/code)

> **⚠️ BETA: Still being optimized**

> **Transform Claude into a complete AI development team that takes your idea from concept to production-ready code**

Turn "Build a blog platform" into a full-stack, tested, production-ready application. With specialized AI agents, research-driven decisions from 100k+ GitHub repos, and human approval gates to keep you in control.

---

## ⚡ Quick Start

```bash
# Install the plugin
/plugin marketplace add bgauryy/octocode-mcp/octocode-claude-plugin
/plugin install octocode
/restart

# Build something amazing from scratch
/octocode-generate Build a todo app with React and Express

# Or add features to existing code
/octocode-feature Add user profile page with avatar upload
```

That's it! The AI team will guide you through requirements, design, implementation, and testing.

---

## 🎯 What Is Octocode?

A **Claude Code plugin** that provides **two powerful commands**:

### `/octocode-generate` - Build from Scratch
Orchestrates 7 specialized AI agents through a structured 7-phase workflow:

```
💭 Requirements → 🏗️ Architecture → ✅ Validation → 🔬 Research 
→ 🎯 Orchestration → 💻 Implementation → ✅ Quality Check
```

**You approve at 5 critical gates** - the AI team handles the rest.

### `/octocode-feature` - Enhance Existing Code
Analyzes existing codebases and safely adds features or fixes bugs through 6 phases:

```
📊 Code Review → 🎯 Analysis → 🔬 Research → 🎯 Planning
→ 💻 Implementation → ✅ Verification
```

**You approve at 3 critical gates** - perfect for production codebases.

---

## ✨ Why Use Octocode?

### 🚀 Parallel Execution
- Multiple implementation agents work simultaneously
- Smart task distribution prevents conflicts
- MVP-first approach: working code before tests

### 🧠 Research-Driven Decisions
- Analyzes **100k+ GitHub repositories** for best practices
- Evaluates **3+ alternatives** for every major decision
- Critical thinking framework with self-questioning and devil's advocate

### 🔍 Complete Transparency
- See **every decision** with reasoning
- Track **all agent communications**
- Know **which repos influenced** the architecture

### 🔒 Production-Ready Quality
- **Focus on working MVP first** - Build, types, lint
- **Tests added after MVP** - User approves functionality first
- Comprehensive verification + browser testing
- Smart task distribution for parallel work

---

## 🤖 Meet Your AI Team

**9 specialized agents total**: 7 agents for `/octocode-generate`, 6 agents for `/octocode-feature` (5 agents are shared between both commands)

### For `/octocode-generate` (Build from Scratch)

| Agent | Role | Model | What They Do |
|-------|------|-------|--------------|
| 🎯 **Product Manager** | Requirements | Opus | Asks clarifying questions, creates PRD, researches competitors |
| 🏗️ **Architect** | System Design | Opus | Designs complete architecture (backend + frontend), evaluates tech stacks, critical thinking |
| ✅ **Tech Lead** | Validation | Sonnet | Reviews architecture, breaks down tasks, detects conflicts |
| 🔬 **Research Specialist** | Best Practices | Sonnet | Finds code examples from top repos, extracts patterns |
| 🎯 **Engineering Manager** | Orchestration | Sonnet | Assigns tasks, prevents conflicts, tracks progress |
| 💻 **Software Engineer** | Implementation | Sonnet | Writes code, follows patterns, ensures build passes (multiple instances work in parallel) |
| ✅ **QA Engineer** | Quality | Sonnet | Tests in browser, checks security, verifies production-readiness |

### For `/octocode-feature` (Enhance Existing Code)

| Agent | Role | Model | What They Do |
|-------|------|-------|--------------|
| 📊 **Code Analyst** | Codebase Review | Sonnet | Analyzes existing code, identifies patterns, assesses quality |
| 🎯 **Feature Analyst** | Impact Analysis | Opus | Critical thinking on changes, assesses risks, plans implementation |
| 🔬 **Research Specialist** | Best Practices | Sonnet | Finds implementation patterns matching existing code style |
| 🎯 **Engineering Manager** | Orchestration | Sonnet | Coordinates parallel work, manages file locks |
| 💻 **Software Engineer** | Implementation | Sonnet | Modifies code following existing patterns (multiple instances) |
| ✅ **QA Engineer** | Quality | Sonnet | Tests changes, verifies no regression in existing features |

**Cost-optimized**: Opus for strategic thinking, Sonnet for analysis and execution

---

## 📖 Example: Build a Blog Platform

```bash
/octocode-generate Build a blog platform with authentication, 
rich text editor, and comments
```

### What Happens Next

**Phase 1: Requirements**
- Product Manager asks about user roles, features, tech preferences
- Creates comprehensive PRD with research from GitHub
- **[Gate 1]** You approve the requirements

**Phase 2: Architecture**
- Architect designs complete system (backend + frontend)
- Evaluates alternatives with critical thinking framework
- **[Gate 2]** You approve the architecture

**Phase 3: Validation**
- Tech Lead breaks project into atomic tasks
- Detects potential file conflicts
- **[Gate 3]** You approve the task plan

**Phase 4: Research**
- Research Specialist finds best auth, editor, and comment implementations
- Creates copy-paste ready examples from top repos

**Phase 5-6: Implementation**
- 4-5 Software Engineers work in parallel
- Engineering Manager orchestrates and prevents conflicts
- **[Gate 4]** Monitor real-time progress

**Phase 7: Verification**
- QA Engineer tests in Chrome browser
- Runs security checks, linting, tests
- **[Gate 5]** Final approval

### What You Get

✅ Full-stack application (Next.js + PostgreSQL)  
✅ User authentication (JWT + OAuth)  
✅ Rich text editor (TipTap)  
✅ Comment system with moderation  
✅ Responsive design (mobile-first)  
✅ TypeScript strict mode  
✅ Lint passing  
✅ Working MVP ready for testing phase  

---

## 🎨 More Examples

### Build Mobile App from Scratch
```bash
/octocode-generate React Native fitness tracker with workout plans, 
progress charts, and social features
```

### Build Enterprise Dashboard from Scratch
```bash
/octocode-generate Analytics dashboard with real-time charts, 
user management, and role-based access control
```

### Add Feature to Existing App
```bash
/octocode-feature Add dark mode toggle with user preference persistence
```

### Fix Bug in Existing App
```bash
/octocode-feature Fix: User login not working on Safari mobile
```

### Resume Previous Session
```bash
/octocode-generate --resume
# or
/octocode-feature --resume
```

---

## 🏆 Comparison with Other Tools

| Feature | Octocode | claude-flow | dify | Microsoft |
|---------|----------|-------------|------|-----------|
| **Specialized Agents** | ✅ 9 specialized | 74 general | Platform | Framework |
| **Approval Gates** | ✅ 3-5 gates | ⚠️ Basic | ❌ None | ⚠️ YAML |
| **Observability** | ✅ **Best-in-class** | ⚠️ Good | ⚠️ Basic | ⚠️ Good |
| **Critical Thinking** | ✅ **Unique** | ❌ None | ❌ None | ❌ None |
| **File Conflict Prevention** | ✅ Atomic locks | ⚠️ Basic | ⚠️ Basic | ❌ None |
| **Browser Testing** | ✅ Chrome DevTools | ❌ None | ⚠️ Limited | ❌ None |
| **Research-Driven** | ✅ GitHub analysis | ⚠️ Limited | ❌ None | ❌ None |

**Verdict**: More focused, better transparency, unique innovations.

---

## 🚀 Installation

### Prerequisites
- **Claude Code** >= 1.0.0
- **Node.js** >= 18.0.0
- Active **Anthropic API key**

```bash
# Check versions
claude --version
node --version
```

### Install from GitHub (Recommended)

```bash
# In Claude Code
/plugin marketplace add bgauryy/octocode-mcp/octocode-claude-plugin
/plugin install octocode
/restart
```

### Verify Installation

```bash
# Check plugin is installed
/plugin list

# Test it works
/octocode-generate Build a simple calculator
```

Expected: agent-product starts asking clarifying questions.

### Alternative: Local Installation (For Development)

```bash
# Clone repository
git clone https://github.com/bgauryy/octocode-mcp.git
cd octocode-mcp/octocode-claude-plugin

# Install in Claude Code
/plugin add .
/restart
```

---

## 🔧 How It Works

### The 7 Phases (for `/octocode-generate`)

| Phase | What Happens | Gate |
|-------|--------------|------|
| **1. Requirements** | Product Manager asks questions, creates PRD | ✋ Gate 1 |
| **2. Architecture** | Architect designs complete system (backend + frontend) | ✋ Gate 2 |
| **3. Validation** | Tech Lead breaks into tasks, detects conflicts | ✋ Gate 3 |
| **4. Research** | Research Specialist finds best practices from GitHub | - |
| **5. Orchestration** | Manager assigns tasks with file locks | - |
| **6. Implementation** | 4-5 Software Engineers work in parallel | ✋ Gate 4 |
| **7. Verification** | QA Engineer verifies everything | ✋ Gate 5 |

### The 6 Phases (for `/octocode-feature`)

| Phase | What Happens | Gate |
|-------|--------------|------|
| **1. Code Review** | Code Analyst analyzes existing codebase | ✋ Gate 1 |
| **2. Analysis** | Feature Analyst assesses impact and risks | ✋ Gate 2 |
| **3. Research** | Research Specialist finds implementation patterns | - |
| **4. Planning** | Manager creates execution plan with file locks | - |
| **5. Implementation** | 4-5 Software Engineers work in parallel | ✋ Gate 3 |
| **6. Verification** | QA Engineer tests changes and regression | - |

### Behind the Scenes

**File Locking System**: Prevents conflicts
```
Manager assigns: "Implement auth.ts"
→ Creates: .octocode/locks/auth.ts.lock
→ Engineer 1 works on auth.ts
→ Engineer 2 cannot touch auth.ts
→ Release lock when done
```

**Observability**: Everything logged to `.octocode/debug/`
- Decisions with reasoning
- Agent communications
- Research queries and sources
- Timeline and performance metrics

**State Persistence**: Resume anytime
```bash
/octocode-generate --resume
```

---

## 📊 Quality Standards

### Parallel Execution Benefits
- Multiple agents work simultaneously
- Atomic file locking prevents conflicts
- Efficient task orchestration
- Real-time progress monitoring

### Quality Enforcement
- ✅ **Working MVP first** - Focus on functionality
- ✅ **TypeScript strict mode** - Type safety enforced
- ✅ **8.5/10 code quality** - Linting + analysis
- ✅ **Browser tested** - Chrome DevTools verification
- ✅ **Tests after approval** - Add comprehensive tests post-MVP

### Cost Optimization
- **Opus (expensive)**: 2-3 agents for strategic decisions (depends on command)
- **Sonnet (efficient)**: 4-6 agents for analysis and implementation
- **Research-driven**: Reduces trial-and-error costs

---

## 🔌 Technology Stack

### Required: octocode-mcp
**Research-driven development with GitHub code search**

The plugin uses octocode-mcp to:
- ✅ Search 100M+ GitHub repositories for best practices
- ✅ Access curated development resources
- ✅ Extract implementation patterns from top repos
- ✅ Find similar successful projects

**Resources include**: Architecture, frontend/backend frameworks, databases, testing, security, infrastructure, and real-world examples.

📚 **Explore resources**: https://github.com/bgauryy/octocode-mcp/tree/main/resources

### Optional: chrome-devtools-mcp
**Browser testing for production verification**

Enables the QA agent to:
- Launch and test in Chrome
- Monitor console errors
- Verify UI rendering
- Check performance metrics (LCP, FID, CLS)

---

## 📚 Documentation

| Doc | Description |
|-----|-------------|
| **[COMPLETE_GUIDE.md](./docs/COMPLETE_GUIDE.md)** | ⭐ Comprehensive guide for `/octocode-generate` workflow |
| **[FLOW.md](./docs/FLOW.md)** | 🎯 Visual walkthrough of the 7-phase workflow |
| **[agents/](./agents/)** | Individual documentation for all 9 specialized agents |
| **[commands/](./commands/)** | Detailed specifications for both commands |

**Want more details?** Read the [Complete Guide](./docs/COMPLETE_GUIDE.md) for in-depth understanding of the workflow, communication protocols, file locking, and state management.

---

## 🛠️ Troubleshooting

**Plugin not found?**
```bash
/plugin marketplace add bgauryy/octocode-mcp/octocode-claude-plugin
/plugin list
```

**MCP tools missing?**
```bash
# Check Node.js version
node --version  # Should be >= 18.0.0

# Test MCP server
npx -y octocode-mcp@latest

# Check logs
cat ~/.claude/logs/mcp-*.log
```

**Commands not working?**
```bash
# Reinstall clean
/plugin uninstall octocode
/restart
/plugin install octocode
```

**More help**: See [GitHub Issues](https://github.com/bgauryy/octocode-mcp/issues) or [Discussions](https://github.com/bgauryy/octocode-mcp/discussions)

---

## 🌟 Roadmap

### v1.1 - Coming Soon
- Workflow templates (quick-prototype, mvp, production-grade)
- Performance metrics collection
- Real-time dashboard streaming

### v1.2
- Dynamic workflow modification
- Cost tracking and optimization
- Load testing integration

### v2.0
- Visual architecture diagrams (Mermaid)
- Pattern validation sandbox
- Multi-language support

---

## 💡 Support & Community

- **Issues**: [Report bugs](https://github.com/bgauryy/octocode-mcp/issues)
- **Discussions**: [Ask questions](https://github.com/bgauryy/octocode-mcp/discussions)
- **Email**: bgauryy@gmail.com

---

## 📄 License

MIT License - Free to use, modify, and distribute.

---

**Made with ❤️ by Guy Bary**

🏗️ **Octocode** - Transform Claude into a complete AI development team

*From idea to production-ready code, research-driven and quality-enforced*
