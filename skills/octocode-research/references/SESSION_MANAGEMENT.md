# Session & Checkpoint Management

## When to Checkpoint

Checkpoint when context becomes heavy or research is extensive. This prevents context window exhaustion and enables resumption.

| State Transition | Trigger |
|---|---|
| RESEARCH → CHECKPOINT | Context heavy or research extensive |
| CHECKPOINT → RESEARCH | After saving, continue compressed |
| OUTPUT → PLAN/RESEARCH | User says "continue researching" |

## Checkpoint Protocol

Save to `.octocode/research/{session-id}/checkpoint-{N}.md`.

**Save**: goal, key findings (file:line), open questions, next steps.
**Discard**: full tool JSON, intermediate results, verbose hints.

### Session Directory Structure

```
.octocode/research/{session-id}/
├── session.json    # {id, state, mainResearchGoal}
├── checkpoint-*.md
├── domain-*.md     # Parallel agent outputs
└── research.md     # Final output
```

### Resumption

If `session.json` exists with state ≠ DONE → Ask "Resume from last checkpoint?"

When resuming:
1. Read `session.json` for context
2. Read latest `checkpoint-*.md` for findings so far
3. Continue from where the checkpoint left off
4. Update task status in `TodoWrite`
