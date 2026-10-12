The local build beats published 19.1.0 on correctness and output size, with no evidence gaps, but it is slower under concurrent load. The file guard refused my two main outputs (the results write-up and `report.md`), so the full report is below. It flagged the writes as "untrusted or private text" and said not to retry; please write it to those paths or get approval.

**Compared against:** `octocode-mcp@19.1.0` (npm `latest`; `alpha` is 10.0.2). Local is branch `octocode-20.0.0`, HEAD `fb62502e4`, the frozen final build.

## Benchmark (30 GitHub questions, one pass)
The claude runner had hit the account spend limit, so per your decision both arms ran on the new pi runner with the same `claude-sonnet-5-5` model. The blind judge was codex `gpt-5.5`. These results can't be compared with earlier claude-runner campaigns.

| arm | median chars | mean chars | median s | model s + tool s (mean) | calls / failed | input tokens | runner cost |
|---|---:|---:|---:|---|---|---:|---:|
| gh-lean | 6,855 | 9,296 | 21.7 | 20.6 + 2.8 | 153 / 8 | 0.54M | $0.90 |
| published 19.1.0 | 12,326 | 17,512 | 24.9 | 24.2 + 8.4 | 111 / 2 | 4.35M | $1.47 |
| local 20.x | 8,302 | 11,791 | 41.7 | 18.6 + 27.0 | 111 / 11 | 1.52M | $1.12 |

| blind pair | correctness | depth | workflow | wins | more correct on |
|---|---|---|---|---|---|
| local vs published | **9.50 vs 9.17** | 4.40 vs 3.97 | 4.70 vs 4.30 | **24–6** | 9 vs 4 (17 same) |
| local vs gh-lean | 9.33 vs 9.40 | 4.33 vs 4.43 | 4.60 vs 4.60 | 12–18 | 7 vs 7 |
| published vs gh-lean | 9.10 vs 9.50 | 3.83 vs 4.47 | 4.27 vs 4.67 | 5–25 | 3 vs 8 |

**Local vs published:**
- **Characters:** local uses 1.59× fewer (95% CI 1.42–1.80) and is leaner on 28 of 30 questions.
- **Input tokens:** 2.9× fewer, because tools/list is 18,075 vs 84,701 characters.
- **Time:** local runs at 0.81× published's speed (CI 0.65–1.01) and is faster on only 12 of 30.
- **Correctness:** local won the 9 questions where it verified layers published left open. Examples are Q19 (10 vs 7) and Q28 (9 vs 7); on Q2 published made a false claim. Local lost on Q17, Q25, Q27 and Q5 by leaving an entry file unconfirmed or giving an imprecise line.

**Rebuilt by script:**
- `results/runs/pi-published-161933-2026-10-12.json`
- `results/runs/pi-local-163239-2026-10-12.json`
- `results/MATRIX.md`, `results/matrix_summary.json` and `results/index.html`

The head-to-head summary is only in `/tmp/ed1598/h2h-sum.json`, because two mcp arms in one campaign would merge into one matrix group. In `MATRIX.md` the published arm's "How it ran" column says "local MCP"; it actually ran `npx -y octocode-mcp@19.1.0`.

## Per-tool ratings, local vs published (0–10)
These come from a new harness that runs identical calls on both versions: live GitHub pinned to express v5.3.0, live npm, and the tool-health fixtures. CLI and MCP output matched on every happy call where both exist, on both versions.

| tool (published counterpart) | local | published | reason |
|---|---:|---:|---|
| ghGetHistoryItem (rechecked first; was 6) | **9** | 7 | Every section complete: PR files 52/52, PR comments 31/31, issue comments 17/17, commit files 52/52, compare commits 76/76. Large compare 4.0.0…v5.0.0: 270/270 files and 1,623/1,623 unique commits. Output 2–6× smaller. Published is also complete but much larger. |
| ghGetFileContent | **9** | 6 | Local pages a 121 KB file in 8 windows that rejoin exactly to the raw file. Published returns 149k characters in one response, which hosts truncate. Published reports a no-match as ok. |
| ghSearchCode (ghSearch code) | 7 | 7 | Complete (6/6 files over 3 pages), with line-numbered hits. But concurrent agents wait 34–57 s on the code-search window. |
| ghSearchRepo | **9** | 7 | 2,042 vs 6,596 chars, complete; the empty case gives a hint (published gives none). |
| ghStructure (ghSearch tree) | **9** | 6 | 215/215 entries; a page takes 6 ms vs 4.8 s. A missing path gives "empty" plus a hint (published: error). |
| ghSearchHistory | **9** | 7 | 5.4× smaller, complete; the empty case gives a lead and 4 hints. |
| artifactSearch (npmSearch) | **9** | 6 | Covers several registries vs npm only; complete paging; empty hint. |
| ghCloneRepo | 8 | 7 | Works and is smaller; CLI-only locally, so MCP parity doesn't apply. |
| localSearch | **9** | 7 | 5.3× smaller, complete, typed error codes. |
| structureSearch | **9** | 7 | 5× smaller, complete, empty hint. |
| astSearch | **9** | 6 | 6× smaller and pages its results; published doesn't page and reports a no-match as ok. |
| localFetch | **9** | 7 | Paged windows rejoin exactly to the file; better no-match guidance. |
| lspSearch | 7 | 7 | Complete and 3× smaller, but slower: first cold call 2.5 s vs 0.38 s, definition 0.41 s vs 0.007 s. |
| astTopology (beta) | 8 | 6 | Smaller, typed empty result with a hint; latency isn't comparable (CLI process vs MCP call). |
| astRewrite (beta) | 8 | N/A | No published counterpart; preview paging complete. |
| clasify | 8 | N/A | No published counterpart; results under the evals heading below. |

