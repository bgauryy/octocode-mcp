# JEV proposal POC

Run isolated experiments around the built local CLI before changing the production JEV integration. The offline mode reproduces current behavior with a loopback mock. The live mode changes only the provider request at a loopback transport boundary and lets the real CLI rank and paginate the response.

Run from the repository root with Node 24. Each output path must be new; earlier attempts are never overwritten.

```sh
node packages/octocode-benchmark/compare/bin/jev_proposal_poc.mjs --mode offline --out .octocode/octocode-eval-benchmark/my-poc/dev/offline-01
node packages/octocode-benchmark/compare/bin/jev_proposal_poc.mjs --mode live --out .octocode/octocode-eval-benchmark/my-poc/dev/live-01
node packages/octocode-benchmark/compare/bin/jev_proposal_poc_summary.mjs .octocode/octocode-eval-benchmark/my-poc/dev/live-01/run.json
node --test packages/octocode-benchmark/compare/bin/jev_proposal_poc.test.mjs
```

Offline mode needs loopback access but sends nothing to an external service. Live mode uses the existing credential through `@octocodeai/config`, sends only the supplied synthetic development fixtures, and pins `jev-1.13.0` by default. Use `--model <id>` for a different explicitly recorded experiment. Production settings remain unchanged. The child CLI uses a separate Octocode home and a dummy key; the real credential stays in the forwarding process and is never saved.

## What is compared

| Mode or arm | What runs | What it can establish |
|---|---|---|
| Offline CLI probes | Missing newline, long line, duplicate rows, partial failure, disjoint range selection, ASCII/Unicode source capture, snapshot mutation, and full paging | Reproduce current defects and verify source traversal |
| Offline prototypes | General chunk partition and successful-slot ordering; unique-request counts | Mechanical feasibility and deduplication opportunity; these are not integrated fixes |
| `ordinary-source-order` | Normal localFetch without classifiers | A source-order reference, not the cheapest possible exact-query strategy |
| `native-2k` | Current classifiers prompt, state, chunks, ordering, and pagination; model pinned at transport | Baseline for this controlled experiment |
| `target-2k` | Explicit target/context instruction; unchanged target text and empty neighbor context | Control for the prompt/shape change used by the context arms |
| `context-4k` / `context-8k` | Same target-aware instruction; bounded neighboring lines added to provider state | Effect of added judgment context while returned units stay unchanged |

The live suite contains six cases with four complete output units each. Arm order rotates by case. Every arm receives the same selected source, classifiers, and page size. Context never leaves that source. All expanded characters count toward the per-operation 131,072-character budget; it does not bind in these small cases. A later equal-budget stress test is still needed.

The hard live ceiling is 96 provider requests, no retries, with a 15-second request timeout and a ten-minute campaign limit. The reported input-token stop is 240,000: the current request can cross that threshold, then further calls stop. Unknown usage and provider errors stop the live campaign and remain in the record. Each valid arm makes four paid requests regardless of continuation count.

## Measurements and limits

`run.json` freezes conditions and hashes before requests, saves every outcome and provider attempt, and includes source fixtures, question shapes, model identity, usage, and source pages. It contains no keys. The ledger's mock usage is synthetic and must not be reported as real inference usage.

The primary sensor is the earliest response page containing all evaluator-required source line IDs. Report it as **retrospective evidence arrival**, not an agent reading, understanding, verifying, or correctly answering a task. Absent-answer cases require the complete walk. Exact source reconstruction is checked for every live arm. Character counts measure serialized `data` rows in UTF-16 units, including their ranking/continuation metadata; they exclude the outer response envelope and request arguments. Full traversal time includes CLI startup, inference, and every continuation; it is not time to first evidence.

The summary uses paired per-case ratios, preserving failures and unknown usage. Comparing medians of pooled arm totals can exaggerate a gain that occurred on only one task. The fixtures and gold lines are development material, visible to the harness author; they are not a sealed holdout. No agent, model grader, AST-aware chunker, GitHub backend, real repository task, cache implementation, or production Scout fix is evaluated here. Do not promote a default or claim whole-agent savings from this POC.

