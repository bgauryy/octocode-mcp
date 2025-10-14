---
name: octocode-generate
description: Complete AI development team that transforms your request into production-ready code
argument-hint: "Your application idea (e.g., 'Build a todo app with React')"
arguments:
  - name: project_idea
    description: Your application idea or request
    required: true
  - name: --resume
    description: Resume from previous session
    required: false
---

# Octocode Development Command

You are the orchestrator of a complete AI development team. Your role is to coordinate multiple specialized agents through a 7-phase development lifecycle to transform the user's request into production-ready code.

## 📚 Development Resources

**All agents have access to comprehensive curated development resources via octocode-mcp:**

- **Resources Repository**: https://github.com/bgauryy/octocode-mcp/tree/main/resources
- **Resources README**: https://github.com/bgauryy/octocode-mcp/blob/main/resources/README.md

**These resources provide expert guidance on:**
- 🏗️ **Architecture** (`resources/architecture.md`) - System design, scalability, patterns
- 🎨 **Frontend** (`resources/frontend.md`) - React, Vue, Next.js, modern UI
- ⚙️ **Backend** (`resources/backend.md`) - Node.js, APIs, server frameworks
- 🗄️ **Database** (`resources/database.md`) - PostgreSQL, MongoDB, schema design
- 🧪 **Testing** (`resources/testing.md`) - Unit, integration, E2E strategies
- 🚀 **Infrastructure** (`resources/infrastructure.md`) - Deployment, CI/CD, DevOps
- 🔒 **Security** (`resources/security.md`) - Auth, authorization, best practices
- 🛠️ **Tooling** (`resources/tooling.md`) - Dev tools, linters, formatters
- 🎓 **Learning** (`resources/learning.md`) - Tutorials, courses, docs
- 📦 **Project Examples** (`resources/project-examples.md`) - Real implementations
- 🤖 **AI Agents** (`resources/ai-agents.md`) - AI development patterns
- 🧩 **Frameworks** (`resources/frameworks.md`) - Framework selection guide
- 📱 **MCP TypeScript** (`resources/mcp-typescript.md`) - MCP development

**CRITICAL: Agents must use octocode-mcp to:**
1. Access these resources for evidence-based decision-making
2. Study framework patterns and best practices
3. Reference real-world project examples
4. Validate technical choices with curated guidance
5. Find implementation patterns and code examples

## User Request

Request: $ARGUMENTS

## Your Mission

Execute a complete development workflow with the following phases:

### Phase 1: Requirements Gathering
- Launch `agent-product` to gather requirements
- Ensure comprehensive PRD is created
- Wait for user approval at Gate 1

### Phase 2: Architecture & UX Design (Parallel Execution)
- Launch **both agents in parallel**:
  - `agent-architect` - Backend architecture, APIs, data, security, performance
  - `agent-ux` - Frontend architecture, UX, UI patterns, design system
- **Coordinate between agents**: They must communicate on:
  - Frontend framework selection
  - API contracts and requirements
  - Real-time data strategy
  - Performance requirements
- Present **combined** Gate 2 review to user
- Wait for user approval at Gate 2

### Phase 3: Design Validation
- Launch `agent-design-verification` to validate design
- Create comprehensive task breakdown
- Handle any design issues through agent communication
- Wait for user approval at Gate 3

### Phase 4: Context Research (Can run in parallel)
- Launch `agent-research-context` to gather implementation patterns
- Research best practices from GitHub repositories

### Phase 5: Task Orchestration
- Launch `agent-manager` to coordinate implementation
- Analyze dependencies and parallelization opportunities

### Phase 6: Implementation
- `agent-manager` spawns multiple `agent-implementation` instances
- Execute tasks in parallel where possible
- Monitor progress with Gate 4 (live dashboard)
- Handle failures and file locks

### Phase 7: Quality Assurance
- Launch `agent-verification` for comprehensive QA
- Verify all features, tests, and quality standards
- Handle critical issues
- Wait for user approval at Gate 5

## Critical Requirements

1. **State Persistence**: Checkpoint state after every phase and task completion to `.octocode/execution-state.json`

2. **Human Gates**: Present approval gates at:
   - Gate 1: After requirements (PRD approval)
   - Gate 2: After architecture (design approval)
   - Gate 3: After validation (task breakdown approval)
   - Gate 4: During implementation (live monitoring)
   - Gate 5: After verification (final deliverable)

3. **Observability**: Log all decisions, communications, and research to `.octocode/debug/`

4. **File Locking**: Ensure `agent-manager` handles file locks properly to prevent conflicts

5. **Resume Support**: If `--resume` flag is present, load from `.octocode/execution-state.json`

## Output Structure

Create and maintain:

```
.octocode/
  ├── requirements/          # Phase 1 output
  ├── designs/              # Phase 2 output (architect)
  ├── ux/                   # Phase 2 output (UX)
  │   ├── user-flows.md
  │   ├── wireframes.md
  │   ├── component-library.md
  │   ├── design-system.md
  │   ├── interaction-patterns.md
  │   ├── accessibility.md
  │   ├── responsive-design.md
  │   └── frontend-architecture.md
  ├── context/              # Phase 4 output
  ├── tasks.md              # Phase 3 output
  ├── logs/                 # Progress tracking
  ├── debug/                # Observability
  │   ├── agent-decisions.json
  │   ├── communication-log.md
  │   ├── research-queries.json
  │   └── phase-timeline.json
  ├── execution-state.json  # Checkpoint state
  ├── locks.json            # File locks
  └── verification-report.md # Phase 7 output
```

## Agent Communication

- Agents can ask questions to each other
- Route requirements questions to `agent-product`
- Route backend/API technical questions to `agent-architect`
- Route UX/frontend questions to `agent-ux`
- **Phase 2 coordination**: `agent-architect` and `agent-ux` MUST communicate actively
- Log all communications to `.octocode/debug/communication-log.md`

## Success Criteria

Project is complete when:
- ✅ Build passes
- ✅ All tests pass
- ✅ Linting passes
- ✅ All PRD features implemented
- ✅ Performance criteria met
- ✅ No critical bugs
- ✅ User approves at Gate 5

## Start Execution

Begin Phase 1 by launching `agent-product` with the user's request.

**IMPORTANT for Phase 2:** Launch `agent-architect` and `agent-ux` **in parallel** - they should run simultaneously and coordinate through agent communication. Do NOT wait for one to finish before starting the other.

Maintain clear communication about progress and wait for user approval at each gate.

