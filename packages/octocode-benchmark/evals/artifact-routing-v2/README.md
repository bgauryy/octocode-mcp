# Artifact routing diagnostic v2

Compare all ten canonical tools using actual `queries[]` envelopes. Both arms use Ollama `/api/chat`: native function calls, or JSON-emulated calls. They receive the same instructions, tool information, tasks, model, seed, context, and output budget. Native formatting and emulated JSON grammar differ by design.

The 20-case prospective diagnostic covers eight registries, all ten tools, exact identifiers and revisions, local scope, independent batching, unsupported discovery, and disabled tools. Cases were authored before v2 inference, with knowledge of earlier failure categories; this is not a blind external benchmark. Selection, semantic fidelity, schema validity, transport validity, and sensor integrity are separate metrics.

Run from the repository root after installing/building the canonical core dependency:

```bash
# Deterministic references, grader adversaries, and repair-message checks. No inference.
node packages/octocode-benchmark/evals/artifact-routing-v2/selftest.mjs

# Choose a fresh artifact root. Never replace a baseline or an existing freeze.
EVAL_ROOT=.octocode/octocode-eval-benchmark/artifact-routing-next
node packages/octocode-benchmark/evals/artifact-routing-v2/snapshot.mjs baseline "$EVAL_ROOT"
# Make/build/review the subject change, then capture the candidate.
node packages/octocode-benchmark/evals/artifact-routing-v2/snapshot.mjs candidate "$EVAL_ROOT"
node packages/octocode-benchmark/evals/artifact-routing-v2/selftest.mjs "$EVAL_ROOT"
node packages/octocode-benchmark/evals/artifact-routing-v2/freeze.mjs "$EVAL_ROOT"

# 20 cases × 2 subjects × 2 transports. Requests group by subject/transport.
node packages/octocode-benchmark/evals/artifact-routing-v2/run.mjs --root="$EVAL_ROOT" --max-requests=80
# Optional separate repair experiment; preserve first-action scores.
node packages/octocode-benchmark/evals/artifact-routing-v2/run.mjs --root="$EVAL_ROOT" --repair=1 --max-requests=120
```

There is one maintained runner. Freezing copies the complete harness into `ROOT/harness` and hashes those copies, both snapshots, copied executable validators, and Zod. If `ROOT/protocol.json` exists, it is frozen too. The canonical runner delegates to that frozen copy; later source edits cannot change a run. Snapshots and freezes refuse replacement. Each run gets its own requests, raw responses, model/runtime receipt, traces, and summary. `snapshot.mjs` optionally accepts `SUBJECT OUTPUT_ROOT CORE_PACKAGE_PATH`.

Defaults are **65,536 context tokens, 512 output tokens, a 240-second HTTP deadline, and an 18-minute total wall budget**. These are local experiment settings, not global model configuration. Full-catalog native prompts measured 32,931–34,786 tokens; 32K requests silently lost input, while a 64K preflight retained all 34,786 tokens. A measured cold prefill took 153 seconds, motivating the HTTP margin. This differs from the older five-tool diagnostic, whose candidate traces were untruncated. Grouped ordering amortizes common prefixes.

Options include `--context`, `--order=grouped|interleaved`, `--timeout-ms`, `--wall-ms`, `--max-requests`, `--subjects`, `--arms`, and `--case-ids`. Partial runs are inconclusive. Defaults target an installed `gemma4:latest` with recorded digest and tool capability; the runner rejects model-digest drift. It sends top-level `truncate:false` and `shift:false`. The installed Ollama 0.33.2 rejected an oversized `truncate:false` negative control with HTTP 400; the shift flag alone is not treated as proof that context shifting is disabled.

The sensor also checks measured token counts, finish reasons, and the server-log byte range produced during each request for truncation or context-shift warnings. It stops on warnings, near-window inputs, or unreadable/rotated/overlarge log ranges. The default local log is `~/.ollama/logs/server.log`; override with `--server-log=/path/to/server.log`. All warnings and byte offsets are retained. Concurrent unrelated server truncation can conservatively invalidate a trial. Without this evidence, a model response must not be assumed complete merely because the requested context was large.

Only input-mode JSON Schemas reach the model. Preserved executable Zod checks refinements JSON Schema cannot express. The all-tools fixture exposes cloning except in the disabled-tool case; live local availability may differ. **No registry, GitHub, local-file, clone, or LSP provider operation is executed by the model.** Provider behavior and continuation completeness need separate CLI/MCP integration tests.

One-error repair uses only observed transport/Zod errors and the original request, never expected answers or semantic grades. Malformed native calls are rendered as assistant text before repair, never forwarded as invalid tool-call messages. Valid native call envelopes receive validation-only tool feedback. This harness sends raw Zod issues, including union branches; it does not replay the MCP server's concise serialized error response. Its repair scores therefore measure validator feedback, not the production MCP repair flow. First-action and repaired success remain separate. Refusal checks are calibrated lexical tests, not a general natural-language oracle.

The diagnostic target is at least 95% joint first-action success, no unnecessary calls or sensor errors, and no matched-case semantic regression. Complete paired results and integration evidence are required before acceptance; the summary does not automatically grant it. One model and seed cannot establish general routing reliability. Historical aborted runs and their original source archives remain evidence and must not be relabeled as accuracy results.
