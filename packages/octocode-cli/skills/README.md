# Octocode Skills

Pre-built Claude Code skills for enhanced AI-assisted research and development.

## Available Skills

| Skill | Description |
|-------|-------------|
| `octocode-research` | Evidence-first code forensics using Octocode MCP tools |

## Installation

### Option 1: CLI Command

```bash
octocode skills install
```

This copies skills to `~/.claude/skills/` for global availability.

### Option 2: Manual Copy

Copy the skill folder to your Claude skills directory:

```bash
# Global (all projects)
cp -r skills/octocode-research ~/.claude/skills/

# Project-specific
cp -r skills/octocode-research .claude/skills/
```

## Skill Structure

Each skill follows Anthropic's best practices:

```
{skill-name}/
├── SKILL.md           # Main reference (<500 lines)
├── resources/         # Supporting documentation
│   ├── tool-reference.md
│   └── workflow-patterns.md
└── scripts/           # Executable tools (optional)
```

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

