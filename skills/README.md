# OctoCode Skills

Specialized AI agent skills extending OctoCode's capabilities. 14 skills, each in its own directory under `skills/`.

---

## Skill Lookup

Use this table to match user intent to the right skill.

| Skill | Directory | Triggers |
|-------|-----------|----------|
| **Install** | `octocode-install/` | "Install octocode", "Set up octocode", "Configure MCP", "Get started" |
| **CLI** | `octocode-cli/` | "Run octocode from shell", "Use octocode without MCP", "Call tool from CLI" |
| **Researcher** | `octocode-researcher/` | "Find X", "Where is Y?", "Who calls Z?", "Search code" |
| **Research** | `octocode-research/` | "Deep-dive auth E2E", "Compare X vs Y", "Multi-phase research" |
| **Brainstorming** | `octocode-brainstorming/` | "Is this worth building?", "Has anyone done X?", "Validate my idea", "Brainstorm" |
| **Plan** | `octocode-plan/` | "Plan this refactor", "Plan this feature", "Implementation plan" |
| **RFC Generator** | `octocode-rfc-generator/` | "Create RFC for X", "Design doc for Y", "Compare approaches" |
| **Engineer** | `octocode-engineer/` | "How does X work?", "Implement this", "Audit quality", "Architecture review" |
| **PR Reviewer** | `octocode-pull-request-reviewer/` | "Review PR #123", "Review my changes", "Review local diff" |
| **Roast** | `octocode-roast/` | "Roast my code", "Find antipatterns", "Code quality critique" |
| **Prompt Optimizer** | `octocode-prompt-optimizer/` | "Optimize this SKILL.md", "Agent skips steps", "Harden this prompt" |
| **Design** | `octocode-design/` | "Generate DESIGN.md", "Design system for this app", "Design review" |
| **Doc Writer** | `octocode-documentation-writer/` | "Document this project", "Create dev docs", "Generate documentation" |
| **News** | `octocode-news/` | "What's new in AI?", "Latest updates", "Tech news", "Recent releases" |

---

## Skill Details

### Install
Step-by-step setup for macOS and Windows: install via `npx octocode-cli`, choose auth (GitHub OAuth, PAT, GitLab, Bitbucket), configure IDE, install skills.

### CLI
Run Octocode MCP tools from a terminal without wiring MCP. Six subcommands: `search-code`, `get-file`, `view-structure`, `search-repos`, `search-prs`, `package-search`. Always use `--json | jq`.

### Researcher
Default research skill. Direct code exploration via Octocode MCP — local (LSP, search, structure) and external (GitHub, npm/PyPI, PRs). No server needed.

### Research
Multi-phase research with session management and checkpoints. Phases: Init > Context > Fast-path > Plan > Research > Output. Use when research spans multiple domains and needs state persistence.

### Brainstorming
Evidence-grounded idea validation. Parallel-researches GitHub (via Octocode MCP) and the web (via subagents + `scripts/tavily-search.mjs` when `TAVILY_API_KEY` is set; falls back to `WebFetch` on known aggregators when Tavily is unavailable) to surface prior art, gaps, risks, and angles to pursue. Hard gates enforce quality: too-broad, zero-results, contradictory-evidence, and a 5-subagent ceiling. Every prior-art entry carries a confidence marker (`strong`/`moderate`/`weak`). Cross-pollination between surfaces is a hard checkpoint before Advocate vs Critic synthesis. Output is a decision-ready brief — not code, not a spec. Hands off to `octocode-rfc-generator` (formal eval) or `octocode-plan` (implementation).

> Optional: `export TAVILY_API_KEY=...` for higher-signal web search. See `octocode-brainstorming/.env.example`.

### Plan
Evidence-based implementation planning. Understand > Research (delegates to Researcher/Research) > Plan > Implement. For multi-step work needing actionable steps.

### RFC Generator
Formal evaluation of technical decisions. Research > Draft RFC with alternatives > Validate > Implementation plan. Use when multiple approaches are viable and trade-offs matter.

### Engineer
Full-stack code engineering — understand, write, analyze, audit. Combines CLI scanner (dependency graph + AST + 16 structural presets via `@ast-grep/napi`) and Octocode MCP local/LSP tools. Four modes: **Explore**, **Code**, **Analyze**, **Audit**. Enforces architecture-first thinking and TDD.

### PR Reviewer
Holistic code review: bugs, security, architecture, flow impact. Supports remote PRs and local changes (staged/unstaged). 7 domains, LSP-powered flow tracing, evidence-backed.

> Requires `ENABLE_LOCAL=true` for local mode — see [README](https://github.com/bgauryy/octocode-mcp/blob/main/skills/octocode-pull-request-reviewer/README.md).

### Roast
Brutal code critique with `file:line` citations. Severity levels from gentle to nuclear. Sin registry, user picks fixes.

### Prompt Optimizer
Turns weak prompts into enforceable protocols. Gates, FORBIDDEN lists, failure analysis. Preserves intent, adds reliability. Not for short prompts (<50 lines) or already-optimized docs.

### Design
Design-system and UI architecture generator. Uses Octocode MCP local tools, adapts depth by project maturity. Covers visual language, styling, component architecture, accessibility, performance, responsive behavior, and implementation mapping.

> See [README](https://github.com/bgauryy/octocode-mcp/blob/main/skills/octocode-design/README.md).

### Doc Writer
6-phase documentation pipeline: Discovery > Questions > Research > Orchestration > Writing > QA. Produces 16+ validated docs.

### News
Tech news researcher. Sweeps RSS + cataloged sources across AI, DevTools, Web/JS, Security, and notable repos. Configurable window (24h–30d) and depth (brief/deep/comprehensive). Outputs a validated JSON report and an HTML report.
