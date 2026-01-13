# Octocode Evaluation Framework

> Technical documentation for the evaluation framework that measures Octocode MCP research quality.

## Overview

The eval framework provides objective measurement of Octocode's effectiveness compared to other tools (Context7) and baseline (no tools). It evaluates across 5 dimensions:

- **Accuracy** (25%) — Correctness of results against expected outcomes
- **Completeness** (20%) — Coverage of expected information
- **Latency** (15%) — Response time performance
- **Tool Selection** (20%) — Correct tool choices and ordering
- **Reasoning** (20%) — LLM judge evaluation of research logic

## Quick Start

```bash
# Run quick 2-way comparison (Octocode vs Baseline)
yarn eval:real:quick

# Run 3-way comparison (Octocode vs Context7 vs Baseline)
yarn eval:real:3way:quick

# Run challenging scenarios only
yarn eval:challenging:quick

# Run hardest scenarios (difficulty >= 5)
yarn eval:hard
```

## Directory Structure

```
tests/evals/
├── scorers/                              # Scoring implementations
│   ├── types.ts                          # Core type definitions
│   ├── index.ts                          # Scorer exports
│   ├── accuracy.ts                       # Result correctness scorer
│   ├── completeness.ts                   # Coverage scorer
│   ├── latency.ts                        # Performance scorer
│   ├── tool-selection.ts                 # Tool choice scorer
│   └── reasoning.ts                      # LLM judge scorer
├── prompts/                              # Test case definitions
│   ├── index.ts                          # Prompt loaders & filters
│   └── manual/
│       ├── research-scenarios.json       # Base test cases (20)
│       └── research-scenarios-realistic.json  # Challenging cases (20)
├── utils/
│   ├── eval-runner.ts                    # Mock eval orchestration
│   ├── sdk-runner.ts                     # Real LLM eval runner
│   ├── llm-judge.ts                      # LLM judge integration
│   └── baseline.ts                       # Baseline comparison utils
├── baselines/                            # Stored baseline results
├── octocode-eval.test.ts                 # Vitest test suite
└── run-comparison.ts                     # CLI for real comparisons
```

## Test Categories

| Category | Description | Example |
|----------|-------------|---------|
| `code_search` | Finding code patterns in repositories | "Find useState implementation in React" |
| `file_discovery` | Locating files by name or pattern | "Find all tsconfig.json in Next.js repo" |
| `symbol_lookup` | Definition/reference lookups | "Find definition of createServer" |
| `package_search` | NPM/PyPI package lookups | "Find zod package repository" |
| `pr_archaeology` | Finding PRs that introduced features | "Find PR that added Server Actions" |
| `error_handling` | Graceful error handling | "Search non-existent repository" |

## Challenging Scenarios

The `research-scenarios-realistic.json` contains 20 scenarios specifically designed to test where AI struggles without tools:

### Categories

- **Breaking Changes** — React 19's `use` hook, Next.js 15 async APIs, Tailwind v4 CSS config
- **Undocumented Internals** — Plugin architectures, extension patterns, internal flows
- **Emerging Frameworks** — Mastra AI, Bun workspaces, Crawlee
- **Protocol Specifications** — MCP responses, WebSocket subprotocols, gRPC-web
- **Complex Configuration** — TypeScript monorepos, K8s NGINX ingress

### Difficulty Ratings

Each challenging scenario has a difficulty rating (1-5):

| Difficulty | Description | Count |
|------------|-------------|-------|
| 3 | Moderately challenging | 4 |
| 4 | Hard without tools | 10 |
| 5 | Extremely hard (post-cutoff, undocumented) | 6 |

## CLI Reference

```bash
npx tsx tests/evals/run-comparison.ts [options]
```

### Options

| Option | Description |
|--------|-------------|
| `--verbose` | Show detailed output per test case |
| `--limit N` | Limit to N test cases |
| `--category X` | Filter by category (code_search, file_discovery, etc.) |
| `--save` | Save results to baseline file |
| `--providers X` | Comma-separated: octocode,context7,none |
| `--mode 2way\|3way` | 2-way (default) or 3-way comparison |
| `--challenging` | Only run challenging/realistic test cases |
| `--difficulty N` | Only run cases with difficulty >= N |

### NPM Scripts

```bash
# Mock eval tests (fast, uses Vitest)
yarn test:eval                    # Run all eval tests
yarn test:eval:baseline           # Save results as baseline
yarn test:eval:compare            # Compare against baseline

# Real LLM evals (slow, uses Claude SDK)
yarn eval:real                    # Full 2-way comparison
yarn eval:real:verbose            # With detailed output
yarn eval:real:quick              # Limited to 3 cases
yarn eval:real:3way               # Full 3-way comparison
yarn eval:real:3way:quick         # 3-way, limited to 3 cases

# Challenging scenarios
yarn eval:challenging             # All 20 realistic cases (3-way)
yarn eval:challenging:quick       # 5 realistic cases (3-way)
yarn eval:hard                    # Only difficulty >= 5 (3-way)
```

