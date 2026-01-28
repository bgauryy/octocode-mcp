---
name: octocode-prompt-optimizer
description: Activate this skill when a user provides a prompt, SKILL.md, or agent instruction document and requests optimization, refinement, or improved reliability. Use this to transform weak instructions into enforceable, production-ready agent protocols via a 10-phase systematic analysis
---

# Prompt Optimizer Skill

**10-phase pipeline for transforming weak prompts into reliable, enforceable agent instructions.**

<what>
Systematically analyzes and improves prompts, documentation, and agent instructions using prompt engineering best practices.
</what>

<when_to_use>
- Creating new agent skills or prompts
- Existing prompts ignored or partially followed
- Agents skip steps or checkpoints
- Instructions lack enforcement mechanisms
- Output format is inconsistent
- Reviewing SKILL.md, AGENTS.md, or prompt files
</when_to_use>

<when_not_to_use>
- Prompts <50 lines → Use Short-form path (Phases 2, 3, 6 only)
- Already-optimized prompts (has gates, FORBIDDEN lists, XML tags)
- Non-instruction documents (data files, configs, pure code)
- User explicitly requests partial optimization only
</when_not_to_use>

<global_forbidden priority="maximum">
## ⛔ GLOBAL FORBIDDEN - READ FIRST

**FORBIDDEN at ALL times:**
1. Skipping phases without Short-form path criteria met
2. Making changes before Phase 1 analysis complete
3. Leaving weak words in critical sections
4. Gates without FORBIDDEN/ALLOWED lists
5. Gates without Reflection Checkpoint
6. Outputting without Phase 10 validation
7. Proceeding when gate conditions fail

**Violation invalidates optimization.**
</global_forbidden>

<data_dictionary>
## Variable Reference

| Variable | Type | Description |
|----------|------|-------------|
| `{{INPUT_FILE_PATH}}` | string | Path to file being optimized |
| `{{INPUT_LINE_COUNT}}` | number | Total lines in input document |
| `{{DOCUMENT_TYPE}}` | enum | SKILL.md, AGENTS.md, Prompt, Documentation |
| `{{WEAK_WORD_COUNT}}` | number | Count of weak words detected |
| `{{GATE_COUNT}}` | number | Number of gates in input |
| `{{ISSUE_COUNT}}` | number | Total issues detected in audit |

**IF** variable missing → **THEN** derive from input or prompt user
</data_dictionary>

<short_form_path>
## Short-form Optimization

**IF** `{{INPUT_LINE_COUNT}}` < 50 AND no complex multi-phase workflow → **THEN** run only:

| Phase | Action |
|-------|--------|
| 2 | Audit for weak words and density |
| 3 | Apply command strengthening |
| 6 | Add output format if missing |

**Skip** Phases 1, 4, 5, 7, 8, 9. **Go directly** to Phase 10 validation.
</short_form_path>

---

## Execution Flow

<execution_sequence>
**EXECUTE phases in this EXACT order. STOP at each gate.**

```
INPUT → ANALYZE → DETECT → STRENGTHEN → STRUCTURE → VALIDATE → OUTPUT
```

| # | Phase | Action | Gate |
|---|-------|--------|------|
| 1 | Structure Analysis | Read doc, identify type/sections | STOP: Complete before changes |
| 2 | Semantic Audit | Weakness, density, redundancy scan | STOP: Document ALL issues |
| 3 | Command Strengthening | Apply strength hierarchy | STOP: No weak words remain |
| 4 | Gate Injection | Add gates with reflection | STOP: Every gate has critique step |
| 5 | Tool Control | Add FORBIDDEN/ALLOWED lists | STOP: Explicit tool lists |
| 6 | Format Specification | Add output templates | STOP: All outputs defined |
| 7 | XML Structuring | Wrap sections in XML tags | STOP: Proper nesting |
| 8 | Delimiter Standardization | Use `{{VAR}}` format | STOP: Data dictionary exists |
| 9 | Failure Mode Analysis | Identify 3+ failure modes | STOP: Recovery steps added |
| 10 | Validation & Output | Run checklist, output result | STOP: All checks pass |

