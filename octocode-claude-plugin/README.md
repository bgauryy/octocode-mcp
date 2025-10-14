# 🏗️ Octocode Vibe

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/bgauryy/octocode-mcp)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-%3E%3D1.0.0-purple.svg)](https://claude.com/code)

> **Transform Claude into a complete AI development team that takes your idea from concept to production-ready code**

Turn "Build a blog platform" into a full-stack, tested, production-ready application in **3-5 hours** instead of days. With 8 specialized AI agents, research-driven decisions from 100k+ GitHub repos, and 5 human approval gates to keep you in control.

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

## 🎯 What Is Octocode Vibe?

A **Claude Code plugin** that orchestrates 8 specialized AI agents through a structured 7-phase workflow:

```
💭 Requirements → 🏗️ Architecture + 🎨 UX → ✅ Validation → 🔬 Research 
→ 🎯 Orchestration → 💻 Implementation → ✅ Quality Check
```

**You approve at 5 critical gates** - the AI team handles the rest.

---

## ✨ Why Use Octocode Vibe?

### 🚀 50% Faster Development
- **Traditional**: 8-12 hours for a full-stack app (sequential development)
- **Octocode Vibe**: 3-5 hours (parallel agents working simultaneously)

### 🧠 Research-Driven Decisions
- Analyzes **100k+ GitHub repositories** for best practices
- Evaluates **3+ alternatives** for every major decision
- Critical thinking framework with self-questioning and devil's advocate

### 🎨 Frontend-Backend Harmony
- **Industry first**: Architecture and UX design run **in parallel**
- No more "backend designed without frontend consideration"
- API contracts match UI needs from day one

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
| 🏗️ **Architect** | Backend Design | Opus | Designs architecture, evaluates tech stacks, critical thinking |
| 🎨 **UX Engineer** | Frontend Design | Opus | Creates design system, ensures accessibility, mobile-first |
| ✅ **Tech Lead** | Validation | Sonnet | Reviews architecture, breaks down tasks, detects conflicts |
| 🔬 **Research Specialist** | Best Practices | Sonnet | Finds code examples from top repos, extracts patterns |
| 🎯 **Engineering Manager** | Orchestration | Sonnet | Assigns tasks, prevents conflicts, tracks progress |
| 💻 **Software Engineer** | Implementation | Sonnet | Writes code, follows patterns, self-tests |
| ✅ **QA Engineer** | Quality | Sonnet | Tests in browser, checks security, verifies production-readiness |

**Cost-optimized**: Opus for strategic thinking (3 agents), Sonnet for execution (5 agents)

---

## 📖 Example: Build a Blog Platform

```bash
/octocode-generate Build a blog platform with authentication, 
rich text editor, and comments
```

### What Happens Next

**Phase 1: Requirements** *(2-3 min)*
- Agent asks about user roles, features, tech preferences
- Creates comprehensive PRD with research
- **[Gate 1]** You approve the requirements

**Phase 2: Design** *(10-15 min)*
- Architect + UX work **simultaneously**
- Complete architecture + design system
- **[Gate 2]** You approve both designs

**Phase 3: Planning** *(5 min)*
- Tech Lead breaks into 15-20 atomic tasks
- Detects potential file conflicts
- **[Gate 3]** You approve the plan

**Phase 4: Research** *(10 min)*
- Finds best auth, editor, and comment implementations
- Copy-paste ready examples from top repos

**Phase 5-6: Build** *(2-3 hours)*
- 4-5 engineers work in parallel
- Manager prevents conflicts
- **[Gate 4]** See real-time progress

**Phase 7: Verify** *(20 min)*
- QA tests in Chrome browser
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

| Feature | Octocode Vibe | claude-flow | dify | Microsoft |
|---------|---------------|-------------|------|-----------|
| **Specialized Agents** | ✅ 8 focused | 74 general | Platform | Framework |
| **Approval Gates** | ✅ 5 gates | ⚠️ Basic | ❌ None | ⚠️ YAML |
| **Observability** | ✅ **Best-in-class** | ⚠️ Good | ⚠️ Basic | ⚠️ Good |
| **Critical Thinking** | ✅ **Unique** | ❌ None | ❌ None | ❌ None |
| **Parallel Arch + UX** | ✅ **Industry first** | ❌ None | ❌ None | ❌ None |
| **File Conflict Prevention** | ✅ Atomic locks | ⚠️ Basic | ⚠️ Basic | ❌ None |
| **Browser Testing** | ✅ Chrome DevTools | ❌ None | ⚠️ Limited | ❌ None |

**Verdict**: More focused, better transparency, unique innovations not found elsewhere.

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

| Phase | Duration | What Happens | Gate |
|-------|----------|--------------|------|
| **1. Requirements** | 2-3 min | Product Manager asks questions, creates PRD | ✋ Gate 1 |
| **2. Design** | 10-15 min | Architect + UX work in parallel | ✋ Gate 2 |
| **3. Validation** | 5 min | Tech Lead breaks into tasks | ✋ Gate 3 |
| **4. Research** | 10 min | Find best practices from GitHub | - |
| **5. Orchestration** | 1 min | Manager assigns tasks with file locks | - |
| **6. Implementation** | 2-3 hours | 4-5 engineers work in parallel | ✋ Gate 4 (progress) |
| **7. Quality** | 20 min | QA verifies everything | ✋ Gate 5 |

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

## 📊 Performance & Quality

### Speed Comparison
- **Traditional Sequential**: 8-12 hours
- **Octocode Vibe Parallel**: 3-5 hours
- **Improvement**: **50-60% faster**

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
| **[WORKFLOW_GUIDE.md](./WORKFLOW_GUIDE.md)** | ⭐ Complete workflow, agent roles, file locking system |
| **[FLOW.md](./FLOW.md)** | 🎯 Visual walkthrough of 7-phase workflow |
| **[TECHNICAL_GUIDE.md](./TECHNICAL_GUIDE.md)** | 🔧 Plugin architecture for contributors |
| **[COMMUNICATION_STANDARD.md](./COMMUNICATION_STANDARD.md)** | Inter-agent protocols |
| **[agents/](./agents/)** | Documentation for all 8 agents |

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

🏗️ **Octocode Vibe** - Transform Claude into a complete AI development team

*From idea to production-ready code, research-driven and quality-enforced*
