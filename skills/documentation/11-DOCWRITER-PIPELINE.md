# Documentation Writer Pipeline

## Overview

The **octocode-documentaion-writer** skill implements a sophisticated 6-phase pipeline that automatically generates comprehensive documentation for any codebase. The pipeline leverages parallel AI agent orchestration, intelligent research, and exclusive file ownership to create high-quality documentation efficiently.

**Key Innovation:** Parallel agent execution with conflict-free file ownership ensures fast, consistent documentation generation without merge conflicts or redundant work.

---

## Pipeline Architecture

### 6-Phase Execution Model

The documentation pipeline executes in six sequential phases, each with specific inputs, outputs, and agent configurations:

```
Phase 1: Discovery+Analysis (4 parallel agents)
   ↓ analysis.json
Phase 2: Engineer Questions (1 Opus agent)
   ↓ questions.json
Phase 3: Research (dynamic parallel agents)
   ↓ research.json
Phase 4: Orchestrator (1 Opus agent)
   ↓ work-assignments.json
Phase 5: Documentation Writers (1-8 parallel agents)
   ↓ documentation/*.md
Phase 6: QA Validator (1 Sonnet agent)
   ↓ qa-results.json + QA-SUMMARY.md
```

**Evidence:**
- `octocode-documentaion-writer/SKILL.md:16` - Phase 1 definition (Discovery+Analysis)
- `octocode-documentaion-writer/SKILL.md:25` - Phase 2 definition (Engineer Questions)
- `octocode-documentaion-writer/SKILL.md:33` - Phase 3 definition (Research)
- `octocode-documentaion-writer/SKILL.md:42` - Phase 4 definition (Orchestrator)
- `octocode-documentaion-writer/SKILL.md:50` - Phase 5 definition (Documentation Writers)
- `octocode-documentaion-writer/SKILL.md:59` - Phase 6 definition (QA Validator)

---

## Phase 1: Discovery + Analysis

### Overview

Phase 1 analyzes the repository structure using **4 parallel Opus agents** executing simultaneously. Each agent focuses on a distinct aspect of the codebase, writing partial results that are later aggregated.

**Execution Model:** Single message spawn with 4 parallel agents
**Critical Agents:** 1A (Language & Manifests) and 1D (Flows & APIs) must succeed

**Evidence:**
- `octocode-documentaion-writer/SKILL.md:16` - Phase 1 with 4 parallel agents
- `octocode-documentaion-writer/references/agent-discovery-analysis.md:130` - Parallel agent diagram

### The 4 Discovery Agents

#### Agent 1A: Language & Manifests

**Responsibilities:**
- Count source files by extension using `localFindFiles`
- Determine primary language (highest file count)
- Find language-specific manifests (package.json, Cargo.toml, requirements.txt, go.mod)
- Extract project metadata (name, version, description)

**Output:** `partial-1a-language.json`

**Evidence:**
- `octocode-documentaion-writer/references/agent-discovery-analysis.md:144` - Agent 1A definition

#### Agent 1B: Components

**Responsibilities:**
- Discover components (directories with 3+ source files)
- Identify component boundaries and purposes
- Extract component descriptions from README/comments
- Map component relationships

**Output:** `partial-1b-components.json`

**Evidence:**
- `octocode-documentaion-writer/references/agent-discovery-analysis.md:168` - Agent 1B definition

#### Agent 1C: Dependencies

**Responsibilities:**
- Map internal dependencies from import/require statements
- Detect external dependencies from manifest files
- Build dependency relationships
- Identify workspace dependencies (monorepo support)

**Output:** `partial-1c-dependencies.json`

**Evidence:**
- `octocode-documentaion-writer/references/agent-discovery-analysis.md:191` - Agent 1C definition

#### Agent 1D: Flows & APIs

**Responsibilities:**
- Trace execution flows (HTTP routes, CLI commands, event handlers)
- Document public APIs (exported functions/classes)
- Identify entry points (main files, index files)
- Use LSP tools to verify call chains

**Output:** `partial-1d-flows-apis.json`

