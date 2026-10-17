# Octocode mcp-v9 vs gh-lean vs published 19.1.0 — 2026-10-10 (30 × 1)

## Verdict

mcp-v9 (today's build: Zod-only contract, lean `{tool, query}` leads, exact windows, static advice moved into descriptions) reaches **correctness parity with gh-lean (8.83 vs 8.87, wins 14–16)** at **0.80×** of its characters' inverse (gh-lean reads 0.80× of what v9 reads; the v20 arm sat at 0.71× and the published 19.1.0 at 0.59×), with higher depth (4.07 vs 3.93) and workflow (4.63 vs 4.33). Against the published 19.1.0 on the same questions it is **9.17 vs 8.97 correctness, wins 21–9, and reads 0.74× the characters**. Against the stored v20 arm it reads 0.89× the characters at +0.03 correctness. The remaining byte gap to gh-lean is agent path (wide `minify:"none"` ranges on Q19/Q21, `pageSize:30` path searches on Q28), not tool output; the one real contract loss was Q22, where `behindBy` was omitted when 0 and the judge counted the omission as unknown — fixed in this round (always stated).

## What ran

| | |
|---|---|
| Questions | `compare/github-questions/Q1–Q30` (v2 set), one pass |
| Arms | `gh-lean` and `mcp` stored from 2026-10-09 (never rerun); `mcp-pub-19-1-0`: `octocode-mcp@19.1.0` from npm (installed locally; `npx` fails to start under the runner); `mcp-v9`: this tree's MCP dist + native addon, snapshot `build-v9` (dev-profile addon: tool seconds below are a debug build) |
| Agents | `claude -p --model claude-sonnet-5-5`, fresh process per question, no settings/skills/memory, empty cwd, clasify off |
| Judge | gpt-5.5 via pi, blind X/Y, tool names redacted, ground truth rebuilt with read-only `gh` |
| Measurement | Characters: tool calls written + results read + final answer, from the transcript |

## Results

| arm | n | median chars | mean chars | median s | model s + tool s | calls / failed | cost (Sonnet) |
|---|---:|---:|---:|---:|---|---|---:|
| gh-lean | 30 | 6,068 | 7,577 | 19.4 | 15.2 + 3.1 | 142 / 3 | $2.49 |
| v20 mcp (2026-10-09) | 30 | 8,168 | 11,244 | 16.5 | 13.9 + 3.0 | 80 / 3 | $2.61 |
| published 19.1.0 | 30 | 9,344 | 13,245 | 13.1 | 11.0 + 7.4 | 74 / 0 | $3.18 |
| mcp-v9 (this build) | 30 | 6,965 | 10,142 | 13.9 | 11.3 + 12.1 | 82 / 1 | $2.61 |

Characters (geo mean over 30): gh-lean ÷ v9 **0.80×**, gh-lean ÷ v20 mcp 0.71×, gh-lean ÷ 19.1.0 0.59×; v9 ÷ v20 mcp 0.89×, v9 ÷ 19.1.0 0.74×.

## Blind judgments

| pair | n | correctness | depth | workflow | wins | more correct on |
|---|---:|---|---|---|---|---|
| mcp-v9 (this build) vs gh-lean | 30 | 8.83 vs 8.87 | 4.07 vs 3.93 | 4.63 vs 4.33 | 14–16 | 10 / 8 |
| mcp-v9 (this build) vs published 19.1.0 | 30 | 9.17 vs 8.97 | 4.27 vs 3.87 | 4.77 vs 4.40 | 21–9 | 10 / 5 |
| published 19.1.0 vs gh-lean | 30 | 8.93 vs 9.13 | 3.87 vs 4.23 | 4.37 vs 4.50 | 8–22 | 7 / 9 |
| v20 mcp (2026-10-09) vs gh-lean | 30 | 8.80 vs 9.17 | 3.83 vs 4.17 | 4.53 vs 4.50 | 10–20 | 7 / 13 |

## Per question

| Q | gh-lean | v20 mcp | 19.1.0 | v9 | v9 / lean correctness | winner (v9~lean) | v9 / 19.1.0 | winner (v9~19.1.0) |
|---|---:|---:|---:|---:|---|---|---|---|
| Q1 | 2,759 | 4,265 | 4,025 | 2,885 | 10 / 9 | mcp-v9 | 10 / 10 | mcp-v9 |
| Q2 | 1,607 | 8,469 | 8,241 | 2,378 | 8 / 9 | gh-lean | 8 / 9 | mcp-pub-19-1-0 |
| Q3 | 6,775 | 8,004 | 9,279 | 6,942 | 10 / 9 | mcp-v9 | 10 / 10 | mcp-pub-19-1-0 |
| Q4 | 6,775 | 11,535 | 9,409 | 10,125 | 9 / 8 | mcp-v9 | 9 / 7 | mcp-v9 |
| Q5 | 23,548 | 24,474 | 48,009 | 21,844 | 9 / 8 | mcp-v9 | 10 / 9 | mcp-v9 |
| Q6 | 2,117 | 4,948 | 7,264 | 2,756 | 10 / 8 | mcp-v9 | 10 / 10 | mcp-v9 |
| Q7 | 4,298 | 5,975 | 5,133 | 5,510 | 10 / 10 | gh-lean | 9 / 10 | mcp-pub-19-1-0 |
| Q8 | 2,502 | 3,880 | 6,074 | 2,228 | 10 / 10 | mcp-v9 | 10 / 10 | mcp-v9 |
| Q9 | 4,180 | 5,663 | 7,088 | 5,609 | 10 / 10 | gh-lean | 10 / 9 | mcp-v9 |
| Q10 | 5,263 | 7,558 | 9,567 | 6,989 | 10 / 9 | mcp-v9 | 10 / 10 | mcp-v9 |
| Q11 | 7,859 | 7,992 | 10,039 | 6,816 | 8 / 10 | gh-lean | 8 / 9 | mcp-pub-19-1-0 |
| Q12 | 5,671 | 5,526 | 5,949 | 4,983 | 10 / 10 | mcp-v9 | 8 / 10 | mcp-pub-19-1-0 |
| Q13 | 8,572 | 16,890 | 15,114 | 14,159 | 10 / 10 | gh-lean | 10 / 10 | mcp-v9 |
| Q14 | 3,167 | 2,906 | 2,345 | 3,101 | 5 / 10 | gh-lean | 6 / 6 | mcp-pub-19-1-0 |
| Q15 | 5,467 | 9,294 | 10,673 | 10,626 | 8 / 9 | gh-lean | 10 / 10 | mcp-v9 |
| Q16 | 3,527 | 3,867 | 8,021 | 3,083 | 10 / 10 | mcp-v9 | 10 / 10 | mcp-v9 |
| Q17 | 9,242 | 11,807 | 11,056 | 11,042 | 10 / 10 | gh-lean | 10 / 10 | mcp-v9 |
| Q18 | 2,923 | 3,425 | 8,049 | 3,477 | 10 / 10 | gh-lean | 10 / 10 | mcp-v9 |
| Q19 | 7,236 | 14,530 | 18,586 | 16,934 | 9 / 8 | mcp-v9 | 8 / 7 | mcp-v9 |
| Q20 | 7,634 | 10,959 | 8,342 | 8,094 | 9 / 9 | gh-lean | 10 / 10 | mcp-v9 |
| Q21 | 17,939 | 60,769 | 45,961 | 43,168 | 9 / 7 | mcp-v9 | 9 / 8 | mcp-v9 |
| Q22 | 4,615 | 16,278 | 16,072 | 11,874 | 8 / 10 | gh-lean | 8 / 10 | mcp-pub-19-1-0 |
| Q23 | 9,429 | 10,220 | 8,222 | 9,600 | 8 / 10 | gh-lean | 9 / 8 | mcp-v9 |
| Q24 | 6,465 | 3,594 | 13,478 | 4,670 | 4 / 4 | mcp-v9 | 10 / 10 | mcp-v9 |
| Q25 | 13,919 | 9,100 | 12,297 | 14,892 | 8 / 9 | gh-lean | 9 / 9 | mcp-pub-19-1-0 |
| Q26 | 3,823 | 6,037 | 4,725 | 4,901 | 10 / 10 | gh-lean | 10 / 9 | mcp-v9 |
| Q27 | 4,416 | 8,332 | 4,674 | 5,022 | 7 / 7 | gh-lean | 6 / 6 | mcp-pub-19-1-0 |
| Q28 | 11,801 | 32,967 | 44,568 | 22,158 | 8 / 6 | mcp-v9 | 9 / 8 | mcp-v9 |
| Q29 | 25,567 | 11,419 | 19,143 | 25,504 | 10 / 8 | mcp-v9 | 10 / 7 | mcp-v9 |
| Q30 | 8,243 | 6,657 | 15,973 | 12,910 | 8 / 9 | gh-lean | 9 / 8 | mcp-v9 |

## Where v9 scored below gh-lean (judge's deciding fact)

- **Q2** (8 vs 9): X directly checked the public entry/export file for the absent name, while Y relied on search-index absence plus a positive control.
- **Q11** (8 vs 10): X traced the build request through Go dispatch to handleBuildRequest, while Y stopped at runService and only inferred the core build location.
- **Q14** (5 vs 10): Y correctly says vite is absent from dependencies and present as a required peer; X misreads devDependencies.vite as dependencies.vite.
- **Q15** (8 vs 9): X and Y both get the required facts, but Y adds more unsupported/stale implementation details and uses nearly twice the characters.
- **Q22** (8 vs 10): X reports the required confirmed behind_by=0 while Y leaves behind_by unknown/presumed despite the compare result exposing it.
- **Q23** (8 vs 10): X includes the concrete rw_verify_area permission/position checks that Y explicitly did not verify.
- **Q25** (8 vs 9): Y cites the actual README.md patch hunks, while X’s load-bearing hunk headers are inaccurate despite mostly correct content.
- **Q30** (8 vs 9): X gives the concrete cross-process message-pipe establishment mechanism via invitation AttachMessagePipe/ExtractMessagePipe; Y only points to bootstrap docs and leaves the handshake unspecified.

## What the tools got wrong, and what was agent path

- **Q22 (tool, fixed):** `compare` omitted `behindBy` when 0; the agent could not tell omission from unknown. `behindBy` is now always stated (core contract + native).
- **Q14 (agent):** the response carried `matchKeys: {221: "devDependencies.vite"}`; the agent still read line 221 as `dependencies.vite`. The key path is correct and present; no tool change.
- **Q25 (data, by design):** PR `comments` include a bot review whose body embeds `@@` hunk context; the agent cited those headers instead of the patch. Bot hiding was removed on request (`includeBots` was rigid); the patch section remains the citation source.
- **Q19, Q21, Q28, Q30 (agent path):** 140–280-line `minify:"none"` ranges, `pageSize:30` path searches and `fullContent` reads; per-call tool output was lean (`matchString` hit lists 0.9–1.3 KB).
- **Tool seconds:** the v9 arm ran a dev-profile (debug) addon, 12.1 s mean tool time vs 3.0 s for the release v20 arm; the published arm's 7.4 s is network. A release build is the production number.
- **Harness:** `npx -y octocode-mcp@19.1.0` fails to start under the runner (startup timeout); the arm ran the package installed to a fixed path.

