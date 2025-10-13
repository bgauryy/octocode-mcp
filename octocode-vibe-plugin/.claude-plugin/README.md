# Octocode-Vibe Plugin

A complete AI development team for Claude Code that transforms your requests into production-ready code through coordinated specialized agents.

## Overview

Octocode-Vibe orchestrates an 8-phase development lifecycle with specialized AI agents working together like a real software team:

```
Requirements → Architecture & UX (parallel) → Design Validation
→ Context Research → Task Orchestration → Parallel Implementation
→ QA Verification
```

## Features

- **Complete Development Workflow**: From idea to production-ready code
- **Specialized AI Agents**: Product Manager, Architect, UX Engineer, Tech Lead, Engineers, QA
- **Parallel Architecture & UX Design**: Backend and frontend designed simultaneously
- **Professional UX Design**: Wireframes, design systems, component libraries
- **Parallel Implementation**: Multiple agents work simultaneously
- **GitHub Research**: Uses octocode-mcp to find best practices and patterns
- **Runtime Testing**: Uses chrome-devtools-mcp to test applications in real Chrome browser, monitor console errors, verify network requests, and validate user flows
- **Human-in-the-Loop**: 5 approval gates for full control
- **State Persistence**: Resume from crashes with checkpoints
- **Full Observability**: Debug decisions, research, and communications

## Prerequisites

1. **Node.js** ≥18.12.0
2. **GitHub CLI** installed and authenticated
   ```bash
   brew install gh
   gh auth login
   ```
3. **Claude Code** with plugin support

## Installation

### Method 1: NPM Plugin (Coming Soon)

```bash
# Install the plugin
npm install -g octocode-vibe-plugin

# Or add to your Claude Code config
claude-code plugin install bgauryy/octocode-vibe
```

### Method 2: Local Development

1. Clone this repository:
   ```bash
   git clone https://github.com/bgauryy/octocode-mcp.git
   cd octocode-mcp/packages/octocode-mcp
   ```

2. Link the plugin to Claude Code:
   ```bash
   # Create a marketplace directory (if it doesn't exist)
   mkdir -p ~/.claude/marketplaces/local

   # Link this plugin
   ln -s $(pwd)/.claude-plugin ~/.claude/marketplaces/local/octocode-vibe
   ```

3. Configure Claude Code to use the local marketplace:
   ```bash
   # Add to ~/.claude/config.json
   {
     "marketplaces": [
       "~/.claude/marketplaces/local"
     ]
   }
   ```

4. Install the plugin in Claude Code:
   ```bash
   claude-code plugin install octocode-vibe
   ```

## Usage

### Basic Usage

Start a complete development project:

```bash
/octocode-vibe "create a stock portfolio tracker with real-time price updates"
```

### Resume from Interruption

If the process is interrupted, resume from the last checkpoint:

```bash
/octocode-vibe --resume
```

### Debug and Inspect

View decisions, communications, and research:

```bash
# Show debug dashboard
/octocode-debug

# View specific phase
/octocode-debug architecture

# View specific task
/octocode-debug task:3.2

# View agent decisions
/octocode-debug agent:agent-architect

# View all research
/octocode-debug research
```

## Development Workflow

### Phase 1: Requirements Gathering
**Agent:** `agent-product` (Product Manager)
- Asks clarifying questions
- Researches similar projects
- Creates comprehensive PRD
- **Gate 1:** User approves requirements

### Phase 2: Architecture & UX Design (Parallel Execution)
**Agents:** `agent-architect` + `agent-ux` (Solution Architect + UX Engineer)

**agent-architect** (Backend Focus):
- Designs backend architecture, APIs, database
- Researches tech stacks and patterns using octocode-mcp
- Makes technology decisions
- Focuses on security, performance, scalability

**agent-ux** (Frontend & UX Focus):
- Designs user experience and interface patterns
- Creates wireframes and design system
- Researches UI/UX best practices using octocode-mcp and web
- Defines component library and frontend architecture

**Coordination:**
- Both agents run simultaneously
- Communicate on frontend framework selection
- Align on API contracts and requirements
- Coordinate real-time data strategy

- **Gate 2:** User approves combined architecture & UX design

### Phase 3: Design Validation
**Agent:** `agent-design-verification` (Technical Lead)
- Validates requirements ↔ design alignment
- Checks technical feasibility
- Creates task breakdown with dependencies
- Identifies parallel execution opportunities
- **Gate 3:** User approves task breakdown

### Phase 4: Context Research (Parallel)
**Agent:** `agent-research-context` (Research Specialist)
- Uses octocode-mcp to research implementation patterns
- Gathers best practices from GitHub repositories
- Creates implementation guides
- Runs multiple research queries in parallel

