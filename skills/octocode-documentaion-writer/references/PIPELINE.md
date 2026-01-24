# Pipeline Execution

> **Review this document to understand the complete documentation generation pipeline with all 7 phases (0-6), their configurations, and execution flow.**

## Flow Diagram

```mermaid
flowchart TB
    Start([/octocode-documentaion-writer PATH]) --> Validate[Pre-Flight Validation]
    Validate --> Init[Initialize Workspace]

    Init --> P0[Phase 0: Static Analysis]
    P0 --> P0Run[Run Analyzer<br/>npm run analyze]
    P0Run --> P0Done[.context/static-analysis/<br/>9 files: static-analysis.json +<br/>PUBLIC_API.md, ARCHITECTURE.md,<br/>MODULE_GRAPH.md, etc.]

    P0Done --> SA[(static-analysis.json<br/>Shared Data Source)]

    SA -->|files, entryPoints,<br/>architecture, moduleGraph| P1[Phase 1: Discovery+Analysis]

    subgraph P1_Parallel["RUN IN PARALLEL (4 agents)"]
        P1A[Agent 1A:<br/>Language & Manifests]
        P1B[Agent 1B:<br/>Components]
        P1C[Agent 1C:<br/>Dependencies]
        P1D[Agent 1D:<br/>Flows & APIs]
    end

    P1 --> P1_Parallel
    P1_Parallel --> P1Agg[Aggregation:<br/>Merge into analysis.json]
    P1Agg --> P1Done[analysis.json created]

    P1Done --> P2[Phase 2: Engineer Questions<br/>Single Agent - Opus]
    SA -->|publicAPI, exportFlows,<br/>insights, violations| P2
    P2 --> P2Done[questions.json created]

    P2Done --> P3[Phase 3: Research<br/>Parallel Agents - Sonnet]
    SA -->|exportFlows, dependencyUsage,<br/>moduleGraph| P3

    subgraph P3_Parallel["RUN IN PARALLEL"]
       P3A[Researcher 1]
       P3B[Researcher 2]
       P3C[Researcher 3]
    end

    P3 --> P3_Parallel
    P3_Parallel --> P3Agg[Aggregation:<br/>Merge into research.json]
    P3Agg --> P3Done[research.json created<br/>Evidence-backed answers]

    P3Done --> P4[Phase 4: Orchestrator<br/>Single Agent - Opus]
    SA -->|architecture.layers,<br/>files[].role, moduleGraph| P4
    P4 --> P4Group[Group questions<br/>by file target]
    P4 --> P4Assign[Assign file ownership<br/>to writers]
    P4Assign --> P4Done[work-assignments.json]

    P4Done --> P5[Phase 5: Documentation Writers]
    SA -->|publicAPI, exportFlows,<br/>dependencyUsage| P5
    P5 --> P5Input[Input:<br/>work-assignments.json<br/>+ research.json<br/>+ static-analysis.json]
    P5Input --> P5Dist[Each writer gets<br/>exclusive file ownership]

    subgraph P5_Parallel["RUN IN PARALLEL (1-8 agents)"]
        P5W1[Writer 1]
        P5W2[Writer 2]
        P5W3[Writer 3]
        P5W4[Writer 4]
    end

    P5Dist --> P5_Parallel
    P5_Parallel --> P5Verify[Verify Structure]
    P5Verify --> P5Done[documentation/*.md created]

    P5Done --> P6[Phase 6: QA Validator]
    SA -->|publicAPI, files[],<br/>dependencies| P6

    subgraph P6_Parallel["RUN IN PARALLEL (4 validators)"]
        P6A[Validator 6A:<br/>File References]
        P6B[Validator 6B:<br/>API Verification]
        P6C[Validator 6C:<br/>Structure]
        P6D[Validator 6D:<br/>Coverage]
    end

    P6 --> P6_Parallel
    P6_Parallel --> P6Agg[Aggregation:<br/>Merge into qa-results.json]
    P6Agg --> P6Done[qa-results.json +<br/>QA-SUMMARY.md]

    P6Done --> Complete([Documentation Complete])

    style SA fill:#ffd700,stroke:#333,stroke-width:2px
    style P1_Parallel fill:#e1f5ff
    style P3_Parallel fill:#e1f5ff
    style P5_Parallel fill:#ffe1f5
    style P6_Parallel fill:#e1ffe1
    style P4 fill:#fff3cd
    style Complete fill:#28a745,color:#fff
```

