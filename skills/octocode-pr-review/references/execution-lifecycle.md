# Execution Lifecycle Reference

This document contains detailed execution lifecycle phases for PR review.

---

## Phase 1: Context

- Fetch PR metadata and diff using `githubSearchPullRequests`
- Review existing PR comments first:
  - **Check if previous comments were fixed!** (Verify resolution)
  - Avoid duplicates (do not report issues already flagged)
- Classify risk: High (Logic/Auth/API/Data) vs Low (Docs/CSS)
- **PR Health Check**:
  - Flag large PRs (>500 lines) - suggest splitting
  - Missing description - flag
  - Can PR be split into independent sub-PRs?
- Build mental model: group changes by functionality
- Analyze commit history: development progression, decision patterns
- Check for ticket/issue reference - verify requirements alignment

---

## Phase 1.5: User Checkpoint (MANDATORY)

Before deep analysis, present findings and ask user for direction.

### Step 1: TL;DR Summary

Present to user:
- **PR Overview**: What this PR does (1-2 sentences)
- **Files Changed**: Count and key areas (e.g., "12 files: API handlers, auth middleware, tests")
- **Initial Risk Assessment**: HIGH / MEDIUM / LOW with reasoning
- **Key Areas Identified**:
  - List 3-5 main functional areas in the PR
  - Flag any areas that look complex or risky
- **Potential Concerns** (if any): Quick observations from initial scan

### Step 2: Ask User (MANDATORY)

Ask user:
1. "Which areas would you like me to focus on?" (list the identified areas as options)
2. "Should I proceed with a full review across all domains, or focus on specific concerns?"
3. **Optional Context** (helpful but not required):
   - "Any additional links? (related PRs, docs, design specs)"
   - "Any context I should know? (known issues, business requirements, deadlines)"

**Wait for user response before proceeding to Phase 2.**

User can provide:
- **Focus areas**: "Focus on the auth changes and API handlers"
- **Additional context**: "This is a hotfix for issue #123, prioritize correctness over style"
- **Full review**: "Proceed with full review" - Continue to Phase 2 with all domains
- **Skip deep analysis**: "Just give me the summary" - Jump to Phase 4 with current findings

---

## Phase 2: Analysis

**Respect User Direction**: Apply user's focus areas and context from Phase 1.5. If user specified focus areas, prioritize those domains. If user provided context, incorporate it into analysis.

- Generate 3-5 context queries for Octocode research (aligned with user focus)
- **Flow Impact Analysis** (CRITICAL):
  - Search all callers/usages of modified functions (`githubSearchCode`)
  - Trace how data flows through changed code paths
  - Identify if return values, types, or side effects changed
  - Check if existing integrations will break
- Validate schemas/APIs/dependencies
- Assess impact per domain (prioritize user-specified areas):
  - **Architectural**: System structure, pattern alignment
  - **Integration**: Affected systems, integration patterns
  - **Risk**: Race conditions, performance, security
  - **Business**: User experience, metrics, operational costs
  - **Cascade Effect**: Could this lead to other problems?
- Identify edge cases
- Security scan: injection, XSS, data exposure, regulatory compliance (GDPR, HIPAA)
- Scan for TODO/FIXME comments in new code
- For high-risk changes: Consider rollback strategy/feature flags

---

## Phase 3: Finalize

- **Dedupe**: Check against existing PR comments, merge same root cause
- **Refine**: For uncertain suggestions - research more or ask user
  - **UNCHANGED**: Suggestion verified correct
  - **UPDATED**: New context improves suggestion
  - **INCORRECT**: Context proves suggestion wrong - delete
- **Verify**:
  - Each suggestion has HIGH/MED confidence + clear fix
  - **Previous Comments Resolution**: Explicitly verify that comments from previous reviews were fixed. If not, re-flag as unresolved.
- Limit to most impactful findings (max ~5-7 key issues)

---

## Phase 4: Report

### Step 1: Chat Summary (MANDATORY)

Before creating any documentation:
- Provide TL;DR of review findings in chat
- State recommendation: APPROVE / REQUEST_CHANGES / COMMENT
- List high-priority issues with brief descriptions
- Summarize risk level and key affected areas

### Step 2: Ask Before Creating Doc (MANDATORY)

Ask user: "Would you like me to create the detailed PR review document?"
- If yes - Generate per output structure
- If no - Continue discussion or provide additional analysis
- Only write `.octocode/reviewPR/...` after explicit user approval

### Step 3: Generate (After Approval)

- Ensure all suggestions have: location, confidence, concise problem, code fix
- Number issues sequentially across all priorities
