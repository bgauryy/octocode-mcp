# AI Agent: Creating ARCHITECTURE.md

## Mission & Quality Standard

**Create ARCHITECTURE.md that enables new contributors to answer in <2 min:**
- Where to make change X?
- What does module Y do?
- Why was decision Z made?
- What are the invariants?
- See main flows
- What NOT to do?

**ANTI-HALLUCINATION RULE:** Every claim MUST cite `file:line` or config. If you can't find it, mark `[TODO: verify]` and ask user.

---

## Workflow Overview

```
0. Check Existing Docs → Read or skip
1. Discover Project    → Ecosystem, type, scale, entry points
   ↓ PAUSE: Present findings + Ask User (scope/depth/focus)
2. Core Architecture   → Classes, patterns, boundaries
   ↓ PAUSE: Verify findings with user
3. Cross-Cutting       → Errors, tests, config, security, ADRs
   ↓ PAUSE: Confirm completeness
4. Generate & Validate → Fill template, check quality
```

**Rule:** ASK when unclear. Never guess type, scope, or priorities.

---

## Phase 0: Check Existing Docs

**Why:** Don't lose context or duplicate work.

**Search:** `ARCHITECTURE.md`, `DESIGN.md`, `architecture/`, `adr/`, `docs/adr/`

**If found:**
1. Read existing docs
2. Identify gaps vs template sections
3. Ask user: Update | Create new | Review only

**If missing:** Proceed to Phase 1

---

## Phase 1: Discover Project (VERIFY EVERYTHING)

**Why:** Wrong assumptions → wrong doc. Must confirm project type before analyzing.

### Step 1.1: Identify Ecosystem & Type

**Find manifest first:**
- JS/TS: `package.json`
- Python: `pyproject.toml`, `setup.py`
- Rust: `Cargo.toml`
- Java: `pom.xml`, `build.gradle`
- Go: `go.mod`

**Determine type from manifest + structure:**

| Type | Indicators | Entry Points | Focus |
|------|-----------|--------------|-------|
| **Backend API** | `express`/`fastify`/`flask` deps | `server.ts`, `app.py` | Routes, middleware, data layer |
| **Frontend** | `react`/`vue`/`svelte` deps | `index.tsx`, `App.tsx` | Components, routing, state |
| **CLI** | `bin:` field, `click`/`commander` deps | `bin/`, `cli.ts` | Commands, arg parsing |
| **Library** | No `bin`, exports in manifest | `index.ts`, `lib.rs` | Public API surface |
| **Monorepo** | `packages/`, `workspaces:` | Root + package entry points | Inter-package deps |

**VERIFY:** Check 2-3 files to confirm type. Don't assume from name alone.

### Step 1.2: Map Entry Points

**Search patterns by type:**
- **API:** `app.listen`, `@app.route`, route definitions
- **Frontend:** `ReactDOM.render`, `createApp`, root component
- **CLI:** `program.command`, `@click.command`, arg parsing
- **Library:** Exported functions/classes in main file

**Tool Strategy:**
1. `local_view_structure` (depth=1) → Get overview
2. `local_ripgrep` (mode="discovery") → Find entry patterns
3. `local_fetch_content` (matchString) → Read entry points

**OUTPUT:** List of `file:line` entry points with purpose

### Step 1.3: Assess Scale

- **Small:** <50 files, single package
- **Medium:** 50-500 files, may have submodules
- **Large:** 500+ files or monorepo with multiple packages

**Monorepo Decision Gate:**
- Multiple packages → Ask: "Document entire repo | specific package | high-level only?"

---

## PAUSE: Interactive Planning (Phase 1.5)

**Present to user:**

**What I Found:**
- Type: [API/Frontend/CLI/Library/Monorepo]
- Scale: [Small/Medium/Large] ([N] files)
- Language: [Lang + version]
- Build: [tool + key scripts]
- Tests: [framework + location]
- Entry points: [list with file:line]
- Existing docs: [found/missing]

**Proposed Plan:**

