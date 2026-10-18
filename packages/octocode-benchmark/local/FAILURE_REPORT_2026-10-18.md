# Benchmark Failure Report — Octocode (local hermetic suites)

Generated: 2026-10-18  
Runner: `packages/octocode-benchmark/local/e2e/harness/run-all.mjs`  
Environment: macOS darwin-arm64, Node 24.x

## 5W2H Summary

- **Who**: Benchmark harness (`run-all.mjs`) invoking hermetic suites; executed by an agent using the local native addon/binary.
- **What**: 15 hermetic suites ran. 11 passed, 4 failed at suite level; 12 individual check failures total. AST/grammar fully green; failures cluster in Rust LSP, classifier provider handling, and large-file pagination reassembly.
- **When**: 2026-10-18 (single session, multiple `run-all` invocations).
- **Where**: `packages/octocode-benchmark/local/e2e/` (harness, results). Native under test: `packages/octocode-native/octocode-native.darwin-arm64.node` + `packages/octocode-native/npm/darwin-arm64/octocode`.
- **Why**: To validate the local octocode native build against the hermetic benchmark suites.
- **How**: Set env overrides, run `run-all.mjs` with named suites, collect stdout + `results/*.log`.
- **How much**: 15 suites, ~minutes wall time; 12 failing checks; 0 grammar failures (133/133).

## Environment Setup (How)

```bash
cd /Users/bgaryy/code/octocode/packages/octocode-benchmark
export LOCAL_REPOS="$PWD/local/repos"
export QUESTION_DIR="$PWD/local/questions"
export QUESTION_REPO_MAP="$PWD/local/repositories.json"
export NODE_ENV=development
export OCTOCODE_NATIVE_BINDING="/Users/bgaryy/code/octocode/packages/octocode-native/octocode-native.darwin-arm64.node"
export OCTOCODE_NATIVE_BIN="/Users/bgaryy/code/octocode/packages/octocode-native/npm/darwin-arm64/octocode"
```

Notes:
- `NODE_ENV=development` is required so the bundled MCP/CLI honor `OCTOCODE_NATIVE_BINDING` / `OCTOCODE_NATIVE_BIN` (dev override gate).
- `OCTOCODE_NATIVE_BINDING` points the MCP server at the local `.node` addon.
- `OCTOCODE_NATIVE_BIN` points the CLI at the local native binary (used by astTopology/CLI paths).

## Execution Steps (How)

1. Ran full hermetic default set:
   ```bash
   node local/e2e/harness/run-all.mjs
   ```
   (timed out at 10 min mid-run; reran with larger timeout)

2. Ran remaining suites after timeout:
   ```bash
   node local/e2e/harness/run-all.mjs local-ranking,read-tool-selection,classification-retry,tool-health
   ```

3. Ran LSP/AST-focused suites:
   ```bash
   node local/e2e/harness/run-all.mjs lsp-importers,navigate,deps-flows,grammar
   ```

4. Collected failures from console output and `results/*.log`.

## Results Summary

| Suite | Result | Passed | Failed |
|---|---|---:|---:|
| acceptance | PASS | 27 | 0 |
| usage-regressions | FAIL | 43 | 2 |
| lsp-importers | PASS | 3 | 0 |
| rewrite | PASS | 5 | 0 |
| grammar | PASS | 133 | 0 |
| workflows | PASS | 27 | 0 |
| chain-check | FAIL | 47 | 1 |
| lead-replay | PASS | 115 | 0 |
| navigate | FAIL | 87 | 3 |
| repo-sweep | PASS | 138 | 0 |
| deps-flows | FAIL | 51 | 2 |
| large-files | FAIL | 48 | 1 |
| local-ranking | FAIL | 36 | 3 |
| read-tool-selection | PASS | 54 | 0 |
| classification-retry | PASS | 28 | 0 |
| tool-health | PASS | 16 | 0 |

## All 12 Failing Checks (with descriptions)

### A. usage-regressions (2)

A1. U17 MCP cold `lspSearch` references timeout
- Message: `{"ms":..., "locations":0, "isError":true, "errorCode":"timeout", "error":"LSP request timed out after 30000ms"}`
- Likely cause: cold LSP server start/indexing exceeds 30s budget on the TypeScript repo fixture.

A2. U17 MCP warm `lspSearch` references timeout
- Same as A1 but after warm-up; suggests sustained LSP latency, not just cold start.

### B. chain-check (1)

B1. chain C5 surface: `clasify` 4077 B > quota 3000 B
- The `clasify` tool output for a chain step exceeded the declared 3000-byte surface quota.
- Likely cause: over-return or quota too tight for that case.

### C. large-files (1)

C1. response pagination: 26-char pages reassemble mismatch
- Walking a large response in 26-char pages reassembled to 109399 bytes vs full 50299 bytes.
- Likely cause: pagination/continuation reassembly bug with tiny page sizes (duplicate/mis-sized pages).

### D. local-ranking (3)

D1. search: provider failures expose unjudged body
- When classifier provider fails/rate-limits during `localSearch`+`clasifyContext`, result leaks an unjudged body and doesn't recover cleanly.

D2. fetch: provider failures expose unjudged body
- Same as D1 but for `localFetch`+`clasifyContext`.

D3. nested `clasifyContext` legacy input rejection
- Nested clasify source + legacy inputs rejected with `invalidInput` before provider access; validation ordering mismatch vs test expectation.

### E. navigate (3) — all Rust

E1. Rust symbols anchor → LSP definition lands on astSearch-confirmed declaration
- `lspSearch` definition did not land on the declaration confirmed by `astSearch` for tokio.

E2. Rust LSP reference files ⊆ text-hit files
- LSP returned reference files not subset of text-hit files (stale/extra refs or missed text hits).

E3. Rust prove step failed
- Cascading from E1/E2; the prove hop (definition + references) did not succeed.

### F. deps-flows (2) — both Rust

F1. Rust `Sender` coverage gap
- Bounded graph vs LSP comparison disclosed uncovered edges (`outside=partial`).

F2. Rust `WeakSender` coverage gap
- Same coverage mismatch for `WeakSender`.

## Grammar Check

- **PASS**: 133/133 across all 12 Tree-sitter grammars (TypeScript, TSX, JavaScript, Python, Go, Rust, Java, C, C++, C#, Scala, Assembly). No grammar failures.

## Suggested Investigation Order for Fixing Agent

1. Rust LSP: verify rust-analyzer availability/indexing in hermetic env; run navigate/deps-flows Rust rows with `--deep`/logs.
2. Classifier provider handling: inspect `clasifyContext` failure paths in local-ranking tests; ensure no unjudged body leaks and graceful recovery.
3. Large-file pagination: inspect continuation logic for tiny page sizes; check for duplicate/mis-sized pages.
4. `chain-check` clasify quota: inspect output size and quota definition for C5.
5. usage-regressions U17: investigate LSP timeout budget/cold-start handling.

## Artifacts

- Logs: `packages/octocode-benchmark/local/e2e/results/*.log`
- Summary: `packages/octocode-benchmark/local/e2e/results/summary.json`
- Harness: `packages/octocode-benchmark/local/e2e/harness/run-all.mjs`
