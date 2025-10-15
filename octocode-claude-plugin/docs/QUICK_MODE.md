# Quick Mode Guide

**NEW in v1.1:** Fast-track development with simplified workflow

## The Problem with Standard Mode

Standard `/octocode-generate`:
- 6 phases with 4 approval gates
- 4 separate documentation files
- Comprehensive but **slower**

**For MVPs, prototypes, and small projects, this is overkill.**

## Quick Mode Solution

New `/octocode-generate-quick`:
- **3 phases** with **1 approval gate**
- **1 consolidated document** (PROJECT_SPEC.md)
- **Faster** for most projects
- Fast but still **quality-focused**

---

## Comparison

| Feature | Quick Mode | Standard Mode |
|---------|------------|---------------|
| **Command** | `/octocode-generate-quick` | `/octocode-generate` |
| **Agents** | 1 planner + 4-5 implementation | 6 specialized agents |
| **Phases** | 3 | 6 |
| **Gates** | 1 | 4 |
| **Documents** | 1 file (~80KB) | 4 files (~200KB) |
| **Speed** | Faster | Slower |
| **Best For** | MVPs, prototypes, small projects | Complex/enterprise projects |

---

## Quick Mode Workflow

### Phase 1: Rapid Planning

**agent-rapid-planner** creates complete specification:

```
User Request
     ↓
Ask 2-3 critical questions
     ↓
Research 2-3 similar projects (octocode-mcp)
     ↓
Create PROJECT_SPEC.md:
  - Overview & Requirements
  - Architecture & Design
  - Verification Plan
  - Implementation Tasks
     ↓
✋ GATE: User approves spec
```

**Single document, everything in one place!**

### Phase 2: Implementation

**agent-manager** + **4-5 agent-implementation** instances:

```
agent-manager reads PROJECT_SPEC.md
     ↓
Assigns tasks to implementation agents
     ↓
Agents work in parallel (file locks prevent conflicts)
     ↓
Progress updated inline in PROJECT_SPEC.md
     ↓
🔄 User can monitor live (pause/continue)
```

**Parallel execution, same as standard mode!**

### Phase 3: Quality Loops

**agent-rapid-planner** validates:

```
Run build check
     ↓
Run lint check
     ↓
Check TypeScript types
     ↓
Verify feature completeness
     ↓
Issues found? → Create fix tasks → Loop back to implementation
     ↓
All clean? → Mark complete ✅
```

**Maximum 3 validation loops**

---

## PROJECT_SPEC.md Structure

Everything in one consolidated document:

```markdown
# Project Specification

## 1. Overview & Requirements
- What we're building (2-3 sentences)
- Must-have features (prioritized list)
- Target users & scale (if relevant)

## 2. Architecture & Design
- Tech stack with rationale
- System architecture (simple diagram)
- Key design decisions
- Database schema (if needed)
- API design (if needed)
- Project structure
- Build & lint setup

## 3. Verification Plan
- Manual testing steps (checklist)
- Quality gates (build, lint, types)

## 4. Implementation Tasks
- Tasks by phase
- Complexity estimates
- Dependencies & parallelization
- Progress tracking (updated live)

---
Created by octocode-mcp
```

**Benefits:**
- ✅ Single source of truth
- ✅ Easy to navigate (one file)
- ✅ Everything context-related is together
- ✅ No jumping between 4 files

---

## When to Use Each Mode

### Use `/octocode-generate-quick` for:

✅ **MVPs and prototypes**
- You want to validate an idea fast
- Speed matters more than extensive documentation

✅ **Small-to-medium projects**
- Todo apps, dashboards, simple APIs
- Projects with clear requirements

✅ **Personal projects**
- Side projects, experiments
- Cost-conscious development

✅ **Learning**
- Understanding architectures quickly
- Trying new tech stacks

### Use `/octocode-generate` (standard) for:

✅ **Complex enterprise projects**
- Multiple stakeholder approvals needed
- Extensive documentation required

✅ **Uncertain requirements**
- Needs discovery phase
- Requirements need extensive research

✅ **Mission-critical systems**
- More upfront planning needed
- Risk mitigation critical

✅ **Team projects**
- Multiple teams need separate docs
- Comprehensive audit trail needed

---

## Example: Building a Todo App

### Quick Mode Timeline

```
1. /octocode-generate-quick "Build a todo app with React and Express"
2. agent-rapid-planner asks 2 questions
3. agent-rapid-planner creates PROJECT_SPEC.md
4. ✋ GATE: User reviews and approves spec
5. agent-manager assigns tasks to 4 implementation agents
6. Implementation by parallel agents
7. agent-rapid-planner validates (build ✅, lint ✅, types ✅)
8. ✅ Done - Ready for user testing
```

**Quick mode complete**

### Standard Mode Timeline (for comparison)

```
1. /octocode-generate "Build a todo app with React and Express"
2. agent-product creates requirements.md
3. ✋ Gate 1: Approve requirements
4. agent-architect creates design.md
5. ✋ Gate 2: Approve architecture
6. agent-quality creates test-plan.md
7. ✋ Gate 2.5: Approve test plan
8. agent-founding-engineer creates scaffold + README
9. ✋ Gate 2.75: Approve foundation
10. agent-manager creates tasks.md
11. Implementation begins (4 agents)
12. Implementation complete
13. ✅ Done - Ready for user testing
```

**Standard mode complete**

**Quick mode is faster!**

---

## Speed Optimizations in Quick Mode

### What Makes It Fast?

1. **Single Planning Agent**
   - No handoffs between product/architect/quality agents
   - All planning happens in one context
   - Faster decisions

2. **Consolidated Documentation**
   - Write once, not 4 times
   - No duplicate information
   - Easier to maintain consistency