## Dynamic Agent Scaling

| Phase | Condition | Agent Count | Formula |
|-------|-----------|-------------|---------|
| **1 - Discovery** | Always | 4 | Fixed (1A-language, 1B-components, 1C-dependencies, 1D-flows) |
| **3 - Research** | questions < 10 | 1 | Single agent |
| **3 - Research** | questions >= 10 | N | `ceil(questions / 15)` |
| **5 - Writers** | questions < 20 | 1 | Sequential strategy |
| **5 - Writers** | questions 20-99 | 2-4 | Parallel-core strategy |
| **5 - Writers** | questions >= 100 | 4-8 | `min(8, ceil(questions / 25))` |
| **6 - QA** | Always | 4 | Fixed (6A-file-refs, 6B-api-refs, 6C-structure, 6D-coverage) |

---

## Phase 0: Static Analysis

**Agent Spec**: `references/agent-static-analysis.md`
**Schema**: `schemas/static-analysis-schema.json`

| Property | Value |
|----------|-------|
| Agent Type | Script (no AI agent) |
| Critical | Yes |
| Input | Repository path |
| Output | `.context/static-analysis/` (folder with 9 files) |
| Script | `npm run analyze -- <repoPath> <outPath>` |

**Purpose**: Run static analyzer to discover:
- Entry points (main, bin, exports)
- Module graph (imports/exports relationships)
- Dependencies (used, unused, unlisted)
- Public API surface
- Code insights (circular deps, orphans, unused exports)
- Export flows (barrel file chains)
- Architecture patterns (layered, feature-based, flat, monorepo)

### Output Files

| File | Description |
|------|-------------|
| `static-analysis.json` | **Primary** - Structured analysis data |
| `ANALYSIS_SUMMARY.md` | Human-readable overview |
| `PUBLIC_API.md` | All exports with signatures and JSDoc |
| `DEPENDENCIES.md` | Dependency tree and issues |
| `INSIGHTS.md` | Circular deps, unused exports, orphans |
| `MODULE_GRAPH.md` | Mermaid dependency diagrams |
| `EXPORT_FLOWS.md` | How symbols travel from source to public API |
| `ARCHITECTURE.md` | Detected patterns and layer analysis |
| `DEPENDENCY_USAGE.md` | Which symbols used from each package |

### On Failure
- IF script exits non-zero: Check npm/node installation
- IF output missing: Verify repository has package.json
- IF timeout: Increase timeout for large repos (>100k LOC)

> See `references/agent-static-analysis.md` for full implementation.
> See `./ANALYZER.md` for API documentation and type definitions.

---

## Phase 1: Discovery+Analysis

**Agent Spec**: `references/agent-discovery-analysis.md`
**Task Config**: `schemas/discovery-tasks.json`

| Property | Value |
|----------|-------|
| Agent Type | Parallel (4 Opus agents) |
| Parallel Agents | 1A-language, 1B-components, 1C-dependencies, 1D-flows-apis |
| Critical | Yes |
| Input | `.context/static-analysis/static-analysis.json` |
| Output | `.context/analysis.json` |

### Gate

**STOP. DO NOT proceed without verifying parallel spawn requirements.**

**Pre-Conditions:**
- Phase 0 completed successfully
- `.context/static-analysis/static-analysis.json` exists

**Required Actions:**
1. Spawn exactly 4 agents (1A-language, 1B-components, 1C-dependencies, 1D-flows-apis)
2. **REQUIRED:** Launch ALL 4 Task calls in **ONE** message

**FORBIDDEN:**
- Sequential Task calls
- Spawning agents one at a time
- Proceeding without static-analysis.json

### On Failure
- IF agent timeout: Retry with extended timeout
- IF agent crashes: Load partial from `partials/discovery/{agent_id}.json`
- IF all 4 fail: STOP pipeline, report critical error
- IF 1-3 fail: Retry failed agents individually (max 3 attempts)

> See `references/agent-discovery-analysis.md` for full implementation.

---

## Phase 2: Engineer Questions

