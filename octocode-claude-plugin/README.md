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
Orchestrates 6 specialized AI agents through a streamlined 4-phase workflow:

```
💭 Requirements → 🏗️ Architecture → 🎯 Planning → 💻 Implementation
```

**You approve at 3 critical gates** - the AI team handles the rest, you verify at the end.

### `/octocode-feature` - Enhance Existing Code
Analyzes existing codebases and safely adds features or fixes bugs through 4 phases:

```
📊 Code Review → 🎯 Analysis → 🎯 Planning → 💻 Implementation
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

**6 specialized agents total**: 4 agents for `/octocode-generate`, 4 agents for `/octocode-feature` (3 agents are shared between both commands)

### For `/octocode-generate` (Build from Scratch)

| Agent | Role | Model | What They Do |
|-------|------|-------|--------------|
| 🎯 **Product Manager** | Requirements | Opus | Asks clarifying questions, creates PRD, researches competitors using Octocode MCP |
| 🏗️ **Architect** | System Design | Opus | Designs complete architecture (backend + frontend), researches proven patterns via Octocode MCP |
| 🔬 **Quality Architect** | Verification Planning | Opus | Creates verification flows and test scenarios, researches testing patterns via Octocode MCP |
| 🎯 **Engineering Manager** | Orchestration | Sonnet | Creates task breakdown, assigns tasks, tracks progress |
| 💻 **Software Engineer** | Implementation | Sonnet | Writes code, follows patterns, ensures build passes (multiple instances work in parallel) |

### For `/octocode-feature` (Enhance Existing Code)

| Agent | Role | Model | What They Do |
|-------|------|-------|--------------|
| 📊 **Code Analyst** | Codebase Review | Sonnet | Analyzes existing code, identifies patterns, assesses quality |
| 🎯 **Feature Analyst** | Impact Analysis | Opus | Critical thinking on changes, researches implementation patterns via Octocode MCP |
| 🎯 **Engineering Manager** | Orchestration | Sonnet | Creates task breakdown, assigns tasks, tracks progress |
| 💻 **Software Engineer** | Implementation | Sonnet | Modifies code following existing patterns (multiple instances) |

**Cost-optimized**: Opus for strategic thinking, Sonnet for analysis and execution

---

## 🔧 Tools Reference

Agents use these tools to do their work:

| Tool | What It Does |
|------|--------------|
| **Read** | Read files from workspace |
| **Write** | Create or overwrite files |
| **Edit** | Make targeted edits to existing files |
| **MultiEdit** | Edit multiple files at once |
| **Grep** | Search for text patterns in files |
| **Glob** | Find files by name patterns |
| **LS** | List directory contents |
| **Bash** | Execute shell commands |
| **BashOutput** | Execute commands and capture output |
| **KillShell** | Terminate running processes |
| **WebFetch** | Fetch content from URLs |
| **WebSearch** | Search the web |
| **TodoWrite** | Create and update task lists |
| **Task** | Spawn child agents (Manager only) |
| **ListMcpResourcesTool** | List octocode-mcp resources |
| **ReadMcpResourceTool** | Access octocode-mcp patterns |

---

## 📖 Example: Build a Blog Platform

```bash
/octocode-generate Build a blog platform with authentication, 
rich text editor, and comments
```

### What Happens Next

**Phase 1: Requirements** → Creates `docs/requirements.md`
- Product Manager asks questions, researches similar apps
- **✋ Gate 1:** You approve requirements

**Phase 2: Architecture** → Creates `docs/design.md` + `docs/test-plan.md`
- Architect designs complete system (backend + frontend), researches proven architectures via Octocode MCP
- Quality Architect creates verification flows (manual testing guide), researches testing patterns via Octocode MCP
- **✋ Gate 2:** You approve architecture
- **✋ Gate 2.5:** You approve verification plan

**Phase 3: Planning** → Creates `docs/tasks.md`
- Engineering Manager breaks project into tasks and assigns work

**Phase 4: Implementation** → Updates `docs/tasks.md` with progress
- 4-5 Software Engineers work in parallel
- **🔄 Gate 3:** Monitor live, pause/continue anytime - Final gate

**After Implementation:**
- You run build/lint checks
- You follow test-plan.md for manual verification
- You commit when ready

**Result: 4 single files (<50KB each) in `docs/`, 3 approval gates, production-ready code**

### What You Get

✅ **4 documentation files** in `docs/` (<50KB each): requirements, design, test-plan, tasks  
✅ **Full-stack application** (Next.js + PostgreSQL)  
✅ **User authentication** (JWT + OAuth)  
✅ **Rich text editor** (TipTap)  
✅ **Comment system** with moderation  
✅ **Responsive design** (mobile-first)  
✅ **TypeScript strict mode**  
✅ **Lint passing**  
✅ **Working MVP** ready for testing phase  
✅ **You approved** at 4 decision gates  
✅ **Each doc** includes "Created by octocode-mcp" footer  

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
| **Specialized Agents** | ✅ 8 specialized | 74 general | Platform | Framework |
| **Approval Gates** | ✅ 4 gates | ⚠️ Basic | ❌ None | ⚠️ YAML |
| **Observability** | ✅ **Best-in-class** | ⚠️ Good | ⚠️ Basic | ⚠️ Good |
| **Critical Thinking** | ✅ **Unique** | ❌ None | ❌ None | ❌ None |
| **Parallel Execution** | ✅ Multiple agents | ⚠️ Basic | ⚠️ Basic | ❌ None |
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

### The 4 Phases (for `/octocode-generate`)

| Phase | Agent | Output | Size | Human Gate |
|-------|-------|--------|------|------------|
| **1. Requirements** | Product Manager | `docs/requirements.md` | <50KB | ✋ Gate 1 |
| **2. Architecture** | Architect + Quality | `docs/design.md` + `docs/test-plan.md` | <50KB each | ✋ Gate 2 + 2.5 |
| **3. Planning** | Manager | `docs/tasks.md` | <50KB | (no gate) |
| **4. Implementation** | 4-5 Engineers | Code + updates to `docs/tasks.md` | - | 🔄 Gate 3 (final) |

**Result: 4 single files (<50KB each) in `docs/`, clear ownership, human control at every gate**

**All docs include footer:** `**Created by octocode-mcp**`

**Note:** Research is integrated into each agent's work using Octocode MCP directly (Product Manager researches during requirements, Architect researches during design, etc.). User verifies manually after implementation.

### The 4 Phases (for `/octocode-feature`)

| Phase | Agent | Output | Size | Human Gate |
|-------|-------|--------|------|------------|
| **1. Code Review** | Code Analyst | `docs/codebase-review.md` | <50KB | ✋ Gate 1 |
| **2. Analysis** | Feature Analyst | `docs/analysis.md` | <50KB | ✋ Gate 2 |
| **3. Planning** | Manager | `docs/tasks.md` | <50KB | (no gate) |
| **4. Implementation** | 4-5 Engineers | Code + updates to `docs/tasks.md` | - | 🔄 Gate 3 (final) |

**Result: 3 single files (<50KB each) in `docs/`, clear ownership, safe changes with human approval**

**All docs include footer:** `**Created by octocode-mcp**`

**Note:** Research is integrated - Feature Analyst uses Octocode MCP during analysis to find proven implementation patterns. User verifies manually after implementation.

### Behind the Scenes

**Task Coordination**: Smart parallelization
```
Manager creates task breakdown
→ Assigns tasks to available engineers
→ Engineers work independently
→ Natural coordination through code structure
→ Progress tracked in tasks.md
```

**Progress Tracking**: Clear visibility in `docs/`
- Task progress in tasks.md (inline status)
- Agent communications logged
- Research queries and sources documented
- Decision reasoning captured
- All files kept under 50KB for optimal AI processing

---

## 📊 Quality Standards

### Parallel Execution Benefits
- Multiple agents work simultaneously
- Smart task coordination
- Efficient orchestration
- Real-time progress monitoring

### Quality Enforcement
- ✅ **Working MVP first** - Focus on functionality
- ✅ **TypeScript strict mode** - Type safety enforced
- ✅ **8.5/10 code quality** - Linting + analysis
- ✅ **Browser tested** - Chrome DevTools verification
- ✅ **Tests after approval** - Add comprehensive tests post-MVP
- ✅ **User controls git** - Agents only modify files, you commit when ready
- ✅ **Optimized docs** - All files <50KB for efficient AI processing

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
| **[FLOW.md](./docs/FLOW.md)** | 🎯 Visual walkthrough of the 4-phase workflow |
| **[agents/](./agents/)** | Individual documentation for all 6 specialized agents |
| **[commands/](./commands/)** | Detailed specifications for both commands |

**Want more details?** Read the [Complete Guide](./docs/COMPLETE_GUIDE.md) for in-depth understanding of the workflow, communication protocols, and state management.

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