**Evidence:**
- `octocode-documentaion-writer/references/agent-discovery-analysis.md:214` - Agent 1D definition with LSP tools

### Aggregation Step

After all 4 agents complete, an aggregation agent merges partial results:

**Process:**
1. Read all partial result files:
   - `.context/partial-1a-language.json`
   - `.context/partial-1b-components.json`
   - `.context/partial-1c-dependencies.json`
   - `.context/partial-1d-flows-apis.json`
2. Merge into comprehensive `analysis.json`
3. Validate structure against `analysis-schema.json`

**Evidence:**
- `octocode-documentaion-writer/references/agent-discovery-analysis.md:239` - Aggregation step merging partials into analysis.json

### Critical Agent Configuration

| Agent ID | Critical | Rationale |
|----------|----------|-----------|
| 1a-language | **true** | Language detection is foundational - all other analysis depends on it |
| 1b-components | false | Component discovery is helpful but not blocking |
| 1c-dependencies | false | Dependency mapping can be incomplete without blocking |
| 1d-flows-apis | **true** | Flow/API discovery is essential for documentation structure |

**Impact:** If Agent 1A or 1D fails, the entire pipeline halts. Non-critical agent failures result in incomplete analysis but allow the pipeline to continue.

**Evidence:**
- `octocode-documentaion-writer/references/agent-discovery-analysis.md:302` - Critical agents configuration

### Output: analysis.json

Comprehensive repository analysis including:
- Language and manifest metadata
- Component structure and descriptions
- Dependency mappings (internal and external)
- Execution flows and API definitions

See **[12-DOCWRITER-SCHEMAS.md](12-DOCWRITER-SCHEMAS.md)** for detailed schema.

---

## Phase 2: Engineer Questions

### Overview

A single **Opus agent** analyzes `analysis.json` and generates comprehensive questions that guide documentation creation.

**Agent Count:** 1 Opus agent
**Input:** `analysis.json`
**Output:** `questions.json`

**Evidence:**
- `octocode-documentaion-writer/SKILL.md:25` - Phase 2 generates questions from analysis

### Question Generation Strategy

**Adaptive Question Generation:**
- Questions are tailored to the repository's language, architecture, and components
- Each question includes:
  - Research goal (what to discover)
  - Target documentation file (where answer belongs)
  - Files to examine (where to find answers)
  - Priority (critical/high/medium/low)
  - Category (component-overview, flow-execution, api-documentation, etc.)

**Question Categories (30+ types):**
- Component analysis (overview, responsibility, exports, internal structure)
- Flow analysis (trigger, execution, error handling, data transformation)
- Architecture (overview, patterns, layers, decisions)
- API documentation (endpoints, parameters, examples)
- Configuration, deployment, security, testing

**Evidence:**
- `octocode-documentaion-writer/schemas/questions-schema.json:103` - 30+ question categories

### Output: questions.json

Structured questions with metadata:
- Total question count
- Breakdown by category and priority
- Questions array with research goals and target files

See **[12-DOCWRITER-SCHEMAS.md](12-DOCWRITER-SCHEMAS.md)** for detailed schema.

---

## Phase 3: Research

### Overview

Phase 3 performs **deep-dive code forensics** to answer questions with evidence. Questions are distributed across **dynamic parallel Sonnet agents** based on workload.

**Agent Scaling:**
- Questions < 10: 1 agent
- Questions ≥ 10: `ceil(questions / 15)` agents

**Evidence:**
- `octocode-documentaion-writer/SKILL.md:33` - Phase 3 with dynamic parallelism
- `octocode-documentaion-writer/references/agent-researcher.md:138` - Questions split into batches of ~15

### Research Philosophy

**Core Principles:**
1. **Evidence Over Opinion:** Every answer MUST be backed by file path and line number
2. **Depth First:** Trace full execution paths, not just definitions
3. **Structured Output:** Machine-parsable findings for Writers to consume

**Evidence:**
- `octocode-documentaion-writer/references/agent-researcher.md:11` - Core philosophy emphasizing evidence

### Mandatory Tool Sequence

Research agents follow a strict tool usage protocol:

