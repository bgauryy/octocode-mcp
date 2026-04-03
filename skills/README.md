# OctoCode Skills

Specialized AI agent skills extending OctoCode's capabilities.

---

## Quick Reference

| Need | Skill | Triggers |
|------|-------|----------|
| Install & configure Octocode | **Install** | "Install octocode", "Set up octocode", "Configure MCP", "Get started" |
| Code search & exploration | **Researcher** | "Find X", "Where is Y?", "Who calls Z?" |
| Deep multi-phase research | **Research** | "Deep-dive auth E2E", "Compare X vs Y" |
| Implementation planning | **Plan** | "Plan this refactor", "Plan this feature" |
| Formal technical decisions | **RFC** | "Create RFC for X", "Design doc for Y" |
| PR & local code review | **PR Reviewer** | "Review PR #123", "Review my changes" |
| Code understanding & implementation | **Engineer** | "How does X work?", "Implement this", "Audit quality" |
| Brutal code critique | **Roast** | "Roast my code", "Find antipatterns" |
| Prompt hardening | **Prompt Optimizer** | "Optimize this SKILL.md", "Agent skips steps" |
| Repo documentation | **Doc Writer** | "Document this project", "Create dev docs" |

---

## Skills

### 1. Install
`octocode-install/`

Step-by-step setup for macOS and Windows: install via `npx octocode-cli`, choose an auth method (GitHub OAuth, PAT, GitLab, Bitbucket), configure your IDE, and install skills. Includes efficient skill usage guide.

### 2. Researcher
`octocode-researcher/`

Default research skill. Direct code exploration via Octocode MCP — local (LSP, search, structure) and external (GitHub, npm/PyPI, PRs). No server needed.

### 3. Research (HTTP Server)
`octocode-research/`

Multi-phase research with session management and checkpoints. Phases: Init > Context > Fast-path > Plan > Research > Output. Use when research spans multiple domains and needs state persistence.

### 4. Plan
`octocode-plan/`

Evidence-based implementation planning. Understand > Research (delegates to Researcher/Research) > Plan > Implement. For multi-step work needing actionable steps.

### 5. RFC Generator
`octocode-rfc-generator/`

Formal evaluation of technical decisions. Research > Draft RFC with alternatives > Validate > Implementation plan. Use when multiple approaches are viable and trade-offs matter.

### 6. Engineer
`octocode-engineer/`

Full-stack code engineering — understand, write, analyze, audit. Combines CLI scanner (dependency graph + AST + 16 structural presets via `@ast-grep/napi`), and Octocode MCP local/LSP tools. Four modes: **Explore**, **Code**, **Analyze**, **Audit**. Enforces architecture-first thinking, TDD, no duplication, dual-layer verification (agentic + deterministic).

### 7. PR & Code Reviewer
`octocode-pull-request-reviewer/`

Holistic code review: bugs, security, architecture, flow impact. Supports remote PRs and local changes (staged/unstaged). 7 domains, LSP-powered flow tracing, evidence-backed.

> Local mode requires `ENABLE_LOCAL=true` — see [README](https://github.com/bgauryy/octocode-mcp/blob/main/skills/octocode-pull-request-reviewer/README.md)

### 8. Roast
`octocode-roast/`

Brutal code critique with `file:line` citations. Severity levels: gentle > nuclear. Sin registry, user picks fixes.

### 9. Prompt Optimizer
`octocode-prompt-optimizer/`

Turns weak prompts into enforceable protocols. Gates, FORBIDDEN lists, failure analysis. Preserves intent, adds reliability. Not for short prompts (<50 lines) or already-optimized docs.

### 10. Documentation Writer
`octocode-documentation-writer/`

6-phase pipeline: Discovery > Questions > Research > Orchestration > Writing > QA. Produces 16+ validated docs.