## Output Format

```
══════════════════════════════════════════════════════════════════════════════
                    OCTOCODE vs CONTEXT7 vs BASELINE
══════════════════════════════════════════════════════════════════════════════

Test Case                            Octocode  Context7  Baseline   Winner
─────────────────────────────────────────────────────────────────────────────
find_react_hooks_implementation         72%       65%       45%    🔵 octocode
locate_config_files                     68%       70%       40%    🟢 context7
npm_package_lookup                      85%       82%       50%    🔵 octocode

══════════════════════════════════════════════════════════════════════════════
                              SUMMARY
─────────────────────────────────────────────────────────────────────────────

Average Scores:
  🔵 Octocode:  75.0%  (avg 25000ms)
  🟢 Context7:  72.3%  (avg 28000ms)
  ⚪ Baseline:  45.0%  (avg 12000ms)

Head-to-Head (Octocode vs Context7):
  Octocode wins: 2  |  Context7 wins: 1  |  Ties: 0

Improvement Over Baseline:
  Octocode: +30.0%
  Context7: +27.3%
```

## Adding New Test Cases

Create test cases in `prompts/manual/research-scenarios.json`:

```json
{
  "name": "unique_test_name",
  "description": "What this tests",
  "prompt": "The actual prompt to send to the LLM",
  "category": "code_search",
  "expected": {
    "status": "hasResults",
    "minResults": 1,
    "expectedTools": ["githubSearchCode", "githubGetFileContent"],
    "mustContain": ["keyword1", "keyword2"]
  },
  "tags": ["github", "react"]
}
```

For challenging scenarios, add to `research-scenarios-realistic.json`:

```json
{
  "name": "challenging_scenario",
  "description": "Description",
  "prompt": "The prompt",
  "category": "code_search",
  "difficulty": 5,
  "whyHard": "Explanation of why AI struggles without tools",
  "expected": { ... },
  "tags": ["post-cutoff", "breaking-change"]
}
```

## Scorer Details

### Accuracy Scorer

Checks:
- Status matches expected (hasResults, empty, error)
- Minimum result count met
- Expected files found
- Must-contain patterns present
- Must-not-contain patterns absent

### Completeness Scorer

Checks:
- All expected files retrieved
- No truncated results
- Pagination handled properly
- Content coverage

### Latency Scorer

Thresholds (configurable):
- Excellent (<1000ms): 1.0
- Good (<3000ms): 0.8
- Acceptable (<5000ms): 0.5
- Poor (>5000ms): 0.2

### Tool Selection Scorer

Checks:
- Correct tools called
- Tool order matches expected (if specified)
- No unnecessary tool calls (configurable penalty)

### Reasoning Scorer

Uses LLM-as-Judge pattern:
- Sends prompt + response to GPT-4o-mini
- Evaluates research logic quality (1-5 scale)
- Requires `OPENAI_API_KEY` environment variable

## Environment Variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Required for real LLM evals |
| `OPENAI_API_KEY` | Required for LLM judge scorer |
| `SAVE_BASELINE` | Set to "true" to save mock eval results |
| `COMPARE_BASELINE` | Set to "true" to compare against baseline |

## Interpreting Results

### Expected Patterns

- **Tools should outperform baseline** on standard research tasks
- **Challenging scenarios may show lower scores** — these test edge cases
- **Latency tradeoff** — tools take longer but should provide better results

### Warning Signs

- Octocode consistently worse than baseline → investigate tool selection
- High latency with low accuracy → tools being called but not used effectively
- Low reasoning scores → LLM not synthesizing tool results properly

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              run-comparison.ts                               │
│                         (CLI Entry Point)                                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              sdk-runner.ts                                   │
│  • Claude Agent SDK integration                                              │
│  • MCP server configuration (Octocode, Context7, None)                       │
│  • Batch evaluation orchestration                                            │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    ▼                 ▼                 ▼
             ┌──────────┐      ┌──────────┐      ┌──────────┐
             │ Octocode │      │ Context7 │      │ Baseline │
             │   MCP    │      │   MCP    │      │ (no MCP) │
             └──────────┘      └──────────┘      └──────────┘
                    │                 │                 │
                    └─────────────────┼─────────────────┘
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Scorers                                         │
│  accuracy.ts │ completeness.ts │ latency.ts │ tool-selection.ts │ reasoning │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Results & Reporting                                  │
│  • Per-test scores    • Summary statistics    • Winner determination         │
│  • Baseline comparison    • Latency breakdown                                │
└─────────────────────────────────────────────────────────────────────────────┘
```