**Step 1: Locate Entry Point (MANDATORY)**
- **REQUIRED:** Start with `localSearchCode` or `localFindFiles`
- **FORBIDDEN:** Reading files randomly without a search hit

**Step 2: Trace & Verify (Tool Sequence Enforced)**
- **IF** need to understand types → **MUST** use `lspGotoDefinition(lineHint)`
- **IF** need to find usage → **MUST** use `lspFindReferences(lineHint)`
- **IF** need flow/call graph → **MUST** use `lspCallHierarchy(lineHint)`
- **CRITICAL:** NEVER use LSP tools without a valid `lineHint` from Step 1

**Step 3: Extract Evidence**
- Use `localGetFileContent` to read code and confirm findings
- Capture file paths, line numbers, and code snippets

**Evidence:**
- `octocode-documentaion-writer/references/agent-researcher.md:46` - Mandatory tool sequence: search → LSP → content

### Parallel Research Execution

**Question Distribution:**

```typescript
chunks = chunkArray(all_questions, 15)

parallel_tasks = chunks.map((chunk, index) => ({
  id: "researcher-" + index,
  description: `Researcher ${index}: ${chunk.length} questions`,
  // ... agent config
}))
```

**Example:**
- 40 questions → 3 agents (15 + 15 + 10)
- 8 questions → 1 agent
- 45 questions → 3 agents (15 + 15 + 15)

**Evidence:**
- `octocode-documentaion-writer/references/agent-researcher.md:138` - 15-question batch size

### Research Output Format

Each researcher writes findings to `partial-research-{index}.json`:

```json
{
  "question_id": "q22",
  "status": "answered",  // or "partial" or "not_found"
  "answer": "The test suite uses Vitest as the test runner...",
  "evidence": [
    {
      "file": "/path/to/file.ts",
      "line": 42,
      "snippet": "code snippet",
      "explanation": "what this proves"
    }
  ],
  "confidence": "high"
}
```

**Evidence:**
- `octocode-documentaion-writer/references/agent-researcher.md:176` - Partial research file aggregation

### Aggregation into research.json

After all research agents complete, results are merged:

1. Read each `partial-research-{index}.json`
2. Aggregate findings into single array
3. Track status counts (answered/partial/not_found)
4. Write final `research.json`

**Evidence:**
- `octocode-documentaion-writer/references/agent-researcher.md:211` - Final research.json structure

### Output: research.json

Comprehensive research findings including:
- Metadata (version, timestamp, total questions)
- Findings array with answers and evidence
- Status tracking (answered/partial/not_found counts)

See **[12-DOCWRITER-SCHEMAS.md](12-DOCWRITER-SCHEMAS.md)** for detailed schema.

---

## Phase 4: Orchestrator

### Overview

A single **Opus agent** groups questions by target documentation file and assigns **exclusive file ownership** to writers, preventing conflicts.

**Agent Count:** 1 Opus agent
**Input:** `questions.json`, `research.json`
**Output:** `work-assignments.json`

**Evidence:**
- `octocode-documentaion-writer/SKILL.md:42` - Phase 4 orchestrates file ownership

### Core Philosophy

**Exclusive File Ownership Rules:**
1. **FILE-BASED OWNERSHIP:** Assignments MUST be by file, NEVER by question
2. **ABSOLUTE EXCLUSIVITY:** One file = One writer (shared ownership FORBIDDEN)
3. **BALANCED WORKLOAD:** Distribute questions evenly to prevent bottlenecks
4. **DYNAMIC SCALING:** Scale from 1 to 8 writers based on workload

**Evidence:**
- `octocode-documentaion-writer/references/agent-orchestrator.md:12` - Core philosophy: exclusive file ownership

### Work Assignment Process

#### Step 1: Group Questions by File

**Grouping Logic:**

```typescript
// 1. Iterate through all questions
// 2. Group by `documentation_target` field
// 3. Calculate priority counts (critical, high, medium, low) per file
// 4. Sort files by (Critical Count DESC, Total Count DESC)
```

**Evidence:**
- `octocode-documentaion-writer/references/agent-orchestrator.md:45` - Grouping by documentation_target

