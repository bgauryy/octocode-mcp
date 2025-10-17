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
/plugin marketplace add bgauryy/octocode-mcp
```

That's it! The AI team will guide you through the workflow.

---

## 🎯 What Is Octocode?

A **Claude Code plugin** that provides **three powerful commands**:

### `/octocode-generate-quick` - Build Fast ⚡ NEW!
**FASTEST**: Single planning agent creates complete spec → 1 approval gate → implementation

```
🚀 Rapid Planning → ✋ Gate → 💻 Parallel Implementation → ✅ Quality Loops
```

**Best for:** MVPs, prototypes, small-medium projects

### `/octocode-generate` - Build Thorough
Orchestrates 6 specialized AI agents through comprehensive 4-phase workflow:

```
💭 Requirements → 🏗️ Architecture → 🎯 Planning → 💻 Implementation
```

**Best for:** Complex/enterprise projects | **You approve at 4 gates**

### `/octocode-feature` - Enhance Existing Code
Analyzes existing codebases and safely adds features or fixes bugs through 4 phases:

```
📊 Code Review → 🎯 Analysis → 🎯 Planning → 💻 Implementation
```

**Best for:** Production codebases | **You approve at 3 gates**

### Important: Git Operations

**NO GIT COMMANDS:** All agents only modify local files. You (the user) are responsible for all git operations including commits, pushes, branch management, and merges. Agents focus solely on code implementation and file modifications - you stay in control of version control.

---

## ✨ Why Use Octocode?

### ⚡ Choose Your Speed
- **Quick Mode**: 1 agent, 1 gate - Perfect for MVPs
- **Standard Mode**: 6 agents, 4 gates - Thorough for complex projects
- **Feature Mode**: 4 agents, 3 gates - Safe for production code

### 🚀 Parallel Execution
- **Dynamic scaling:** 2-8 agents spawn based on task complexity
- Small projects: 2-3 agents (cost-efficient)
- Large projects: 6-8 agents (maximum speed)
- Smart task distribution prevents conflicts
- MVP-first approach: working code before tests

### 🧠 Research-Driven Decisions
- Analyzes **100k+ GitHub repositories** for best practices
- Evaluates **3+ alternatives** for every major decision
- Critical thinking framework with self-questioning and devil's advocate

### 🔍 Streamlined Documentation
- **Quick Mode**: 1 consolidated file (~80KB) - Everything in one place
- **Standard Mode**: 4 separate files (~50KB each) - Comprehensive documentation
- **Clear approval gates** - Human control at critical decisions
- **Live monitoring** - Pause/continue implementation anytime

### 🔒 MVP-First Approach
- **Working code FIRST** - Build + Types + Lint (NO TESTS during MVP)
- **Tests AFTER user approval** - See working product before investing in tests
- **Quality validation loops** - Automated checks catch issues
- **Manual verification** - test-plan guides your testing

---

## 🤖 Meet Your AI Team

**9 specialized agents total**: Quick mode uses 3 agents, Standard mode uses 6 agents, Feature mode uses 4 agents (agent-manager and agent-implementation are shared across all workflows)

### For `/octocode-generate-quick` ⚡ NEW! (Fast Build)

| Agent | Role | Model | What They Do |
|-------|------|-------|--------------|
| 🚀 **Rapid Planner** | All Planning | Opus | Requirements + Architecture + Tasks in ONE pass, creates single consolidated spec |
| 🎯 **Engineering Manager** | Orchestration | Sonnet | Reads spec, assigns tasks, tracks progress |
| 💻 **Software Engineer** | Implementation | Sonnet | Writes code, follows patterns (multiple instances work in parallel) |

**Fast & efficient**: 1 planning agent, 1 approval gate

### For `/octocode-generate` (Thorough Build)

| Agent | Role | Model | What They Do |
|-------|------|-------|--------------|
| 🎯 **Product Manager** | Requirements | Opus | Asks clarifying questions, creates PRD, researches competitors using Octocode MCP |
| 🏗️ **Architect** | System Design | Opus | Designs architecture (backend + frontend), researches proven patterns via Octocode MCP |
| 🔬 **Quality Architect** | Verification Planning | Opus | Creates verification flows and test scenarios, researches testing patterns via Octocode MCP |
| 🚀 **Founding Engineer** | Initial Scaffold | Sonnet | Transforms design into working project foundation (structure, build, deps, README) |
| 🎯 **Engineering Manager** | Orchestration | Sonnet | Creates task breakdown, assigns tasks, tracks progress |
| 💻 **Software Engineer** | Implementation | Sonnet | Writes code, follows patterns, ensures build passes (multiple instances work in parallel) |

**Comprehensive**: 6 agents, 4 approval gates

### For `/octocode-feature` (Enhance Existing Code)

| Agent | Role | Model | What They Do |
|-------|------|-------|--------------|
| 📊 **Code Analyst** | Codebase Review | Sonnet | Analyzes existing code, identifies patterns, assesses quality |
| 🎯 **Feature Analyst** | Impact Analysis | Opus | Critical thinking on changes, researches implementation patterns via Octocode MCP |
| 🎯 **Engineering Manager** | Orchestration | Sonnet | Creates task breakdown, assigns tasks, tracks progress |
| 💻 **Software Engineer** | Implementation | Sonnet | Modifies code following existing patterns (multiple instances) |

**Production-safe**: 4 agents, 3 approval gates

**Cost-optimized**: Opus for strategic thinking, Sonnet for execution

---

## 🔌 MCPs Used by Agents

The plugin uses **two MCPs** for different purposes:

### octocode-mcp: Code Research & Planning
**Purpose**: Finding proven patterns, researching implementations, planning decisions

Agents use this for:
- ✅ Searching 100M+ GitHub repositories for best practices
- ✅ Accessing curated development resources (610+ repos, 12 specialized files)
- ✅ Extracting implementation patterns from top repos
- ✅ Finding similar successful projects
- ✅ Researching during requirements, architecture, and analysis phases

📚 **Explore resources**: https://github.com/bgauryy/octocode-mcp/tree/main/resources

### octocode-local-memory: Agent Coordination
**Purpose**: Fast inter-agent communication and coordination

Agents use this for:
- ✅ Task assignments (manager → implementation agents)
- ✅ File locks (prevent simultaneous edits)
- ✅ Status updates (progress tracking)
- ✅ Inter-agent messaging (questions/answers)
- ✅ Workflow state management
- ✅ **50x faster than file-based coordination** (< 1ms operations)

**Key benefit**: Parallel agents coordinate through sub-millisecond storage operations instead of slow file I/O.

📖 **See patterns**: [.claude-plugin/AGENT_COMMUNICATION.md](.claude-plugin/AGENT_COMMUNICATION.md)

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

---

## 📖 Example: Build a Blog Platform

### Quick Mode ⚡ (Recommended for this project)

```bash
/octocode-generate-quick Build a blog platform with authentication, 
rich text editor, and comments
```

**Phase 1: Rapid Planning** → Creates `docs/PROJECT_SPEC.md` (~80KB)
- Rapid Planner asks 2-3 questions, researches similar apps
- Creates complete spec: requirements + architecture + verification + tasks
- **✋ Gate 1:** You approve complete specification

**Phase 2: Implementation** → Updates `docs/PROJECT_SPEC.md` with progress
- 2-8 Software Engineers work in parallel (dynamically scaled)
- **🔄 Monitor:** Live progress, pause/continue anytime

**Phase 3: Quality Loops** → Validation
- Rapid Planner validates build, lint, types
- Creates fix tasks if issues found (max 3 loops)

**Result: 1 consolidated file (~80KB), 1 approval gate, production-ready code**

---

### Standard Mode (For complex enterprise version)

```bash
/octocode-generate Build a blog platform with authentication, 
rich text editor, and comments
```

**Phase 1: Requirements** → Creates `docs/requirements.md`
- Product Manager asks questions, researches similar apps
- **✋ Gate 1:** You approve requirements

**Phase 2: Architecture** → Creates `docs/design.md`, `docs/test-plan.md`, project scaffold
- Architect designs system (backend + frontend), researches proven architectures via Octocode MCP
- **✋ Gate 2:** You approve architecture
- Quality Architect creates verification flows (manual testing guide)
- **✋ Gate 2.5:** You approve verification plan
- Founding Engineer creates project scaffold (structure, build, deps, README)
- **✋ Gate 2.75:** You approve initial foundation

**Phase 3: Planning** → Creates `docs/tasks.md`
- Engineering Manager breaks project into tasks and assigns work

**Phase 4: Implementation** → Updates `docs/tasks.md` with progress
- 2-8 Software Engineers work in parallel (dynamically scaled)
- **🔄 Gate 3:** Monitor live, pause/continue anytime - Final gate

**Result: 4 separate files (<50KB each), 4 approval gates, production-ready code**

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

### Quick MVPs ⚡
```bash
# Fast prototypes
/octocode-generate-quick Build a URL shortener with analytics
/octocode-generate-quick Create a markdown note-taking app
/octocode-generate-quick Build a simple task tracker API
```

### Complex Projects (Thorough Mode)
```bash
# Enterprise apps
/octocode-generate React Native fitness tracker with workout plans,
progress charts, and social features

