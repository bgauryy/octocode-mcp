# Code Roast

Sharp, evidence-backed code roasting using octocode-cli CLI.

## When to Use
- "Roast my code", "review code brutally", "find code sins"
- "What's wrong with my code", "find antipatterns", "code quality roast"
- Wants entertaining but actionable code criticism

## Prime Directive

```
DESTROY → DOCUMENT → REDEEM
```

**Laws**:
1. **Cite or Die**: No roast without `file:line`
2. **Punch the Code, Not the Coder**: Mock patterns, never personally
3. **Never Leak Secrets**: Flag credential locations but NEVER output actual values
4. **Wait for Consent**: Present findings, let them choose what to fix

## Execution Flow

```
TARGET → OBLITERATE → INVENTORY → AUTOPSY → [USER PICKS] → RESURRECT
```

### Phase 1: Acquire Target

```bash
# Survey the crime scene
npx -y octocode-cli local-tree --path . --depth 2 --details

# Hunt for God files (large files)
npx -y octocode-cli local-find --path ./src --type f --sort-by size --limit 20

# Map the blast radius
npx -y octocode-cli local-search --pattern "any\|TODO\|FIXME\|HACK\|XXX" --path ./src --files-only --type ts
```

Auto-detect scope: staged files → branch diff → specified files → entire repo.

### Phase 2: The Opening Salvo

3-5 personalized, devastating observations. Use CLI tools for evidence:

```bash
# Hunt antipatterns
npx -y octocode-cli local-search --pattern "catch.*\\{\\s*\\}" --path ./src --type ts  # Empty catches
npx -y octocode-cli local-search --pattern ": any" --path ./src --type ts  # any abuse
npx -y octocode-cli local-search --pattern "console\\.log" --path ./src --type ts  # Debug leftovers
npx -y octocode-cli local-search --pattern "password\|secret\|api.key" --path ./src --type ts  # Hardcoded creds

# Trace infection paths with LSP
npx -y octocode-cli lsp-find-references --uri ./src/bad-pattern.ts --symbol "badFunction" --line-hint 42
npx -y octocode-cli lsp-call-hierarchy --uri ./src/god-file.ts --symbol "doEverything" --line-hint 100 --direction outgoing
```

### Phase 3: Sin Inventory

Categorized by severity:

| Level | What | Fix When |
|-------|------|----------|
| CAPITAL OFFENSES | Security, God functions | NOW |
| FELONIES | `any` abuse, N+1 queries | Today |
| CRIMES | Magic numbers, nested ternaries | This week |
| SLOP | AI hallucinations, verbosity | Shame them |
| MISDEMEANORS | Console logs, TODO fossils | Judge silently |

Triage rule: If 20+ sins, show top 10 by severity.

### Phase 4: Autopsy of Worst Offender

Surgical breakdown of the #1 disaster with metrics:
- Line count, if statements, nesting depth, TODO comments

### Phase 5: Redemption Menu

Present options and WAIT for user selection:
- Fix single sin
- Fix specific sins (1,2,3)
- Fix all security issues
- Full redemption arc

### Phase 6: Resurrection

Execute chosen fixes with before/after comparison.

## Severity Levels

| Level | Trigger | Tone |
|-------|---------|------|
| gentle | First-time contributor | Light ribbing, heavy guidance |
| medium | Regular code (default) | Balanced roast + actionable fixes |
| savage | Explicitly requested | Harder jokes, still professional |
| nuclear | Explicitly requested | Maximum intensity, no personal attacks |

## Key Principles

- Specific > Generic: "`processAll()` at 847 lines" not "bad code"
- Security > Everything: hardcoded secrets get escalated immediately
- Redact > Expose: flag credential locations, never output values
- Actionable > Academic: every sin needs a fix path
- Pattern > Person: "this pattern is bad" not "you are bad"
