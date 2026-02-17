# OctoCode Skills

Specialized AI agent skills that extend OctoCode's capabilities.

---

## When to Use What

| Your Need | Skill | Example Trigger |
|-----------|-------|-----------------|
| Local code search, structure, definitions | **Local Search** | "Find X in codebase", "Where is Y?", "Explore this dir" |
| Full research (local + GitHub, PRs, packages) | **Research** | "How does X work?", "Who calls Z?", "Trace flow", "Review PR" |
| Plan work before implementing | **Plan** | "Plan this feature", "Research & plan refactor" |
| Review a pull request | **PR Reviewer** | "Review PR #123", "Is this PR safe to merge?" |
| Brutal code criticism with fixes | **Roast** | "Roast my code", "Find code sins", "What's wrong with this?" |
| Strengthen prompts / agent instructions | **Prompt Optimizer** | "Optimize this SKILL.md", "Agent skips steps" |
| Generate repo documentation | **Documentation Writer** | "Document this project", "Create developer docs" |

---

## Skills Overview

### 1. OctoCode Local Search
**Location:** `octocode-local-search/`

Local codebase exploration using Octocode Local + LSP. Search, structure, find files, trace definitions/usages—no GitHub. Fast local discovery.

| When | Example |
|------|---------|
| Local search only | "Find auth logic", "Where is X defined?" |
| Explore structure | "List src/ files", "Show package layout" |

---

### 2. OctoCode Research
**Location:** `octocode-research/`

Deep code exploration: LSP, local tools, GitHub API, packages, PRs. File:line citations and GitHub URLs. Full stack research.

| When | Example |
|------|---------|
| Research code | "Research how auth works" |
| GitHub/external | "How does library X work?", "Find PRs that changed Y" |

---

### 3. OctoCode Plan
**Location:** `octocode-plan/`

Evidence-based planning. Understand → Research (via Local Search/Research) → Plan → Implement. No guessing; validates with code.

| When | Example |
|------|---------|
| Multi-step work | "Plan auth refactor", "Plan API v2" |
| Non-trivial tasks | "Research & plan this feature" |

---

### 4. OctoCode Prompt Optimizer
**Location:** `octocode-prompt-optimizer/`

Turns weak prompts into enforceable protocols. Gates, FORBIDDEN lists, failure analysis. Preserves intent, adds reliability.

| When | Example |
|------|---------|
| Prompts ignored | "Agent keeps skipping steps" |
| New/weak instructions | "Optimize this SKILL.md", "Make prompt reliable" |

*Not for:* Short prompts (<50 lines), already-optimized docs.

---

### 5. OctoCode Documentation Writer
**Location:** `octocode-documentation-writer/`

6-phase pipeline: Discovery → Questions → Research → Orchestration → Writing → QA. Produces 16+ docs with validation.

| When | Example |
|------|---------|
| New/outdated docs | "Generate documentation", "Update docs" |
| Onboarding | "Create docs for new devs" |

---

### 6. OctoCode Roast
**Location:** `octocode-roast/`

Brutal code critique with file:line citations. Severity: gentle → nuclear. Sin registry, user picks fixes. Cites or dies.

| When | Example |
|------|---------|
| Code critique | "Roast my code", "Find antipatterns" |
| Honest feedback | "What's wrong with my code?" |

---

### 7. OctoCode Pull Request Reviewer
**Location:** `octocode-pull-request-reviewer/`

Holistic PR review via Octocode MCP: bugs, security, architecture, flow impact. 7 domains, evidence-backed, user checkpoint before deep dive.

| When | Example |
|------|---------|
| PR review | "Review PR #456", "Check this PR" |
| Security/impact | "Is this safe to merge?" |

---