## Naive eval, held-out cases, clasify and the lspSearch re-time
- **Naive eval:** 81/84 overall. The 15 existing cases scored 58/60, up from 55/60. The held-out cases HN1–HN6 scored 23/24; HN5 lost a point to the agent's arithmetic, not the tool.
  - My command allowlist blocked 52 shell calls (ls, echo, grep). That friction comes from my setup, not the tool.
  - The grader ran read-only against the answer keys, without network to re-verify.
- **Clasify, 6 cases:** stats now returns usage without the earlier contract violation (C-D1).
  - Passed: A2, A3, A4, and A5 (8/8).
  - A1 scored 10/12, but both misses were items I had wrongly labelled "ambiguous" for the question asked.
  - A6 got no handoff: by design a regex search term never counts as a plain phrase (`clasify/handoff.rs:403-417`).
  - The key never appeared in any output.
- **lspSearch IDisposable subtypes:** totalItems was 564 in every run, but the language server never answered in time, even warm, so every result is the syntax-based fallback.
  - Cold median 13.18 s, just over the 13.1 s target; warm median about 8.9 s.
  - Not decisive: load was 5–14, so the idle condition never held.

## Regressions found
1. **Medium (speed): code-search waits.** The local client allows 10 code searches per minute per token, shared across processes through `OCTOCODE_HOME` (`github/src/budget.rs:120-127`, `try_admit` at :547).
   - **Repro:** 4 agents sharing one home, each running a few `ghSearchCode` calls within a minute.
   - **Observed:** calls waited 34–57 s, and 5 then returned `rateLimited` ("code search window is full; request not sent"). Q10 waited 57.4 s and still didn't send.
   - Published hit no such waits on the same token. The earlier v20 claude campaign showed only about 3 s of tool time, so this may be new or specific to a shared temp home. The guard blocked my git history check.
2. **Low–medium (schema clarity): missing `queries` wrapper.** Local agents left out the `queries` wrapper 8 times in 111 calls, vs 0 on published.
   - Local's `queries` field has no description and no minimum count; published's says "Parallel queries; response rows use matching zero-based indexes."
   - The fix belongs in the core schemas.
3. **Low:** issue comments with pageSize 5 returned 5 on page 1, then the remaining 12 on page 2 with no pagination block. Nothing was lost.
4. **Low (docs, unverified):** `docs/OCTOCODE_CLASIFY.md:174` says `hints.clasify` appears by default; `docs/OCTOCODE_TOOLS.md:415` says it needs `extras:["hints"]`. The guard blocked the call that would settle it.

What looked like a defect but isn't: invalid-input replies don't match the success output schema. The server declares no output schema, and I confirmed the official MCP SDK client accepts these replies without throwing.

## Changes I made (harness and tooling only, no product code)
- `compare/bin/run_arm.sh`: opt-in `RUNNER=pi`; claude stays the unchanged default.
- New `compare/bin/pi_runner.py` (isolated pi run) and `compare/bin/pi-bash-allow.ts` (the claude runner's command allowlist for pi).
- `compare/bin/transcript_to_log.py`: `--format pi` and `--max-turns`.
- `judge_pair.sh`: the `JUDGE_RUNNER=codex` branch, which you applied.
- New `octocode-local-testing/harness/version-compare.mjs` and `version-compare/cases.mjs`.
- `skills-dev/octocode-dev/scripts/retired-names.json`: allow `lineHint` under the version-compare path, which quotes the 19.1.0 contract; `docs:verify` passes.

Raw per-tool results are in `.octocode/tmp/agents/implementer-ed1598/vc-local.json` and `vc-published-19.1.0.json`. The eval answers and verdicts are in `/tmp/ed1598/naive/`.

**Still open:**
- Write the results file (`packages/octocode-benchmark/results/pi-local-vs-published-164221-2026-10-12.md`) and its row in `results/README.md`.
- Write `.octocode/tmp/agents/implementer-ed1598/report.md`.
- Re-time lspSearch on an idle machine.