#### Step 2: Select Execution Strategy

**Strategy Selection Logic:**

| Condition | Strategy | Agent Count |
|-----------|----------|-------------|
| total_questions < 20 | `sequential` | 1 |
| total_questions < 100 | `parallel-core` | 2-4 |
| total_questions ≥ 100 | `parallel-all` | 4-8 (min(8, ceil(questions / 25))) |

**Evidence:**
- `octocode-documentaion-writer/references/agent-orchestrator.md:57` - Strategy selection based on question count

**Strategy Details:**

**Sequential (< 20 questions):**
- Single agent handles all files
- Simple, no coordination needed

**Parallel-Core (20-99 questions):**
- Split Core Documents (01-08) among 2-4 agents
- Agent 1 also handles all supplementary files
- Balance critical documentation across agents

**Parallel-All (≥ 100 questions):**
- Distribute ALL files (Core + Supplementary) across 4-8 agents
- Round-robin distribution
- Maximum parallelization

**Evidence:**
- `octocode-documentaion-writer/references/agent-orchestrator.md:57` - Three strategies with agent scaling

#### Step 3: Assign Files to Writers

**Assignment Rules:**

1. **CRITICAL:** Assign **Core Documents** first (from schema)
2. **FORBIDDEN:** Assigning the same file to multiple agents
3. **REQUIRED:** Every file assigned to exactly ONE agent
4. **REQUIRED:** Every question belongs to exactly ONE assignment
5. Balance question counts across agents (max variance 40% if possible)

**Evidence:**
- `octocode-documentaion-writer/references/agent-orchestrator.md:83` - Strict assignment rules

#### Step 4: Validation

**Conflict Detection:**

```typescript
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
```

**Evidence:**
- `octocode-documentaion-writer/references/agent-orchestrator.md:255` - Validation preventing duplicates

### Output: work-assignments.json

File ownership assignments including:
- Metadata (version, timestamp, repository path)
- Strategy (name, agent count, reasoning)
- File groups (questions grouped by target file)
- Assignments (agent ID, exclusive files, questions)

See **[12-DOCWRITER-SCHEMAS.md](12-DOCWRITER-SCHEMAS.md)** for detailed schema.

---

## Phase 5: Documentation Writers

### Overview

Phase 5 executes **1-8 parallel Sonnet agents** that synthesize research into documentation. Each writer has **exclusive file ownership** preventing all conflicts.

**Agent Count:** 1-8 (dynamic based on workload)
**Input:** `analysis.json`, `questions.json`, `research.json`, `work-assignments.json`
**Output:** `documentation/*.md` files

**Evidence:**
- `octocode-documentaion-writer/SKILL.md:50` - Phase 5 with 1-8 parallel writers
- `octocode-documentaion-writer/references/agent-documentation-writer.md:10` - Writers operate in parallel with exclusive ownership

### Writer Scaling Strategy

| Strategy | Agent Count | When Used |
|----------|-------------|-----------|
| `sequential` | 1 | < 20 questions |
| `parallel-core` | 2-4 | 20-99 questions |
| `parallel-all` | 4-8 | ≥ 100 questions |

**Evidence:**
- `octocode-documentaion-writer/SKILL.md:473` - Writer scaling strategy table

### Writer Execution Flow

#### Phase 1: Initialization

**Initialization Gate (HALT until complete):**

1. **REQUIRED:** Read `.context/work-assignments.json` and find entry for `AGENT_ID`
2. **REQUIRED:** Extract `myFiles` (files owned) and `myQuestionIds`
3. **REQUIRED:** Read `analysis.json`, `research.json`, and filtered `questions.json`
4. **REQUIRED:** Read `documentation-structure.json` to understand required output format

**FORBIDDEN until gate passes:** Writing any files, calling research tools

**Evidence:**
- `octocode-documentaion-writer/references/agent-documentation-writer.md:40` - Initialization gate requirements

#### Phase 2: Synthesis & Verification

**Evidence Mapping Strategy:**