Use the existing isolated agent benchmark for a later autonomous comparison, after selecting a candidate on development data and freezing new real-repository tasks. Keep that evaluation separate from the mechanism experiments.

## First recorded run

The [development report](/Users/bgaryy/code/octocode/.octocode/octocode-eval-benchmark/2026-10-14-jev-proposal-poc/README.md) records the first offline and live results. The [RFC](/Users/bgaryy/code/octocode/.octocode/octocode-rfc-generator/2026-10-14-jev-goals-and-evidence/RFC.md) owns the proposed production design and its acceptance criteria.

## Atomic questions and verification reads

The second experiment compares complete question/read policies through the same built CLI:

```sh
node packages/octocode-benchmark/compare/bin/jev_question_poc.mjs --out .octocode/octocode-eval-benchmark/my-question-poc/dev/smoke --smoke
node packages/octocode-benchmark/compare/bin/jev_question_poc.mjs --out .octocode/octocode-eval-benchmark/my-question-poc/dev/live
python3 packages/octocode-benchmark/compare/bin/jev_question_poc_summary.py .octocode/octocode-eval-benchmark/my-question-poc/dev/live/run.json
node packages/octocode-benchmark/compare/bin/jev_read_expansion_poc.mjs .octocode/octocode-eval-benchmark/my-question-poc/dev/live/run.json .octocode/octocode-eval-benchmark/my-question-poc/dev/expansion
python3 packages/octocode-benchmark/compare/bin/jev_question_poc_summary.py .octocode/octocode-eval-benchmark/my-question-poc/dev/expansion/run.json
node --test packages/octocode-benchmark/compare/bin/jev_question_poc.test.mjs
```

Token analysis requires Python with `tiktoken==0.14.0`; both `o200k_base` and `cl100k_base` are recorded. Counts cover literal CLI stdout and serialized arguments separately. They exclude host framing, schema loading, history replay, reasoning, and final answers; they are not observed host usage.

The live runner sends 12 synthetic support packets, eight novelty packets, and six bounded local Rust source snapshots to the configured JEV provider. Review `question-cases.mjs` and `locate-cases.mjs` before using it. Source hashes fail closed if a case changes. The run pins `jev-1.13.0`, caps requests at 256 (40 in smoke), stops after 600,000 reported input tokens (100,000 in smoke; one request can cross the bound), and permits no provider retries. A separate home and loopback proxy keep credentials out of saved evidence. Output directories must be new.

Question styles are compound, atomic, and atomic with explicit required-evidence instructions. Support decisions require every returned predicate to reach the preregistered 0.8 cutoff. This is a comparison cutoff, not a calibrated product threshold. Every judgment is a provider Noul question over literal `state`. Novelty compares an `adds` question (known facts plus source as state) with a relevance-driven next-read question; `relevant` is not itself a novelty classifier. Classifiers use a fixed first-two-page reading budget. The pre-RFC Locate arms were removed with the public Locate API; their recorded runs remain historical evidence. Selection never consults gold line IDs; the evaluator checks them afterward. Missing or failed arms stay visible.

The expansion replay makes no JEV requests. It reuses the frozen model choices and their original classification responses, then performs snapshot-pinned local reads with zero, eight, or sixteen surrounding lines. It merges overlapping/adjacent intervals without filling other gaps. Its modeled workflow still includes the original classifier response and provider cost. The expansion candidate was chosen after observing development failures; it is not an independent confirmation.

The [atomic-workflow report](/Users/bgaryy/code/octocode/.octocode/octocode-eval-benchmark/2026-10-14-jev-atomic-workflows/README.md) records measured results, failed smoke attempts, exact-read controls, and the remaining autonomous-agent evaluation gap.

## Four-tool transfer check

`jev_four_tools_poc.mjs` compares `localSearch`, `localFetch`, `ghSearchCode`, and `ghGetFileContent` on two public Django cases. It copies committed source from the pinned local Django checkout and verifies the target files against GitHub at that SHA. Search discovery still uses GitHub's live default-branch index. The smoke and full runs require new output directories:

```sh
node packages/octocode-benchmark/compare/bin/jev_four_tools_poc.mjs --out .octocode/octocode-eval-benchmark/my-four-tool-run/dev/smoke --smoke
node packages/octocode-benchmark/compare/bin/jev_four_tools_poc.mjs --out .octocode/octocode-eval-benchmark/my-four-tool-run/dev/live
python3 packages/octocode-benchmark/compare/bin/jev_four_tools_poc_summary.py .octocode/octocode-eval-benchmark/my-four-tool-run/dev/live/run.json
```

The full run caps JEV at 220 requests, 450,000 reported input tokens, 15 minutes, and zero retries. A single in-flight request can cross the token threshold. It pins `jev-1.13.0` and records every attempted workflow. Provider source packets contain public Django code only; credentials and evaluator gold labels are not sent in the state.

Broad search policies read the first two candidate files completely; broad fetch policies read the first two 25-line pages; the classifiers arm changes only their ordering. The pre-RFC Locate arm and its GitHub revision guard were removed with the public Locate API; their recorded runs remain historical evidence. Unread search and source continuations remain in the trace. This is a bounded routing comparison, not a complete traversal test. The separate exact-anchor control uses a known filename and method literals, then reads containing declarations; it has more initial information and must not be portrayed as an autonomous discovery policy.

The [four-tool report](/Users/bgaryy/code/octocode/.octocode/octocode-eval-benchmark/2026-10-14-jev-four-tools/README.md) records the failed GitHub revision guards, the context-margin transfer failure, source-preserving controls, and full exchange tokens. It does not promote a default or claim whole-agent savings.

## Instruction and chunk-boundary comparison

`jev_chunk_instruction_poc.mjs` compares the short relevance rubric with a longer evidence rubric over complete-line 2k, complete-line 4k, and bounded declaration partitions. It reuses the six approved frozen Rust sources from the atomic-workflow run and the two pinned public Django snapshots from the four-tool run. Those dated source artifacts must exist; preparation verifies their hashes before copying them. This is an exposed development corpus, not a portable held-out benchmark.

```sh
node packages/octocode-benchmark/compare/bin/jev_chunk_instruction_poc.mjs --out .octocode/octocode-eval-benchmark/my-chunk-run/dev/live --prepare-only
node packages/octocode-benchmark/compare/bin/jev_chunk_instruction_poc.mjs --run .octocode/octocode-eval-benchmark/my-chunk-run/dev/live
python3 packages/octocode-benchmark/compare/bin/jev_chunk_instruction_poc_summary.py .octocode/octocode-eval-benchmark/my-chunk-run/dev/live/run.json
```

Use `--mock` with a new output directory for a transport rehearsal; mock scores and usage are artificial. `--run` accepts only an unstarted frozen preparation with the same harness/native hashes. Live execution pins `jev-1.13.0`, caps requests at 400 and reported input tokens at 600,000, allows 15 minutes overall and 20 seconds per request, and has zero retries. Unknown usage stops further requests. The credential is loaded through config and is never saved.

The planner obtains function/method spans internally through the real CLI. Every line is preserved exactly once. Each clasify query row has a `source` of `tool:"localFetch"` with a path, snapshot and range, never an inline body; a call carries at most five rows. Exact scores select one chunk per question with stable source-order ties; snapshot-pinned verification reads merge only overlapping or adjacent spans. Gold lines and enclosing declaration identities grade the resulting reads afterward and do not drive selection. The source planner is a prototype; this is not production classifiers' ordering.

The token summary counts complete classification and verification exchanges with both tokenizers. Internal AST setup is separately recorded and excluded; a host performing those calls itself must include them. Full reads are the ordinary baseline. Missing rows, quality failures and provider usage remain visible. No actual host model runs, so do not describe these token counts as measured host billing or total agent savings.

The [instruction/chunk report](/Users/bgaryy/code/octocode/.octocode/octocode-eval-benchmark/2026-10-14-jev-instructions-chunks/README.md) records all attempts and the 56-workflow live result: the longer prompt selected the same units in all 24 pairs; short 4k preserved evidence in 8/8 cases but did not meet the token-reduction target. Declaration units increased classification overhead and missed one caller/helper fact. Production defaults remain unchanged.
