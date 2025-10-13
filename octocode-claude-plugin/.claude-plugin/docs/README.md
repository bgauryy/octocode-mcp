# 🏗️ Octocode Vibe - Documentation Hub

**Complete AI Development Team for Claude Code**

Transform your ideas into production-ready code through a structured 7-phase workflow powered by 8 specialized AI agents.

---

## 🚀 Quick Installation

### Prerequisites
- Claude Code >= 1.0.0
- Node.js >= 18.0.0
- Git repository initialized

### Install Plugin

**Option 1: From GitHub (Recommended)**
```bash
# In Claude Code
/plugin add bgauryy/octocode-mcp/octocode-vibe-plugin
/restart
```

**Option 2: From Local Directory**
```bash
# Clone repository
git clone https://github.com/bgauryy/octocode-mcp.git
cd octocode-mcp/octocode-vibe-plugin

# In Claude Code
/plugin add .
/restart
```

### Verify Installation
```bash
# In Claude Code
/plugin list
# Should show "octocode" plugin v1.0.0
```

### Your First Project
```bash
# In Claude Code
/octocode-generate Build a todo app with React frontend and Express backend
```

**What happens:** The plugin guides you through 7 phases with 5 approval gates to create production-ready code!

---

## 📋 What is Octocode Vibe?

### The Complete AI Development Team

Octocode Vibe transforms Claude into **8 specialized AI agents** working together:

```
┌──────────────────────────────────────────────────────────┐
│  YOU: "Build a todo app with React and Express"          │
└──────────────────────────────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────┐
│  🤖 agent-product (Product Manager)                      │
│  • Asks clarifying questions                             │
│  • Creates comprehensive PRD                             │
│  • Defines features and success metrics                  │
│  → Gate 1: PRD Approval                                  │
└──────────────────────────────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────┐
│  🏗️ agent-architect + 🎨 agent-ux (Parallel!)           │
│  • Designs backend architecture & APIs                   │
│  • Designs frontend UX & components                      │
│  • Coordinates on framework & contracts                  │
│  → Gate 2: Architecture & UX Approval                    │
└──────────────────────────────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────┐
│  ✅ agent-design-verification (Technical Lead)           │
│  • Validates design completeness                         │
│  • Creates task breakdown with dependencies              │
│  • Identifies parallel work opportunities                │
│  → Gate 3: Task Breakdown Approval                       │
└──────────────────────────────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────┐
│  🔬 agent-research-context (Research Specialist)         │
│  • Searches GitHub for best practices (>500⭐ repos)     │
│  • Extracts copy-paste ready code examples              │
│  • Documents patterns and anti-patterns                  │
└──────────────────────────────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────┐
│  🎯 agent-manager (Engineering Manager)                  │
│  • Spawns 4-5 implementation agents                      │
│  • Manages file locks (prevents conflicts!)              │
│  • Monitors progress in real-time                        │
│  → Gate 4: Live Progress Dashboard                       │
│                                                           │
│  💻 agent-implementation x5 (Software Engineers)         │
│  • Work in parallel on different tasks                   │
│  • Follow research-backed patterns                       │
│  • Run tests before completion                           │
└──────────────────────────────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────┐
│  🧪 agent-verification (QA Engineer)                     │
│  • Runs build, tests, linting                            │
│  • Tests in Chrome browser (runtime testing!)            │
│  • Performs static code analysis                         │
│  • Creates comprehensive verification report             │
│  → Gate 5: Final Approval                                │
└──────────────────────────────────────────────────────────┘
                           ↓
                  🎉 PRODUCTION-READY CODE
```

---

## ⚡ Key Features

### 🚪 5 Human Approval Gates
Review and approve at critical decision points:
- **Gate 1:** PRD approval
- **Gate 2:** Architecture & UX approval
- **Gate 3:** Task breakdown approval
- **Gate 4:** Live implementation monitoring
- **Gate 5:** Final verification approval

