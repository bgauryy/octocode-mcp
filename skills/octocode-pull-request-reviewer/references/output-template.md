# Output Protocol & Report Template

## Tone
Professional, constructive. Focus on code, not author. Explain reasoning. Distinguish requirements vs preferences.

---

## Report File Location

| Mode | Path |
|------|------|
| **PR Mode** | `.octocode/reviewPR/{session-name}/PR_{prNumber}.md` |
| **Local Mode** | `.octocode/reviewLocal/{session-name}/REVIEW_{branch}_{timestamp}.md` |

> `{session-name}` = short descriptive name (e.g., `auth-refactor`, `api-v2`)

---

## Report Template — PR Mode

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

---

## Report Template — Local Mode

```markdown
# Local Changes Review: [{branch}]

## Executive Summary
| Aspect | Value |
|--------|-------|
| **Branch** | [{branch}] |
| **Scope** | [staged / unstaged / both] |
| **Files Changed** | [Count] |
| **Lines Changed** | [Count] |
| **Risk Level** | [HIGH / MEDIUM / LOW] — [reasoning] |
| **Review Mode** | [Quick / Full] |
| **Recommendation** | [LOOKS_GOOD / NEEDS_CHANGES / COMMENT] |

**Affected Areas**: [Key components/modules with file names]

**Flow Changes**: [Brief description of how these changes alter existing behavior/data flow]

## Ratings
| Aspect | Score |
|--------|-------|
| Correctness | X/5 |
| Security | X/5 |
| Performance | X/5 |
| Maintainability | X/5 |

## Changes Health
- [ ] Changes are logically cohesive (single concern)
- [ ] Appropriate size (or should be split into multiple commits)
- [ ] Has relevant tests (if applicable)

## Guidelines Compliance (if guidelines loaded)
| Source | Rule | Status |
|--------|------|--------|
| [file path] | [specific rule] | PASS / VIOLATION / N/A |

## High Priority Issues
(Must fix before committing)

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

## Suggested Next Steps
- [ ] [Run tests / Fix issues / Split into commits / Ready to commit]

---
Created by Octocode MCP https://octocode.ai
```
