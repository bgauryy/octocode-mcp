---
name: octocode-prompt-optimizer
description: Activate when user provides a prompt, SKILL.md, or agent instruction and requests optimization. Transforms weak instructions into reliable, enforceable agent protocols.
---

# Prompt Optimizer Skill

<what>
Analyzes and improves prompts, documentation, and agent instructions using prompt engineering best practices.
</what>

<when_to_use>
- Creating or improving prompts
- Agents skip steps or ignore instructions
- Instructions lack enforcement
- Output format is inconsistent
- Reviewing any instruction document or prompt
</when_to_use>

<global_forbidden priority="maximum">
**CRITICAL - FORBIDDEN at ALL times:**
1. Changing good parts that already work
2. Changing the existing logic/intent of prompts
3. Making changes before understanding the prompt
4. Leaving weak words in critical sections
5. Outputting without validation
6. Over-strengthening soft guidance
7. Skipping gates or checkboxes
8. Bloating prompts - fixes MUST NOT increase line count >10% unless adding required gates

**Triple Lock:**
- **STATE:** You MUST preserve working logic AND follow all gates in order
- **FORBID:** FORBIDDEN: Altering intent without user approval
- **FORBID:** FORBIDDEN: Skipping steps or gates
- **REQUIRE:** REQUIRED: Validate all changes before output AND complete all checkboxes

**Violation invalidates optimization. Start over if violated.**
</global_forbidden>

<tool_control priority="high">
**FORBIDDEN tools during optimization:**
- Shell commands that modify files directly
- Any tool that executes code
- Tools that skip the READ→UNDERSTAND→RATE→FIX→VALIDATE flow

**ALLOWED tools:**
- Read (to read prompt files)
- StrReplace/Write (ONLY after VALIDATE step passes)
- AskQuestion (for clarification)
- Text output (all phases)
</tool_control>

---

## Execution Flow

<execution_flow>
```
READ → UNDERSTAND → RATE → FIX → VALIDATE → OUTPUT
  ↓         ↓          ↓       ↓         ↓          ↓
 GATE      GATE       GATE    GATE      GATE       GATE
```

| Step | Action | Gate Requirement | FORBIDDEN Until Gate Passes |
|------|--------|------------------|----------------------------|
| 1 | **READ** the prompt completely | All checkboxes checked | Analysis, changes |
| 2 | **UNDERSTAND** what the prompt does | Understanding output produced | Rating, fixes |
| 3 | **RATE** each part for issues | Issues table produced | Fixing issues |
| 4 | **FIX** issues by severity | All Critical/High fixed | Validation |
| 5 | **VALIDATE** against checklist | All REQUIRED checks pass | Output |
| 6 | **OUTPUT** optimized document | Format followed exactly | N/A |

**CRITICAL:** You MUST complete each gate before proceeding. DO NOT skip steps.
</execution_flow>

---

## Step 1: READ

<read_gate>
**STOP. DO NOT proceed to analysis.**

### Pre-Conditions
- [ ] User provided prompt/file to optimize
- [ ] Path is valid and readable

### Actions (REQUIRED)
1. MUST read the input file completely
2. MUST note the document type and purpose
3. MUST count approximate line count

### Gate Check
**Verify before proceeding:**
- [ ] File read completely (no skipped sections)
- [ ] Document type identified
- [ ] Line count noted

### FORBIDDEN
- Making ANY changes before reading
- Skipping sections
- Proceeding without completing all checkboxes

### ALLOWED
- Read tool only
- Text output to confirm reading

### On Failure
- **IF** file unreadable → **THEN** ask user for correct path
- **IF** file empty → **THEN** ask user to provide content
</read_gate>

---

## Step 2: UNDERSTAND

<understand_gate>
**STOP. DO NOT proceed to rating. Understand what this prompt does first.**

### Pre-Conditions
- [ ] Step 1 (READ) completed
- [ ] File content in context

