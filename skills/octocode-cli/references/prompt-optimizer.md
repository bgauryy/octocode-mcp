# Prompt Optimizer

Analyze and improve instructional prompts, SKILL.md files, and agent instructions.

## When to Use
- "Optimize this prompt", "improve this SKILL.md", "make this prompt more reliable"
- "Fix my agent instructions", "my agent keeps skipping steps"
- "Strengthen this prompt", "add enforcement to instructions"

## Flow

`READ` → `UNDERSTAND` → `RATE` → `FIX` → `VALIDATE` → `OUTPUT`

Each step has a gate — do not skip steps.

## Step 1: READ

Read the input file completely. Note document type, purpose, and line count.

## Step 2: UNDERSTAND

Identify:
- **Goal**: What the prompt achieves
- **Logical parts**: Break down into sections/phases
- **Flow**: How parts connect

## Step 3: RATE

Check each part for issues:

| Category | What to Look For | Severity |
|----------|------------------|----------|
| Weak words | "consider", "might", "could" in critical sections | Critical |
| Missing enforcement | Rules without FORBIDDEN/ALLOWED | High |
| Ambiguous instructions | "handle", "process" without specifics | High |
| Referential ambiguity | "it", "this" without clear antecedent | High |
| Missing output format | Expected outputs without templates | Medium |
| Missing gates | Phase transitions without checkpoints | Medium |
| Verbose/bloat | Sections >20 lines that could be tables | Medium |

## Step 4: FIX

Fix in priority order: Critical → High → Medium → Low.

**Command Strength Hierarchy**:

| Strength | Keywords | Use For |
|----------|----------|---------|
| Absolute | NEVER, ALWAYS, MUST, FORBIDDEN | Non-negotiable rules |
| Stop | STOP, HALT, DO NOT proceed | Gates/checkpoints |
| Required | REQUIRED, MANDATORY | Essential steps |
| Soft | should, prefer | Optional guidance only |

**Triple Lock Pattern** for critical rules:
```
1. STATE: "You MUST X"
2. FORBID: "FORBIDDEN: Not doing X"
3. REQUIRE: "REQUIRED: Verify X complete"
```

Explain **why** behind changes — LLMs respond better to reasoning than rigid commands.

## Step 5: VALIDATE

Checklist:
- [ ] No weak words in critical sections
- [ ] Critical rules use MUST/NEVER/FORBIDDEN
- [ ] No conversational filler
- [ ] No conflicting instructions
- [ ] Logical flow preserved
- [ ] Original intent preserved
- [ ] Line count increase <10% (justify if more)

Reflection:
1. Would I trust this prompt to execute reliably?
2. What's the weakest remaining section?
3. Did I change any original intent? (must be NO)

## Step 6: OUTPUT

Present changes summary + optimized document or patch-style delta.

## Key Principles

- Preserve working logic — never change what already works
- Explain the why — reasoning beats rigid MUSTs
- Keep it lean — remove what doesn't pull its weight
- No over-strengthening — keep "should" for truly optional items