3. **One Approval Gate**
   - User reviews once, not 4 times
   - Less back-and-forth
   - Faster to green-light

4. **Same Implementation Quality**
   - Parallel execution still used
   - File locking still prevents conflicts
   - Quality loops catch issues

5. **Focused Questions**
   - 2-3 critical questions only
   - No extensive discovery phase
   - User answers fast

---

## Quality Is Not Compromised

Quick mode is **faster**, not **sloppier**:

### Still Includes:

✅ **Research-driven decisions**
- Uses octocode-mcp to find proven patterns
- Evidence-based architecture choices
- References successful projects (>500★)

✅ **Quality validation**
- Build must pass
- Lint must pass
- TypeScript strict mode
- Feature completeness check

✅ **Validation loops**
- Catches issues automatically
- Creates fix tasks
- Re-validates after fixes

✅ **Parallel execution**
- Multiple agents work simultaneously
- File locking prevents conflicts
- Smart task distribution

### Traded Off:

❌ **Extensive documentation**
- 1 file vs 4 files
- More concise (but complete)

❌ **Multiple review points**
- 1 gate vs 4 gates
- Less checkpoints (but still validated)

❌ **Deep discovery**
- 2-3 questions vs longer exploration
- Assumes clearer requirements

---

## Cost Comparison

### Quick Mode (1 Opus + 4-5 Sonnet agents)

**Phase 1 (Planning):**
- 1 × Opus agent: ~$0.50-1.00

**Phase 2 (Implementation):**
- 4-5 × Sonnet agents: ~$2.00-4.00

**Phase 3 (Validation):**
- 1 × Opus agent: ~$0.10-0.20

**Total: ~$2.60-5.20**

### Standard Mode (3 Opus + 3-6 Sonnet agents)

**Phase 1-3 (Planning/Architecture/Validation):**
- 3 × Opus agents: ~$1.50-3.00
- 2 × Sonnet agents: ~$0.50-1.00

**Phase 4-6 (Implementation/Verification):**
- 4-5 × Sonnet agents: ~$2.00-4.00
- 1 × Sonnet agent: ~$0.30-0.50

**Total: ~$4.30-8.50**

**Quick mode saves 40-50% on AI costs!**

---

## Migration Path

### Already using standard mode?

You can mix modes:

```bash
# Start big project with standard mode for planning
/octocode-generate "Build complex SaaS platform"

# Use quick mode for new features
cd existing-project
/octocode-feature "Add user profiles"
```

### Trying quick mode first?

If project grows complex:

1. Quick mode generates PROJECT_SPEC.md
2. If needed, split into separate docs later
3. Continue with standard mode for next phase

---

## Tips for Quick Mode Success

### 1. Clear Initial Request

**Good:**
```
/octocode-generate-quick "Build a todo app with React frontend, 
Express backend, and PostgreSQL. Include user authentication."
```

**Better:**
```
/octocode-generate-quick "Build a todo app:
- React + TypeScript frontend
- Express + TypeScript backend
- PostgreSQL database
- JWT authentication
- CRUD operations for todos
- Mark todos complete/incomplete"
```

### 2. Answer Questions Concisely

Agent asks: "Should todos support categories?"

**Good:** "Yes, categories with colors"
**Better:** "Yes, categories table with name and color fields"

### 3. Review Spec Carefully

You only get **one approval gate** - make it count:

- ✅ Check tech stack makes sense
- ✅ Verify all features are listed
- ✅ Review task breakdown
- ✅ Confirm architecture approach

### 4. Trust the Validation Loops

If build/lint fails, agent will:
1. Identify issues
2. Create fix tasks
3. Re-run implementation
4. Validate again

**Let it loop** - don't intervene too early.

---

## Troubleshooting

### "Quick mode spec is too brief"

**Solution:** After gate approval, ask agent to expand specific sections:

```
"Expand the database schema section with field types and constraints"
```

Agent will update PROJECT_SPEC.md inline.

### "I need more planning time"

**Solution:** Use standard mode `/octocode-generate` for this project.

Quick mode assumes requirements are relatively clear.

### "Implementation is taking longer than estimated"

**Normal!** Estimates are for planning purposes.

Complex tasks may take longer. Monitor with live dashboard.

### "Quality loop keeps failing"

After loop 3, agent reports issues to you.

Common causes:
- Complex TypeScript types need manual fixes
- API integration issues
- Missing environment variables

**Fix manually** or provide guidance to agents.

---

## Success Metrics

After using quick mode, you should have:

✅ **Fast turnaround** - Project complete quickly
✅ **Working code** - Build, lint, types all pass
✅ **Single spec** - Everything documented in PROJECT_SPEC.md
✅ **Quality validated** - Automated checks passed
✅ **Ready to test** - Manual verification can begin

---

## Roadmap

### Coming Soon

- **Even faster mode:** `/octocode-generate-instant` (AI designs, auto-approves, builds)
- **Templates:** Pre-built specs for common projects (REST API, Next.js app, CLI tool)
- **Spec imports:** Start from existing project structure
- **Cost tracking:** Real-time cost display during generation

---

## Feedback

Quick mode is **new in v1.1**. We're iterating based on usage.

Found an issue? Have suggestions?
- GitHub Issues: https://github.com/bgauryy/octocode-mcp/issues
- Discussions: https://github.com/bgauryy/octocode-mcp/discussions

---

**Try it now:**

```bash
/octocode-generate-quick "Build a [your idea here]"
```

**Fast, quality-focused, research-driven development!**

---

**Made with ❤️ by Guy Bary**

🚀 **Octocode Quick Mode** - Speed meets quality