**CRITICAL:** NEVER skip phases. NEVER proceed without passing gate.
</execution_sequence>

<priority_hierarchy>
**When rules conflict, apply this order:**
1. Global Forbidden (always wins)
2. Phase-specific FORBIDDEN (scoped to that phase)
3. MUST/REQUIRED rules
4. SHOULD/PREFER guidance

**IF** MUST conflicts with FORBIDDEN → **THEN** FORBIDDEN wins, flag for user review.
</priority_hierarchy>

---

## Content Value Guide

<content_value_guide importance="high">
**Reference for Phase 2.**

### ❌ LOW-VALUE Content (Remove)

| Pattern | Action |
|---------|--------|
| "Why This Matters" explanations | DELETE or single-line comment |
| Numeric scoring systems | Replace with pass/fail checklist |
| Quality rating labels | Use binary: pass or fix |
| Repeated examples | Keep 1-2 best |
| Duplicate sections | Keep one, reference elsewhere |
| Verbose templates | Show pattern once |
| Long prose paragraphs | Convert to tables |
| Politeness markers | DELETE |
| Hedging language | Replace with MUST/REQUIRED or DELETE |
| Meta-commentary | DELETE |

### ✅ HIGH-VALUE Content (Keep)

| Pattern | Example |
|---------|---------|
| Tables with actionable columns | `| Pattern | Action |` |
| Imperative verbs | STOP, EXECUTE, VERIFY |
| XML tags | `<gate>`, `<forbidden>` |
| FORBIDDEN/ALLOWED lists | Clear tool control |
| IF/THEN conditionals | `**IF** X → **THEN** Y` |
| Gate checkpoints | STOP before each phase |
| Triple Lock Pattern | State + Forbid + Require |
| Self-critique gates | "Critique your reasoning" |
| Data dictionaries | `{{VAR}}` definitions |

### Token Efficiency Rules

1. One definition per concept
2. Tables over prose
3. Patterns over instances
4. Imperatives over explanations
5. Binary over gradient
6. Structure over style
</content_value_guide>

---

## Phase 1: Structure Analysis

<phase_1_gate>
**STOP. Read and analyze the input document.**

### Pre-Conditions
- [ ] Input file path provided
- [ ] File is readable

### Required Actions
1. Read the input file completely
2. Identify `{{DOCUMENT_TYPE}}`
3. Extract existing sections and structure
4. Create analysis summary using template

### Reflection Checkpoint
**STOP. Critique your analysis:**
- Did I miss any sections?
- Is my document type classification correct?
**IF** uncertainty exists → **THEN** re-read before proceeding

### FORBIDDEN
- Making changes before completing analysis
- Skipping any section of the input document
- Proceeding to Phase 2 without summary complete

### ALLOWED
- Read tool
- Glob tool (to locate files)
- Grep tool (to search patterns)

### On Failure
- **IF** file unreadable → **THEN** prompt user for correct path
</phase_1_gate>

<analysis_template>
```markdown
## Document Analysis

**Type:** {{DOCUMENT_TYPE}}
**Total Sections:** [N]
**Line Count:** {{INPUT_LINE_COUNT}}
**Has Gates:** [Yes/No]
**Has Tool Control:** [Yes/No]
**Has Output Format:** [Yes/No]
**Has XML Tags:** [Yes/No]
**Has Conditional Logic:** [Yes/No]
**Has Data Dictionary:** [Yes/No]
**Has Global Forbidden:** [Yes/No]
**Has Reflection Gates:** [Yes/No]

### Sections Found
1. [Section name] - [line range]

### Initial Issues Detected
- [ ] [Issue 1]
```
</analysis_template>

---

## Phase 2: Semantic Audit

<phase_2_gate importance="high">
**STOP. Scan for weakness, density, AND redundancy.**

### Pre-Conditions
- [ ] Phase 1 analysis complete
- [ ] Document structure identified

