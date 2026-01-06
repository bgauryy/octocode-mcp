# Research Paths & Reflection Log

## Research Session Summary

**Target:** `@anthropic-ai/claude-agent-sdk` v0.1.76
**Files:** `cli.js` (10.5MB), `sdk.mjs` (850KB)
**Goal:** Understand terminal UI patterns and agent architecture

---

## Phase 001: Initial Discovery

### Findings
- Identified bundle structure: esbuild-bundled with `__create`, `__toESM` helpers
- Package is an SDK wrapper around Claude Code CLI
- Two main entry points: `cli.js` (runtime), `sdk.mjs` (SDK wrapper)

### Key Locations
| Component | File | Location |
|-----------|------|----------|
| Entry point | `sdk.mjs` | Line ~26703 |
| ProcessTransport | `sdk.mjs` | Line ~12956 |
| Query class | `sdk.mjs` | Line ~13497 |

---

## Phase 002: Core Architecture

### What is this?
The SDK spawns `cli.js` as a child process and communicates via JSON-over-stdio. The SDK provides:
- `query()` - Main AsyncGenerator entry point
- `ProcessTransport` - Child process management
- `Query` - Agent loop state machine

### Key Discoveries
1. Uses stdio JSON streaming (`--output-format stream-json`)
2. Supports MCP servers via `--mcp-servers` JSON config
3. Has complex control message protocol for permissions/hooks
4. 12 hook events cover entire agent lifecycle

### Research Paths Identified
- [x] Tool permission flow (can_use_tool)
- [x] Hook system (HOOK_EVENTS)
- [x] Sub-agent spawning (Agent tool)
- [x] Background task management (TaskOutput)
- [x] Context compaction (PreCompact)

---

## Phase 003: Terminal UI Analysis

### Framework Stack
| Layer | Technology |
|-------|------------|
| UI Framework | Ink (React for CLI) |
| Layout | Yoga (Flexbox) |
| Styling | Chalk-like (V1.*) |
| Progress | @inkjs/ui Spinner |

### Key UI Locations in cli.js

| Pattern | charOffset | Notes |
|---------|------------|-------|
| Border styles | 4279459 | single, double, round, dashed |
| Progress component | 4357331 | ink-progress |
| Hyperlinks (OSC 8) | 9089386 | Terminal link support |
| Message rendering | 9413778 | Box + Text components |
| Tool use display | 9880442 | Status icons + spinner |
| Error display | 4319563 | Error Box pattern |

---

## Phase 004: Sub-Agent System

### Built-in Agent Types
| Type | charOffset | Description |
|------|------------|-------------|
| `explore` | 8582293 | Read-only research |
| `Plan` | 8588402 | Planning (no writes) |

### Agent Configuration
- Agents defined via `options.agents` (SDK) or `.claude/agents/*.md` (files)
- YAML frontmatter for `color`, `model`, `forkContext`
- Tool restrictions per agent type

---

## Phase 005: Skill System

### Key Location
- `cli.js:6909838` - Skill loading/processing

### Skill Structure
```
.claude/skills/
├── my-skill/
│   ├── SKILL.md          # Skill definition
│   └── references/       # Context files
```

### Processing Pattern
- `$ARGUMENTS` placeholder replaced with user input
- Reference files loaded for context injection

---

## Phase 006: Session Management

### Storage Locations
| Path | Purpose |
|------|---------|
| `~/.claude/projects/<hash>/sessions/` | Session files |
| `~/.claude/sessions.json` | Session index |

### Resume Flow
1. Load session from disk
2. Reconstruct message history
3. Fork if `forkSession` option
4. Continue agent loop

---

## Phase 007: octocode-cli Comparison

### Feature Mapping

| Claude SDK Feature | octocode-cli Status |
|-------------------|---------------------|
| Ink UI | ✅ Implemented |
| Static + Dynamic | ✅ Implemented |
| Hook events (12) | ✅ Identical |
| Sub-agents | ✅ OCTOCODE_SUBAGENTS |
| Session persistence | ✅ SQLite |
| Background tasks | ❌ TO IMPLEMENT |
| Context compaction | ❌ TO IMPLEMENT |
| Tool progress messages | ❌ TO IMPLEMENT |

### Critical UX Issues Identified
1. **Tool results disappear** - 1 second timeout
2. **100 message limit** - Hardcoded window
3. **Arrow key conflict** - Input vs scrolling
4. **Ctrl+C exits** - Should cancel first
5. **No export** - Can't share findings

---

## Research Artifacts Created

| File | Lines | Purpose |
|------|-------|---------|
| `research.md` | 238 | Master doc - CLI UI analysis |
| `best-practices.md` | 294 | Terminal UI best practices |
| `overview.md` | 160+ | Package structure overview |
| `flows.md` | 280+ | Execution flows (updated) |
| `entities.md` | 320+ | Classes and types (updated) |
| `strings.md` | 160+ | Constants and paths (updated) |
| `paths.md` | This file | Research reflection |
| `priorities.md` | 25 | Focus areas |
| `claude-agent-sdk-architecture.md` | 2068 | Complete SDK documentation |
| `octocode-cli-ux-audit.md` | 1135 | Detailed UX audit |

---

## Next Steps

### For octocode-cli

**P0 - Critical (Fix Now):**
1. Show tool results - Remove 1s timeout
2. Add `/export` command
3. Fix Ctrl+C - Cancel, not exit

**P1 - High Priority:**
4. Implement background tasks (TaskOutput equivalent)
5. Add context compaction
6. Fix scroll mode (separate from input)

**P2 - Medium Priority:**
7. Add `/search` in history
8. Implement permission UI
9. Model-aware cost estimation

---

## Reflection Notes

### What Worked
- Pattern-based search (ripgrep) for large minified file
- charOffset references for navigation
- Incremental documentation updates
- Parallel research threads

### What Could Improve
- Initial file structure exploration was slow
- Some patterns required multiple search iterations
- Could benefit from automated pattern extraction

### Key Insights
1. Claude Code's UI is sophisticated but follows clear patterns
2. The SDK/CLI separation is clean and well-designed
3. octocode-cli has good foundations but missing critical UX features
4. Tool result visibility is the #1 issue for power users

---

*Research completed January 5, 2026*
*Total research artifacts: ~4,500 lines of documentation*