For each assigned question:
1. Look up answer in `research.json`
2. **IF** `status` is "answered" → **THEN** use `answer` and `code_references`
3. **IF** `status` is "partial" or "not_found" → **THEN** perform `localSearchCode` (max 3 calls) to fill gap
4. **CRITICAL:** If gap persists, mark as "Unresolved" in notes. **DO NOT HALLUCINATE.**

**Evidence:**
- `octocode-documentaion-writer/references/agent-documentation-writer.md:54` - Evidence mapping from research.json

#### Phase 3: Documentation Generation

**Writing Rules (CRITICAL):**

1. **Exclusive Ownership:** **FORBIDDEN** to write/edit any file not in `myFiles`
2. **Completeness:** **REQUIRED** to create all assigned Core Files
3. **Evidence:** **MUST** cite files and line numbers (e.g., `src/auth.ts:45`) in docs
4. **No Hallucinations:** **IF** not found in code/research → **THEN** state "Not found" or "Unclear"

**Evidence:**
- `octocode-documentaion-writer/references/agent-documentation-writer.md:88` - Critical rules enforcing exclusive ownership

### Critical Writer Identification

**Primary Core Files (01-08):**
The orchestrator identifies one writer as "critical" based on core file ownership:

```typescript
const CORE_FILE_PATTERN = /^0[1-8]-/

function findCriticalWriter(assignments) {
  // Find the writer that owns the majority of primary core files (01-08)
  let maxCoreFiles = 0
  let criticalAgentId = null

  for (const assignment of assignments) {
    const coreFileCount = assignment.files.filter(f => CORE_FILE_PATTERN.test(f)).length
    if (coreFileCount > maxCoreFiles) {
      maxCoreFiles = coreFileCount
      criticalAgentId = assignment.agent_id
    }
  }

  return criticalAgentId
}
```

**Why Critical Writers Matter:**
- Core files (01-08) include all 5 required documentation files
- If the critical writer fails, core documentation is incomplete
- Non-critical writer failures result in partial documentation with warnings

**Evidence:**
- `octocode-documentaion-writer/references/agent-documentation-writer.md:118` - Critical writer identification

### Error Handling & Retry Logic

**Retry Configuration:**

```typescript
const MAX_RETRIES = 2
let failed_agents = results.filter(r => r.status === "failed")
let retry_count = 0

while (failed_agents.length > 0 && retry_count < MAX_RETRIES) {
  retry_count++
  // ... retry failed agents
}
```

**Failure Handling:**

**Critical Writer Failure:**
```typescript
if (critical_failed) {
  update_state({
    phase: "documentation-failed",
    status: "critical_failure",
    error: `Critical writer ${criticalWriterId} failed after ${MAX_RETRIES} retries.`,
  })
  throw new Error(`CRITICAL: Writer ${criticalWriterId} (core files) failed.`)
}
```

**Non-Critical Writer Failure:**
- Pipeline continues with partial success
- Warning logged for incomplete documentation
- QA validation reports missing files

**Evidence:**
- `octocode-documentaion-writer/references/agent-documentation-writer.md:176` - Retry logic (max 2 retries)
- `octocode-documentaion-writer/references/agent-documentation-writer.md:217` - Critical writer failure handling

### Output: documentation/*.md

Complete documentation files including:
- 16 core documentation files (01-OVERVIEW.md through 16-*.md)
- 5 required files (01, 02, 03, 04, 08)
- Supplementary files as needed

---

## Phase 6: QA Validator

### Overview

A single **Sonnet agent** validates documentation quality using **LSP-powered verification** across 7 validation phases.

**Agent Count:** 1 Sonnet agent
**Critical:** No (failure produces warning, not pipeline halt)
**Input:** `documentation/*.md`, `analysis.json`, `questions.json`
**Output:** `qa-results.json`, `QA-SUMMARY.md`

**Evidence:**
- `octocode-documentaion-writer/SKILL.md:59` - Phase 6 validates with LSP tools
- `octocode-documentaion-writer/SKILL.md:489` - QA validator properties (non-critical)

### Validation Phases

#### Phase 1: Context Loading

- Read `analysis.json` and `questions.json`
- Use `localFindFiles` to list `documentation/*.md` files
- Halt if no documentation found

