# Skills Guide

> Comprehensive guide to Octocode Skills - pre-built AI assistant behaviors for Claude Code and compatible AI coding assistants.

## Overview

**Skills** are markdown-based instruction sets that teach AI assistants how to perform specific tasks. They transform generic AI assistants into specialized experts for code research, implementation, PR review, and more.

### What Are Skills?

Skills are `.md` files that define:
- **Agent Identity**: Role, objectives, and principles
- **Tooling**: Which MCP tools to use and when
- **Workflows**: Step-by-step execution flows
- **Decision Frameworks**: How to handle uncertainty and edge cases
- **Output Formats**: Structured responses and deliverables

### Why Use Skills?

| Without Skills | With Skills |
|----------------|-------------|
| Generic responses | Domain-expert behavior |
| Inconsistent workflows | Structured execution flows |
| Manual tool selection | Automatic tool orchestration |
| Ad-hoc output formats | Consistent deliverables |
| No validation gates | Built-in checkpoints |

---

## Available Skills

### Official Octocode Skills

| Skill | Description | Use When |
|-------|-------------|----------|
| **octocode-research** | Evidence-first code forensics | Researching external GitHub repos, understanding implementations |
| **octocode-researcher** | Primary code research and exploration | Researching code, exploring codebases, tracing flows, finding definitions |
| **octocode-implement** | Research-driven feature development | Implementing features from specs, building in large codebases |
| **octocode-plan** | Adaptive research & implementation planning | Complex multi-step tasks requiring structured planning |
| **octocode-pr-review** | Defects-first PR review | Reviewing PRs for bugs, security, architecture issues |
| **octocode-roast** | Brutally honest code review | Entertainment + finding antipatterns with humor |

### Skill Details

#### octocode-research
```
Flow: PREPARE → DISCOVER → ANALYZE → OUTPUT
```

**Features**:
- GitHub code forensics across repositories
- Cross-domain transitions (Local ↔ GitHub)
- Multi-agent parallelization for independent hypotheses
- Validation pattern: Discover → Verify → Cross-check → Confirm

**Best For**: External library research, understanding third-party implementations, cross-repo analysis.

#### octocode-researcher
```
Flow: DISCOVER → PLAN → EXECUTE → VERIFY → OUTPUT
```

**Features**:
- Local + external research using Octocode MCP tools directly
- LSP-powered code intelligence: `lspGotoDefinition`, `lspFindReferences`, `lspCallHierarchy`
- Structured search with `localSearchCode`, `localViewStructure`, `localFindFiles`, `localGetFileContent`
- GitHub research: `githubSearchCode`, `githubGetFileContent`, `packageSearch`
- Interactive planning with user checkpoints

**Best For**: Any code exploration/discovery need — exploring codebases, tracing flows, finding definitions, researching libraries.

#### octocode-implement
```
Flow: SPEC → CONTEXT → PLAN → RESEARCH → IMPLEMENT → VALIDATE
```

**Features**:
- Reads and parses task specifications from MD files
- Deep codebase research before writing code
- Pattern discovery to follow existing conventions
- Impact analysis before modifying code
- Test-driven implementation with validation gates

**Core Principle**: "Read 10x more than you write. Measure twice, cut once."

#### octocode-plan
```
Flow: UNDERSTAND → RESEARCH → PLAN → IMPLEMENT → VERIFY
```

**Features**:
- Adaptive execution flow based on goal type
- Evidence-based coding with pattern validation
- Goal classification (RESEARCH_ONLY, ANALYSIS, CREATION, FEATURE, BUG, REFACTOR)
- Research synthesis with confidence levels
- Plan approval gates before implementation

**Best For**: Complex features requiring structured planning, multi-step implementations.

#### octocode-pr-review
```
Flow: CONTEXT → CHECKPOINT → ANALYSIS → FINALIZE → REPORT
```

**Domain Reviewers**:
| Domain | Focus Areas |
|--------|-------------|
| 🐛 Bug | Runtime errors, logic flaws, resource leaks |
| 🏗️ Architecture | Pattern violations, circular dependencies |
| ⚡ Performance | O(n²), memory leaks, blocking ops |
| 🎨 Code Quality | Naming, conventions, DRY violations |
| 🔗 Duplicate Code | Missed reuse opportunities |
| 🚨 Error Handling | Swallowed exceptions, poor diagnostics |
| 🔄 Flow Impact | Breaking changes, altered data paths |

#### octocode-roast
```
Flow: SCOPE → ROAST → INVENTORY → SPOTLIGHT → REDEMPTION
```

**Sin Severity Levels**:
| Level | Icon | Fix When |
|-------|------|----------|
| 💀 CAPITAL OFFENSES | Security, God functions | NOW |
| ⚖️ FELONIES | `any` abuse, N+1 queries | Today |
| 🚨 CRIMES | Magic numbers, nested ternaries | This week |
| 🤖 SLOP | AI hallucinations, verbosity | Shame them |
| 📝 MISDEMEANORS | Console logs, TODO fossils | Judge silently |
| 🅿️ PARKING TICKETS | Trailing whitespace | Mention if bored |

---

## Installation

### Option 1: CLI Command (Recommended)

```bash
# Install via npx
npx octocode skills install

# Or if installed globally
octocode skills install
```

This copies all official skills to `~/.claude/skills/` for global availability.

### Option 2: Interactive Menu

```bash
npx octocode
# Select "🎯 Skills Manager"
# Choose "🐙 Octocode Official"
# Select skills to install
```

