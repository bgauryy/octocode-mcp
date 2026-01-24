# Execution Flow Diagram

> **Check this document to understand the complete execution flow of the documentation generation pipeline.**

```mermaid
flowchart TB
    Start([/octocode-documentaion-writer PATH]) --> Validate[Pre-Flight Validation]
    Validate --> Init[Initialize Workspace]

    Init --> P0[Phase 0: Static Analysis]
    P0 --> P0Run[Run Analyzer<br/>npm run analyze]
    P0Run --> P0Done[✅ .context/static-analysis/<br/>9 files: static-analysis.json +<br/>PUBLIC_API.md, ARCHITECTURE.md,<br/>MODULE_GRAPH.md, etc.]

    P0Done --> SA[(static-analysis.json<br/>📊 Shared Data Source)]

    SA -->|files, entryPoints,<br/>architecture, moduleGraph| P1[Phase 1: Discovery+Analysis]

    subgraph P1_Parallel["🔄 RUN IN PARALLEL (4 agents)"]
        P1A[Agent 1A:<br/>Language & Manifests]
        P1B[Agent 1B:<br/>Components]
        P1C[Agent 1C:<br/>Dependencies]
        P1D[Agent 1D:<br/>Flows & APIs]
    end

    P1 --> P1_Parallel
    P1_Parallel --> P1Agg[Aggregation:<br/>Merge into analysis.json]
    P1Agg --> P1Done[✅ analysis.json created]

    P1Done --> P2[Phase 2: Engineer Questions<br/>Single Agent - Opus]
    SA -->|publicAPI, exportFlows,<br/>insights, violations| P2
    P2 --> P2Done[✅ questions.json created]

    P2Done --> P3[Phase 3: Research 🆕<br/>Parallel Agents - Sonnet]
    SA -->|exportFlows, dependencyUsage,<br/>moduleGraph| P3

    subgraph P3_Parallel["🔄 RUN IN PARALLEL"]
       P3A[Researcher 1]
       P3B[Researcher 2]
       P3C[Researcher 3]
    end

    P3 --> P3_Parallel
    P3_Parallel --> P3Agg[Aggregation:<br/>Merge into research.json]
    P3Agg --> P3Done[✅ research.json created<br/>Evidence-backed answers]

    P3Done --> P4[Phase 4: Orchestrator<br/>Single Agent - Opus]
    SA -->|architecture.layers,<br/>files[].role, moduleGraph| P4
    P4 --> P4Group[Group questions<br/>by file target]
    P4 --> P4Assign[Assign file ownership<br/>to writers]
    P4Assign --> P4Done[✅ work-assignments.json]

    P4Done --> P5[Phase 5: Documentation Writers]
    SA -->|publicAPI, exportFlows,<br/>dependencyUsage| P5
    P5 --> P5Input[📖 Input:<br/>work-assignments.json<br/>+ research.json<br/>+ static-analysis.json]
    P5Input --> P5Dist[Each writer gets<br/>exclusive file ownership]

    subgraph P5_Parallel["🔄 RUN IN PARALLEL (1-8 agents)"]
        P5W1[Writer 1]
        P5W2[Writer 2]
        P5W3[Writer 3]
        P5W4[Writer 4]
    end

    P5Dist --> P5_Parallel
    P5_Parallel --> P5Verify[Verify Structure]
    P5Verify --> P5Done[✅ documentation/*.md created]

    P5Done --> P6[Phase 6: QA Validator]
    SA -->|publicAPI, files[],<br/>dependencies| P6

    subgraph P6_Parallel["🔄 RUN IN PARALLEL (4 validators)"]
        P6A[Validator 6A:<br/>File References]
        P6B[Validator 6B:<br/>API Verification]
        P6C[Validator 6C:<br/>Structure]
        P6D[Validator 6D:<br/>Coverage]
    end

    P6 --> P6_Parallel
    P6_Parallel --> P6Agg[Aggregation:<br/>Merge into qa-results.json]
    P6Agg --> P6Done[✅ qa-results.json +<br/>QA-SUMMARY.md]

    P6Done --> Complete([✅ Documentation Complete])

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

## Parallel Execution Rules

<execution_rules>
    <phase name="0-static-analysis" type="single" critical="true" spawn="sequential">
        <agent_count>N/A (script, not AI agent)</agent_count>
        <description>Static Analysis - Entry Points, Module Graph, Architecture</description>
        <spawn_instruction>Run npm script to analyze repository</spawn_instruction>
        <rules>
            <rule>Run `npm run analyze -- &lt;repoPath&gt; &lt;outPath&gt;` from skill package</rule>
            <rule>Output folder: `.context/static-analysis/` with 9 files</rule>
            <rule>Primary output: `static-analysis.json` (structured data)</rule>
            <rule>Additional outputs: PUBLIC_API.md, ARCHITECTURE.md, MODULE_GRAPH.md, DEPENDENCIES.md, INSIGHTS.md, EXPORT_FLOWS.md, DEPENDENCY_USAGE.md, ANALYSIS_SUMMARY.md</rule>
            <rule>Provides entry points, module graph, and architecture for Phase 1</rule>
        </rules>
    </phase>

    <phase name="1-discovery" type="parallel" critical="true" spawn="single_message">
        <gate>
        **STOP.** Verify parallel spawn requirements.
        **REQUIRED:** Spawn 4 agents in ONE message.
        **FORBIDDEN:** Sequential Task calls.
        </gate>
        <agent_count>4</agent_count>
        <description>Discovery and Analysis</description>
        <spawn_instruction>⚠️ Launch ALL 4 Task calls in ONE response</spawn_instruction>
        <rules>
            <rule>All 4 agents start simultaneously via single-message spawn</rule>
            <rule>Wait for ALL 4 to complete before aggregation</rule>
            <rule>Must aggregate 4 partial JSONs into analysis.json</rule>
        </rules>
    </phase>

    <phase name="2-questions" type="single" critical="true" spawn="sequential">
        <agent_count>1</agent_count>
        <description>Engineer Questions Generation</description>
        <input>analysis.json + static-analysis.json</input>
        <uses_from_static_analysis>publicAPI, exportFlows, insights, architecture.violations</uses_from_static_analysis>
        <spawn_instruction>Single agent, wait for completion</spawn_instruction>
    </phase>

    <phase name="3-research" type="parallel" critical="true" spawn="single_message">
        <gate>
        **STOP.** Verify parallel spawn requirements.
        **REQUIRED:** Spawn N researchers in ONE message.
        **FORBIDDEN:** Sequential Task calls.
        </gate>
        <agent_count_logic>
            <case condition="questions &lt; 10">1 agent</case>
            <case condition="questions &gt;= 10">Ceil(questions / 15)</case>
        </agent_count_logic>
        <description>Evidence Gathering</description>
        <input>questions.json + static-analysis.json</input>
        <uses_from_static_analysis>exportFlows (symbol locations), dependencyUsage, moduleGraph</uses_from_static_analysis>
        <spawn_instruction>⚠️ Launch ALL researcher Task calls in ONE response</spawn_instruction>
        <rules>
            <rule>Split questions into batches BEFORE spawning</rule>
            <rule>All researchers start simultaneously</rule>
            <rule>Use exportFlows to find symbol definitions before LSP calls</rule>
            <rule>Aggregate findings into research.json</rule>
        </rules>
    </phase>

    <phase name="4-orchestrator" type="single" critical="true" spawn="sequential">
        <agent_count>1</agent_count>
        <description>Orchestration and Assignment</description>
        <input>questions.json + research.json + static-analysis.json</input>
        <uses_from_static_analysis>architecture.layers, files[].role, moduleGraph, insights.mostImported</uses_from_static_analysis>
        <spawn_instruction>Single agent, wait for completion</spawn_instruction>
        <rules>
            <rule>Assign EXCLUSIVE file ownership to writers</rule>
            <rule>Distribute research findings to relevant writers</rule>
            <rule>Use architecture.layers for smart file grouping</rule>
            <rule>Prioritize entry points and high-import files</rule>
        </rules>
    </phase>

    <phase name="5-writers" type="dynamic_parallel" critical="false" spawn="single_message">
        <gate>
        **STOP.** Verify parallel spawn requirements.
        **REQUIRED:** Spawn all writers in ONE message.
        **FORBIDDEN:** Sequential Task calls.
        </gate>
        <agent_count_logic>
            <case condition="questions &lt; 20">1 agent</case>
            <case condition="questions 20-99">2-4 agents</case>
            <case condition="questions &gt;= 100">4-8 agents</case>
        </agent_count_logic>
        <input>work-assignments.json + research.json + static-analysis.json</input>
        <uses_from_static_analysis>publicAPI (signatures, JSDoc), exportFlows, dependencyUsage</uses_from_static_analysis>
        <spawn_instruction>⚠️ Launch ALL writer Task calls in ONE response</spawn_instruction>
        <rules>
            <rule>Each writer owns EXCLUSIVE files - no conflicts possible</rule>
            <rule>All writers start simultaneously via single-message spawn</rule>
            <rule>Use provided research.json as primary source</rule>
            <rule>Use publicAPI for accurate signatures and JSDoc</rule>
            <rule>Use exportFlows to document re-export chains</rule>
        </rules>
    </phase>

    <phase name="6-qa" type="parallel" critical="false" spawn="single_message">
        <gate>
        **STOP.** Verify parallel spawn requirements.
        **REQUIRED:** Spawn 4 validators in ONE message.
        **FORBIDDEN:** Sequential Task calls.
        </gate>
        <agent_count>4</agent_count>
        <description>Quality Validation</description>
        <input>documentation/*.md + analysis.json + research.json + static-analysis.json</input>
        <uses_from_static_analysis>publicAPI (coverage), files[] (path validation), dependencies (accuracy)</uses_from_static_analysis>
        <spawn_instruction>⚠️ Launch ALL 4 validator Task calls in ONE response</spawn_instruction>
        <validators>
            <validator id="6a-file-refs">Verify file path references exist (use files[] from static-analysis)</validator>
            <validator id="6b-api-refs">Verify API/function references with LSP + publicAPI cross-check</validator>
            <validator id="6c-structure">Validate documentation structure compliance</validator>
            <validator id="6d-coverage">Validate coverage against publicAPI exports</validator>
        </validators>
        <rules>
            <rule>All 4 validators start simultaneously via single-message spawn</rule>
            <rule>Wait for ALL 4 to complete before aggregation</rule>
            <rule>Cross-reference docs against static-analysis.json for automated validation</rule>
            <rule>Aggregate 4 partial results into qa-results.json</rule>
        </rules>
    </phase>
</execution_rules>
