# OctoCode Skills

Specialized AI agent skills that extend OctoCode's capabilities.

---

## When to Use What

| Your Need | Skill | Example Trigger |
|-----------|-------|-----------------|
| Code search, exploration, research (local + external) | **Researcher** | "Find X in codebase", "Where is Y?", "Who calls Z?", "Trace this flow", "How does library X work?" |
| Complex multi-phase research with sessions & checkpoints | **Research** | "Deep-dive into auth end-to-end", "Compare React vs Vue state", "Research and review PR changes" |
| Plan implementation steps before coding | **Plan** | "Plan this refactor", "Research & plan this feature" |
| Technical decisions requiring formal RFC with alternatives | **RFC** | "Create RFC for caching", "Design doc for API v2", "How should we build X?" |
| Review a pull request or local changes | **PR Reviewer** | "Review PR #123", "Review my changes", "Is this PR safe to merge?" |
| Understand, write, plan, review, or analyze code with codebase awareness | **Code Engineer** | "How does X work?", "Implement this safely", "Plan this refactor", "Audit quality", "Check architecture" |
| Brutal code criticism with fixes | **Roast** | "Roast my code", "Find code sins", "What's wrong with this?" |
| Strengthen prompts / agent instructions | **Prompt Optimizer** | "Optimize this SKILL.md", "Agent skips steps" |
| Generate repo documentation | **Documentation Writer** | "Document this project", "Create developer docs" |

---

## Skills Overview

### 1. OctoCode Researcher
**Location:** `octocode-researcher/`

**The default research skill.** Direct code exploration via Octocode MCP tools — local codebase (LSP semantic navigation, search, structure) and external (GitHub, npm/PyPI, PRs). Lightweight, no server needed. Use for most research tasks.

| When | Example |
|------|---------|
| Local search + LSP | "Find auth logic", "Where is X defined?", "Who calls Y?" |
| External research | "How does library X work?", "Find a caching package" |
| Cross-boundary | "How does our code use dependency Z?" |

---

### 2. OctoCode Research (HTTP Server)
**Location:** `octocode-research/`

HTTP server mode for complex, multi-phase research. Adds session management, checkpoints, and persistent context on top of Octocode MCP tools. Phases: Init → Context → Fast-path → Plan → Research → Output. Use when research spans multiple domains and benefits from state persistence.

| When | Example |
|------|---------|
| Multi-domain deep dive | "Research how auth works end-to-end" |
| Comparative analysis | "Compare React vs Vue state management" |
| Persistent sessions | "Continue researching from last checkpoint" |

---

### 3. OctoCode Plan
**Location:** `octocode-plan/`

Evidence-based implementation planning. Understand → Research (delegates to Researcher/Research) → Plan → Implement. Use when you know the general approach and need actionable steps.

| When | Example |
|------|---------|
| Multi-step work | "Plan auth refactor", "Plan API v2" |
| Non-trivial tasks | "Research & plan this feature" |

---

### 4. OctoCode RFC Generator
**Location:** `octocode-rfc-generator/`

For technical decisions that need formal evaluation. Understand → Research → Draft RFC with alternatives → Validate → Implementation plan. Use when multiple approaches are viable and you need to reason through trade-offs before committing.

| When | Example |
|------|---------|
| Technical decisions | "Create RFC for caching layer", "How should we build X?" |
| Migrations / refactors | "RFC for auth migration", "Design doc for API v2" |
| Architecture choices | "Should we use Redis or Memcached?", "Propose new pattern" |

---

### 5. OctoCode Prompt Optimizer
**Location:** `octocode-prompt-optimizer/`

Turns weak prompts into enforceable protocols. Gates, FORBIDDEN lists, failure analysis. Preserves intent, adds reliability.

| When | Example |
|------|---------|
| Prompts ignored | "Agent keeps skipping steps" |
| New/weak instructions | "Optimize this SKILL.md", "Make prompt reliable" |

*Not for:* Short prompts (<50 lines), already-optimized docs.

---

### 6. OctoCode Documentation Writer
**Location:** `octocode-documentation-writer/`

6-phase pipeline: Discovery → Questions → Research → Orchestration → Writing → QA. Produces 16+ docs with validation.

| When | Example |
|------|---------|
| New/outdated docs | "Generate documentation", "Update docs" |
| Onboarding | "Create docs for new devs" |

---

### 7. OctoCode Roast
**Location:** `octocode-roast/`

Brutal code critique with file:line citations. Severity: gentle → nuclear. Sin registry, user picks fixes. Cites or dies.

| When | Example |
|------|---------|
| Code critique | "Roast my code", "Find antipatterns" |
| Honest feedback | "What's wrong with my code?" |

---

### 8. OctoCode Code Engineer
**Location:** `octocode-code-engineer/`

Code engineering platform for any task requiring deep file-level comprehension. Combines a CLI scanner (dependency graph + AST + semantic analysis), AST engine (`@ast-grep/napi` with 16 structural presets), and Octocode MCP local/LSP tools into a unified workflow. Four composable modes: Explore, Code, Analyze, Audit. Enforces coding standards: architecture-first thinking, TDD, no duplications, dual-layer verification (agentic + deterministic).

| When | Example |
|------|---------|
| Understand code | "How does X work?", "Explore this module", "Where should this live?" |
| Write code safely | "Implement this", "Add feature", "Fix this bug" |
| Plan refactors | "Plan this refactor", "Safe to rename?", "Blast radius?" |
| Architecture health | "Check architecture", "Find cycles", "Dependency analysis" |
| Quality audit | "Audit code", "Find issues", "Scan for problems" |
| Security / test gaps | "Security review", "Test coverage gaps", "Unused deps" |

---

### 9. OctoCode Pull Request & Code Reviewer
**Location:** `octocode-pull-request-reviewer/`

Holistic code review via Octocode MCP: bugs, security, architecture, flow impact. Supports both **remote PRs** and **local changes** (staged/unstaged). 7 domains, LSP-powered flow tracing, evidence-backed, user checkpoint before deep dive.

> **Local Mode** requires `ENABLE_LOCAL=true` — see [README](https://github.com/bgauryy/octocode-mcp/blob/main/skills/octocode-pull-request-reviewer/README.md)

| When | Example |
|------|---------|
| PR review | "Review PR #456", "Check this PR" |
| Local changes | "Review my changes", "Review staged changes" |
| Security/impact | "Is this safe to merge?" |

---

