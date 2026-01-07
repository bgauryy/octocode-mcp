# Octocode Skills

Pre-built Claude Code skills for enhanced AI-assisted research and development.

## Available Skills

| Skill | Description | Flow |
|-------|-------------|------|
| `octocode-research` | Evidence-first code forensics (local & GitHub) | PREPARE → DISCOVER → ANALYZE → OUTPUT |
| `octocode-local-search` | Local-first code exploration and discovery | DISCOVER → PLAN → EXECUTE → VERIFY → OUTPUT |
| `octocode-pr-review` | Defects-first PR review across 6+ domains | CONTEXT → CHECKPOINT → ANALYSIS → FINALIZE → REPORT |
| `octocode-generate` | App scaffolding with stack selection | DISCOVERY → STACK → PLAN → RESEARCH → SCAFFOLD → VALIDATE |
| `octocode-roast` | Brutally honest code review with comedic flair | SCOPE → ROAST → INVENTORY → SPOTLIGHT → REDEMPTION |

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

**Use when**: Answering questions about codebases, implementations, dependencies, or bugs. Researching code across local workspace AND GitHub repositories.

Features:
- Local-first strategy (prefer local tools over shell commands)
- GitHub code forensics across repositories
- Cross-domain transitions (Local ↔ GitHub)
- node_modules inspection with `noIgnore=true`
- Multi-agent parallelization for independent hypotheses
- Validation pattern: Discover → Verify → Cross-check → Confirm

### octocode-local-search

**Use when**: Exploring unfamiliar codebases, searching for patterns locally, understanding project structure, finding implementations in your workspace.

Features:
- Local-only focus (no GitHub tools)
- Structured discovery with `localViewStructure`, `localSearchCode`, `localFindFiles`, `localGetFileContent`
- Interactive planning with user checkpoints
- node_modules inspection with `noIgnore=true`
- Token-efficient workflows with discovery mode
- Multi-agent parallelization for independent research domains

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

### octocode-generate

**Use when**: Scaffolding new applications with optimal tech stack selection.

Supported Frameworks:
- **Fullstack**: Next.js, T3 Stack, Remix, Nuxt
- **Frontend**: Vite, Angular
- **Mobile**: Expo (React Native)
- **Desktop**: Electron Vite
- **Backend**: NestJS, Hono, Fastify

### octocode-roast

**Use when**: You want entertainment with your code review, finding antipatterns, or humorous feedback.

Features:
- Sin severity classification (FELONY → WAR CRIME → PARKING TICKET)
- Personalized zingers based on actual patterns found
- Multiple roast personas (Gordon Ramsay, Disappointed Dad, Tech Bro, Israeli Sabra, etc.)
- User checkpoint before fixes (Redemption Arc)
- Actionable fixes with before/after

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