### Option 3: Manual Copy

```bash
# Global (all projects)
cp -r skills/octocode-* ~/.claude/skills/

# Project-specific
cp -r skills/octocode-* .claude/skills/
```

### Installation Paths

| Platform | Default Path |
|----------|--------------|
| macOS/Linux | `~/.claude/skills/` |
| Windows | `%LOCALAPPDATA%\Claude\skills\` |

Custom paths can be set via the CLI:
```bash
octocode skills
# Select "📁 Change default skills path"
```

---

## Skill Structure

### Standard Layout

```
{skill-name}/
├── SKILL.md              # Main reference (<500 lines)
└── references/           # Supporting documentation (optional)
    ├── tool-reference.md
    └── workflow-patterns.md
```

### SKILL.md Format

Skills use YAML frontmatter for metadata:

```yaml
---
name: skill-name
description: Use when [specific triggers]...
---

# Skill Title

## Flow Overview
`PHASE1` → `PHASE2` → `PHASE3`

## 1. Agent Identity
<agent_identity>
Role: **Agent Type**. Expert description.
**Objective**: What the agent does.
**Principles**: Core behaviors.
</agent_identity>

## 2. Scope & Tooling
<tools>
| Tool | Purpose |
|------|---------|
| `toolName` | When to use |
</tools>

## 3. Decision Framework
<confidence>
| Level | Certainty | Action |
|-------|-----------|--------|
| ✅ HIGH | Verified | Use as evidence |
| ⚠️ MED | Likely correct | Use with caveat |
| ❓ LOW | Uncertain | Investigate more |
</confidence>

## 4. Research Flows
<research_flows>
Transition matrices and tool chains.
</research_flows>

## 5. Execution Flow
<key_principles>
Step-by-step execution lifecycle.
</key_principles>

## 6. Error Recovery
<error_recovery>
How to handle failures and edge cases.
</error_recovery>
```

---

## Skills Marketplace

The CLI includes a skills marketplace with community-contributed skills:

### Available Marketplaces

| Marketplace | Description | Skills |
|-------------|-------------|--------|
| 🐙 Octocode Official | Research, planning, review & roast | 6 |
| Build With Claude | Largest collection | 170+ |
| Claude Code Plugins + Skills | Organized categories with tutorials | Various |
| Claude Skills Marketplace | Git automation, testing, code review | Various |
| Daymade Claude Skills | Production-ready development | Various |
| Superpowers | TDD, debugging, git worktrees | Various |
| Claude Scientific Skills | Scientific computing | Various |
| Dev Browser | Browser automation with Playwright | Various |

### Browsing the Marketplace

```bash
npx octocode
# Select "🎯 Skills Manager"
# Choose " Browse Marketplace"
```

---

## Creating Custom Skills

### Guidelines

1. **Keep SKILL.md under 500 lines** - Use `references/` for detailed documentation
2. **Description = When to Use** - Don't describe workflow, describe triggers
3. **Test with pressure scenarios** before deploying
4. **Follow the standard structure** - Consistent format helps AI parse correctly

### Template

```yaml
---
name: my-custom-skill
description: Use when [specific scenario]...
---

# My Custom Skill

## Flow Overview
`PHASE1` → `PHASE2` → `OUTPUT`

## 1. Agent Identity
<agent_identity>
Role: **Custom Agent**. Expert in [domain].
**Objective**: [What it does].
**Principles**: [Core behaviors].
</agent_identity>

## 2. Scope & Tooling
<tools>
| Tool | Purpose |
|------|---------|
| `localSearchCode` | Find patterns |
| `localGetFileContent` | Read implementations |
</tools>

## 3. Execution Flow
<key_principles>
1. **Step 1**: Description
2. **Step 2**: Description
3. **Output**: Deliverable format
</key_principles>
```

### Best Practices

| Do | Don't |
|----|-------|
| Use XML tags for sections | Use plain markdown headers only |
| Provide tool transition matrices | List tools without context |
| Include confidence levels | Assume all findings are certain |
| Add user checkpoints | Execute without confirmation |
| Cite file paths precisely | Give vague references |

---

## Shared Principles

All official skills follow these core principles:

1. **Local-First**: Prefer local tools over shell commands
2. **Research Before Action**: Always gather evidence first
3. **User Checkpoints**: Ask before major actions
4. **TaskCreate/TaskUpdate**: Track progress with tasks
5. **Validation**: Green build required
6. **No Time Estimates**: Never provide timing
7. **Evidence Citing**: Include file paths and code references

---

## Troubleshooting

### Skills Not Loading

1. Verify installation path:
   ```bash
   ls ~/.claude/skills/
   ```

2. Check SKILL.md frontmatter:
   ```yaml
   ---
   name: skill-name
   description: Required description
   ---
   ```

3. Ensure Claude Code is configured to read skills

### Skill Not Triggering

- Check the `description` field matches your use case
- Try explicitly mentioning the skill name
- Verify the skill is in the correct directory

### Marketplace Fetch Errors

- Check network connectivity
- GitHub API rate limits may apply
- Try again later or use manual installation

---

## Related Documentation

- [CLI Docs Index](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-cli/docs/README.md) - Package documentation entry point
- [CLI Reference](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-cli/docs/CLI_REFERENCE.md) - Complete CLI commands
- [Claude Skills Documentation](https://support.anthropic.com/en/articles/10176498-how-to-use-custom-instructions-for-your-projects)
- [Octocode MCP](https://octocode.ai)
