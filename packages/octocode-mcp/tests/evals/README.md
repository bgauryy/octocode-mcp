# Octocode Evaluation Framework

Benchmarks Octocode MCP research quality by comparing provider lanes across multiple AI clients.

## How It Works

```
Prompt Corpus (JSON)
  ↓
run-comparison.ts (filter → run → score → report)
  ↓
┌──────────────────────────────────────────────────┐
│  For each test case × each provider:             │
│                                                  │
│  1. Send prompt to client (Claude/Codex/Cursor)  │
│  2. Client calls MCP tools (or not)              │
│  3. Collect tool responses + final answer         │
│  4. Run 5 scorers against expected rubric         │
│  5. Compute weighted overall score               │
└──────────────────────────────────────────────────┘
  ↓
Comparison table + optional baseline save
```

### Provider Lanes

| Lane | What it means |
|------|---------------|
| `octocode` | Octocode MCP tools available and required |
| `context7` | Context7 MCP tools available (Claude only) |
| `none` | No external MCP provider. **Not** a universal no-tools baseline — `codex` and `cursor` may still use native client tools |

### Scoring

Five dimensions, weighted to prioritize correctness:

| Scorer | Weight | What it measures |
|--------|--------|------------------|
| `accuracy` | 0.40 | Status, result count, expected files, `mustContain`/`mustNotContain` patterns, final answer content |
| `completeness` | 0.25 | Coverage of expected answer surface, pagination, file anchors |
| `reasoning` | 0.20 | LLM judge (GPT-4o-mini) grades the final answer + evidence |
| `tool_selection` | 0.10 | Correct tools called in correct order |
| `latency` | 0.05 | Response time against configurable thresholds |

Overall = weighted sum normalized to 0–1. Pass threshold: 0.5.

### Architecture

```
tests/evals/
├── run-comparison.ts           # CLI entry point for real evals
├── octocode-eval.test.ts       # Vitest mock harness
├── eval-regressions.test.ts    # Scorer + SDK runner regressions
├── prompts/
│   ├── index.ts                # Prompt loader + filters
│   └── manual/                 # JSON prompt fixtures
│       ├── research-scenarios.json
│       ├── research-scenarios-realistic.json
│       └── verified-ground-truth.json
├── scorers/
│   ├── types.ts                # Core types (EvalTestCase, ToolResponse, EvalScorer, etc.)
│   ├── index.ts                # Scorer registry + DEFAULT_WEIGHTS
│   ├── accuracy.ts             # Correctness scorer
│   ├── completeness.ts         # Coverage scorer
│   ├── latency.ts              # Response time scorer
│   ├── tool-selection.ts       # Tool choice scorer
│   ├── reasoning.ts            # LLM judge scorer
│   └── result-count.ts         # Shared result counting helper
└── utils/
    ├── eval-runner.ts           # Orchestration: runSingleEval, generateReport
    ├── sdk-runner.ts            # Client adapters (Claude SDK/CLI, Codex, Cursor)
    ├── baseline.ts              # Save/load/compare baseline artifacts
    └── llm-judge.ts             # OpenAI-based reasoning evaluator
```

## Quick Start

```bash
# Validate mock harness + regression tests
yarn test:eval

# Typecheck the real harness
yarn typecheck:evals

# Preview which prompts will run (no API calls)
npx tsx tests/evals/run-comparison.ts --list --category symbol_lookup --limit 3

# Claude 2-way: Octocode vs no external MCP
yarn eval:real

# Claude 3-way: Octocode vs Context7 vs no external MCP
yarn eval:real:3way

# Codex / Cursor smoke
npx tsx tests/evals/run-comparison.ts --client codex --category symbol_lookup --limit 1
npx tsx tests/evals/run-comparison.ts --client cursor --category symbol_lookup --limit 1
```

## CLI Reference

```bash
npx tsx tests/evals/run-comparison.ts [options]
```

| Option | Description |
|--------|-------------|
| `--client X` | `claude`, `codex`, or `cursor` |
| `--model X` | Override client model |
| `--mode 2way\|3way` | Comparison mode |
| `--providers X` | Comma-separated: `octocode,context7,none` |
| `--category X` | Filter by category |
| `--names X` | Comma-separated exact prompt names |
| `--tags X` | Comma-separated tags (match-any) |
| `--difficulty N` | Minimum difficulty (1–5) |
| `--challenging` | Use only realistic prompts |
| `--limit N` | Cap test case count |
| `--list` | Print selected cases and exit |
| `--save` | Save results as baseline artifact |
| `--verbose` | Detailed per-case output |

Notes: `context7` requires `--client claude`. Use `--list` to validate selections before expensive runs.

## Client Matrix

| Client | Octocode | Context7 | `none` lane behavior |
|--------|----------|----------|----------------------|
| `claude` | yes | yes | Built-in tools disabled |
| `codex` | yes | no | Native tools may still be used |
| `cursor` | yes | no | Native tools may still be used |

## Creating Benchmark Packs

### 1. Reuse existing prompts

Preview candidates before running anything expensive:

```bash
npx tsx tests/evals/run-comparison.ts --list --tags nextjs --difficulty 4
```

### 2. Add prompts only when needed

Add to the appropriate JSON fixture with these required fields:

- `name` — stable identifier
- `prompt` — clear research question
- `category` — one of: `code_search`, `file_discovery`, `symbol_lookup`, `package_search`, `pr_archaeology`, `error_handling`
- `expected` — assertions (`status`, `minResults`, `expectedTools`, `mustContain`, `expectedFiles`)
- `tags` — for pack selection
- Optional: `difficulty` (1–5), `whyHard`, `groundTruth`

Prefer source-backed rubric anchors over generic keywords — `expectedFiles` and specific `mustContain` terms that prove the model actually found the right code.

### 3. Run and interpret

```bash
# Validate selection
npx tsx tests/evals/run-comparison.ts --list --names case1,case2

# Run
npx tsx tests/evals/run-comparison.ts --client claude --mode 3way --names case1,case2

# Save baseline
npx tsx tests/evals/run-comparison.ts --client claude --names case1,case2 --save
```

Interpretation rules:
- Any `codex`/`cursor` row where the baseline lane used native tools is a contaminated comparison
- Zero tool calls in the Octocode lane means provider-usage failure, not capability failure
- Run at least 2 repeats before drawing conclusions; single runs have high variance

## Prompt Corpus

| Category | Description |
|----------|-------------|
| `code_search` | Find code patterns, implementations, API usage |
| `file_discovery` | Locate files by structure or metadata |
| `symbol_lookup` | Jump to definitions, references, call hierarchy |
| `package_search` | Find npm/PyPI packages and repos |
| `pr_archaeology` | Find PRs that introduced changes |
| `error_handling` | Invalid inputs, missing resources |

## Environment

| Variable | Required for |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Real Claude evals |
| `OPENAI_API_KEY` | LLM judge (reasoning scorer) |
| `GITHUB_TOKEN` | Octocode GitHub tool calls |
| `SAVE_BASELINE=true` | Save mock eval baseline |
| `COMPARE_BASELINE=true` | Compare to saved baseline |

## Known Limitations

- The `none` lane is not a universal no-tools baseline on `codex`/`cursor`
- `context7` only works with `--client claude`
- Cursor Octocode runs depend on external MCP config
- LLM judge falls back to neutral (0.5) without `OPENAI_API_KEY`
- Ground truth can become stale — re-verify against upstream sources
- Small corpus — add cases before drawing broad conclusions