**Scope:** [Areas to document - src/tests/docs, specific packages]
**Depth:**
- A) Overview (depth=1, entry points only)
- B) Standard (depth=2, key files + abstractions)
- C) Comprehensive (depth=2+, all patterns + ADRs)

**Focus:**
- A) Entry points + public APIs
- B) Core architecture + boundaries
- C) Cross-cutting concerns + all ADRs

**Risks/Unknowns:** [Ambiguities that may affect scope]

**Which approach? (A/B/C or custom)**

---

## Phase 2: Core Architecture (CITE SOURCES)

**Why:** Document the "skeleton" - how components relate and where boundaries are.

### Step 2.1: Find Key Abstractions

**Search patterns by language:**
- **JS/TS:** `export class`, `export interface`, `export type`
- **Python:** `class`, `@dataclass`, `Protocol`
- **Rust:** `pub struct`, `pub trait`, `impl`
- **Go:** `type`, `interface`, `struct`

**Tool Strategy:**
1. `local_ripgrep` (pattern by lang, mode="discovery") → Find abstractions
2. `local_fetch_content` (matchString for top 5-10) → Read definitions
3. Note: Used by (search references), Implements/Extends (inheritance)

**OUTPUT:** For each abstraction: `TypeName` (`file:line`) - Purpose, Used by, Relations

### Step 2.2: Map Boundaries & Layers

**Find dependency flow:**
- Public vs internal (export patterns, visibility markers)
- Layers (API → business logic → data)
- Module boundaries (import/export analysis)

**Create simple ASCII diagram:**
```
[Interface/API Layer]
       ↓
[Business Logic Layer]
       ↓
[Data/Infrastructure Layer]
```

**OUTPUT:** Layer diagram + dependency rules + `file:line` examples

### Step 2.3: Identify Patterns

**Common patterns to search:**
- Dependency injection: constructor params, `@inject`
- Factory: `create*`, `build*` functions
- Observer: event emitters, pub/sub
- Repository: data access abstractions
- Middleware: pipeline, chain of responsibility

**VERIFY:** Don't claim pattern without citing implementation `file:line`

---

## PAUSE: Verify Core Architecture

**Present to user:**
- Key abstractions found (top 10)
- Boundary diagram
- Patterns identified

**Ask:** "Does this match your understanding? Any critical components missing?"

---

## Phase 3: Cross-Cutting Concerns (SEARCH & VERIFY)

**Why:** Document non-functional requirements and operational aspects.

### Error Handling

**Search:** `throw new`, `Error(`, `Result<`, `Either<`, `panic!`, `except`

**Document:**
- Strategy: [How errors propagate - exceptions/Result types/error boundaries]
- Invariants: [Rules - where to catch, how to log]
- Examples: `file:line`

### Testing

**Find test framework:**
- JS/TS: `jest.config`, `vitest.config`, `describe(`, `test(`
- Python: `pytest`, `unittest`, `test_*.py`
- Rust: `#[test]`, `tests/`
- Go: `_test.go`

**Document:**
- Framework: [Name + version]
- Location: [test directories]
- Run: `[exact command from package.json/Makefile]`
- Philosophy: [Unit/integration/e2e split]

### Configuration

**Search:** `.env`, `config/`, environment variable usage

**Document:**
- Files: [List config files with purpose]
- Env vars: [Key variables - search `process.env`, `os.getenv`]
- Precedence: [Load order]

### Security

**Search:** Auth/authz implementations, data validation

**Document (if applicable):**
- Auth: [JWT/session/OAuth - cite implementation]
- Authz: [RBAC/ABAC - cite middleware]
- Data protection: [Encryption, sanitization - cite usage]

### Observability

**Search:** `logger`, `console.log`, `winston`, `pino`, telemetry

