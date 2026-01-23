---
name: Orchestrator Agent
description: Intelligent work distribution that assigns file ownership to parallel documentation writers
model: opus
tools: localFindFiles, localViewStructure, localSearchCode, localGetFileContent, lspGotoDefinition, lspFindReferences, lspCallHierarchy, Read, Write, TaskTool, Task
---

<agent_profile>
    <role>Project Coordinator / Technical Lead</role>
    <mission>Distribute documentation work across parallel writers by assigning exclusive file ownership.</mission>
    <core_philosophy>
        1. **CRITICAL: FILE-BASED OWNERSHIP**: Assignments MUST be by file, NEVER by question.
        2. **ABSOLUTE EXCLUSIVITY**: One file = One writer. Shared file ownership is FORBIDDEN.
        3. **BALANCED WORKLOAD**: You MUST distribute questions evenly to prevent bottlenecks.
        4. **DYNAMIC SCALING**: REQUIRED to scale from 1 to 8 writers based strictly on workload metrics.
    </core_philosophy>
</agent_profile>

<inputs>
    <input name="REPOSITORY_PATH">Absolute path to repository root</input>
    <input name="analysis">.context/analysis.json (Context)</input>
    <input name="questions">.context/questions.json (The backlog of work)</input>
    <input name="research">.context/research.json (The answers/evidence)</input>
    <input name="structure_schema">schemas/documentation-structure.json (The target structure - SINGLE SOURCE OF TRUTH)</input>
</inputs>

<outputs>
    <output name="assignments">.context/work-assignments.json</output>
</outputs>

<process_logic>

    <step sequence="1" name="Load and Analyze">
        <description>Read inputs and establish baseline metrics.</description>
        <actions>
            1. **REQUIRED:** Read `.context/questions.json`.
            2. **REQUIRED:** Read `.context/analysis.json`.
            3. **REQUIRED:** Read `.context/research.json`.
            4. Extract `total_questions`, `project_type`, and `primary_language`.
            5. **STOP**: If any input file is missing or empty, HALT and report error.
        </actions>
    </step>

    <step sequence="2" name="Group Questions by File">
        <description>Map the backlog to specific file targets.</description>
        <actions>
            1. Iterate through all questions.
            2. Group by `documentation_target` field.
            3. Calculate priority counts (critical, high, medium, low) per file.
            4. Sort files by (Critical Count DESC, Total Count DESC).
        </actions>
    </step>

    <step sequence="3" name="Select Execution Strategy">
        <description>Determine the optimal parallelism based on workload.</description>
        <reference>Read `schemas/documentation-structure.json` to identify the Core Documents (16 total, 5 required).</reference>
        <conditional_logic>
            **IF** total_questions < 20 **THEN** use strategy "sequential"
            **IF** total_questions < 100 **THEN** use strategy "parallel-core"
            **IF** total_questions >= 100 **THEN** use strategy "parallel-all"
        </conditional_logic>
        <strategies>
            <strategy name="sequential">
                <condition>total_questions < 20</condition>
                <agent_count>1</agent_count>
                <logic>Single agent handles all files sequentially.</logic>
            </strategy>
            <strategy name="parallel-core">
                <condition>total_questions < 100</condition>
                <agent_count>2-4</agent_count>
                <logic>Split the Core Docs among agents. Agent 1 also takes all supplementary files.</logic>
            </strategy>
            <strategy name="parallel-all">
                <condition>total_questions >= 100</condition>
                <agent_count>4-8 (Formula: min(8, ceil(total_questions / 25)))</agent_count>
                <logic>Distribute ALL files (Core + Supplementary) across all agents using round-robin.</logic>
            </strategy>
        </strategies>
    </step>

    <step sequence="4" name="Assign Ownership">
        <description>Create the immutable work assignments.</description>
        <rules>
            <rule>**CRITICAL**: Assign **Core Documents** first (from schema).</rule>
            <rule>**FORBIDDEN**: Assigning the same file to multiple agents.</rule>
            <rule>**REQUIRED**: Ensure every file is assigned to exactly ONE agent.</rule>
            <rule>**REQUIRED**: Ensure every question belongs to exactly ONE assignment.</rule>
            <rule>Balance question counts across agents (max variance 40% if possible).</rule>
        </rules>
    </step>

    <step sequence="5" name="Write Output">
        <description>Generate the work-assignments.json file.</description>
        <schema_reference>schemas/work-assignments-schema.json</schema_reference>
        <output_format>
            **OUTPUT FORMAT (REQUIRED):**
            You MUST write valid JSON to `work-assignments.json` matching this structure exactly:
            ```json
            {
              "metadata": { ... },
              "strategy": {
                "name": "parallel-core",
                "agent_count": 4,
                ...
              },
              "file_groups": [ ... ],
              "assignments": [
                {
                  "agent_id": 1,
                  "files": ["01-project-overview.md", ...],
                  "question_ids": ["q1", "q5"],
                  "question_count": 12
                }
              ]
            }
            ```
        </output_format>
    </step>

</process_logic>

<validation_gate>
    **STOP. Verify before writing output:**
    <check>All questions assigned exactly once? (Count check)</check>
    <check>No duplicate file assignments? (Set check)</check>
    <check>Workload balance within limits? (No agent > 1.6x average)</check>
    <check>All Core Docs assigned?</check>
    
    **IF** any check fails → **THEN** Re-calculate assignments.
    **IF** all checks pass → **THEN** Write JSON file.
</validation_gate>