/octocode-generate Analytics dashboard with real-time charts,
user management, and role-based access control
```

### Enhance Existing Code
```bash
# Add features or fix bugs
/octocode-feature Add dark mode toggle with user preference persistence
/octocode-feature Fix: User login not working on Safari mobile
/octocode-feature Implement real-time notifications with WebSocket
```

---

## 🏆 Comparison with Other Tools

| Feature | Octocode | claude-flow | dify | Microsoft |
|---------|----------|-------------|------|-----------|
| **Specialized Agents** | ✅ 7 specialized | 74 general | Platform | Framework |
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
| **2. Architecture** | Architect | `docs/design.md` | <50KB | ✋ Gate 2 |
| **2.5 Verification** | Quality Architect | `docs/test-plan.md` | <50KB | ✋ Gate 2.5 |
| **2.75 Foundation** | Founding Engineer | Scaffold + README | - | ✋ Gate 2.75 |
| **3. Planning** | Manager | `docs/tasks.md` | <50KB | (no gate) |
| **4. Implementation** | 2-8 Engineers (dynamic) | Code + updates to `docs/tasks.md` | - | 🔄 Gate 3 (final) |

**Result: 4 single files (<50KB each) in `docs/`, clear ownership, human control at every gate**

**All docs include footer:** `**Created by octocode-mcp**`

**Note:** Research is integrated into each agent's work using Octocode MCP directly (Product Manager researches during requirements, Architect researches during design, etc.). User verifies manually after implementation.

### The 4 Phases (for `/octocode-feature`)

| Phase | Agent | Output | Size | Human Gate |
|-------|-------|--------|------|------------|
| **1. Code Review** | Code Analyst | `docs/codebase-review.md` | <50KB | ✋ Gate 1 |
| **2. Analysis** | Feature Analyst | `docs/analysis.md` | <50KB | ✋ Gate 2 |
| **3. Planning** | Manager | `docs/tasks.md` | <50KB | (no gate) |
| **4. Implementation** | 2-8 Engineers (dynamic) | Code + updates to `docs/tasks.md` | - | 🔄 Gate 3 (final) |

**Result: 3 single files (<50KB each) in `docs/`, clear ownership, safe changes with human approval**

**All docs include footer:** `**Created by octocode-mcp**`

**Note:** Research is integrated - Feature Analyst uses Octocode MCP during analysis to find proven implementation patterns. User verifies manually after implementation.

### Behind the Scenes

**Task Coordination**: Smart parallelization with octocode-local-memory
```
Manager creates task breakdown
→ Assigns tasks via storage (setStorage "task:1", ...)
→ Engineers check assignments (getStorage "task:1")
→ File locks prevent conflicts (lock:src/file.ts)
→ Status updates tracked (status:agent-1:task-1)
→ 50x faster than file-based coordination
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
- **Dynamic agent scaling:** 2-8 agents based on complexity
- Small projects use fewer agents (40% cost savings)
- Large projects use more agents (60% faster)
- Smart task coordination via octocode-local-memory
- Efficient orchestration with file locking
- Real-time progress monitoring

