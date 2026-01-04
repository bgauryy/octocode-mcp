# Octocode Skills

Pre-built Claude Code skills for enhanced AI-assisted research and development.

## Available Skills

| Skill | Description | Flow |
|-------|-------------|------|
| `octocode-research` | Evidence-first code forensics (local & GitHub) | PREPARE → DISCOVER → ANALYZE → OUTPUT |
| `octocode-pr-review` | Defects-first PR review across 6 domains | CONTEXT → CHECKPOINT → ANALYSIS → REPORT |
| `octocode-plan` | Research-driven planning & implementation | UNDERSTAND → RESEARCH → PLAN → IMPLEMENT → VERIFY |
| `octocode-generate` | App scaffolding with stack selection | DISCOVERY → STACK → PLAN → SCAFFOLD → VALIDATE |

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
**Use when**: Answering questions about codebases, implementations, dependencies, or bugs.

Features:
- Local-first strategy (prefer local tools over shell commands)
- GitHub code forensics
- Cross-domain transitions (Local ↔ GitHub)
- node_modules inspection

### octocode-pr-review
**Use when**: Reviewing pull requests for issues.

Domain Reviewers:
- Bug (runtime errors, logic flaws)
- Architecture (pattern violations, coupling)
- Performance (O(n²), memory leaks)
- Code Quality (naming, conventions)
- Error Handling (swallowed exceptions)
- Flow Impact (breaking changes)

### octocode-plan
**Use when**: Planning complex implementations requiring research.

Goal Types:
- RESEARCH_ONLY - No code changes
- ANALYSIS - Understand existing code
- CREATION - New files/features
- FEATURE / BUG / REFACTOR - Modify existing

### octocode-generate
**Use when**: Scaffolding new applications.

Supported Frameworks:
- Fullstack: Next.js, T3 Stack, Remix, Nuxt
- Frontend: Vite, Angular
- Mobile: Expo
- Desktop: Electron Vite
- Backend: NestJS, Hono, Fastify

## Skill Structure

Each skill follows Anthropic's best practices:

```
{skill-name}/
├── SKILL.md           # Main reference (<500 lines)
└── resources/         # Supporting documentation (optional)
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

## Creating Custom Skills

See `octocode-research/` as a template. Key guidelines:

1. **SKILL.md** - Main file with YAML frontmatter:
   ```yaml
   ---
   name: skill-name
   description: Use when [specific triggers]...
   ---
   ```

2. **Keep SKILL.md under 500 lines** - Use resources/ for details

3. **Description = When to Use** - Don't describe workflow, describe triggers

4. **Test with pressure scenarios** before deploying

## More Info

- [Claude Skills Documentation](https://support.claude.com/en/articles/12512176-what-are-skills)
- [Octocode MCP](https://octocode.ai)
