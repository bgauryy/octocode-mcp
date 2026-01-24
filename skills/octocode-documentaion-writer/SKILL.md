---
name: octocode-documentaion-writer
description: Generate comprehensive documentation with intelligent orchestration and parallel execution
---

# Repository Documentation Generator

**Production-ready 7-phase pipeline with static analysis, intelligent orchestration, research-first validation, and conflict-free file ownership.**


<what>
This command orchestrates specialized AI agents in 7 phases to analyze your code repository and generate comprehensive documentation:
</what>

<steps>
  <phase_0>
  **Static Analysis** (Phase 0)
  Agent: Script (no AI - runs `npm run analyze`)
  What: Run static analyzer to discover entry points, module graph, dependencies, architecture, and export flows
  Input: Repository path
  Output: `.context/static-analysis/` folder containing:
    - `static-analysis.json` (primary structured data)
    - `PUBLIC_API.md`, `ARCHITECTURE.md`, `MODULE_GRAPH.md`
    - `DEPENDENCIES.md`, `INSIGHTS.md`, `EXPORT_FLOWS.md`
    - `DEPENDENCY_USAGE.md`, `ANALYSIS_SUMMARY.md`
  Script: `npm run analyze -- <repoPath> <outPath>` (via octocode-documentaion-writer package)
  </phase_0>

  <phase_1>
  **Discovery+Analysis** (Phase 1)
  Agent: Opus
  Parallel: 4 parallel agents
  What: Analyze language, architecture, flows, and APIs (leverages static-analysis.json)
  Input: Repository path + `static-analysis.json`
  Output: `analysis.json`
  Uses from static-analysis: `files[]`, `package.entryPoints`, `architecture`, `moduleGraph`
  </phase_1>

  <phase_2>
  **Engineer Questions** (Phase 2)
  Agent: Opus
  What: Generates comprehensive questions based on analysis and static analysis insights
  Input: `analysis.json` + `static-analysis.json`
  Output: `questions.json`
  Uses from static-analysis: `publicAPI`, `exportFlows`, `insights`, `architecture.violations`
  </phase_2>

  <phase_3>
  **Research Agent** (Phase 3) 🆕
  Agent: Sonnet
  Parallel: Dynamic (based on question volume)
  What: Deep-dive code forensics to ANSWER the questions with evidence
  Input: `questions.json` + `static-analysis.json`
  Output: `research.json`
  Uses from static-analysis: `exportFlows` (symbol locations), `dependencyUsage`, `moduleGraph`
  </phase_3>

  <phase_4>
  **Orchestrator** (Phase 4)
  Agent: Opus
  What: Groups questions by file target and assigns exclusive file ownership to writers
  Input: `questions.json` + `research.json` + `static-analysis.json`
  Output: `work-assignments.json` (file-based assignments for parallel writers)
  Uses from static-analysis: `architecture.layers`, `files[].role`, `moduleGraph`
  </phase_4>

  <phase_5>
  **Documentation Writers** (Phase 5)
  Agent: Sonnet
  Parallel: 1-8 parallel agents (dynamic based on workload)
  What: Synthesize research and write comprehensive documentation with exclusive file ownership
  Input: `analysis.json` + `research.json` + `work-assignments.json` + `static-analysis.json`
  Output: `documentation/*.md` (16 core docs, 5 required + supplementary files)
  Uses from static-analysis: `publicAPI` (signatures), `exportFlows`, `dependencyUsage`
  </phase_5>

  <phase_6>
  **QA Validator** (Phase 6)
  Agent: Sonnet
  Parallel: 4 parallel validators
  What: Validates documentation quality using LSP-powered verification and static analysis cross-reference
  Input: `documentation/*.md` + `analysis.json` + `research.json` + `static-analysis.json`
  Output: `qa-results.json` + `QA-SUMMARY.md`
  Uses from static-analysis: `publicAPI` (coverage), `files[]` (path validation), `dependencies`
  </phase_6>
</steps>

