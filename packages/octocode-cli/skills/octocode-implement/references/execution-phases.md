# Execution Phases - Detailed Reference

Detailed step-by-step instructions for each implementation phase.

---

## Phase 1: SPEC (Spec Parsing)

**Goal**: Extract and structure all implementation requirements.

**Subagent Pattern**:
```
Task: "Parse specification and extract implementation tasks"
Scope: Read spec file, identify tasks, classify complexity
```

**Steps**:
1. **Read Specification**: Read the provided MD file
2. **Extract Tasks**: Identify discrete implementation tasks
3. **Classify Complexity**: Simple | Medium | Complex | Epic
4. **Identify Dependencies**: What depends on what?
5. **Create Master Todo**: Add all tasks via `TaskCreate`

**Deliverable**: Structured task list with dependencies.

---

## Phase 2: SPEC_VALIDATE (Spec Validation)

**Goal**: Ensure specification is complete and actionable before proceeding.

**Subagent Pattern**:
```
Task: "Validate specification completeness and clarity"
Scope: Check for ambiguities, missing details, contradictions
```

**Validation Checklist**:
| Check | Status | Action if Fails |
|-------|--------|-----------------|
| All requirements clearly defined | ❓ | Ask user for clarification |
| Acceptance criteria specified | ❓ | Request criteria from user |
| No contradicting requirements | ❓ | Flag conflicts to user |
| Technical constraints clear | ❓ | Ask for constraints |
| Dependencies identified | ❓ | Map dependencies |
| Out-of-scope items listed | ❓ | Confirm scope with user |

**Validation Questions**:
- Are there ambiguous terms that need definition?
- Are there implicit requirements not stated?
- Are there edge cases not covered?
- Is the scope well-bounded?

**Outcomes**:
| Result | Action |
|--------|--------|
| ✅ All Clear | Proceed to CONTEXT |
| ⚠️ Minor Gaps | Document assumptions, proceed with checkpoint |
| ❌ Major Gaps | STOP. Present gaps to user. Wait for clarification. |

---

## Phase 3: CONTEXT (Context Discovery)

**Goal**: Build mental model of codebase architecture.

**Subagent Pattern**:
```
Task: "Map codebase architecture for [feature area]"
Scope: Directory structure, entry points, testing setup
```

**Parallel Subagents** (spawn via `Task`):
| Subagent | Focus | Tool |
|----------|-------|------|
| Structure Agent | Map directory tree | `localViewStructure` |
| Pattern Agent | Find similar features | `localSearchCode` |
| Test Agent | Understand test setup | `localSearchCode` in tests/ |

**Steps**:
1. **Map Codebase**: `localViewStructure` at root (depth=1)
2. **Identify Relevant Areas**: Which directories matter for this task?
3. **Locate Entry Points**: Where does the feature start?
4. **Find Similar Features**: What analogous implementations exist?
5. **Understand Testing Setup**: How are tests organized?

**Deliverable**: Mental model of the codebase architecture.

---

## Phase 4: PLAN (Implementation Planning)

**Goal**: Create detailed, actionable implementation plan.

**Subagent Pattern**:
```
Task: "Create implementation plan for [task]"
Scope: Break down into atomic changes, identify files, risks
```

**Plan Structure**:
Write implementation plan with:
- Task breakdown (atomic changes)
- File changes required
- Research questions to resolve
- Testing strategy
- Risk areas

**Parallel Planning** (for Complex/Epic tasks):
```
Task 1: "Plan types and interfaces changes"
Task 2: "Plan core logic implementation"
Task 3: "Plan integration points"
Task 4: "Plan test coverage"
```

**User Checkpoint**: Present plan → Wait for approval.

---

## Phase 5: RESEARCH (Deep Research)

**Goal**: Understand exactly what to change and how.

**Subagent Pattern**:
```
Task: "Research [specific area] for implementation"
Scope: Locate code, trace flow, find patterns
```

**Parallel Research Subagents** (spawn via `Task`):
| Subagent | Focus | Output |
|----------|-------|--------|
| Flow Tracer | Trace data flow with LSP | Call hierarchy map |
| Pattern Finder | Find existing patterns | Pattern examples |
| Impact Analyzer | Find all affected code | Reference list |
| Test Researcher | Find test patterns | Test templates |

**Research Steps Per Task**:

1. **Locate Target Area**:
   ```
   localSearchCode(pattern="FeatureName", filesOnly=true)
   ```

2. **Read Implementation Context**:
   ```
   localGetFileContent(path="target.ts", matchString="class Feature")
   ```

3. **Trace Data Flow**:
   ```
   lspCallHierarchy(symbolName="handleData", direction="incoming")
   lspCallHierarchy(symbolName="handleData", direction="outgoing")
   ```

4. **Find All References** (Impact Analysis):
   ```
   lspFindReferences(symbolName="affectedFunction", includeDeclaration=false)
   ```