### Phase 5: Task Orchestration
**Agent:** `agent-manager` (Engineering Manager)
- Analyzes task and file dependencies
- Creates execution plan
- Manages file locks to prevent conflicts
- Spawns multiple implementation agents

### Phase 6: Implementation (Parallel)
**Agents:** Multiple `agent-implementation` instances (Software Engineers)
- Execute tasks in parallel where possible
- Use context guides and design specs
- Write tests and fix issues
- Communicate with other agents when needed
- **Gate 4:** Live monitoring with pause/resume

### Phase 7: QA Verification
**Agent:** `agent-verification` (QA Engineer)
- Runs builds, tests, linting
- Verifies all features against PRD
- Checks performance criteria
- Performs static code analysis (type safety, complexity, dead code)
- Validates production readiness (environment, monitoring, health checks)
- **Runtime testing with Chrome DevTools** (chrome-devtools-mcp):
  - Starts local dev server
  - Opens application in Chrome browser
  - Monitors console for errors and warnings
  - Verifies network requests
  - Tests user interactions in real browser
  - Captures screenshots of issues
  - Fixes runtime errors
- Scans for critical bugs and security issues
- **Gate 5:** User approves final deliverable

## Human-in-the-Loop Gates

The system includes **5 explicit approval gates** where you maintain control:

1. **Gate 1 - After Requirements**: Approve PRD
2. **Gate 2 - After Architecture**: Approve technical design
3. **Gate 3 - After Validation**: Approve task breakdown
4. **Gate 4 - During Implementation**: Live monitoring with pause/resume
5. **Gate 5 - After Verification**: Approve final deliverable

At each gate, you can:
- ✅ Approve and continue
- 📝 Request modifications
- ❓ Ask questions
- 📖 Review detailed documents
- 🔄 Request alternatives

## State Persistence & Recovery

The system automatically checkpoints state after every phase and task completion to `.octocode/execution-state.json`.

If the process is interrupted:

```bash
/octocode-vibe --resume
```

This will:
- Load the last checkpoint
- Display recovery summary
- Resume from the current phase
- Reassign any in-progress tasks

## File Structure

During development, Octocode-Vibe creates:

```
.octocode/
  ├── requirements/          # PRD and requirements
  ├── designs/              # Backend architecture and design docs
  ├── ux/                   # UX design documents
  │   ├── user-flows.md
  │   ├── wireframes.md
  │   ├── component-library.md
  │   ├── design-system.md
  │   ├── interaction-patterns.md
  │   ├── accessibility.md
  │   ├── responsive-design.md
  │   └── frontend-architecture.md
  ├── context/              # Implementation patterns from research
  ├── tasks.md              # Task breakdown with statuses
  ├── logs/                 # Progress tracking
  ├── debug/                # Observability data
  │   ├── agent-decisions.json
  │   ├── communication-log.md
  │   ├── research-queries.json
  │   └── phase-timeline.json
  ├── execution-state.json  # Checkpoint state
  ├── locks.json            # File locks for parallel work
  └── verification-report.md # Final QA report
```

## Observability & Debugging

All agent decisions, communications, and research are logged for full transparency:

**View decision reasoning:**
```bash
/octocode-debug architecture
```

**See agent communications:**
```bash
/octocode-debug communications
```

**Inspect research queries:**
```bash
/octocode-debug research
```

**View task execution trace:**
```bash
/octocode-debug task:3.2
```

## Agents

### Product Manager (`agent-product`)
- Model: Opus
- Tools: Read, Write, WebSearch, TodoWrite, octocode-mcp
- Role: Requirements gathering and PRD creation

### Solution Architect (`agent-architect`)
- Model: Opus
- Tools: Read, Write, Grep, Glob, TodoWrite, octocode-mcp
- Role: Backend architecture, APIs, database, security, performance
- Capabilities: Questions assumptions, reasons through tradeoffs, evaluates alternatives with devil's advocate approach, documents decision rationale

### UX Engineer (`agent-ux`)
- Model: Opus
- Tools: Read, Write, WebSearch, WebFetch, TodoWrite, octocode-mcp
- Role: UX design, wireframes, design system, frontend architecture
- Capabilities: Questions user needs, reasons through design tradeoffs, validates with user mental models, creates accessible and delightful interfaces

### Technical Lead (`agent-design-verification`)
- Model: Sonnet
- Tools: Read, Write, Grep, TodoWrite
- Role: Design validation and task breakdown

### Research Specialist (`agent-research-context`)
- Model: Sonnet
- Tools: Read, Write, octocode-mcp
- Role: GitHub research and best practices