<subagents>
Use spawn explore opus/sonnet/haiku subagents to explore code with MCP tools (localSearchCode, lspGotoDefinition, lspCallHierarchy, lspFindReferences)
</subagents>

**Documentation Flow:**
```
static-analysis.json ─┬─→ Phase 1 → analysis.json
(9 files)             ├─→ Phase 2 → questions.json
                      ├─→ Phase 3 → research.json
                      ├─→ Phase 4 → work-assignments.json
                      ├─→ Phase 5 → documentation/*.md
                      └─→ Phase 6 → qa-results.json (validation)
```
**Key:** `static-analysis.json` feeds ALL phases (not just Phase 1)

---

## ⚠️ CRITICAL: Parallel Agent Execution

<parallel_execution_critical importance="maximum">

**STOP. READ THIS TWICE.**

### 1. THE RULE
**You MUST spawn parallel agents in a SINGLE message with multiple Task tool calls.**

### 2. FORBIDDEN BEHAVIOR
**FORBIDDEN:** Calling `Task` sequentially (one per response).
**REASON:** Sequential calls defeat parallelism and slow down execution by 4x-8x.

### 3. REQUIRED CONFIRMATION
Before launching any parallel phase (1, 3, 5), you **MUST** verify:
- [ ] All Task calls are prepared for a SINGLE response
- [ ] No dependencies exist between these parallel agents
- [ ] Each agent has exclusive scope (no file conflicts)

<correct_pattern title="✅ CORRECT: Single response launches all agents concurrently">
```
// In ONE assistant message, include ALL Task tool invocations:
Task(description="Discovery 1A-language", subagent_type="general-purpose", prompt="...", model="opus")
Task(description="Discovery 1B-components", subagent_type="general-purpose", prompt="...", model="opus")
Task(description="Discovery 1C-dependencies", subagent_type="general-purpose", prompt="...", model="opus")
Task(description="Discovery 1D-flows", subagent_type="general-purpose", prompt="...", model="opus")
// ↑ All 4 execute SIMULTANEOUSLY
```
</correct_pattern>

<wrong_pattern title="❌ WRONG: Sequential calls lose parallelism">
```
// DON'T DO THIS - Each waits for previous to complete
Message 1: Task(description="Discovery 1A") → wait for result
Message 2: Task(description="Discovery 1B") → wait for result
Message 3: Task(description="Discovery 1C") → wait for result
Message 4: Task(description="Discovery 1D") → wait for result
// ↑ 4x slower! No parallelism achieved
```
</wrong_pattern>

</parallel_execution_critical>

---

## Execution Flow

> **See [docs/EXECUTION_FLOW.md](docs/EXECUTION_FLOW.md) for the complete execution flow diagram, dynamic agent scaling rules, and parallel execution specifications.**

---

## Pre-Flight Checks

> **See [docs/PRE_FLIGHT_CHECKS.md](docs/PRE_FLIGHT_CHECKS.md) for the complete validation requirements that must pass before documentation generation begins.**

---

## Initialize Workspace

> **See [docs/INITIALIZE_WORKSPACE.md](docs/INITIALIZE_WORKSPACE.md) for the complete workspace initialization process and state management.**

---

## Agent Pipeline Execution

> **See [docs/AGENT_PIPELINE.md](docs/AGENT_PIPELINE.md) for the complete agent pipeline with all 7 phases (0-6), their configurations, gates, and implementation references.**

---

## Static Analysis Integration

> **See [docs/STATIC_ANALYSIS_INTEGRATION.md](docs/STATIC_ANALYSIS_INTEGRATION.md) for how `static-analysis.json` feeds into each phase of the pipeline.**

> **See [docs/ANALYZER.md](docs/ANALYZER.md) for the analyzer API documentation, exported functions, and type definitions.**

---

## Completion, Error Recovery & Helper Functions

> **See [docs/COMPLETION_AND_RECOVERY.md](docs/COMPLETION_AND_RECOVERY.md) for completion flow, error recovery mechanisms, helper functions, and retry/data preservation logic.**

---
