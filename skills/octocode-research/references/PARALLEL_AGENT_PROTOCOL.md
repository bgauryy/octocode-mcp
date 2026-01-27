# Parallel Agent Protocol

**CRITICAL: When spawning parallel agents, follow this EXACT protocol.**

## Spawn Phase

**Step 1**: Generate session ID and prepare output directory
```bash
mkdir -p .octocode/research/{session-id}/
```

**Step 2**: For each domain, spawn an agent with this template:

### Agent Template

```markdown
# Research Agent - Domain: {DOMAIN_NAME}

## Mission
You are researching ONE specific domain as part of a larger investigation.
Other agents are researching other domains in parallel.
DO NOT duplicate work outside your boundaries.

## Main Research Goal
{MAIN_RESEARCH_GOAL}

## Your Specific Scope
- **Domain**: {DOMAIN_NAME}
- **Repository**: {owner}/{repo} (if GitHub) OR {path_prefix} (if local)
- **Boundaries**: ONLY research within this scope

## Constraints
- Maximum tool calls: 10
- Timeout: 5 minutes
- You MUST write findings to output file

## Output File
Write to: `.octocode/research/{SESSION_ID}/domain-{DOMAIN_NAME}.md`

## Required Output Format
```markdown
# Domain: {DOMAIN_NAME}

## Summary
[2-3 sentence TL;DR]

## Key Files
| File | Line | Description |
|------|------|-------------|
| path/to/file | 42 | What it does |

## Findings
### Finding 1: {title}
- Evidence: {file:line}
- Code snippet (≤10 lines)

## Gaps
- [What couldn't be determined]

## Answer
[Direct answer to mainResearchGoal from this domain]
```
```

**Step 3**: Launch agents in parallel
```
Task(subagent_type="Explore", model="opus", prompt=AGENT_PROMPT_A, run_in_background=True)
Task(subagent_type="Explore", model="opus", prompt=AGENT_PROMPT_B, run_in_background=True)
```

**Step 4**: Tell user
> "Spawning {N} parallel agents for domains: {list}. Will merge findings when complete."

---

## Barrier Phase (Wait)

**WAIT for all agents** to complete or timeout (5 min max).

Track status:
```
Agent A: Complete (domain-auth.md written)
Agent B: Running...
Agent C: Timeout (partial results)
```

**IF agent times out**: Collect partial results if output file exists.

---

## Merge Phase

<merge_gate>
**HALT. Before merging, verify ALL conditions:**

- [ ] All agents completed OR timed out (5 min max)?
- [ ] All expected domain-*.md files exist (or noted as missing)?
- [ ] No agent still running in background?

**IF ANY condition not met → WAIT or collect partial results.**
**IF ALL conditions met → PROCEED with merge steps.**
</merge_gate>

**Step 1**: Read all output files
```
.octocode/research/{session}/domain-auth.md
.octocode/research/{session}/domain-payments.md
```

**Step 2**: Check for conflicts

| Conflict Type | Detection | Resolution |
|---------------|-----------|------------|
| Contradictory facts | Same topic, different claims | **STOP.** Ask user to resolve. |
| Overlapping findings | Both found same file | Deduplicate |
| Missing coverage | Gap between domains | Note in output |

**Step 3**: Synthesize unified answer
- Combine findings from all domains
- Note which domain each finding came from
- Highlight cross-domain connections

**Step 4**: Present merged result
> "Merged findings from {N} agents. Domain A found X, Domain B found Y. Together, this shows..."

<merge_complete_gate>
**HALT. Before proceeding to Phase 5 (OUTPUT), verify:**

- [ ] All domain findings incorporated?
- [ ] Conflicts resolved (or user acknowledged)?
- [ ] Deduplication complete?
- [ ] Cross-domain connections noted?

**IF ANY condition not met → Complete missing items.**
**IF ALL conditions met → PROCEED to Phase 5 (OUTPUT) in main SKILL.md.**
</merge_complete_gate>

---

## Failure Handling

| Scenario | Detection | Action |
|----------|-----------|--------|
| One agent fails | No output file after timeout | Use partial results, note gap |
| One agent finds answer | Complete answer in one domain | Cancel others, proceed to OUTPUT |
| All agents timeout | No complete results | **STOP.** Offer: retry with smaller scope? |
| Contradictory findings | Conflicting claims | **STOP.** Present both, ask user to resolve |

### Example: Partial Failure

```markdown
## Merged Findings

### From Domain: auth (complete)
- Auth uses JWT tokens
- Implementation at auth/jwt.ts:42

### From Domain: payments (partial - timeout)
- Found payment gateway integration
- [Incomplete: couldn't trace full flow]

### Gaps
- Payments domain research incomplete due to timeout
- Consider: "Continue researching payments domain?"
```

### Example: Conflict Resolution

```markdown
## Conflict Detected

**Topic**: Authentication method

**Domain A says**: "Uses JWT tokens" (evidence: auth/config.ts:15)
**Domain B says**: "Uses session cookies" (evidence: api/middleware.ts:23)

**Asking user**: Which is correct, or should I investigate further?
```