### Actions (REQUIRED)
1. MUST identify the **goal** - what is this prompt supposed to achieve?
2. MUST identify **logical parts** - break down into sections/phases/steps
3. MUST identify **flow** - how do the parts connect?
4. MUST document understanding in output format below

### Output Format (REQUIRED)
```markdown
## Understanding

**Goal:** [What the prompt achieves]

**Logical Parts:**
1. [Part name] - [purpose]
2. [Part name] - [purpose]
...

**Flow:** [How parts connect]
```

### Assumptions & Unknowns (REQUIRED if prompt is underspecified)
```markdown
## Assumptions & Unknowns

**Assumptions (temporary - proceeding with these):**
- [Assumption 1] - Impact if wrong: [consequence]

**Unknowns (MUST ask before proceeding):**
- [Unknown 1] - Why critical: [reason]

**Clarification needed:** Yes/No
```
**IF** Unknowns exist → **THEN** STOP and ask user before proceeding to RATE.

### Gate Check
**Verify before proceeding:**
- [ ] Goal clearly stated
- [ ] All logical parts identified
- [ ] Flow documented
- [ ] Understanding output produced

### Reflection
- Did I understand the intent correctly?
- Did I identify all logical parts?
**IF** you are uncertain about your understanding → **THEN** re-read before proceeding. DO NOT guess.

### FORBIDDEN
- Proceeding without understanding the goal
- Making changes based on assumptions
- Skipping output format

### ALLOWED
- Text output (understanding summary)
- Re-reading file if needed

### On Failure
- **IF** intent unclear → **THEN** ask user for clarification
- **IF** multiple interpretations → **THEN** present options and WAIT for user choice
</understand_gate>

---

## Step 3: RATE

<rate_gate>
**STOP. DO NOT fix anything yet. Rate each logical part for issues first.**

### Pre-Conditions
- [ ] Step 2 (UNDERSTAND) completed
- [ ] Understanding output produced

### Issue Categories (MUST check all)

| Category | What to Look For | Severity |
|----------|------------------|----------|
| **Weak Words** | "consider", "might", "could", "may", "should" in critical sections | Critical |
| **Missing Enforcement** | Rules without FORBIDDEN/ALLOWED | High |
| **Ambiguous Instructions** | "do some", "handle", "process" without specifics | High |
| **Referential Ambiguity** | "it", "this", "that", "above", "below" without clear antecedent | High |
| **Missing Output Format** | Expected outputs without templates | Medium |
| **Missing Gates** | Phase transitions without checkpoints | Medium |
| **Duplication** | Same logic/rule repeated in multiple places (not just examples) | Medium |
| **Verbose/Bloat** | Sections >20 lines that could be tables; prose without constraints | Medium |
| **Emoji as Instructions** | Emojis used as commands instead of strong words | Medium |
| **Redundancy** | Same example repeated, unnecessary variations | Low |
| **Low Density** | Explanations that don't constrain behavior | Low |

### Rating Output (REQUIRED)
```markdown
## Issues Found

| Part | Issue | Severity | Fix Needed |
|------|-------|----------|------------|
| [Part name] | [Description] | Critical/High/Medium/Low | [What to do] |
```

### Gate Check
**Verify before proceeding:**
- [ ] All logical parts rated
- [ ] Weak word scan completed
- [ ] Issues table produced
- [ ] Severity assigned to each issue

### FORBIDDEN
- Fixing issues before completing rating
- Ignoring critical issues
- Skipping weak word scan
- Proceeding without issues table

### ALLOWED
- Text output (issues table)
- Re-reading parts for rating

### On Failure
- **IF** no issues found → **THEN** MUST double-check with weak word scan
- **IF** scan still clean → **THEN** document "No issues found" and proceed
</rate_gate>

### Weak Word Reference