### Quality Enforcement (Build + Types + Lint)
- ✅ **Build passes** - No compilation errors
- ✅ **TypeScript strict mode** - Type safety enforced, minimal `any`
- ✅ **Lint passes** - Clean, consistent code
- ✅ **Manual verification** - User tests features following test-plan.md
- ❌ **NO automated tests during MVP** - Tests added after user approval
- ✅ **User controls git** - Agents only modify files, you commit when ready
- ✅ **Optimized docs** - All files <50KB for efficient AI processing

### Cost Optimization
- **Opus (expensive)**: 2-3 agents for strategic decisions (depends on command)
- **Sonnet (efficient)**: 2-8 agents for analysis and implementation (dynamically scaled)
- **Dynamic scaling**: Small projects save ~40% on implementation costs
- **Research-driven**: Reduces trial-and-error costs

---

## 🔌 Technology Stack

### Required MCPs

**octocode-mcp**: Research-driven development with GitHub code search
- ✅ Search 100M+ GitHub repositories for best practices
- ✅ Access curated development resources (610+ repos, 12 files)
- ✅ Extract implementation patterns from top repos
- ✅ Find similar successful projects
- **Usage**: Planning and research phases (requirements, architecture, analysis)

**octocode-local-memory**: Fast agent coordination layer
- ✅ Sub-millisecond task assignments and status updates
- ✅ File lock coordination (prevent simultaneous edits)
- ✅ Inter-agent messaging (questions/answers)
- ✅ 50x faster than file-based coordination
- **Usage**: Implementation phase (parallel agent coordination)