**Agent Spec**: `references/agent-engineer-questions.md`

| Property | Value |
|----------|-------|
| Agent Type | Single (Opus) |
| Critical | Yes |
| Input | `.context/analysis.json` + `.context/static-analysis/static-analysis.json` |
| Output | `.context/questions.json` |
| Uses from static-analysis | `publicAPI`, `exportFlows`, `insights`, `architecture.violations` |

### On Failure
- IF agent fails: Retry up to 3 times with backoff
- IF analysis.json missing: STOP, re-run Phase 1
- IF static-analysis.json missing: STOP, re-run Phase 0

> See `references/agent-engineer-questions.md` for full implementation.

---

## Phase 3: Research

**Agent Spec**: `references/agent-researcher.md`

| Property | Value |
|----------|-------|
| Agent Type | Parallel (Sonnet) |
| Critical | Yes |
| Input | `.context/questions.json` + `.context/static-analysis/static-analysis.json` |
| Output | `.context/research.json` |
| Uses from static-analysis | `exportFlows` (symbol locations), `dependencyUsage`, `moduleGraph.internalDependencies` |

**Research Acceleration**: Researchers use `exportFlows` to find symbol definitions without LSP calls. Check `exportFlows[symbol].definedIn` and `publicAPI[].position` before using `lspGotoDefinition`.

### Gate

**STOP. DO NOT proceed without verifying parallel spawn requirements.**

**Pre-Conditions:**
- Phase 2 completed successfully
- `.context/questions.json` exists and is valid

**Required Actions:**
1. Calculate agent count: `questions < 10 ? 1 : ceil(questions / 15)`
2. Split questions into batches BEFORE spawning
3. **REQUIRED:** Launch ALL researcher Task calls in **ONE** message

**FORBIDDEN:**
- Sequential Task calls
- Spawning researchers one at a time
- Starting research without questions.json

### On Failure
- IF researcher timeout: Retry with extended timeout
- IF researcher crashes: Load partial from `partials/research/batch-{id}.json`
- IF questions.json missing: STOP, re-run Phase 2
- IF all researchers fail: STOP pipeline, report critical error

> See `references/agent-researcher.md` for full implementation.

---

## Phase 4: Orchestrator

**Agent Spec**: `references/agent-orchestrator.md`

| Property | Value |
|----------|-------|
| Agent Type | Single (Opus) |
| Critical | Yes |
| Input | `.context/analysis.json`, `.context/questions.json`, `.context/research.json`, `.context/static-analysis/static-analysis.json` |
| Output | `.context/work-assignments.json` |
| Uses from static-analysis | `architecture.layers`, `files[].role`, `moduleGraph`, `insights.mostImported` |

**Assignment Strategy**: Use `architecture.layers` to group files by layer, `files[].role` for priority (entry > barrel > component), and `moduleGraph` for dependency clustering.

### Rules
- Assign EXCLUSIVE file ownership to writers
- Distribute research findings to relevant writers
- Use architecture.layers for smart file grouping
- Prioritize entry points and high-import files

### On Failure
- IF agent fails: Retry up to 3 times with backoff
- IF research.json missing: STOP, re-run Phase 3
- IF file ownership conflicts detected: Re-assign and retry

> See `references/agent-orchestrator.md` for full implementation.

---

## Phase 5: Documentation Writers

**Agent Spec**: `references/agent-documentation-writer.md`

| Property | Value |
|----------|-------|
| Agent Type | Parallel (1-8 Sonnet writers) |
| Primary Writer | Writer 1 (Critical) |
| Non-Primary | Partial failure allowed |
| Retry Logic | Up to 2 retries per failed writer |
| Input | `.context/analysis.json`, `.context/research.json`, `.context/work-assignments.json`, `.context/static-analysis/static-analysis.json` |
| Output | `documentation/*.md` (16 core, 5 required + supplementary) |
| File Ownership | Exclusive (no conflicts) |
| Uses from static-analysis | `publicAPI` (signatures, JSDoc), `exportFlows`, `dependencyUsage`, `architecture` |

**Writer Templates**: Use `publicAPI[]` for API reference sections (name, type, signature, jsDoc). Use `exportFlows` to document re-export chains. Use `dependencyUsage` for dependency documentation.

