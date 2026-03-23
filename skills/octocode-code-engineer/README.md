<div align="center">
  <img src="https://github.com/bgauryy/octocode-mcp/raw/main/packages/octocode-mcp/assets/logo_white.png" width="400px" alt="Octocode Logo">

  <h1>Octocode Code Engineer</h1>

  <p><strong>AI agent skill — code with full codebase awareness</strong></p>
  <p>Architecture · Quality · Smart Coding · Security · Refactoring · Reviews · Testing</p>

  [![Skill](https://img.shields.io/badge/skill-agentskills.io-purple)](https://agentskills.io/what-are-skills)
  [![License](https://img.shields.io/badge/license-MIT-blue)](https://github.com/bgauryy/octocode-mcp/blob/main/LICENSE)

</div>

---

## The Problem

AI coding agents are fast — but without codebase awareness, they produce **patches**. Feature by feature, fix by fix, the repo accumulates junk: duplicated logic, dead exports, dependency cycles, god modules, untested critical paths, copy-paste patterns where a shared abstraction should exist. The agent doesn't know what's already there, so it reinvents it. It doesn't see the dependency graph, so it deepens coupling. It doesn't check blast radius, so it breaks things silently.

As the codebase grows, the problem compounds: agents lose the ability to reason about it effectively. Context windows fill up, navigation gets noisy, and the agent starts making worse decisions — more patches, more duplication, more breakage. **The code the agent wrote yesterday makes the agent worse at coding today.** Maintainability degrades in a feedback loop that's hard to reverse manually.

## What Is This

An AI agent skill that solves this by making your coding agent **understand the codebase while it works** — not after the damage is done. Before writing a line of code, the agent maps the structure, checks for existing patterns, measures blast radius, and verifies architecture safety. After coding, it re-scans to prove nothing got worse.

It answers the questions your linter can't: *what's the blast radius? where should this code live? who calls this? is this safe to change? does this already exist?*

Just ask your AI agent — it uses this skill automatically for any engineering task.

---

## Setup

### 1. Install the Skill (default: Claude)

```bash
npx octocode-cli skills install --skill octocode-code-engineer
```

Multi-target install (e.g. all supported targets):

```bash
npx octocode-cli skills install --skill octocode-code-engineer --targets claude-code,claude-desktop,cursor,codex,opencode
```

### 2. Octocode MCP with Local Tools (required)

This skill needs **Octocode MCP** with `ENABLE_LOCAL` to work at full power. Add this to your MCP configuration:

```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "type": "stdio",
      "args": ["octocode-mcp@latest"],
      "env": {
        "ENABLE_LOCAL": "true"
      }
    }
  }
}
```

**`ENABLE_LOCAL: true`** unlocks:
- **Local search** — find code patterns across your codebase
- **File content** — read files with targeted matching
- **Directory structure** — explore project layout
- **LSP tools** — go-to-definition, find-references, call-hierarchy for semantic validation

> Without `ENABLE_LOCAL`, the skill falls back to CLI-only mode (AST structural search only — no semantic validation).

---

## What You Can Do

Just tell your agent what you need. It picks the right mode automatically.

### Explore & Understand

| Ask the agent | What happens |
|--------------|-------------|
| "how does X work", "explore this module" | Traces code flow with structure, search, and LSP |
| "where should this live", "before I build X" | Maps layout, patterns, and dependencies to find the right location |

### Build & Change

| Ask the agent | What happens |
|--------------|-------------|
| "implement this", "add feature", "fix this bug" | Checks blast radius and consumers before coding, verifies after |
| "plan this refactor", "safe to rename" | Impact analysis with test/prod split |
| "change CLI flag", "modify endpoint" | Maps public contracts, checks compatibility, updates docs |

### Analyze & Improve

| Ask the agent | What happens |
|--------------|-------------|
| "check architecture", "find cycles" | Dependency graph, coupling hotspots, chokepoints |
| "audit code", "scan for problems" | Scans, validates findings with LSP, presents with evidence |
| "security review", "find vulnerabilities" | Detects sink patterns, traces taint paths |
| "test coverage gaps", "unused deps" | Coverage mapping, dead-code detection, import analysis |

---

## What It Detects

**76+ detection categories** across 7 pillars:

| Pillar | Highlights |
|--------|------------|
| **Architecture** | Cycles, coupling, chokepoints, layer violations, orphan modules |
| **Code Quality** | Complexity, god modules, duplicates, `any` usage, empty catches |
| **Performance** | Await-in-loop, sync I/O, uncleared timers, listener leaks |
| **Security** | Secrets, eval, SQL injection, path traversal, command injection |
| **Dead Code** | Dead exports, unused deps, boundary violations |
| **Test Quality** | Low assertions, excessive mocks, missing cleanup |
| **Semantic** | Over-abstraction, DIP violations, shotgun surgery |

---

## How It Works

Three layers work together:

```
CLI Scanner (graph + AST)  →  flag structural candidates
AST Engine (presets)       →  zero false-positive patterns
Octocode MCP (LSP)        →  validate against live code
```

Findings are **hypotheses, not facts**. The agent validates each one with LSP tools before presenting it to you — confirmed, dismissed, or uncertain with evidence.

---

## Performance

| Metric | Value |
|--------|-------|
| Cold scan (400-file monorepo) | ~3s |
| With `--semantic` | ~5-8s |
| Cached (no changes) | <1s |

---

## What It's Not For

- Syntax errors → use `tsc`
- Style enforcement → use ESLint / Prettier
- Runtime debugging → use tests / debugger
- Deep taint analysis / SCA → use Semgrep or dedicated tools

---

## License

MIT License © 2026 Octocode — see [LICENSE](https://github.com/bgauryy/octocode-mcp/blob/main/LICENSE).
