---
name: octocode-generate-quick
description: FAST AI development - single agent, one spec, straight to code
argument-hint: "Your application idea (e.g., 'Build a todo app with React')"
arguments:
  - name: project_idea
    description: Your application idea or request
    required: true
---

# Octocode Quick Generate Command

**FAST MODE:** Single planning agent → One approval gate → Implementation → Quality loops

Perfect for MVPs, prototypes, small-to-medium projects when speed matters.

## 📚 MCPs Available

**octocode-mcp**: Research + Boilerplates
- **🚀 START HERE:** `https://github.com/bgauryy/octocode-mcp/blob/main/resources/boilerplate_cli.md` - CLI commands for instant setup
- Architecture patterns: `https://github.com/bgauryy/octocode-mcp/tree/main/resources`
- Search GitHub for similar projects (>500★)

**octocode-local-memory**: Agent coordination (tasks, locks, status, messaging)

## Request

$ARGUMENTS

## Rules

**Docs:** Single consolidated file `<project>/docs/PROJECT_SPEC.md` (~80KB)
**Git:** NO git commands - user handles commits/pushes
**MVP:** Build + Types + Lint ONLY (NO tests until post-MVP)

## MVP Focus

**DO:** ✅ Build passes ✅ Types correct ✅ Lint passes ✅ Features work
**DON'T:** ❌ NO test files ❌ NO test setup ❌ NO automated testing

Tests added post-MVP when user requests.

## Workflow (3 Simple Phases)

**Phase 1: Rapid Planning** → `agent-rapid-planner` → `PROJECT_SPEC.md` → ✋ **SINGLE GATE**
**Phase 2: Implementation** → 2-8 `agent-implementation` (dynamically scaled, parallel) → 🔄 Live monitor
**Phase 3: Quality Check & Code Review** → `agent-rapid-planner` → Build/Lint validation + Bug scan → ✅ Done

**Post-Implementation:** User runs `npm run build && npm run lint`, verifies, commits when ready

**Note:** Quick mode INCLUDES automated code review by `agent-rapid-planner` (Phase 3). Standard mode also has code review by `agent-quality-architect` (Phase 5).

## Single Document Structure

**PROJECT_SPEC.md** contains everything:

```markdown
# [Project Name] - Project Specification

## 1. Overview & Requirements
- What we're building (2-3 sentences)
- Must-have features (P0/P1/P2 prioritized)
- Target users & scale (if relevant)

## 2. Architecture & Design

### 🚀 Quick Start Command
```bash
# Initialize project with boilerplate (USE THIS!)
npx create-next-app@latest my-app --typescript --tailwind --app
# OR: npx create-t3-app@latest
# OR: npm create vite@latest -- --template react-ts
```
**Why this boilerplate:** [1-line reason]

### Tech Stack
- Frontend/Backend/Database with 1-line rationale each
- Key libraries with reasons

### System Architecture
- Simple text diagram showing flow
- Key design decisions (why X over Y)
- Database schema (if needed)
- API endpoints (if needed)
- Project structure

## 3. Verification Plan
- Manual testing steps per feature
- Quality gates (build ✅ lint ✅ types ✅)
- NO automated tests (post-MVP)

## 4. Implementation Tasks
- Phase breakdown (setup/core/frontend/polish)
- Task: description, files, complexity (LOW/MED/HIGH)
- Parallelization opportunities marked

## 5. Implementation Progress
- Status tracking (updated by agents)
- Task completion percentages

---
**Created by octocode-mcp**
```

## Phase Details

### Phase 1: Rapid Planning

**agent-rapid-planner** does ALL planning in one pass:

1. **Quick Questions** (2-3 only, if needed)
   - Core functionality unclear?
   - Tech preference (if not specified)?
   - Scale/performance critical?

2. **Research**
   - **🚀 FIRST:** Check `boilerplate_cli.md` for CLI command (10x faster!)
   - Find 2-3 similar projects (>500★)
   - Extract key patterns

3. **Design**
   - Choose boilerplate command
   - Design tech stack with rationale
   - Create architecture diagram
   - Database/API design (if needed)
   - Break into tasks with complexity

4. **Output:** Single `PROJECT_SPEC.md` (~80KB)

**✋ GATE 1 (ONLY GATE):** User reviews complete spec
- **[1] ✅ Approve & Build** → Start implementation immediately
- **[2] 📝 Modify** → What to change? → Update spec → Re-present
- **[3] ❓ Questions** → Answer → Re-present

### Phase 2: Implementation

**agent-manager** orchestrates 2-8 `agent-implementation` instances (dynamically scaled based on task complexity):
- Task assignments via octocode-local-memory
- File locks prevent conflicts
- Progress updates inline in PROJECT_SPEC.md
- Parallel execution where possible