| Weak Word | Context | Replacement |
|-----------|---------|-------------|
| consider, might, could, may | Critical section | **MUST**, **REQUIRED** |
| consider, might, could, may | Optional guidance | Remove or keep with "optionally" |
| should, prefer | Critical section | **MUST** |
| should, prefer | Soft guidance | Keep as-is |
| do some, handle, process | Any | Specify exact action: "Run X", "Call Y" |
| as needed, if necessary | Any | **IF** [condition] → **THEN** [action] |
| feel free to, you can | Required action | Remove entirely, use **MUST** |
| feel free to, you can | Optional action | "Optionally, you may..." |

**CRITICAL:** Weak words in FORBIDDEN/MUST/NEVER sections MUST be replaced.

---

## Step 4: FIX

<fix_gate>
**STOP. Fix issues in priority order: Critical → High → Medium → Low.**

### Pre-Conditions
- [ ] Step 3 (RATE) completed
- [ ] Issues table produced

### Fix Priority (MUST follow order)
1. **Critical first** - Weak words in MUST/FORBIDDEN contexts
2. **High next** - Missing enforcement, ambiguous instructions
3. **Medium** - Missing output formats, missing gates
4. **Low last** - Redundancy, density (only if value added)

### Command Strength Hierarchy

| Strength | Keywords | Use For |
|----------|----------|---------|
| Absolute | NEVER, ALWAYS, MUST, FORBIDDEN, CRITICAL | Non-negotiable rules |
| Stop | STOP, HALT, DO NOT proceed, WAIT | Gates/checkpoints |
| Required | REQUIRED, MANDATORY | Essential steps |
| Soft | should, prefer | Optional guidance only |

### Triple Lock Pattern (REQUIRED for Critical Rules)
```
1. STATE: "You MUST X"
2. FORBID: "FORBIDDEN: Not doing X"
3. REQUIRE: "REQUIRED: Verify X complete"
```

### Reasoning Block (REQUIRED Before Changes)
**REQUIRED:** Before making changes, produce a `<reasoning>` block:
```markdown
<reasoning>
1. **Current state:** [What exists now]
2. **Goal:** [What we are trying to achieve]
3. **Approach:** [Why this specific change]
4. **Risk:** [What could go wrong]
</reasoning>
```

### Gate Template (When Adding Gates)
```markdown
<[name]_gate>
**STOP. DO NOT proceed. [What to verify]**

### Pre-Conditions
- [ ] [Previous step completed]

### Actions (REQUIRED)
1. [Action]

### Gate Check
**Verify before proceeding:**
- [ ] [Condition]

### FORBIDDEN
- [What not to do]

### ALLOWED
- [What is permitted]

### On Failure
- **IF** [condition] → **THEN** [recovery]
</[name]_gate>
```

### Gate Check
**Verify before proceeding:**
- [ ] All Critical issues fixed
- [ ] All High issues fixed
- [ ] Medium/Low addressed or documented as skipped
- [ ] Reasoning block produced before changes

### FORBIDDEN
- Over-strengthening soft guidance (keep "should" for optional items)
- Changing logic that already works
- Adding unnecessary complexity
- Skipping Critical/High issues
- Bloating: fixes that increase line count >10% without adding required gates

### ALLOWED
- Text output (draft fixes)
- Iterating on fixes

### On Failure
- **IF** over-strengthening detected → **THEN** revert and re-assess using RATE step criteria
- **IF** unsure if logic changed → **THEN** compare before/after intent
</fix_gate>

---

## Step 5: VALIDATE

<validate_gate>
**STOP. DO NOT output yet. Validate all fixes against checklist.**

### Pre-Conditions
- [ ] Step 4 (FIX) completed
- [ ] All Critical/High issues addressed

### Validation Checklist (MUST complete all)

**REQUIRED checks:**
- [ ] No weak words in critical sections
- [ ] Critical rules use MUST/NEVER/FORBIDDEN
- [ ] No conversational filler
- [ ] No conflicting instructions
- [ ] Logical flow preserved
- [ ] Original intent preserved
- [ ] Triple Lock applied to critical rules
- [ ] Line count increase <10% (unless adding required gates)