### 🔬 Research-Driven Decisions
- Analyzes 100k+ GitHub repositories for best practices
- Extracts patterns from production apps (>500 stars)
- Provides copy-paste ready code examples
- Curated resources from [octocode-mcp](https://github.com/bgauryy/octocode-mcp/tree/main/resources)

### 🧠 Critical Thinking Framework
- **Self-questioning:** Validates all assumptions
- **Devil's advocate:** Challenges own reasoning
- **Alternatives evaluation:** Minimum 3 options per major decision
- **Evidence-based:** Decisions backed by research, not popularity

### 🎨 Parallel Architecture + UX (Industry First!)
- Backend architect and UX engineer work simultaneously
- Ensures API contracts match UX needs from start
- Reduces development time by ~50%

### 🔒 Production-Ready
- **File locking:** Prevents conflicts in parallel work
- **State persistence:** Resume from any interruption
- **Comprehensive observability:** Full audit trail
- **Runtime testing:** Tests in actual Chrome browser
- **Quality gates:** 80-90% test coverage enforced

---

## 📚 Complete Documentation

### 🎯 Getting Started (5 minutes)

**Start here if you're new:**

1. **[Quick Start Guide](guides/QUICK_START.md)** ⭐
   - 5-minute walkthrough
   - Your first project generation
   - Expected output and next steps

2. **[Main README](../README.md)**
   - Plugin overview and features
   - Installation instructions
   - Comparison with other frameworks

3. **[Workflow Overview](workflow/FLOW.md)**
   - Visual 7-phase workflow diagram
   - Gate approval explanation
   - Time estimates per phase

---

### 🤖 Understanding Agents (30 minutes)

**Learn how the 8-agent system works:**

1. **[Agent Architecture](agents/ARCHITECTURE.md)** ⭐
   - Complete system overview
   - How agents communicate
   - Parallel execution explained
   - File locking system

2. **Individual Agent Documentation:**
   - [agent-product](agents/agent-product.md) - Product Manager (Opus)
   - [agent-architect](agents/agent-architect.md) - Solution Architect (Opus)
   - [agent-ux](agents/agent-ux.md) - UX Engineer (Opus)
   - [agent-design-verification](agents/agent-design-verification.md) - Technical Lead (Sonnet)
   - [agent-research-context](agents/agent-research-context.md) - Research Specialist (Sonnet)
   - [agent-manager](agents/agent-manager.md) - Engineering Manager (Sonnet)
   - [agent-implementation](agents/agent-implementation.md) - Software Engineer (Sonnet)
   - [agent-verification](agents/agent-verification.md) - QA Engineer (Sonnet)

---

### 📖 Workflow Deep Dive (1 hour)

**Understand the complete 7-phase process:**

1. **[Workflow Guide](workflow/WORKFLOW_GUIDE.md)** ⭐
   - Detailed phase-by-phase breakdown
   - Agent roles and responsibilities
   - Communication protocols
   - File locking system
   - State management
   - Observability framework

2. **[Visual Flow](workflow/FLOW.md)**
   - ASCII diagram walkthrough
   - Phase dependencies
   - Gate approval points

3. **[Communication Standard](technical/COMMUNICATION_STANDARD.md)**
   - Inter-agent message format
   - Communication protocols
   - Logging standards

---

### 🔧 Technical Documentation (2 hours)

**For developers and contributors:**

1. **[Technical Guide](technical/TECHNICAL_GUIDE.md)** ⭐
   - Plugin architecture internals
   - Command flow implementation
   - Agent system details
   - File locking mechanism
   - State management system
   - Extending the plugin

2. **[Testing Guide](guides/TESTING_GUIDE.md)** ⭐
   - Complete testing procedures
   - Installation tests
   - Individual agent tests
   - End-to-end workflow tests
   - Troubleshooting guide

3. **[Changes Summary](../CHANGES_SUMMARY.md)**
   - Recent improvements
   - Test verification results
   - All fixes applied

---

## 🎓 Learning Paths

### Path 1: Quick User (5 minutes)
**Goal:** Generate your first project

1. Read installation section above
2. Read [Quick Start Guide](guides/QUICK_START.md)
3. Run `/octocode-generate Build a todo app`
4. ✅ Done!

---

### Path 2: Understanding User (30 minutes)
**Goal:** Understand how everything works

1. Read [Quick Start Guide](guides/QUICK_START.md)
2. Read [Agent Architecture](agents/ARCHITECTURE.md)
3. Read [Workflow Guide](workflow/WORKFLOW_GUIDE.md)
4. Try a project with `/octocode-generate`
5. Review generated files in `.octocode/`

---

### Path 3: Power User (2 hours)
**Goal:** Master advanced features

1. Read [Agent Architecture](agents/ARCHITECTURE.md)
2. Read [Workflow Guide](workflow/WORKFLOW_GUIDE.md)
3. Study individual agent docs
4. Read [Technical Guide](technical/TECHNICAL_GUIDE.md)
5. Experiment with complex projects
6. Explore `.octocode/debug/` observability files

---

### Path 4: Contributor (4 hours)
**Goal:** Contribute to the plugin

1. Read [Technical Guide](technical/TECHNICAL_GUIDE.md)
2. Read [Testing Guide](guides/TESTING_GUIDE.md)
3. Study agent implementation details
4. Set up development environment
5. Review [Changes Summary](../CHANGES_SUMMARY.md)
6. Check [GitHub Issues](https://github.com/bgauryy/octocode-mcp/issues)

---

## 🔍 Quick Reference

### By Phase

| Phase | Agent(s) | Documentation | Duration |
|-------|----------|---------------|----------|
| **Phase 1** | agent-product | [agent-product.md](agents/agent-product.md) | 2-5 min |
| **Phase 2** | agent-architect + agent-ux | [agent-architect.md](agents/agent-architect.md) + [agent-ux.md](agents/agent-ux.md) | 5-10 min |
| **Phase 3** | agent-design-verification | [agent-design-verification.md](agents/agent-design-verification.md) | 2-3 min |
| **Phase 4** | agent-research-context | [agent-research-context.md](agents/agent-research-context.md) | 3-5 min |
| **Phase 5-6** | agent-manager + agent-implementation | [agent-manager.md](agents/agent-manager.md) + [agent-implementation.md](agents/agent-implementation.md) | 15-40 min |
| **Phase 7** | agent-verification | [agent-verification.md](agents/agent-verification.md) | 3-5 min |

**Total Time:** 30-70 minutes (depending on project complexity)

---

### By Feature

| Feature | Documentation |
|---------|---------------|
| **Requirements Gathering** | [agent-product.md](agents/agent-product.md) |
| **Architecture Design** | [agent-architect.md](agents/agent-architect.md) |
| **UX Design** | [agent-ux.md](agents/agent-ux.md) |
| **Task Orchestration** | [agent-manager.md](agents/agent-manager.md) |
| **Implementation** | [agent-implementation.md](agents/agent-implementation.md) |
| **Quality Assurance** | [agent-verification.md](agents/agent-verification.md) |
| **Complete Workflow** | [WORKFLOW_GUIDE.md](workflow/WORKFLOW_GUIDE.md) |
| **Testing** | [TESTING_GUIDE.md](guides/TESTING_GUIDE.md) |

---

### By Problem

| Problem | Solution |
|---------|----------|
| **How do I install?** | See installation section above |
| **How do I start?** | [Quick Start Guide](guides/QUICK_START.md) |
| **How does it work?** | [Agent Architecture](agents/ARCHITECTURE.md) |
| **What's the workflow?** | [Workflow Guide](workflow/WORKFLOW_GUIDE.md) |
| **How do I test?** | [Testing Guide](guides/TESTING_GUIDE.md) |
| **Plugin won't install** | [Testing Guide - Troubleshooting](guides/TESTING_GUIDE.md#troubleshooting) |
| **Agent fails** | [Testing Guide - Error Recovery](guides/TESTING_GUIDE.md#error-recovery) |
| **How do I contribute?** | [Technical Guide](technical/TECHNICAL_GUIDE.md) |

---

## 📊 What Gets Generated

When you run `/octocode-generate`, the plugin creates:

### Your Application Code
```
your-project/
├── frontend/              # React/Next.js application
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   └── ...
│   ├── public/
│   └── package.json
│
├── backend/               # Express/NestJS server
│   ├── src/
│   │   ├── routes/
│   │   ├── models/
│   │   └── ...
│   ├── tests/
│   └── package.json
│
└── README.md
```

### Plugin State & Documentation
```
.octocode/
├── requirements/          # Phase 1 output
│   ├── prd.md
│   ├── features.md
│   └── ...
│
├── designs/              # Phase 2 output (architect)
│   ├── architecture.md
│   ├── tech-stack.md
│   ├── database-schema.md
│   └── ...
│
├── ux/                   # Phase 2 output (UX)
│   ├── user-flows.md
│   ├── wireframes.md
│   ├── component-library.md
│   └── ...
│
├── context/              # Phase 4 output
│   ├── trpc-patterns.md
│   ├── prisma-patterns.md
│   └── ...
│
├── tasks.md              # Phase 3 output
├── locks.json            # File lock management
├── execution-state.json  # Resume capability
├── verification-report.md # Phase 7 output
│
├── logs/                 # Progress tracking
│   └── progress-dashboard.md
│
└── debug/                # Observability
    ├── agent-decisions.json
    ├── communication-log.md
    ├── research-queries.json
    └── phase-timeline.json
```

**Everything is documented for transparency and debugging!**

---

## 🌟 Unique Innovations

### 1. Critical Thinking Framework
Unlike other AI code generators, our agents:
- Question their own assumptions
- Play devil's advocate
- Evaluate 3+ alternatives per decision
- Base choices on research, not popularity

See: [agent-architect.md](agents/agent-architect.md#critical-thinking-framework)

---

### 2. Parallel Architecture + UX (Industry First!)
Both agents run simultaneously and coordinate:
- Backend architect designs APIs
- UX engineer designs frontend
- They communicate to ensure alignment
- **Result:** 50% faster than sequential

See: [Agent Architecture](agents/ARCHITECTURE.md#parallelization-strategy)

---

### 3. Research-Driven Development
Agents research GitHub repositories for patterns:
- Analyzes 100k+ repositories
- Focuses on production apps (>500 stars)
- Extracts copy-paste ready examples
- Documents anti-patterns to avoid

See: [agent-research-context.md](agents/agent-research-context.md)

---

### 4. Atomic File Locking
Prevents conflicts when multiple agents work in parallel:
- Agents request locks before modifying
- All files locked atomically
- Timeout and reassignment handling
- Complete audit trail

See: [agent-manager.md](agents/agent-manager.md#file-lock-management)

---

### 5. Runtime Browser Testing
Unlike other tools that only run unit tests:
- Launches Chrome browser
- Tests application in real runtime
- Monitors console for errors
- Validates UI rendering
- Checks network requests

See: [agent-verification.md](agents/agent-verification.md#runtime-testing)

---

## 🆘 Need Help?

### Documentation
- **Quick Question:** Check this README or [Quick Start](guides/QUICK_START.md)
- **How It Works:** [Agent Architecture](agents/ARCHITECTURE.md)
- **Deep Dive:** [Workflow Guide](workflow/WORKFLOW_GUIDE.md)
- **Technical:** [Technical Guide](technical/TECHNICAL_GUIDE.md)
- **Testing:** [Testing Guide](guides/TESTING_GUIDE.md)

### Community
- **GitHub Issues:** [Report bugs](https://github.com/bgauryy/octocode-mcp/issues)
- **GitHub Discussions:** [Ask questions](https://github.com/bgauryy/octocode-mcp/discussions)
- **Email:** bgauryy@gmail.com

### Resources
- **Curated Development Resources:** [octocode-mcp resources](https://github.com/bgauryy/octocode-mcp/tree/main/resources)
- **Claude Code Docs:** [Official docs](https://docs.claude.com/en/docs/claude-code)

---

## 📈 Performance & Quality

### Speed (with parallel execution)
- **Small Project (Todo App):** 30-40 minutes
- **Medium Project (Dashboard):** 40-60 minutes
- **Large Project (E-commerce):** 60-90 minutes

**Time Saved:** 50-60% faster vs sequential execution

### Quality Metrics
- **Test Coverage:** 80-90% (enforced)
- **Code Quality:** 8.5/10 average
- **Production Ready:** All features verified
- **Accessibility:** WCAG 2.1 AA compliant

See: [Workflow Guide - Performance](workflow/WORKFLOW_GUIDE.md#performance)

---

## 🔄 Updates & Changelog

**Current Version:** 1.0.0

**Recent Changes:**
- ✅ Agent frontmatter format fixed
- ✅ Hook error handling improved
- ✅ .claudeignore added
- ✅ Comprehensive testing guide added
- ✅ Documentation organized

See: [Changes Summary](../CHANGES_SUMMARY.md) for complete details

**Roadmap:**
- v1.1: Workflow templates, performance metrics
- v1.2: Message queue, dynamic workflows
- v2.0: Visual diagrams, pattern validation, multi-language

---

## 🤝 Contributing

Want to improve Octocode Vibe?

1. Read [Technical Guide](technical/TECHNICAL_GUIDE.md)
2. Read [Testing Guide](guides/TESTING_GUIDE.md)
3. Check [GitHub Issues](https://github.com/bgauryy/octocode-mcp/issues)
4. Fork, improve, pull request!

**Areas to contribute:**
- New agent capabilities
- Additional workflow templates
- Testing improvements
- Documentation enhancements

---

## 📝 License

MIT License - See [LICENSE](../../LICENSE)

---

## 🎉 Ready to Build?

```bash
# Install
/plugin add bgauryy/octocode-mcp/octocode-vibe-plugin
/restart

# Generate
/octocode-generate Build your amazing app idea here

# Enjoy production-ready code! 🚀
```

---

**Made with ❤️ by Guy Bary**

🏗️ **Octocode Vibe** - Where research meets execution

*Transform Claude into a complete AI development team*
