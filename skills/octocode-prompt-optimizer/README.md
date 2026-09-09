# Octocode prompt optimizer

Write and repair instruction surfaces so they change behavior. A stated preference leaves every choice open; a defined boundary against the behavior it is confused with decides the next action. Preserve intent when you change tool contracts or schema contracts.

## Use when

- A goal must become a compact prompt, rule, tool description, or policy.
- An instruction surface is unclear, unsafe, too expensive in context, or difficult to trigger.
- MCP server instructions, a tool description, and a schema disagree, or a shared field name drifted between tools.
- A handoff omits authority, evidence, acceptance, or return shape.
- A tool schema or pagination contract permits ambiguous or incomplete behavior.
- Accumulated context must be compacted, summarized, or compressed without destroying evidence.
- Reliability needs behavioral evaluation rather than wording judgment alone.

## Method

Use these questions to diagnose an unclear rule; they are not required output sections:

| Part | States |
|---|---|
| Definition | the behavior, concretely |
| Contrast | the smallest wrong → right pair |
| Consequence | why the distinction matters |
| Principle | the general rule behind the pair |
| Action | the rule to apply while working |

Keep an observable action. Add a distinction, example, or consequence only when it makes that action clearer. A short rule can stand alone without the other parts.

Then each surviving sentence must define a distinction, set a boundary, explain a consequence, or direct an action. Everything else — repeated rules, motivational language, role-play, uninformative headings, decorative terminology — is cut. The target is behavioral information per token, not minimum length.

## Layers

Tool-facing work separates three surfaces that are read at different moments: MCP server instructions own tool families, cross-tool workflow, and shared conventions; a tool description owns when to call it and when not to; a schema owns exact fields and how to use each one. `references/contract-audit.md` then sweeps the full tool set for split owners, overlapping selection, and descriptors that drifted in name, type, or meaning.

## Workflow

```text
READ → UNDERSTAND → RATE → FIX → VALIDATE → OUTPUT
```

Small edits can combine adjacent phases. A goal with no existing prompt skips RATE. Claims of improved reliability need a fixed evaluation and measured comparison; wording review alone cannot establish them.

## Install

```bash
npx -y octocode skill install octocode-prompt-optimizer
```

## Maintainer verification

Run the `octocode-skills` review against this folder.