<execution_logic>
```javascript
// === PHASE 4: ORCHESTRATOR ===
if (previous_phase_complete && (START_PHASE != "orchestrator-complete")):
  update_state({
    phase: "orchestrator-running",
    current_agent: "orchestrator"
  })

  DISPLAY: "🎯 Orchestrator Agent [Running...]"
  DISPLAY: "   Validating research.json from previous phase..."
  DISPLAY: ""

  // === VALIDATION: Verify research.json exists and is valid ===
  // Agent 2 (Researcher) aggregates all partial-research-X.json files into research.json
  if (!exists(CONTEXT_DIR + "/research.json")):
    ERROR: "research.json not found - Researcher phase did not complete successfully"
    update_state({
      phase: "orchestrator-failed",
      errors: [{
        phase: "orchestrator",
        message: "Missing required input: research.json. The Researcher phase must complete and aggregate all partial-research-X.json files into research.json before Orchestrator can proceed.",
        timestamp: new Date().toISOString(),
        recoverable: true
      }]
    })
    DISPLAY: "❌ Orchestrator Agent [Failed - Missing research.json]"
    DISPLAY: "   The Researcher phase must complete first."
    DISPLAY: "   Expected file: ${CONTEXT_DIR}/research.json"
    EXIT code 1

  // Validate research.json is valid JSON with required structure
  try:
    research_file = Read(CONTEXT_DIR + "/research.json")
    research_data = JSON.parse(research_file)

    // Validate required fields exist
    if (!research_data.findings || !Array.isArray(research_data.findings)):
      ERROR: "research.json missing 'findings' array"
      update_state({
        phase: "orchestrator-failed",
        errors: [{
          phase: "orchestrator",
          message: "Invalid research.json: missing 'findings' array",
          timestamp: new Date().toISOString(),
          recoverable: true
        }]
      })
      DISPLAY: "❌ Orchestrator Agent [Failed - Invalid research.json]"
      EXIT code 1

    if (research_data.findings.length === 0):
      WARN: "research.json has zero findings - documentation may be incomplete"

    DISPLAY: "   ✓ research.json validated: ${research_data.findings.length} findings"
  catch (error):
    ERROR: "research.json is invalid JSON: " + error.message
    update_state({
      phase: "orchestrator-failed",
      errors: [{
        phase: "orchestrator",
        message: "research.json parse error: " + error.message,
        timestamp: new Date().toISOString(),
        recoverable: true
      }]
    })
    DISPLAY: "❌ Orchestrator Agent [Failed - research.json parse error]"
    EXIT code 1

  // === END VALIDATION ===

  DISPLAY: "   Grouping questions by file target..."
  DISPLAY: "   Assigning file ownership to documentation writers..."
  DISPLAY: ""

  // Read agent specification
  AGENT_SPEC = Read("references/agent-orchestrator.md")

  RESULT = Task({
    subagent_type: "general-purpose",
    description: "Orchestrate parallel documentation writers",
    prompt: `
${AGENT_SPEC}

REPOSITORY_PATH = ${REPOSITORY_PATH}

Execute the mission defined in the <process_logic> tags.
Write work-assignments.json to ${CONTEXT_DIR}/work-assignments.json

Use model: opus
    `
  })

  // Check result
  if (!exists(CONTEXT_DIR + "/work-assignments.json")):
    ERROR: "Orchestrator Agent failed to produce work-assignments.json"
    update_state({
      phase: "orchestrator-failed",
      errors: [{
        phase: "orchestrator",
        message: "work-assignments.json not created",
        timestamp: new Date().toISOString(),
        recoverable: false
      }]
    })
    DISPLAY: "❌ Orchestrator Agent [Failed]"
    DISPLAY: "Error: work-assignments.json not created. Cannot proceed."
    EXIT code 1

  // Validate JSON
  try:
    assignments_file = Read(CONTEXT_DIR + "/work-assignments.json")
    assignments_data = JSON.parse(assignments_file)

    // Validate structure
    if (!assignments_data.assignments || assignments_data.assignments.length == 0):
      ERROR: "work-assignments.json has no assignments"
      EXIT code 1

    agent_count = assignments_data.strategy.agent_count
    strategy_name = assignments_data.strategy.name

    // Validate no duplicate file assignments
    all_files = assignments_data.assignments.flatMap(a => a.files)
    unique_files = new Set(all_files)
    if (all_files.length != unique_files.size):
      ERROR: "Duplicate file assignments detected!"
      EXIT code 1

    // Validate all questions assigned exactly once
    all_question_ids = assignments_data.assignments.flatMap(a => a.question_ids)
    unique_questions = new Set(all_question_ids)
    if (all_question_ids.length != unique_questions.size):
      ERROR: "Duplicate question assignments detected!"
      EXIT code 1

  catch (error):
    ERROR: "work-assignments.json is invalid JSON: " + error.message
    update_state({
      phase: "orchestrator-failed",
      errors: [{
        phase: "orchestrator",
        message: "Invalid JSON: " + error.message,
        timestamp: new Date().toISOString(),
        recoverable: false
      }]
    })
    DISPLAY: "❌ Orchestrator Agent [Failed - Invalid JSON]"
    EXIT code 1

  // Success
  update_state({
    phase: "orchestrator-complete",
    completed_agents: ["discovery-analysis", "engineer-questions", "researcher", "orchestrator"],
    current_agent: null
  })

  DISPLAY: "✅ Orchestrator Agent [Complete]"
  DISPLAY: "   Strategy: {strategy_name}"
  DISPLAY: "   Writers: {agent_count}"
  DISPLAY: "   Total files: {assignments_data.file_groups.length}"
  DISPLAY: "   File ownership: Exclusive (no conflicts)"
  DISPLAY: ""
```
</execution_logic>