### Required Actions
1. Scan for weak words (see checklist)
2. Identify ambiguous instructions
3. Find missing enforcement
4. Flag low-density content
5. Document ALL weaknesses with line numbers
6. Identify duplicates (>80% similarity)
7. Check for conflicting instructions

### Reflection Checkpoint
**STOP. Critique your audit:**
- Did I check every section?
- Are my severity ratings consistent?
**IF** sections unchecked → **THEN** complete before proceeding

### FORBIDDEN
- Proceeding without documenting ALL weaknesses
- Fixing issues before completing detection
- Ignoring semantic density issues

### ALLOWED
- Read tool (re-reading sections)
- Grep tool (pattern search)
- Note-taking in response

### On Failure
- **IF** no issues found → **THEN** verify with targeted weak word search
</phase_2_gate>

<audit_checklist>
### Weak Word Scanner

| Category | Weak Words | Replacement |
|----------|-----------|-------------|
| Hedging | "consider", "might", "could", "may" | MUST/REQUIRED |
| Soft Guidance | "should", "prefer", "recommended" | MUST for critical |
| Vague Actions | "do some", "handle", "process" | Specify exact action |
| Implicit | "as needed", "if necessary" | Define explicit conditions |
| Optional Feel | "feel free to", "you can" | Remove for required |

### Density Target
>80% instruction tokens, <20% filler tokens

### Audit Report Format
| Line | Text | Issue | Severity | Category |
|------|------|-------|----------|----------|
| [N] | "[text]" | [type] | Critical/High/Medium | [category] |
</audit_checklist>

---

## Phase 3: Command Strengthening

<phase_3_gate>
**STOP. Apply command strength hierarchy.**

### Pre-Conditions
- [ ] Phase 2 audit complete
- [ ] All weaknesses documented

### Required Actions
1. Replace weak words with strong equivalents
2. Apply strength hierarchy based on criticality
3. Apply semantic density pruning
4. Document all changes

### Command Strength Hierarchy

| Strength | Keywords | Use For |
|----------|----------|---------|
| Absolute | NEVER, ALWAYS, MUST, FORBIDDEN, CRITICAL | Non-negotiable rules |
| Stop | STOP, HALT, DO NOT proceed | Gates/checkpoints |
| Required | REQUIRED, MANDATORY | Essential steps |
| Should | should, prefer | Soft guidance only |

### Reflection Checkpoint
**STOP. Critique your strengthening:**
- Did I over-strengthen soft guidance?
- Are absolute keywords reserved for critical rules only?
**IF** over-strengthening detected → **THEN** adjust before proceeding

### FORBIDDEN
- Using "should" for critical actions
- Leaving weak words in critical sections
- Over-strengthening optional guidance

### ALLOWED
- StrReplace tool (applying fixes)
- Read tool (verification)

### Triple Lock Pattern (Apply to Critical Rules)
1. STATE: "You MUST X"
2. FORBID: "FORBIDDEN: Not doing X"
3. REQUIRE: "REQUIRED: Verify X complete"
</phase_3_gate>

---

## Phase 4: Gate Injection

<phase_4_gate>
**STOP. Add gates between all phases.**

### Pre-Conditions
- [ ] Phase 3 complete
- [ ] No weak words remain

### Required Actions
1. Identify all phase transitions
2. Add gate for each transition
3. EVERY gate MUST have: Pre-Conditions, Actions, Reflection, FORBIDDEN, ALLOWED, On Failure

### Reflection Checkpoint
**STOP. Critique your gates:**
- Does every gate have all 6 required sections?
- Are FORBIDDEN lists specific enough?
**IF** incomplete gates → **THEN** complete before proceeding

### FORBIDDEN
- Phases without gates
- Gates without FORBIDDEN/ALLOWED lists
- Gates without Reflection Checkpoint
- Gates without On Failure recovery

### ALLOWED
- StrReplace tool
- Write tool (if creating new file)
</phase_4_gate>

---

## Phase 5: Tool Control

<phase_5_gate>
**STOP. Add explicit tool control for every phase.**