**🔄 Live Monitor:** [1] Pause [2] Details [3] Continue

### Phase 3: Quality & Code Review

**agent-rapid-planner** runs validation + bug scan:

**Step 1: Build Validation**
1. Build check (`npm run build`) - must pass
2. Lint check (`npm run lint`) - must be clean
3. Types check (TypeScript strict) - no errors
4. Feature completeness - all P0 features implemented

**Step 2: Code Review (Bug Prevention)**
1. **Logic Flow** - Trace critical paths, edge cases, async patterns
2. **Type Safety** - Input validation, API validation, type guards
3. **Error Handling** - Try-catch blocks, error messages, no silent failures
4. **Security** - No secrets, input sanitization, auth checks
5. **Performance** - Memory leaks, resource cleanup, efficient queries
6. **Common Bugs** - Array mutations, race conditions, state issues

**If Issues Found:**
- Create fix tasks (CRITICAL priority)
- Back to implementation
- Re-validate
- **Max 2 quality loops**

**If All Clean:**
- Update PROJECT_SPEC.md status: ✅ Complete & Reviewed
- Ready for user verification!

## Speed Comparison

| Mode | Phases | Gates | Docs | Code Review |
|------|--------|-------|------|-------------|
| **Quick** | 3 | 1 | 1 file | ✅ Phase 3 (rapid-planner) |
| Standard | 5 | 3 | 5 files | ✅ Phase 5 (quality-architect) |

**Quick mode is faster!** Both modes now include automated code review for bug prevention.

## When to Use Quick Mode

✅ **Use Quick:**
- MVPs and prototypes
- Small-to-medium projects
- Personal projects
- When speed matters
- Learning/experimentation
- Projects with clear requirements

❌ **Use Standard:**
- Complex enterprise projects
- Projects needing extensive documentation
- Multiple stakeholder approvals required
- Uncertain requirements needing discovery

## Smart Instructions for agent-rapid-planner

**You are being invoked by the QUICK command. Follow this EXACT workflow:**

### Phase 1: Planning (YOUR PRIMARY ROLE)

1. **Greet & Clarify**
   - Brief greeting: "I'll create a complete project spec for [project]"
   - Ask 2-3 CRITICAL questions ONLY if truly unclear
   - Skip obvious details

2. **Research Boilerplates FIRST**
   - Fetch: `https://github.com/bgauryy/octocode-mcp/blob/main/resources/boilerplate_cli.md`
   - Find matching CLI command (create-next-app, create-t3-app, vite, etc.)
   - This is 10x faster than from scratch!

3. **Quick Architecture Research**
   - Find 2-3 similar projects (>500★)
   - Extract key patterns
   - Keep it brief

4. **Create PROJECT_SPEC.md**
   - Follow the template structure EXACTLY
   - Include 🚀 Quick Start Command section with CLI command
   - Keep concise: ~80KB, direct statements, no fluff
   - Mark task complexity (LOW/MED/HIGH)
   - Identify parallel opportunities

5. **Present for Approval** (SINGLE GATE)
   ```
   ✅ PROJECT SPECIFICATION READY
   
   📋 Project: [Name]
   🎯 Features: [N] must-have features
   🚀 Boilerplate: [Command]
   🏗️ Stack: [Frontend + Backend + Database]
   📝 Tasks: [N] tasks, [M] can run in parallel

   Review docs/PROJECT_SPEC.md
   
   [1] ✅ Approve & Start Building
   [2] 📝 Modify (what to change?)
   [3] ❓ Questions
   ```

### Phase 3: Quality Check (YOUR SECONDARY ROLE)

**After implementation completes, YOU validate:**

1. **Run Checks**
   ```bash
   npm run build  # Must pass
   npm run lint   # Must be clean
   ```

2. **Code Review Checklist**
   - [ ] Logic flow traced, edge cases checked
   - [ ] Input validation present
   - [ ] Error handling in async functions
   - [ ] No hardcoded secrets
   - [ ] Event listeners cleaned up
   - [ ] No common bug patterns

3. **If Issues:** Create fix tasks → Implementation → Re-validate (max 2 loops)

4. **If Clean:** Update PROJECT_SPEC.md with ✅ Complete & Reviewed status

### Key Principles

✅ **DO:**
- Use boilerplate CLI commands (10x faster)
- Keep spec concise (~80KB)
- Single approval gate
- Comprehensive code review
- Fix bugs immediately

❌ **DON'T:**
- Create test files (post-MVP)
- Ask 10 questions (2-3 max)
- Create multiple documents
- Skip code review
- Write verbose explanations

## Start

Launch `agent-rapid-planner` with user's request and these smart instructions.

