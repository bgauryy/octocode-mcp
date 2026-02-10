# Output Protocol & Report Template

## Tone
Professional, constructive. Focus on code, not author. Explain reasoning. Distinguish requirements vs preferences.

---

## Report File Location
**File**: `.octocode/reviewPR/{session-name}/PR_{prNumber}.md`

> `{session-name}` = short descriptive name (e.g., `auth-refactor`, `api-v2`)

---

## Report Template

```markdown
# PR Review: [Title]

## Executive Summary
| Aspect | Value |
|--------|-------|
| **PR Goal** | [One-sentence description] |
| **Files Changed** | [Count] |
| **Risk Level** | [HIGH / MEDIUM / LOW] — [reasoning] |
| **Review Mode** | [Quick / Full] |
| **Review Effort** | [1-5] — [1=trivial, 5=complex] |
| **Recommendation** | [APPROVE / REQUEST_CHANGES / COMMENT] |

**Affected Areas**: [Key components/modules with file names]

**Business Impact**: [How changes affect users, metrics, or operations]

**Flow Changes**: [Brief description of how this PR changes existing behavior/data flow]

## Ratings
| Aspect | Score |
|--------|-------|
| Correctness | X/5 |
| Security | X/5 |
| Performance | X/5 |
| Maintainability | X/5 |

## PR Health
- [ ] Has clear description
- [ ] References ticket/issue (if applicable)
- [ ] Appropriate size (or justified if large)
- [ ] Has relevant tests (if applicable)

## Guidelines Compliance (if guidelines loaded)
| Source | Rule | Status |
|--------|------|--------|
| [file path] | [specific rule] | PASS / VIOLATION / N/A |

## High Priority Issues
(Must fix before merge)

### [Domain] #[N]: [Title]
**Location:** `[path]:[line]` | **Confidence:** [HIGH / MED]

[1-2 sentences: what's wrong, why it matters, flow impact if any]

```diff
- [current]
+ [fixed]
```

---

## Medium Priority Issues
(Should fix, not blocking)

[Same format, sequential numbering]

---

## Low Priority Issues
(Nice to have)

[Same format, sequential numbering]

---

## Flow Impact Analysis (if significant changes)
[Mermaid diagram showing before/after flow, or list of affected callers]

---
Created by Octocode MCP https://octocode.ai
```