**Additional checks (if applicable):**
- [ ] Gates have Pre-Conditions, Gate Check, FORBIDDEN, ALLOWED, On Failure
- [ ] Outputs have format specifications
- [ ] IF/THEN rules for decision points

**Referential Clarity (MUST check):**
- [ ] No ambiguous pronouns or positional references without explicit antecedent
- [ ] All entities have stable names (same term throughout)
- [ ] Steps/outputs referenced by name, not position
- [ ] All cross-references are unambiguous
- [ ] No implicit "the" references without clear antecedent
- [ ] XML tags for attention-critical sections

### Reflection (REQUIRED)
MUST answer these questions:
1. Would I trust this prompt to execute reliably?
2. What's the weakest remaining section?
3. Did I change any original intent? (MUST be NO)

**IF** weakness identified → **THEN** fix or document as limitation
**IF** intent changed → **THEN** STOP and revert. Return to UNDERSTAND step.

### Definition of Done (DoD) - Fast Final Gate
**ALL must be true before OUTPUT:**
- [ ] Single execution path (no ambiguous branches)
- [ ] All inputs/outputs explicitly defined
- [ ] All decision points use IF/THEN
- [ ] No orphan references (every "it/this" resolved)

### Gate Check
**Verify before proceeding:**
- [ ] All REQUIRED checks pass
- [ ] Reflection questions answered
- [ ] No intent changes

### FORBIDDEN
- Outputting without completing validation
- Skipping checklist items
- Proceeding with failed checks

### ALLOWED
- Text output (validation results)
- Returning to FIX step

### On Failure
- **IF** validation fails → **THEN** return to FIX step
- **IF** intent changed → **THEN** return to UNDERSTAND step
</validate_gate>

---

## Step 6: OUTPUT

<output_gate>
**STOP. Verify VALIDATE step passed before outputting.**

### Pre-Conditions
- [ ] Step 5 (VALIDATE) completed
- [ ] All REQUIRED checks passed
- [ ] No intent changes confirmed

### Output Format (REQUIRED - DO NOT deviate)

```markdown
# Optimization Complete

## Summary
- **Issues Found:** [N]
- **Fixes Applied:** [N]
- **Intent Preserved:** Yes

## Changes Made
| Category | Count | Examples |
|----------|-------|----------|
| Command Strengthening | [N] | [Brief example] |
| Gates Added/Fixed | [N] | [Brief example] |
| Redundancy Removed | [N] | [Brief example] |

## Optimized Document
[Full optimized content]
```

### FORBIDDEN
- Deviating from output format
- Outputting without validation pass
- Omitting the optimized document

### ALLOWED
- StrReplace/Write to save optimized content
- Text output (summary + document)

### On Failure
- **IF** format deviates → **THEN** regenerate output
- **IF** user requests changes → **THEN** return to FIX step
</output_gate>

---


## Reference: Instruction Precedence

<precedence_table>
**When rules conflict, follow this precedence (highest wins):**

| Priority | Category | Examples | Notes |
|----------|----------|----------|-------|
| 1 (highest) | Safety/Tool Restrictions | FORBIDDEN tools, NEVER actions | Always wins |
| 2 | User explicit request | "I want X", "Do Y" | Overrides defaults |
| 3 | FORBIDDEN/MUST rules | "FORBIDDEN: changing logic" | Overrides preferences |
| 4 | Skill defaults | Default behaviors, templates | Baseline |
| 5 (lowest) | Soft guidance | "prefer", "consider" | Yields to all above |

**Resolution rule:** When two rules conflict, the higher priority wins. Document the conflict and resolution.
</precedence_table>

---

## Reference: Context Patterns

