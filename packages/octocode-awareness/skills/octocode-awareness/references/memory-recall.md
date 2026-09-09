# Memory Recall and Trust

Load when prior learning could change the approach, or substantial work produced a reusable lesson.

Memory is a ranked lead, never authority. Current user instructions, source, and fresh tests win.

## Recall

```bash
<cli> memory recall --agent-id "$OCTOCODE_AGENT_ID" --workspace "$PWD" \
  --query "<current task>" --smart --compact
```

Use compact recall for orientation. Expand only relevant IDs and verify every decision-changing file, URL, version, or test against current state. Preserve provenance and distinguish repository coordination from global reusable learning.

## Store

At the end of substantial work or a meaningful event, store one concise verified, reusable lesson with narrow scope and references. Skip routine edits and repeated lessons. Prefer a lesson that changes a future decision over status, raw dialogue, or a transcript. Reflect after the check so outcome and evidence remain joined.

## Validate declared evidence

For file-backed learning, `memory record --capture-fingerprint` captures current
bytes and modes from every declared `--file` and `--reference file:<path>` source.
Include dependencies explicitly. `memory recall --check-fingerprint` checks those
sources in the same canonical workspace and retains `evidence.state` in lean output:
`fresh`, `stale`, or `unknown`. Without the check, a captured fingerprint is unknown.

Fresh means the declared sources match at observation time; it proves neither the
claim, complete dependency coverage nor a successful check. Changed or missing
sources are stale; unsupported, inaccessible, foreign, symlinked or over-budget
sources cannot be fresh. Limits are 64 references, 1 MiB per file, 8 MiB per call
and a cooperative 100 ms filesystem deadline, which cannot preempt a blocked kernel
call. Partial captures fail. Existing memory references and fingerprint storage own
this feature; there is no separate cache database.

Discover exact fields with `schema command memory record --compact` and
`schema command memory recall --compact`.

## Freshness and conflict

- A stale file reference lowers confidence; it does not silently update itself.
- Conflicting memories remain visible until current evidence resolves them.
- Supersede obsolete knowledge; archive weak material; restore only archived rows.
- Preview forget/digest operations and review exact IDs before deletion.
- Never load a human thesis or large corpus automatically into prompt context.

Default hooks deliver peer messages without recalling memory. Request memory explicitly when prior learning could change a decision.

Before writing, ask: Is it verified? Will it change a later action? Is its scope clear? Can a future agent re-check the cited source? If any answer is no, keep it out of durable memory.

Next: use `references/learning-loop.md` to route a verified outcome or return to `SKILL.md`.
