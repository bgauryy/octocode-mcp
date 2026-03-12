# PR Reviewer

Expert code review using octocode-tools CLI for deep code forensics and holistic evaluation.

## When to Use
- User asks to "review a PR", "review pull request", "check this PR", "review my changes"
- Needs architectural analysis, defect detection, security scanning
- Supports both remote PRs (via `gh` CLI + octocode) and local changes

## Review Modes

| Mode | Trigger | Behavior |
|------|---------|----------|
| Quick | ≤5 files, low risk | Surface scan, skip deep analysis |
| Full | >5 files or high risk | All phases, deep analysis |

## Execution Flow

```
TARGET DETECTION → CONTEXT → CHECKPOINT → ANALYSIS → FINALIZE → REPORT
```

## Phase 1: Target Detection

### Remote PR
```bash
# Get PR metadata and diff
gh pr view 123 --json title,body,files,additions,deletions,commits
gh pr diff 123

# Get PR comments
gh pr view 123 --json comments,reviews
```

### Local Changes
```bash
# Get change context
git status
git diff --staged
git diff HEAD
git log --oneline -10
```

## Phase 2: Context Gathering

Use octocode-tools to understand the changed code:

```bash
# For each changed file, understand its role
npx -y octocode-tools local-search --pattern "export.*function\|export.*class" --path ./src/changed-file.ts

# Trace impact — who calls the changed functions?
npx -y octocode-tools lsp-call-hierarchy --uri ./src/changed-file.ts --symbol "changedFunction" --line-hint 42 --direction incoming

# Find all usages of changed types
npx -y octocode-tools lsp-references --uri ./src/types.ts --symbol "ChangedType" --line-hint 10

# Check for similar patterns in codebase
npx -y octocode-tools local-search --pattern "similar_pattern" --path ./src --type ts
```

## Phase 3: User Checkpoint

Present findings and ask for focus direction:
- What areas to focus on?
- Any concerns to prioritize?
- Full review or specific aspects?

## Phase 4: Analysis

### Flow Impact Analysis (for function/method changes)

```bash
# 1. Search for the changed symbol
npx -y octocode-tools local-search --pattern "changedFunction" --path ./src --type ts

# 2. Trace incoming callers
npx -y octocode-tools lsp-call-hierarchy --uri ./src/file.ts --symbol "changedFunction" --line-hint 42 --direction incoming --depth 2

# 3. Find all references (types, variables)
npx -y octocode-tools lsp-references --uri ./src/file.ts --symbol "ChangedType" --line-hint 10

# 4. Check outgoing dependencies
npx -y octocode-tools lsp-call-hierarchy --uri ./src/file.ts --symbol "changedFunction" --line-hint 42 --direction outgoing
```

### Domain Analysis

| Domain | What to Check |
|--------|---------------|
| Bug | Logic errors, edge cases, null handling |
| Architecture | Pattern alignment, coupling, cohesion |
| Performance | N+1 queries, unnecessary allocations, blocking calls |
| Security | Injection, XSS, data exposure, hardcoded secrets |
| Error Handling | Swallowed exceptions, missing error cases |
| Flow Impact | Blast radius — how many callers/consumers affected |

### External Context (when needed)

```bash
# Check how a dependency is supposed to be used
npx -y octocode-tools search-packages --name "dependency-name" --ecosystem npm --fetch-metadata
npx -y octocode-tools search-code --keywords "usage,pattern" --owner owner --repo dep-repo --extension ts
```

## Phase 5: Finalize

- Deduplicate findings
- Verify against project guidelines
- Priority: Security > Bug > Flow Impact > Architecture > Performance > Quality

## Phase 6: Report

Each finding includes:
- **Location**: `file:line`
- **Confidence**: HIGH / MED
- **Problem**: Clear description
- **Fix**: Code-level suggestion

```markdown
## Review Summary

**Risk**: LOW / MEDIUM / HIGH
**Recommendation**: Approve / Request Changes / Needs Discussion

## Findings

### HIGH: [Title] — `src/file.ts:42`
**Problem**: [Description]
**Impact**: [Who/what is affected]
**Fix**:
```diff
- old code
+ new code
```
```

## Key Principles

- Focus on CHANGED code, not surrounding code
- Trace impact with LSP before concluding
- Evidence-backed findings only — cite file:line
- Never guess lineHint — always search first