### Writer Scaling Strategy

| Strategy | Agent Count | When Used |
|----------|-------------|-----------|
| `sequential` | 1 | < 20 questions |
| `parallel-core` | 2-4 | 20-99 questions |
| `parallel-all` | 4-8 | >= 100 questions |

### Gate

**STOP. DO NOT proceed without verifying parallel spawn requirements.**

**Pre-Conditions:**
- Phase 4 completed successfully
- `.context/work-assignments.json` exists and is valid
- `.context/research.json` exists

**Required Actions:**
1. Calculate writer count based on question volume
2. Verify each writer has exclusive file ownership
3. **REQUIRED:** Launch ALL writer Task calls in **ONE** message

**FORBIDDEN:**
- Sequential Task calls
- Spawning writers one at a time
- Writers sharing file ownership (conflicts)
- Starting without work-assignments.json

### On Failure
- IF writer timeout: Retry with extended timeout
- IF writer crashes: Load partial from `partials/writers/writer-{id}.json`
- IF primary writer (Writer 1) fails: CRITICAL, retry up to 3 times
- IF non-primary writer fails: Mark files incomplete, continue
- IF work-assignments.json missing: STOP, re-run Phase 4

> See `references/agent-documentation-writer.md` for full implementation.

---

## Phase 6: QA Validator

**Agent Spec**: `references/agent-qa-validator.md`

| Property | Value |
|----------|-------|
| Agent Type | Parallel (4 Sonnet validators) |
| Parallel Validators | 6A-file-refs, 6B-api-refs, 6C-structure, 6D-coverage |
| Critical | No (failure produces warning) |
| Input | `.context/analysis.json`, `.context/questions.json`, `.context/research.json`, `documentation/*.md`, `.context/static-analysis/static-analysis.json` |
| Output | `.context/qa-results.json`, `documentation/QA-SUMMARY.md` |
| Score Range | 0-100 |
| Quality Ratings | `excellent` (>=90), `good` (>=75), `fair` (>=60), `needs-improvement` (<60) |
| Uses from static-analysis | `publicAPI` (coverage check), `files[]` (path validation), `dependencies` (accuracy check) |

**Automated Validation**: Cross-reference documentation against `static-analysis.json`:
- All `publicAPI` exports documented? -> Coverage score
- All file paths in docs exist in `files[]`? -> Link validation
- Documented deps match `dependencies.declared`? -> Accuracy score

### QA Validator Token Budgets

| Validator ID | Responsibility | Token Budget |
|--------------|----------------|--------------|
| 6A-file-refs | Verify all file paths in docs exist | ~15k |
| 6B-api-refs | LSP-powered API/function verification | ~25k |
| 6C-structure | Schema compliance & cross-links | ~5k |
| 6D-coverage | Component, flow, question coverage | ~10k |

### Gate

**STOP. DO NOT proceed without verifying parallel spawn requirements.**

**Pre-Conditions:**
- Phase 5 completed (at least primary writer)
- `documentation/*.md` files exist
- All required context files available

**Required Actions:**
1. Spawn exactly 4 validators (6A-file-refs, 6B-api-refs, 6C-structure, 6D-coverage)
2. **REQUIRED:** Launch ALL 4 validator Task calls in **ONE** message

**FORBIDDEN:**
- Sequential Task calls
- Spawning validators one at a time
- Starting without documentation files

### On Failure
- IF validator timeout: Retry with extended timeout
- IF validator crashes: Load partial from `partials/qa/validator-{id}.json`
- IF all validators fail: Generate warning-only QA report
- IF documentation/*.md missing: STOP, re-run Phase 5

> See `references/agent-qa-validator.md` for full implementation.

---

## Critical Rules Summary

**REMEMBER:** These rules MUST be followed for ALL parallel phases (1, 3, 5, 6):

1. **ALWAYS** spawn all parallel agents in ONE message - **NEVER** sequentially
2. **ALWAYS** verify pre-conditions before spawning agents
3. **ALWAYS** save partial results to `partials/{phase}/` for recovery
4. **ALWAYS** retry failed agents individually before failing the phase
5. **NEVER** proceed if required input files are missing - STOP and re-run previous phase
6. **NEVER** allow file ownership conflicts between writers