### Pre-Conditions
- [ ] Phase 4 complete
- [ ] All gates added

### Required Actions
1. List all tools mentioned in document
2. For each phase, specify FORBIDDEN and ALLOWED tools
3. Add tool sequencing rules where order matters

### Reflection Checkpoint
**STOP. Critique your tool lists:**
- Are tool names exact (not generic)?
- Is sequencing clear for dependent operations?
**IF** vague tool references → **THEN** specify exact tool names

### FORBIDDEN
- Phases without explicit tool lists
- Implied tool usage
- Generic tool references ("read tools" instead of "Read tool")

### ALLOWED
- StrReplace tool
- Read tool (verification)
</phase_5_gate>

---

## Phase 6: Format Specification

<phase_6_gate>
**STOP. Ensure all outputs have format specifications.**

### Pre-Conditions
- [ ] Phase 5 complete
- [ ] Tool control explicit

### Required Actions
1. Identify all expected outputs
2. Add format template for each
3. Specify regeneration condition

### Reflection Checkpoint
**STOP. Critique your formats:**
- Is every output accounted for?
- Are templates copy-pasteable?
**IF** missing outputs → **THEN** add templates

### FORBIDDEN
- Outputs without format specifications
- Vague format descriptions

### ALLOWED
- StrReplace tool
- Write tool

### Format Pattern
```
**OUTPUT FORMAT (REQUIRED):**
\`\`\`
[Template]
\`\`\`
**IF** format wrong → **THEN** regenerate.
```
</phase_6_gate>

---

## Phase 7: XML Structuring

<phase_7_gate>
**STOP. Add XML tags for section demarcation.**

### Pre-Conditions
- [ ] Phase 6 complete
- [ ] Formats specified

### Required Actions
1. Wrap major sections in semantic XML tags
2. Add instruction blocks with XML
3. Ensure proper nesting

### Reflection Checkpoint
**STOP. Critique your XML:**
- Are tags semantically meaningful?
- Is nesting correct (no overlaps)?
**IF** nesting errors → **THEN** fix before proceeding

### FORBIDDEN
- Flat markdown without XML structure
- Incorrectly nested XML tags

### ALLOWED
- StrReplace tool

### XML Tags Reference
| Tag | Purpose |
|-----|---------|
| `<what>` | Brief description |
| `<when_to_use>` | Trigger conditions |
| `<gate>` | Checkpoints |
| `<forbidden>` | Prohibited actions |
| `<data_dictionary>` | Variable definitions |
| `<global_forbidden>` | Aggregated prohibitions |
</phase_7_gate>

---

## Phase 8: Delimiter Standardization

<phase_8_gate>
**STOP. Standardize all variables.**

### Pre-Conditions
- [ ] Phase 7 complete
- [ ] XML structure in place

### Required Actions
1. Identify all variables and placeholders
2. Wrap in `{{VARIABLE_NAME}}` format
3. Create `<data_dictionary>` section

### Reflection Checkpoint
**STOP. Critique your variables:**
- Are all placeholders wrapped consistently?
- Is dictionary complete?
**IF** missing variables → **THEN** add to dictionary

### FORBIDDEN
- Inconsistent delimiter styles
- Variables without dictionary definition

### ALLOWED
- StrReplace tool
- Read tool
</phase_8_gate>

---

## Phase 9: Failure Mode Analysis

<phase_9_gate importance="critical">
**STOP. Identify how this prompt could fail.**

### Pre-Conditions
- [ ] Phase 8 complete
- [ ] Data dictionary exists

### Required Actions
1. Identify 3+ specific failure modes
2. Add IF-THEN recovery for each
3. Document scenarios and mitigations

### Reflection Checkpoint
**STOP. Critique your failure modes:**
- Are these specific to THIS prompt (not generic)?
- Does each have a recovery path?
**IF** generic modes → **THEN** make specific

### FORBIDDEN
- Skipping failure analysis
- Generic failure modes
- Failure modes without recovery

### ALLOWED
- Read tool (reviewing for edge cases)
- Note-taking
</phase_9_gate>

