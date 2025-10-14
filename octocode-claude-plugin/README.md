# 🏗️ Octocode Claude Plugin

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/bgauryy/octocode-mcp)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-%3E%3D1.0.0-purple.svg)](https://claude.com/code)

> **Transform Claude into a complete AI development team that takes your idea from concept to production-ready code**

Turn "Build a blog platform" into a full-stack, tested, production-ready application. With 7 specialized AI agents, research-driven decisions from 100k+ GitHub repos, and 5 human approval gates to keep you in control.

---

## ⚡ Quick Start

```bash
# Install the plugin
/plugin marketplace add bgauryy/octocode-mcp/octocode-claude-plugin
/plugin install octocode
/restart

# Build something amazing
/octocode-generate Build a todo app with React and Express
```

That's it! The AI team will guide you through requirements, design, implementation, and testing.

---

## 🎯 What Is Octocode?

A **Claude Code plugin** that orchestrates 7 specialized AI agents through a structured 7-phase workflow:

```
💭 Requirements → 🏗️ Architecture → ✅ Validation → 🔬 Research 
→ 🎯 Orchestration → 💻 Implementation → ✅ Quality Check
```

**You approve at 5 critical gates** - the AI team handles the rest.

---

## ✨ Why Use Octocode?

### 🚀 Parallel Execution
- Multiple implementation agents work simultaneously
- File locking system prevents conflicts
- Efficient task orchestration for faster development

### 🧠 Research-Driven Decisions
- Analyzes **100k+ GitHub repositories** for best practices
- Evaluates **3+ alternatives** for every major decision
- Critical thinking framework with self-questioning and devil's advocate

### 🔍 Complete Transparency
- See **every decision** with reasoning
- Track **all agent communications**
- Know **which repos influenced** the architecture

### 🔒 Production-Ready Quality
- **80-90% test coverage** enforced
- **WCAG 2.1 AA accessibility** compliance
- Comprehensive verification + browser testing
- Zero file conflicts with atomic locking

---

## 🤖 Meet Your AI Team

| Agent | Role | Model | What They Do |
|-------|------|-------|--------------|
| 🎯 **Product Manager** | Requirements | Opus | Asks clarifying questions, creates PRD, researches competitors |
| 🏗️ **Architect** | System Design | Opus | Designs complete architecture (backend + frontend), evaluates tech stacks, critical thinking |
| ✅ **Tech Lead** | Validation | Sonnet | Reviews architecture, breaks down tasks, detects conflicts |
| 🔬 **Research Specialist** | Best Practices | Sonnet | Finds code examples from top repos, extracts patterns |
| 🎯 **Engineering Manager** | Orchestration | Sonnet | Assigns tasks, prevents conflicts, tracks progress |
| 💻 **Software Engineer** | Implementation | Sonnet | Writes code, follows patterns, self-tests (multiple instances work in parallel) |
| ✅ **QA Engineer** | Quality | Sonnet | Tests in browser, checks security, verifies production-readiness |

**Cost-optimized**: Opus for strategic thinking (2 agents), Sonnet for execution (5 agents)

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
✅ WCAG AA accessible  
✅ 85%+ test coverage  
✅ Production-ready deployment  

---

## 🎨 More Examples

### Mobile App
```bash
/octocode-generate React Native fitness tracker with workout plans, 
progress charts, and social features
```

### Enterprise Dashboard
```bash
/octocode-generate Analytics dashboard with real-time charts, 
user management, and role-based access control
```

### Resume Previous Session
```bash
/octocode-generate --resume
```

---

## 🏆 Comparison with Other Tools

| Feature | Octocode | claude-flow | dify | Microsoft |
|---------|----------|-------------|------|-----------|
| **Specialized Agents** | ✅ 7 focused | 74 general | Platform | Framework |
| **Approval Gates** | ✅ 5 gates | ⚠️ Basic | ❌ None | ⚠️ YAML |
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

### The 7 Phases

| Phase | What Happens | Gate |
|-------|--------------|------|
| **1. Requirements** | Product Manager asks questions, creates PRD | ✋ Gate 1 |
| **2. Architecture** | Architect designs complete system (backend + frontend) | ✋ Gate 2 |
| **3. Validation** | Tech Lead breaks into tasks, detects conflicts | ✋ Gate 3 |
| **4. Research** | Research Specialist finds best practices from GitHub | - |
| **5. Orchestration** | Manager assigns tasks with file locks | - |
| **6. Implementation** | 4-5 Software Engineers work in parallel | ✋ Gate 4 |
| **7. Verification** | QA Engineer verifies everything | ✋ Gate 5 |

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
- ✅ **80-90% test coverage** (enforced)
- ✅ **WCAG 2.1 AA** accessibility (enforced)
- ✅ **8.5/10 code quality** (linting + analysis)
- ✅ **Browser tested** (Chrome DevTools)
- ✅ **Security scanned**

### Cost Optimization
- **Opus (expensive)**: 3 agents for strategic decisions
- **Sonnet (efficient)**: 5 agents for implementation
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
| **[COMPLETE_GUIDE.md](./docs/COMPLETE_GUIDE.md)** | ⭐ Comprehensive guide covering all phases, agents, and systems |
| **[FLOW.md](./docs/FLOW.md)** | 🎯 Visual walkthrough of the 7-phase workflow |
| **[agents/](./agents/)** | Individual documentation for all 7 agents |

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