### Engineering Manager (`agent-manager`)
- Model: Sonnet
- Tools: Read, Write, TodoWrite, Bash, Task
- Role: Task orchestration and progress tracking

### Software Engineer (`agent-implementation`)
- Model: Sonnet
- Tools: Read, Write, Edit, Bash, Grep, Glob, TodoWrite, octocode-mcp
- Role: Code implementation and testing

### QA Engineer (`agent-verification`)
- Model: Sonnet
- Tools: Read, Bash, Grep, Glob, TodoWrite, chrome-devtools-mcp
- Role: Quality assurance and verification
- Capabilities: Static code analysis (type safety, complexity, dead code), production readiness verification (environment config, monitoring, health checks, security headers), **runtime testing in Chrome browser** (console errors, network monitoring, user flow testing, performance metrics), comprehensive testing and feature validation

## Examples

### Example 1: Full-Stack Application

```bash
/octocode-vibe "create a full-stack task management app with Next.js, PostgreSQL, and real-time updates"
```

The system will:
1. Ask clarifying questions (authentication, features, scale)
2. Research similar projects on GitHub
3. Design architecture AND UX in parallel:
   - Backend: Next.js + tRPC + Prisma + PostgreSQL
   - UX: Wireframes, design system, component library
4. Create task breakdown (~40 tasks)
5. Implement in parallel (4-5 agent instances)
6. Run comprehensive QA
7. Deliver production-ready code with professional UI/UX

### Example 2: API Service

```bash
/octocode-vibe "build a REST API for managing user subscriptions with Stripe integration"
```

### Example 3: Resume After Crash

```bash
# Original command was interrupted
/octocode-vibe --resume
```

Output:
```
✅ Requirements: Completed
✅ Architecture: Completed
✅ Design Verification: Completed
✅ Research: Completed
🔄 Implementation: In Progress (12/35 tasks completed)
⏸️  Verification: Not Started

Resuming from: Implementation Phase
Active tasks found: 4
```

## Configuration

### MCP Servers

The plugin automatically configures two MCP servers:

**octocode-mcp** - GitHub research and best practices:
- Search repositories by keywords and stars
- View repository structures
- Extract file contents from high-quality repos
- Search code patterns across GitHub

**chrome-devtools-mcp** - Runtime testing and browser automation:
- Launch local development servers
- Open applications in Chrome browser
- Monitor console logs and errors
- Track network requests and responses
- Test user interactions in real browser
- Capture screenshots of issues
- Verify performance metrics

```json
{
  "mcp": {
    "servers": {
      "octocode": {
        "command": "npx",
        "args": ["-y", "octocode-mcp@latest"]
      },
      "chrome-devtools": {
        "command": "npx",
        "args": ["chrome-devtools-mcp@latest"]
      }
    }
  }
}
```

### Custom Settings

Create `.octocode/config.json` to customize:

```json
{
  "concurrency": {
    "maxParallelAgents": 5,
    "lockTimeout": 300000
  },
  "humanInTheLoop": {
    "enableApprovalGates": true,
    "autoApproveGates": [],
    "pauseOnErrors": true
  },
  "debugging": {
    "enableDetailedLogging": true,
    "logAllDecisions": true
  }
}
```

## Troubleshooting

### Issue: MCP server not connecting

Ensure GitHub CLI is authenticated:
```bash
gh auth status
gh auth login
```

### Issue: Plugin not found

Verify plugin installation:
```bash
claude-code plugin list
```

Re-install if needed:
```bash
claude-code plugin install octocode-vibe
```

### Issue: State corruption

If execution state is corrupted:
```bash
# Remove corrupted state
rm .octocode/execution-state.json

# Start fresh
/octocode-vibe "your request"
```

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](../../CONTRIBUTING.md) for details.

## License

MIT License - see [LICENSE](../../LICENSE) for details.

## Links

- **GitHub**: https://github.com/bgauryy/octocode-mcp
- **MCP Server**: https://github.com/bgauryy/octocode-mcp
- **Documentation**: https://octocode.ai
- **Issues**: https://github.com/bgauryy/octocode-mcp/issues

## Credits

Built by [Guy Bary](https://github.com/bgauryy) using:
- [Claude Code](https://claude.com/claude-code)
- [octocode-mcp](https://github.com/bgauryy/octocode-mcp)
- [Anthropic MCP SDK](https://github.com/anthropics/mcp)

## Support

For issues and questions:
- Open an issue on [GitHub](https://github.com/bgauryy/octocode-mcp/issues)
- Join discussions in [GitHub Discussions](https://github.com/bgauryy/octocode-mcp/discussions)