<reasoning_patterns>
### State Summaries (Context Retention)
Use at the start of complex phases to prevent "forgetting":
```markdown
<phase_start>
**State Summary:**
- **Goal:** [What are we solving?]
- **Progress:** [What is already done?]
- **Next:** [Immediate next step]
- **Blockers:** [Any issues?]
</phase_start>
```

**REQUIRED:** For multi-step fixes, produce a state summary every 3 fixes.
</reasoning_patterns>

---
## Reference: High-Value vs Low-Value Content

<content_guide>
### REMOVE (Low Value)
| Pattern | Action |
|---------|--------|
| Explanatory prose without actionable constraints | DELETE |
| Numeric scoring systems | Replace with pass/fail |
| Repeated examples | Keep 1-2 best |
| Long prose paragraphs | Convert to tables |
| Hedging language | Replace with MUST or DELETE |
| Emoji as instructions | Replace with strong command words (unless prompt output requires emoji) |

### KEEP (High Value)
| Pattern | Example |
|---------|---------|
| Tables with actions | `| Pattern | Action |` |
| Imperative verbs | STOP, EXECUTE, VERIFY |
| FORBIDDEN/ALLOWED lists | Clear capability control |
| IF/THEN conditionals | `**IF** X → **THEN** Y` |
| Gate checkpoints | STOP before transitions |
</content_guide>

---

## Quick Reference

| Goal | Pattern |
|------|---------|
| Force a stop | `**STOP. DO NOT proceed.**` |
| Require action | `**REQUIRED:** You MUST [action]` |
| Ban action | `**FORBIDDEN:** [action] until [condition]` |
| Force format | `**OUTPUT FORMAT (REQUIRED):** [template]` |
| Create checkpoint | `### Gate Check` with `- [ ]` items |
| Handle errors | `**IF** [error] → **THEN** [recovery]` |
| Critical rule | Triple Lock: STATE + FORBID + REQUIRE |
| Replace emoji | Emoji → strong command word (MUST, FORBIDDEN, etc.) |

---

## Common Mistakes

<common_mistakes>
| Mistake | Why It Fails | Fix |
|---------|--------------|-----|
| Skipping UNDERSTAND step | Fixes wrong things, breaks working logic | ALWAYS produce Understanding output first |
| Fixing before RATE complete | Misses issues, inconsistent severity handling | Complete issues table before ANY fix |
| Over-strengthening soft guidance | "prefer" → "MUST" breaks optional flexibility | Keep "should/prefer" for truly optional items |
| Using "it/this/that" | Agent loses context, applies fix to wrong element | Name every entity explicitly |
| Outputting without VALIDATE | Weak words remain, conflicts undetected | MUST complete all checklist items |
| Changing working logic | User trusted original behavior | FORBIDDEN: If the logic works, don't touch it |
| Bloating the prompt | Verbose fixes overwhelm context, reduce density | MUST keep fixes concise; <10% line increase |
</common_mistakes>

---

## Before/After Example

<before_after_example>
### Before (Weak)
```
Consider checking the file before making changes.
You should validate the output.
Handle any errors that occur.
If needed, retry the operation.
```

### After (Strong)
```
**REQUIRED:** You MUST read the file completely before making ANY changes.
**FORBIDDEN:** Outputting without validation.

### On Error
- **IF** file unreadable → **THEN** ask user for correct path
- **IF** validation fails → **THEN** return to FIX step

### Retry Logic
- **IF** operation fails AND retry_count < 3 → **THEN** retry with exponential backoff
- **IF** retry_count >= 3 → **THEN** STOP and report failure to user
```

### Changes Applied
| Original | Issue | Fixed |
|----------|-------|-------|
| "Consider checking" | Weak word in critical action | "REQUIRED: You MUST" |
| "should validate" | Weak enforcement | "FORBIDDEN: without validation" |
| "Handle any errors" | Ambiguous instruction | Explicit IF/THEN for each error |
| "If needed, retry" | Vague condition | Specific retry count + backoff |
</before_after_example>