#### Phase 2: Verify File References

**Goal:** Ensure every file path mentioned in docs exists in the repo

**Process:**
1. Extract all file paths from docs (regex: `src/[\w/.-]+`)
2. **REQUIRED TOOL:** Run `localSearchCode(filesOnly=true)` to validate existence
3. **FORBIDDEN:** Using `cat`, `ls`, or guessing paths
4. Match extracted paths against actual files
5. **Metric:** `file_reference_score = (valid / total) * 100`

**Evidence:**
- `octocode-documentaion-writer/references/agent-qa-validator.md:59` - File reference verification

#### Phase 3: Verify API References (CRITICAL)

**Goal:** Ensure every function/class mentioned in docs actually exists and is used

**Mandatory Tool Chain for EACH API:**

1. **SEARCH:** `localSearchCode(pattern=name)` → Capture `lineHint`
2. **CHECKPOINT:** Do you have a lineHint? If NO, mark as invalid and skip
3. **LOCATE:** `lspGotoDefinition(lineHint)` → **Verify existence**
4. **ANALYZE:** `lspFindReferences(lineHint)` → **Verify usage**
5. **Metric:** `api_verification_score = (verified / total) * 100`

**FORBIDDEN:** Calling LSP tools without valid `lineHint` from search

**Evidence:**
- `octocode-documentaion-writer/references/agent-qa-validator.md:72` - API verification with mandatory LSP tool chain
- `octocode-documentaion-writer/references/agent-qa-validator.md:36` - Mandatory tool usage protocol

#### Phase 4: Validate Structure

- Check all core_files marked `required: true` exist
- Validate folder structure (components/, flows/)
- Check internal cross-links
- Calculate `structure_score`

#### Phase 5: Validate Coverage

- Ensure all components in `analysis.json` have mentions/sections
- All flows have descriptions
- Keywords from `questions.json` appear in docs
- Calculate:
  - `component_coverage_score`
  - `flow_coverage_score`
  - `question_coverage_score`

#### Phase 6: Scoring and Reporting

**Weighted Scoring:**

| Category | Weight |
|----------|--------|
| File references | 20% |
| API verification | 20% |
| Question coverage | 15% |
| Component coverage | 15% |
| Cross-links | 10% |
| Flow coverage | 10% |
| Diagrams | 5% |
| Markdown syntax | 5% |

**Quality Levels:**

| Level | Score Range | Ready for Use |
|-------|-------------|---------------|
| Excellent | 90+ | ✅ Yes |
| Good | 75-89 | ✅ Yes |
| Fair | 60-74 | ⚠️ With caveats |
| Needs Improvement | < 60 | ❌ No |

**Ready for Use Threshold:** 70+

**Evidence:**
- `octocode-documentaion-writer/references/agent-qa-validator.md:115` - Scoring weights and quality thresholds

#### Phase 7: Output Generation

**Output Format (MANDATORY):**

1. **Write `.context/qa-results.json`**
   - Strict JSON format
   - No markdown code blocks inside file content

2. **Write `documentation/QA-SUMMARY.md`**
   - Include badges, tables, and actionable gaps
   - Summarize scores clearly

**Evidence:**
- `octocode-documentaion-writer/references/agent-qa-validator.md:134` - Output generation requirements

### Output: qa-results.json + QA-SUMMARY.md

**qa-results.json:** Machine-parsable validation results with scores and issues

**QA-SUMMARY.md:** Human-readable summary with:
- Overall quality score
- Score breakdown by category
- List of issues found
- Recommendations for improvement

---

## Pipeline Orchestration

### State Management

The pipeline tracks state across phases using `.context/state.json`:

```json
{
  "phase": "discovery",  // or "questions", "research", "orchestration", "writing", "qa", "complete"
  "status": "running",   // or "completed", "failed"
  "current_step": "1a-language",
  "started_at": "2024-01-23T10:00:00Z",
  "updated_at": "2024-01-23T10:05:00Z"
}
```

### File Structure

**Context Directory (`.context/`):**

