# Octocode Skills

Pre-built Claude Code skills for enhanced AI-assisted research and development.

## Available Skills

| Skill | Description | Flow |
|-------|-------------|------|
| `octocode-research` | Research code in local and remote repositories using library functions | INSTALL → IMPORT → CALL |
| `octocode-local-search` | Local codebase exploration & search | DISCOVER → PLAN → EXECUTE → VERIFY → OUTPUT |
| `octocode-implement` | Implement features from spec documents (context/doc required) | SPEC → SPEC_VALIDATE → CONTEXT → PLAN → RESEARCH → IMPLEMENT → VALIDATE |
| `octocode-plan` | Adaptive research & implementation planning with evidence-based execution | UNDERSTAND → RESEARCH → PLAN → IMPLEMENT → VERIFY |
| `octocode-pr-review` | PR review for bugs, security & quality (requires PR URL) | CONTEXT → CHECKPOINT → ANALYSIS → FINALIZE → REPORT |
| `octocode-roast` | Brutally honest roasts of your code with fixes | TARGET → OBLITERATE → INVENTORY → AUTOPSY → RESURRECT |

## Installation

### Option 1: CLI Command

```bash
octocode skills install
```

This copies all skills to `~/.claude/skills/` for global availability.

### Option 2: Manual Copy

Copy skill folders to your Claude skills directory:

```bash
# Global (all projects)
cp -r skills/octocode-* ~/.claude/skills/

# Project-specific
cp -r skills/octocode-* .claude/skills/
```

## Skill Details

### octocode-research

**Use when**: Searching code, exploring codebases, finding definitions, tracing call hierarchies, or analyzing GitHub repos. Trigger phrases: "find where", "search for", "how is X used", "what calls", "explore the codebase", "look up package".

Features:
- **Library functions** (not MCP tools) - import and call directly
- Local tools: `localSearchCode`, `localGetFileContent`, `localFindFiles`, `localViewStructure`
- LSP tools: `lspGotoDefinition`, `lspFindReferences`, `lspCallHierarchy`
- GitHub tools: `githubSearchCode`, `githubGetFileContent`, `githubSearchRepositories`, `githubViewRepoStructure`, `githubSearchPullRequests`
- Package tools: `packageSearch` (npm/PyPI)
- CLI scripts in `scripts/` folder for quick usage

Installation:
```bash
cd skills/octocode-research
./install.sh
```

### octocode-local-search

**Use when**: Exploring unfamiliar codebases, searching for patterns locally, understanding project structure, finding implementations in your workspace.

Features:
- Local-only focus (no GitHub tools)
- Structured discovery with `localViewStructure`, `localSearchCode`, `localFindFiles`, `localGetFileContent`
- LSP semantic intelligence: `lspGotoDefinition`, `lspFindReferences`, `lspCallHierarchy`
- Interactive planning with user checkpoints
- node_modules inspection with `noIgnore=true`
- Token-efficient workflows with discovery mode
- Multi-agent parallelization for independent research domains

### octocode-implement

**Use when**: Implementing features from specification documents (MD files, PRDs, tickets), building new functionality in large/unfamiliar codebases, or executing task lists with proper research.

Features:
- Reads and parses task specifications from MD files
- Deep codebase research before writing code
- Delegates to `octocode-local-search` for local workspace search & LSP
- Delegates to `octocode-research` for external GitHub research
- Pattern discovery to follow existing codebase conventions
- Impact analysis before modifying code
- Test-driven implementation with validation gates
- User checkpoints at key decision points
- Multi-agent parallelization for independent tasks

Core Principle: "Read 10x more than you write. Measure twice, cut once."

### octocode-plan

**Use when**: Implementing features requiring research-driven planning, tackling complex multi-step tasks, building new functionality with proper validation, or when you need structured implementation with approval gates.

Features:
- Adaptive execution flow: UNDERSTAND → RESEARCH → PLAN → IMPLEMENT → VERIFY
- Research orchestration - delegates to specialized skills
- Goal classification (RESEARCH_ONLY, ANALYSIS, CREATION, FEATURE, BUG, REFACTOR)
- Research synthesis with confidence levels
- Plan approval gates before implementation
- Research-to-Plan traceability (every step references evidence)
- Multi-agent parallelization for independent research domains
- Structured output to `.octocode/plan/{session-name}/`

Core Principle: "Research Before Code. Synthesize Evidence into Plans. Follow the Plan. Green Build Required."

### octocode-pr-review

**Use when**: Reviewing pull requests for bugs, security vulnerabilities, architecture problems, performance issues, and code quality.

Domain Reviewers:
- 🐛 Bug (runtime errors, logic flaws, resource leaks)
- 🏗️ Architecture (pattern violations, circular dependencies)
- ⚡ Performance (O(n²), memory leaks, blocking ops)
- 🎨 Code Quality (naming, conventions, DRY violations)
- 🔗 Duplicate Code (missed reuse opportunities)
- 🚨 Error Handling (swallowed exceptions, poor diagnostics)
- 🔄 Flow Impact (breaking changes, altered data paths)

Features:
- Uses both GitHub tools and local LSP for impact analysis
- Focus ONLY on changed code ('+' prefix in diffs)
- Cites precisely with file:line references

### octocode-roast

**Use when**: You want entertainment with your code review, finding antipatterns, or humorous feedback.

Features:
- Three Laws: Cite or Die, Punch the Code Not the Coder, Wait for Consent
- Sin severity classification with precise citations
- Triage mode for 20+ sins (pick top 10)
- User checkpoint before fixes (Redemption Arc)
- Actionable fixes with before/after

Tone: Battle-hardened staff engineer + tech Twitter energy + Gordon Ramsay reviewing frozen pizza

## Skill Structure

Each skill follows Anthropic's best practices:

```
{skill-name}/
├── SKILL.md           # Main reference (<500 lines)
└── references/        # Supporting documentation (optional)
    ├── tool-reference.md
    └── workflow-patterns.md
```

## Shared Principles

All skills follow these core principles:

1. **Local-First**: Prefer local tools over shell commands
2. **Research Before Action**: Always gather evidence first
3. **User Checkpoints**: Ask before major actions
4. **TodoWrite**: Track progress with tasks
5. **Validation**: Green build required
6. **No Time Estimates**: Never provide timing
7. **Evidence Citing**: Include file paths and code references

## Creating Custom Skills

See `octocode-research/` as a template. Key guidelines:

1. **SKILL.md** - Main file with YAML frontmatter:
   ```yaml
   ---
   name: skill-name
   description: Use when [specific triggers]...
   ---
   ```

2. **Keep SKILL.md under 500 lines** - Use references/ for details

3. **Description = When to Use** - Don't describe workflow, describe triggers

4. **Test with pressure scenarios** before deploying

## More Info

- [Claude Skills Documentation](https://support.anthropic.com/en/articles/10176498-how-to-use-custom-instructions-for-your-projects)
- [Octocode MCP](https://octocode.ai)