**Document:**
- Logging: [Framework + key log points]
- Metrics: [What's tracked]
- Debug tips: [How to enable verbose logging]

### Architectural Decision Records (ADRs)

**Search existing:** `docs/adr/`, `0001-*.md`, decision logs in docs

**For each significant decision (from code analysis), document:**

```markdown
### [Decision Title]
**Date:** YYYY-MM-DD | **Status:** Accepted

**Context:** [What problem needed solving - cite issue/requirement]
**Alternatives:** [Options considered + why rejected]
**Decision:** [Choice made + rationale]
**Consequences:**
- PROS: [Benefits]
- CONS: [Trade-offs - be honest]
```

**Common decisions to look for:**
- Framework choice (why X over Y)
- Architecture pattern (why layered/hexagonal/etc)
- Database choice
- State management approach
- Build tool selection

**RULE:** Both PROS and CONS required. No decision is perfect.

---

## PAUSE: Confirm Cross-Cutting Coverage

**Present to user:**
- Error handling strategy
- Test framework + philosophy
- Config approach
- Security measures (if applicable)
- ADRs identified

**Ask:** "Any additional cross-cutting concerns to document?"

---

## Phase 4: Generate ARCHITECTURE.md

**Use this template structure. Keep headings as shown.**

```markdown
# Architecture
> High-level architecture of [PROJECT_NAME]

## Bird's Eye View
**What**: [System purpose in 1 sentence]
**How**: [Key tech stack + architectural approach]
**Why**: [Architectural philosophy - why this design]

## Entry Points
- **Main**: `file:line` - [description]
- **APIs**: `file:line` - [interfaces]
- **Config**: `file:line` - [entry]

**Start here**: Read `[file]`, then explore `[module]`

## Code Map
### `/src/[dir]`
**Purpose**: [What this directory does]
**Key files**:
- `file:line` - [purpose]
- `file:line` - [purpose]

**Invariants**: [Rules that must not be broken]
**API Boundary**: [What's public vs internal]

[Repeat for each major directory]

## System Boundaries & Layers
```
[ASCII diagram of layers and dependency flow]
```

**Rules**: [How boundaries are enforced]
**Dependency Direction**: [Must flow from X → Y, never reverse]

## Key Abstractions & Types
- **`TypeName`** (`file:line`) - [Purpose]
  - **Used by**: [Components that depend on this]
  - **Implements/Extends**: [Inheritance/interface relations]

[List top 5-10 most important abstractions]

## Architectural Decisions

[Include ADRs from Phase 3 - see ADR format above]

[If >5 ADRs, link to `docs/adr/` instead of inlining]

## Cross-Cutting Concerns

### Error Handling
**Strategy**: [Approach - exceptions/Result types/boundaries]
**Invariants**: [Where to catch, how to log, propagation rules]
**Examples**: `file:line`

### Testing
**Framework**: [Name] | **Location**: [dirs] | **Run**: `[command]`
**Philosophy**: [Unit/integration split, coverage goals]

### Configuration
**Files**: [config.json, .env - with purposes]
**Env Vars**: [KEY_VAR - usage]
**Precedence**: [Env > config file > defaults]

### Security
[Only if applicable]
**Auth**: [Implementation approach - cite `file:line`]
**Authz**: [Model - RBAC/etc - cite middleware]
**Data**: [Encryption, validation - cite usage]

### Observability
**Logging**: [Framework + key log points]
**Metrics**: [What's tracked]
**Debug**: [How to enable verbose mode]

## Dependencies & Build

### Key Dependencies
- **[name]**: [version] - [Why we use it]

[List top 5-10 critical dependencies only]

### Build Commands
```bash
[install command]  # Install dependencies
[build command]    # Production build
[dev command]      # Development mode
[test command]     # Run tests
```

## Design Patterns & Constraints

### Patterns Used
- **[Pattern Name]**: [Where + why] - `file:line` example

### Anti-Patterns to Avoid
- **AVOID [Anti-pattern]**: [Why it's bad + what to do instead]

### Assumptions
- [Runtime environment assumptions]
- [Scale/load assumptions]
- [User behavior assumptions]

### Constraints
**Technical**: [Technology/platform limits]
**Business**: [Requirements that drive design]
**Operational**: [Deployment/scaling restrictions]

## Contributors Guide

### Bug Fixes
1. **Locate**: Bug likely in `[typical directory]`
2. **Fix**: Edit `[file]`, add test in `[test location]`
3. **Test**: `[test command]`
4. **Verify**: `[build/lint commands]`

### New Features
1. **Design**: Review this doc, identify affected components
2. **Implement**: Follow pattern from `[example file:line]`
3. **Test**: Add tests in `[location]`
4. **Document**: Update this doc if architecture changes

### Navigation Tips
- **Find feature X**: Look in `[directory/pattern]`
- **Understand component Y**: Read `[file:line]`
- **Add capability Z**: Follow example `[file:line]`
```

---

## Quality Validation Checklist

**Before finalizing, verify each:**

- [ ] Every claim has `file:line` citation or config reference
- [ ] Entry points are concrete files, not vague descriptions
- [ ] ADRs include both PROS and CONS (no "perfect" decisions)
- [ ] Diagrams are simple ASCII/Mermaid, not complex
- [ ] Anti-patterns documented (what NOT to do)
- [ ] Test/build commands are exact (copy from package.json/Makefile)
- [ ] No hallucinated patterns - only cite what you found in code
- [ ] Assumptions and constraints explicitly stated
- [ ] New contributor could answer: "Where do I start to add feature X?"

**If ANY item fails → Fix before presenting to user**

---

## Tool Efficiency Rules

**DO:**
- Start with `mode="discovery"` or `filesOnly=true` (fast overview)
- Use `matchString` + `matchStringContextLines=5` (targeted reads)
- Batch 3-5 queries per tool call (parallel efficiency)
- Use `depth=1-2` for structure exploration (not 3+)
- Use `minified=true` (default - saves tokens)

**DON'T:**
- Use `fullContent=true` on large files without `charLength` limit
- Use `depth=3+` (causes timeouts)
- Search before knowing what to search for (explore structure first)
- Claim pattern exists without citing `file:line` evidence

---

## Decision Gates: When to Ask User

**ASK when:**
1. Project type unclear (multiple valid interpretations)
2. Monorepo with many packages (which to document?)
3. Multiple entry points (which is primary?)
4. Unfamiliar tech stack (need pointer to main entry)
5. Large codebase (priority areas?)
6. Generated vs source code (focus on source only?)

**NEVER guess. Quick question > wasted analysis.**

---

## Output Quality Standards

**Conciseness:** Bullets > paragraphs. Short sections > long walls of text.

**Evidence:** Every architectural claim links to `file:line` or config.

**Honesty:** Document trade-offs, cons, assumptions. No perfect systems.

**Actionability:** New contributors can navigate and contribute.

**Tone:** Neutral, technical, factual.

**Scope:** Match repo complexity. Don't over-document tiny projects. Don't under-document complex ones.

---

## Common Pitfalls to Avoid

| Pitfall | Why Bad | Solution |
|---------|---------|----------|
| Skip existing docs | Lose context | Always search first (Phase 0) |
| No `file:line` citations | Can't verify/navigate | Cite every claim |
| Only document PROS | Surprises later | PROS **and** CONS required |
| Guess project type | Wrong analysis | Verify manifest + structure |
| Claim pattern without evidence | Hallucination | Only cite what you found in code |
| Vague "in src/" references | Can't navigate | Concrete `src/services/auth.ts:42` |
| Complex Mermaid diagrams | Harder to maintain | Simple ASCII better |
| Copy README content | Duplication | README = usage, ARCH = design |

---

## Final Workflow Summary

```
0. Search existing docs → Read or skip
   ↓
1. Discover: Manifest → Type → Scale → Entry points
   ↓ PAUSE: Present findings + get user choices (A/B/C)
   ↓
2. Core: Abstractions → Boundaries → Patterns
   ↓ PAUSE: Verify with user
   ↓
3. Cross-cutting: Errors → Tests → Config → Security → ADRs
   ↓ PAUSE: Confirm coverage
   ↓
4. Generate: Fill template → Validate quality checklist → Present
```

**Every claim = `file:line` citation. If unsure, ask. Never hallucinate.**