📚 **Explore octocode-mcp resources**: https://github.com/bgauryy/octocode-mcp/tree/main/resources
📖 **See coordination patterns**: [../docs/AGENT_COMMUNICATION.md](.claude-plugin/AGENT_COMMUNICATION.md)

### chrome-devtools-mcp
**Integrated browser testing for quality assurance**

Automatically used by the Quality Architect during QA phase (Mode 3):
- ✅ Launches dev server and opens Chrome for real browser testing
- ✅ Monitors console errors and warnings in real-time
- ✅ Detects network failures (failed API requests, 404s, CORS errors)
- ✅ Identifies runtime exceptions and unhandled promise rejections
- ✅ Validates critical user flows (login, CRUD operations, error states)
- ✅ Reports all browser issues in bug-report.md

**When it runs**: After build validation, before final sign-off (web apps only)
**Benefit**: Catches browser-specific issues that static analysis can't detect

---

## 📚 Documentation

| Doc | Description |
|-----|-------------|
| **[QUICK_MODE.md](./docs/QUICK_MODE.md)** | ⚡ NEW! Guide to fast development with `/octocode-generate-quick` |
| **[COMPLETE_GUIDE.md](./docs/COMPLETE_GUIDE.md)** | ⭐ Comprehensive guide for standard `/octocode-generate` workflow |
| **[FLOW.md](./docs/FLOW.md)** | 🎯 Visual walkthrough of all workflows |
| **[agents/](./agents/)** | Individual documentation for all 8 specialized agents |
| **[commands/](./commands/)** | Detailed specifications for all three commands |

**Want more details?** 
- **Fast development?** Read [Quick Mode Guide](./docs/QUICK_MODE.md)
- **Thorough approach?** Read [Complete Guide](./docs/COMPLETE_GUIDE.md)

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