5. **Find Existing Patterns**:
   ```
   localSearchCode(pattern="similar implementation pattern")
   ```

6. **Check Test Patterns**:
   ```
   localSearchCode(pattern="describe.*SimilarFeature", path="tests")
   ```

**Deliverable**: Clear understanding of what to change and how.

---

## Phase 6: IMPLEMENT (Code Implementation)

**Goal**: Execute changes following patterns and plan.

**Subagent Pattern**:
```
Task: "Implement [specific component/feature]"
Scope: Types, logic, integration for one atomic task
```

**Parallel Implementation** (for independent tasks):
```
Task 1: "Implement types and interfaces" → Types Agent
Task 2: "Implement core logic" → Logic Agent
Task 3: "Implement tests" → Test Agent
```

**Sequential Implementation** (for dependent tasks):
Execute changes in order:
1. **Types First**: Add/modify interfaces and types
2. **Core Logic**: Implement the feature
3. **Integration**: Wire into existing code
4. **Tests**: Add tests following existing patterns
5. **Documentation**: Update docs if needed

**Implementation Guidelines**:
- Match existing code style exactly
- Use existing abstractions, don't create new ones
- Follow naming conventions found in codebase
- Add minimal comments (code should be self-documenting)
- Keep functions focused (Single Responsibility)

---

## Phase 7: VALIDATE (Spec Verification)

**Goal**: Verify ALL spec requirements are correctly implemented.

**Subagent Pattern**:
```
Task: "Validate [requirement] implementation"
Scope: Check specific requirement against code
```

**Parallel Validation Subagents** (spawn via `Task`):
| Subagent | Focus | Checks |
|----------|-------|--------|
| Tech Validator | Technical checks | Compile, lint, tests |
| Spec Validator | Requirement coverage | Each spec item |
| Regression Validator | Side effects | Affected areas |
| Quality Validator | Code quality | Patterns, style |

**Technical Validation Gates (ALL MANDATORY)**:
- [ ] TypeScript compiles (`tsc --noEmit`)
- [ ] Linter passes (`lint`)
- [ ] Tests pass (`test`)
- [ ] New code has tests
- [ ] No regressions in affected areas

**Spec Compliance Validation**:
| Requirement | Status | Evidence |
|-------------|--------|----------|
| [Req 1 from spec] | ✅/❌ | [File:line or test name] |
| [Req 2 from spec] | ✅/❌ | [File:line or test name] |

**Cross-Reference Check**:
1. Re-read original spec
2. For EACH requirement, find corresponding:
   - Implementation code
   - Test coverage
   - Documentation (if needed)
3. Flag any gaps

**Outcomes**:
| Result | Action |
|--------|--------|
| ✅ All requirements verified | Complete. Generate changes.md |
| ⚠️ Minor gaps | Document, ask user if acceptable |
| ❌ Missing requirements | Loop back to IMPLEMENT |

---

## Multi-Agent Parallelization

### Phase-Level Parallelization

| Phase | Parallelizable? | Subagent Strategy |
|-------|-----------------|-------------------|
| SPEC | No | Single agent parses spec |
| SPEC_VALIDATE | Yes | Spawn validators per requirement category |
| CONTEXT | Yes | Parallel: Structure, Pattern, Test agents |
| PLAN | Partial | Parallel for independent task areas |
| RESEARCH | Yes | Parallel: Flow, Pattern, Impact, Test agents |
| IMPLEMENT | Partial | Parallel for independent components |
| VALIDATE | Yes | Parallel: Tech, Spec, Regression validators |

### Task Tracking Integration

**Master Task Flow**:
```
TaskCreate({ subject: "Parse specification", status: "completed" })
TaskCreate({ subject: "Validate spec completeness", status: "in_progress" })
TaskCreate({ subject: "Discover codebase context", status: "pending" })
TaskCreate({ subject: "Create implementation plan", status: "pending" })
TaskCreate({ subject: "Deep research per task", status: "pending" })
TaskCreate({ subject: "Implement changes", status: "pending" })
TaskCreate({ subject: "Validate against spec", status: "pending" })
```

### Spawning Subagents with Task Tool

**Pattern for Phase Subagent**:
```
Task: "[Phase]: [Specific Goal]"
Context: [Relevant files, findings so far]
Scope: [Bounded deliverable]
Report: [What to return to main agent]
```

**Example - CONTEXT Phase**:
```
// Spawn in parallel:
Task("CONTEXT: Map directory structure", { depth: 2, focus: "src/" })
Task("CONTEXT: Find similar features", { pattern: "auth", type: "ts" })
Task("CONTEXT: Analyze test setup", { path: "tests/" })
```

### When to Spawn vs Sequential

**Spawn Subagents When**:
- 2+ independent tasks in same phase
- Research across different code areas
- Validation of independent requirements
- Implementation of unrelated components

**Stay Sequential When**:
- Tasks have dependencies
- Small tasks (overhead > benefit)
- Need to maintain context flow
- User interaction required
