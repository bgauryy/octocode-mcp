<div align="center">
  <img src="https://github.com/bgauryy/octocode-mcp/raw/main/packages/octocode-mcp/assets/logo_white.png" width="400px" alt="Octocode Logo">

  <h1>Octocode Code Engineer</h1>

  <p><strong>AI agent skill — code with full codebase awareness</strong></p>
  <p>Architecture · Quality · Smart Coding · Security · Refactoring · Reviews · Testing</p>

  [![Skill](https://img.shields.io/badge/skill-agentskills.io-purple)](https://agentskills.io/what-are-skills)
  [![License](https://img.shields.io/badge/license-MIT-blue)](https://github.com/bgauryy/octocode-mcp/blob/main/LICENSE)

</div>

---

## What Is This

An AI agent skill that makes your coding agent **understand the codebase while it works** — not just when you ask for a review. It powers every engineering task: exploring unfamiliar code, writing features with blast radius awareness, refactoring safely, checking architecture, auditing quality, and more.

Unlike `tsc`, ESLint, or tests that check local correctness, this skill answers: **what's the blast radius? where should this code live? who calls this? is this safe to change?**

It combines a **CLI scanner** (dependency graph + AST + semantic analysis), an **AST engine** (`@ast-grep/napi` with structural presets), and **Octocode MCP local/LSP tools** (search, go-to-definition, find-references, call-hierarchy) into one platform that integrates into your coding workflow — not a separate review step.

It has two public surfaces:

- **CLI surface** — `scripts/index.js`, `scripts/ast/search.js`, and `scripts/ast/tree-search.js`
- **Artifact API** — `summary.md`, `summary.json`, `findings.json`, `architecture.json`, and `file-inventory.json`

Just ask your AI agent — it uses this skill automatically for any engineering task.

---

## What It Can Do

The skill has four modes that compose together. The agent picks the right one based on your request.

### Understand & Navigate

| Capability | Ask the agent | What happens |
|-----------|--------------|-------------|
| **Codebase Exploration** | "how does X work", "explore this module" | Structure → Search → Fetch with LSP semantic tracing |
| **Pre-Implementation Check** | "where should this live", "before I build X" | Layout → existing patterns → dependency map → safe location |

### Build & Change

| Capability | Ask the agent | What happens |
|-----------|--------------|-------------|
| **Smart Coding** | "implement this", "add feature", "fix this bug" | Behavior contract → pre-check (blast radius, consumers, coupling) → code → verify |
| **Interface Change Safety** | "change CLI", "rename flag", "modify endpoint", "change payload" | Public contract map → compatibility check → docs/migration → verify |
| **Refactoring Planning** | "plan this refactor", "safe to rename" | Impact analysis → test/prod split → decomposition candidates |

### Analyze & Improve

| Capability | Ask the agent | What happens |
|-----------|--------------|-------------|
| **Architecture Analysis** | "check architecture", "find cycles" | Dependency graph, cycles, SCC clusters, coupling hotspots, chokepoints |
| **Quality Audit** | "audit code", "scan for problems" | Scan → validate → present → plan fixes → apply → verify |
| **Code Quality Review** | "review this module", "is this code good" | AST smell sweep + complexity + dead code + maintainability |
| **Code Review** | "review impact of changes" | Change impact → architecture delta → new issues → test coverage |
| **Test Strategy** | "test coverage gaps", "what needs testing" | Coverage mapping + test quality + critical untested code |
| **Security Analysis** | "security review", "find vulnerabilities" | AST sink patterns + LSP taint tracing + sanitizer detection |
| **Dependency Health** | "unused deps", "import analysis" | Dead-code scan + reference counting + import mapping |

---

## Setup

### Octocode MCP (recommended)

For full power — the agent scans, then confirms findings with LSP-powered semantic tools:

```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "type": "stdio",
      "args": [
        "octocode-mcp@latest"
      ],
      "env": {
        "ENABLE_LOCAL": "true"
      }
    }
  }
}
```

`ENABLE_LOCAL: true` unlocks local search, file content, directory structure, and LSP tools (go-to-definition, find-references, call-hierarchy) that the agent uses to validate findings against live code.

> **Without Octocode MCP**, the skill still works in CLI-only mode with AST structural search. Octocode MCP adds semantic precision.

---

## How It Works

Three analysis layers work together in every mode:

```
CLI Scanner (graph + AST + semantic) → broad hypotheses with file:line
AST Engine (structural presets, proof)    → zero false-positive pattern detection
Octocode MCP (local search + LSP)    → semantic validation against live code
```

**When exploring** — the agent chains them as a research funnel:
```
STRUCTURE → SEARCH → FETCH   (see shape → find it → read evidence)
```

**When coding** — behavior first, then architecture:
```
Think:   behavior contract → blast radius → consumer map → architecture safety
         → CLI/API contract impact → edge cases
Code:    TDD when possible → no patches/duplications → no junk comments
Verify:  tests + relevant CLI/API checks + docs/examples sync
         → deterministic (AST re-scan + presets) + agentic (LSP refs + calls)
         → lint + build
```

**When auditing** — the agent validates before presenting:
```
Scan → Triage → Validate each finding with LSP → Present with evidence
```

---

## What It Detects

**Detection categories** across 7 pillars (run `--help` for the current full list):

| Pillar | Categories | Highlights |
|--------|-----------|------------|
| **Architecture** | 22 | Cycles, coupling, SCC clusters, chokepoints, layer violations, orphan/unreachable modules, boundary chatter, startup risk |
| **Code Quality** | 21 | Complexity, god modules/functions, duplicates, maintainability, `any` usage, empty catches, promise misuse |
| **Performance** | 5 | Await-in-loop, sync I/O, uncleared timers, listener leaks, unbounded collections |
| **Security** | 9 | Secrets, eval, SQL injection, prototype pollution, path traversal, command injection, unvalidated input |
| **Dead Code** | 11 | Dead exports, dead re-exports, unused deps, boundary violations, barrel explosion |
| **Test Quality** | 8 | Low assertions, excessive mocks, shared mutable state, missing cleanup, focused tests |
| **Semantic** | additional | Unused parameters, over-abstraction, DIP violations, shotgun surgery (requires `--semantic`; run `--help` for current count) |

Especially strong for **agentic/MCP repos**: catches prompt-to-path, prompt-to-command, tool boundary leaks.

---

## What You Get

- **Health scores** per pillar with letter grades
- **Prioritized findings** with severity, confidence, `file:line` evidence, impact, and suggested fixes
- **Architecture graph** (Mermaid dependency visualization)
- **lspHints** on each finding — so the agent can confirm with Octocode MCP before presenting as fact
- **Smart output** — category-diverse truncation, chain dedup, computed remediation, architecture heuristics

---

## Performance

| Metric | Value |
|--------|-------|
| Cold scan (400-file monorepo) | ~3s |
| Cold scan + `--semantic` | ~5-8s |
| Cached scan (no changes) | <1s |

Incremental caching stores per-file AST results. Unchanged files skip re-parsing.

---

## When to Use / When Not

**Use when:**
- Understanding code — "how does X work?", "explore this module", "where should this live?"
- Writing code with codebase awareness — blast radius, consumers, coupling, edge cases
- Planning refactors — impact analysis, test/prod split, decomposition candidates
- Architecture, quality, or security review needed
- Finding dead code, coverage gaps, or dependency issues

**Coding standards enforced:**
- Behavior-first contract (current vs desired, acceptance criteria, invariants)
- Architecture-first thinking (map structure before coding)
- CLI/API contracts treated as code for public changes
- TDD when possible (failing test → fix → pass)
- No patches/duplications (find existing patterns first)
- No redundant comments (explain *why*, not *what*)
- Docs/examples/migration notes updated when behavior changes
- Dual-layer verification: agentic (Octocode LSP) + deterministic (AST/CLI)
- Confidence tiers: high (structural proof), medium (semantic signal), low (behavioral trace)

**Don't use for:**
- Syntax errors → `tsc`
- Style enforcement → ESLint / Prettier
- Runtime debugging → tests / debugger
- Deep taint analysis / SCA → Semgrep or dedicated tools

---

## License

MIT License © 2026 Octocode — see [LICENSE](https://github.com/bgauryy/octocode-mcp/blob/main/LICENSE).