<failure_modes_for_this_skill>
### Failure Mode 1: Phase Skip
**Scenario:** Agent skips directly to output without completing phases
**Recovery:** **IF** output lacks phase markers → **THEN** reject, restart from Phase 1
**Checkpoint:** Verify phase completion markers in output

### Failure Mode 2: Weak Word Leak
**Scenario:** Agent leaves weak words in MUST/FORBIDDEN contexts
**Recovery:** **IF** "should/could/might" in critical sections → **THEN** re-run Phase 3
**Checkpoint:** Grep for weak words before output

### Failure Mode 3: Gate Template Mismatch
**Scenario:** Agent creates gates missing required sections
**Recovery:** **IF** gate lacks 6 sections → **THEN** complete missing sections
**Checkpoint:** Verify each gate has: Pre-Conditions, Actions, Reflection, FORBIDDEN, ALLOWED, On Failure

### Failure Mode 4: Short-form Misapplication
**Scenario:** Agent uses Short-form on complex document
**Recovery:** **IF** document has phases/workflows AND <50 lines → **THEN** use full path
**Checkpoint:** Check for workflow indicators before Short-form
</failure_modes_for_this_skill>

---

## Phase 10: Validation & Output

<phase_10_gate>
**STOP. Validate all optimizations.**

### Pre-Conditions
- [ ] Phases 1-9 complete
- [ ] All failure modes documented

### Required Actions
1. Run validation checklist
2. Count improvements
3. Verify Global Forbidden at TOP and END
4. Output optimized document

### Reflection Checkpoint
**STOP. Final critique:**
- Would I trust this prompt to execute reliably?
- What's the weakest remaining section?
**IF** weakness identified → **THEN** address or document as known limitation

### FORBIDDEN
- Outputting without validation
- Skipping checklist items
- Missing Global Forbidden section

### ALLOWED
- Read tool (final review)
- Write tool (output)
</phase_10_gate>

<validation_checklist>
### Final Validation

**MUST verify ALL:**

- [ ] No weak words in critical sections
- [ ] All critical rules use MUST/NEVER/FORBIDDEN
- [ ] Triple lock on non-negotiable rules
- [ ] No conversational filler
- [ ] >80% instruction tokens
- [ ] No verbatim duplications (except anchoring)
- [ ] No conflicting instructions
- [ ] Every phase has a gate
- [ ] All gates have 6 required sections
- [ ] Every phase has explicit tool lists
- [ ] All outputs have format specifications
- [ ] IF/THEN rules for decision points
- [ ] Major sections wrapped in XML tags
- [ ] All variables use `{{VAR}}` format
- [ ] Data dictionary exists
- [ ] 3+ failure modes with recovery
- [ ] Global Forbidden at TOP and END

**Rating:** All pass = Ready | Any fail = Fix
</validation_checklist>

<output_format>
**OUTPUT FORMAT (REQUIRED):**
```markdown
# Optimization Complete

## Summary
- **Original Issues:** {{ISSUE_COUNT}}
- **Fixes Applied:** [N]
- **Token Change:** [±X%]

## Changes Made
| Category | Count |
|----------|-------|
| Command Strengthening | [N] |
| Gates Added/Fixed | [N] |
| Failure Modes | [N] |

## Optimized Document
[Full content]
```
**IF** format deviates → **THEN** regenerate.
</output_format>

---

<global_forbidden_reminder priority="maximum">
## ⛔ REMINDER: Global Forbidden

**FORBIDDEN throughout this skill:**

1. Skipping any of the 10 phases
2. Leaving weak words in critical sections
3. Phases without explicit gates
4. Gates without 6 required sections
5. Conversational filler in output
6. Inconsistent variable delimiters
7. Missing failure mode analysis
8. Omitting Global Forbidden section
9. Leaving verbatim duplications
10. Conflicting instructions
11. Gates without Reflection Checkpoint
12. Generic (non-specific) failure modes

**Violation invalidates optimization.**
</global_forbidden_reminder>
