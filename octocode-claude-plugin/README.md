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

### Important: Git Operations

**NO GIT COMMANDS:** All agents only modify local files. You (the user) are responsible for all git operations including commits, pushes, branch management, and merges. Agents focus solely on code implementation and file modifications - you stay in control of version control.

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

### 🔍 Complete Transparency & Human Control
- **5-6 single files** - No documentation bloat
- **Clear approval gates** - Human-in-the-loop at critical decisions
- **Live monitoring** - Pause/continue implementation anytime
- See **every decision** with reasoning

### 🔒 Production-Ready Quality
- **Focus on working MVP first** - Build, types, lint
- **Tests added after MVP** - User approves functionality first
- **Efficient documentation** - 5-6 single files, no bloat
- **Human approval gates** - You control every major decision
- Comprehensive verification + browser testing

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

**Phase 1: Requirements** → Creates `requirements.md`
- Product Manager asks questions, researches similar apps
- **✋ Gate 1:** You approve requirements

**Phase 2: Architecture** → Creates `design.md` + `test-plan.md`
- Architect designs complete system (backend + frontend)
- Quality Architect creates test strategy (for reasoning)
- **✋ Gate 2:** You approve architecture
- **✋ Gate 2.5:** You approve test plan

**Phase 3: Validation** → Creates `tasks.md`
- Tech Lead breaks project into atomic tasks
- **✋ Gate 3:** You approve task plan

**Phase 4: Research** → Creates `patterns.md`
- Research Specialist finds best implementations from top repos

**Phase 5-6: Implementation** → Updates `tasks.md` with progress
- 4-5 Software Engineers work in parallel
- **🔄 Gate 4:** Monitor live, pause/continue anytime

**Phase 7: Verification** → Creates `verification.md`
- QA Engineer tests in Chrome browser, runs all checks
- **✋ Gate 5:** Final approval

**Result: 6 single files, 5 approval gates, production-ready code**

### What You Get

✅ **6 documentation files** (requirements, design, test-plan, tasks, patterns, verification)  
✅ **Full-stack application** (Next.js + PostgreSQL)  
✅ **User authentication** (JWT + OAuth)  
✅ **Rich text editor** (TipTap)  
✅ **Comment system** with moderation  
✅ **Responsive design** (mobile-first)  
✅ **TypeScript strict mode**  
✅ **Lint passing**  
✅ **Working MVP** ready for testing phase  
✅ **You approved** at 5 decision gates  

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

| Phase | Agent | Output | Human Gate |
|-------|-------|--------|------------|
| **1. Requirements** | Product Manager | `requirements.md` | ✋ Gate 1 |
| **2. Architecture** | Architect + Quality | `design.md` + `test-plan.md` | ✋ Gate 2 + 2.5 |
| **3. Validation** | Tech Lead | `tasks.md` | ✋ Gate 3 |
| **4. Research** | Research Specialist | `patterns.md` | (parallel) |
| **5. Orchestration** | Manager | Progress tracking | (planning) |
| **6. Implementation** | 4-5 Engineers | Code + updates to `tasks.md` | 🔄 Gate 4 (live) |
| **7. Verification** | QA Engineer | `verification.md` | ✋ Gate 5 |

**Result: 6 single files, clear ownership, human control at every gate**

### The 6 Phases (for `/octocode-feature`)

| Phase | Agent | Output | Human Gate |
|-------|-------|--------|------------|
| **1. Code Review** | Code Analyst | `codebase-review.md` | ✋ Gate 1 |
| **2. Analysis** | Feature Analyst | `analysis.md` | ✋ Gate 2 |
| **3. Research** | Research Specialist | `patterns.md` | (parallel) |
| **4. Planning** | Manager | Progress tracking | (planning) |
| **5. Implementation** | 4-5 Engineers | Code + updates to `tasks.md` | 🔄 Gate 3 (live) |
| **6. Verification** | QA Engineer | `verification.md` | ✋ Final |

**Result: 5 single files, clear ownership, safe changes with human approval**

### Behind the Scenes

**File Locking System**: Prevents conflicts
```
Manager assigns: "Implement auth.ts"
→ Creates: .octocode/locks/auth.ts.lock
→ Engineer 1 works on auth.ts
→ Engineer 2 cannot touch auth.ts
→ Release lock when done
```

**Progress Tracking**: Clear visibility in `.octocode/`
- Task progress in tasks.md (inline status)
- Agent communications logged
- Research queries and sources documented
- Decision reasoning captured

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
- ✅ **User controls git** - Agents only modify files, you commit when ready

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
