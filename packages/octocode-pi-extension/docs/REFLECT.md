# Awareness learning in Pi

Pi uses the full `@octocodeai/octocode-awareness` package. Durable memory,
reflection, weakness mining, refinements, verified-memory workflows and harness
exports use its installed CLI through `bash`. Pi does not register a separate
model-facing memory tool or automatically run learning workflows at turn end.

Use Pi's supplied runner and database bindings for every example below. Scoped
commands use `--workspace "$OCTOCODE_AWARENESS_WORKSPACE"`; writes use the supplied
`OCTOCODE_AGENT_ID`. External agents share the physical database and workspace
with their own stable identities. See [agent flow](AWARENESS_AGENT_FLOW.md).

The bundled `octocode-awareness` skill explains when to use each workflow.
Keep authored improvement proposals in the workspace-root `.octocode/REFLECT.md`,
normal docs, issues, or reviewed plans. That project file is distinct from
global Octocode home state. Keep it concise and non-binding.

## When to record memory

Record only reusable, verified facts:

- a root cause or workaround that is likely to recur;
- a repository convention that changed the implementation path;
- a decision and the evidence behind it;
- a command or test gotcha that affects future work.

Skip routine status, raw logs, obvious edits, secrets, and facts already
authoritative in source/docs.

## Recall before risky work

```bash
"$OCTOCODE_NODE" "$OCTOCODE_AWARENESS_CLI" --db "$OCTOCODE_AWARENESS_DB" memory recall \
  --workspace "$OCTOCODE_AWARENESS_WORKSPACE" --query "tokenization"
```

Treat every result as a lead. Re-read cited source and rerun current checks when
the fact can affect a change.

## Store a verified learning

```bash
"$OCTOCODE_NODE" "$OCTOCODE_AWARENESS_CLI" --db "$OCTOCODE_AWARENESS_DB" memory record \
  --workspace "$OCTOCODE_AWARENESS_WORKSPACE" --agent-id "$OCTOCODE_AGENT_ID" --label DECISION \
  --task-context "parser validation" --importance 7 \
  --observation "Malformed escapes are rejected before tokenization"
```

Keep the text short and cite source/test evidence in the wording when useful.
Do not use memory as a task queue; use `plan`/`task` for work and `handoff` for
continuation notes.

## Reflection and follow-up

Inspect the live contract before using a broader workflow:

```bash
"$OCTOCODE_NODE" "$OCTOCODE_AWARENESS_CLI" --db "$OCTOCODE_AWARENESS_DB" schema command reflect record --compact
"$OCTOCODE_NODE" "$OCTOCODE_AWARENESS_CLI" --db "$OCTOCODE_AWARENESS_DB" schema command refinement set --compact
```

Record the observed outcome and a reusable lesson after verification:

```bash
"$OCTOCODE_NODE" "$OCTOCODE_AWARENESS_CLI" --db "$OCTOCODE_AWARENESS_DB" reflect record \
  --workspace "$OCTOCODE_AWARENESS_WORKSPACE" --agent-id "$OCTOCODE_AGENT_ID" \
  --task "Validate parser escapes" --outcome worked \
  --lesson "Validate malformed escapes before tokenization"
```

`reflect mine-weakness`, `reflect export-harness`, and
`reflect developer-review` support broader analysis. `refinement get|set|delete`
tracks follow-up improvements. Inspect each command's schema for required
evidence and options. Reflection and exported proposals do not authorize
harness changes or prove that checks passed.

## Cleanup

Awareness cleanup is explicit and item-scoped:

```bash
"$OCTOCODE_NODE" "$OCTOCODE_AWARENESS_CLI" --db "$OCTOCODE_AWARENESS_DB" status --workspace "$OCTOCODE_AWARENESS_WORKSPACE"
"$OCTOCODE_NODE" "$OCTOCODE_AWARENESS_CLI" --db "$OCTOCODE_AWARENESS_DB" memory forget \
  --workspace "$OCTOCODE_AWARENESS_WORKSPACE" --memory-id mem_123 --dry-run
```

Review the preview before removing `--dry-run`. Use `schema commands --all --compact`
for the installed command inventory and `docs list --compact` for
the package's detailed learning and maintenance references.