```
.context/
├── analysis.json              # Phase 1 output
├── questions.json             # Phase 2 output
├── research.json              # Phase 3 output (aggregated)
├── work-assignments.json      # Phase 4 output
├── qa-results.json            # Phase 6 output
├── state.json                 # Pipeline state tracking
└── partials/
    └── research/
        ├── batch-1.json       # Phase 3 partial (researcher 0)
        ├── batch-2.json       # Phase 3 partial (researcher 1)
        └── batch-3.json       # Phase 3 partial (researcher 2)
```

**Documentation Directory (`documentation/`):**

```
documentation/
├── 01-OVERVIEW.md             # Required
├── 02-ARCHITECTURE.md         # Required
├── 03-GETTING-STARTED.md      # Required
├── 04-API-REFERENCE.md        # Required
├── 05-CONFIGURATION.md
├── 06-DATA-FLOWS.md
├── 07-PATTERNS.md
├── 08-ERROR-HANDLING.md       # Required
├── 09-TESTING.md
├── 10-DEPLOYMENT.md
├── 11-DOCWRITER-PIPELINE.md
├── 12-DOCWRITER-SCHEMAS.md
├── 13-MIDDLEWARE.md
├── 14-INTEGRATIONS.md
└── QA-SUMMARY.md              # Phase 6 output
```

---

## Performance Characteristics

### Parallelization Benefits

**Phase 1 (Discovery):** 4 parallel agents
- **Sequential time:** ~20 minutes (5 min per agent)
- **Parallel time:** ~5 minutes (all agents run simultaneously)
- **Speedup:** 4x

**Phase 3 (Research):** Dynamic scaling
- 40 questions → 3 agents → ~15 minutes (vs 45 min sequential)
- 80 questions → 6 agents → ~20 minutes (vs 120 min sequential)
- **Speedup:** 3-6x depending on workload

**Phase 5 (Writers):** 1-8 parallel agents
- 100 questions → 4 writers → ~10 minutes (vs 40 min sequential)
- **Speedup:** 4-8x depending on agent count

**Total Pipeline:**
- Small repo (< 20 questions): ~30 minutes
- Medium repo (20-100 questions): ~45 minutes
- Large repo (100+ questions): ~60 minutes

### Exclusive File Ownership Benefits

**No Merge Conflicts:**
- Each writer owns distinct files
- No coordination needed during writing
- No post-processing merge step

**Predictable Completion:**
- Each writer's workload is known upfront
- No race conditions
- Clear success/failure per writer

**Retry Safety:**
- Failed writers can be retried independently
- No risk of partial writes or corruption
- Idempotent operations

---

## Error Handling

### Phase Failure Strategies

| Phase | Critical | Failure Behavior |
|-------|----------|------------------|
| Phase 1 (Discovery) | Partially (1A, 1D critical) | Non-critical agent failures produce incomplete analysis |
| Phase 2 (Questions) | Yes | Pipeline halts |
| Phase 3 (Research) | No | Partial findings allowed, marked as "not_found" |
| Phase 4 (Orchestrator) | Yes | Pipeline halts if assignment validation fails |
| Phase 5 (Writers) | Partially (critical writer) | Critical writer failure halts, others produce warnings |
| Phase 6 (QA) | No | Failure produces warning, documentation still delivered |

### Retry Logic

**Writer Retry (Phase 5):**
- Max 2 retries per failed writer
- Independent retry (doesn't re-run successful writers)
- Critical writer failure after 2 retries → pipeline failure

**Research Retry (Phase 3):**
- Individual question failures don't halt pipeline
- Status marked as "partial" or "not_found"
- Writers use limited research for those questions

---

## Related Documentation

- **[12-DOCWRITER-SCHEMAS.md](12-DOCWRITER-SCHEMAS.md)** - JSON schemas for all pipeline outputs
- **[02-ARCHITECTURE.md](02-ARCHITECTURE.md)** - Relationship between research skill and documentation pipeline
- **[04-API-REFERENCE.md](04-API-REFERENCE.md)** - MCP tools used by research agents
- **[07-PATTERNS.md](07-PATTERNS.md)** - Parallel orchestration patterns
