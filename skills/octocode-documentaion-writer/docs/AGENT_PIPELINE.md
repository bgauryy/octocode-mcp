# Agent Pipeline Execution

> **Review this document to understand the complete agent pipeline with all 7 phases (0-6) and their configurations.**

## Phase 0: Static Analysis Agent

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

> See `references/agent-static-analysis.md` → **Orchestrator Execution Logic** section for full implementation.
> See `docs/ANALYZER.md` for API documentation and type definitions.

---

## Phase 1: Discovery+Analysis Agent

<phase_1_gate>
**GATE: START Phase 1**
**REQUIRED:** Spawn 4 agents in **ONE** message.
**FORBIDDEN:** Sequential calls.
</phase_1_gate>

**Agent Spec**: `references/agent-discovery-analysis.md`
**Task Config**: `schemas/discovery-tasks.json`

| Property | Value |
|----------|-------|
| Parallel Agents | 4 (1a-language, 1b-components, 1c-dependencies, 1d-flows-apis) |
| Critical | Yes |
| Output | `.context/analysis.json` |

> See `references/agent-discovery-analysis.md` → **Orchestrator Execution Logic** section for full implementation.

---

## Phase 2: Engineer Questions Agent

**Agent Spec**: `references/agent-engineer-questions.md`

| Property | Value |
|----------|-------|
| Agent Type | Single (Opus) |
| Critical | Yes |
| Input | `.context/analysis.json` + `.context/static-analysis/static-analysis.json` |
| Output | `.context/questions.json` |
| Uses from static-analysis | `publicAPI`, `exportFlows`, `insights`, `architecture.violations` |

> See `references/agent-engineer-questions.md` → **Orchestrator Execution Logic** section for full implementation.

---

## Phase 3: Research Agent

<phase_3_gate>
**GATE: START Phase 3**
**REQUIRED:** Spawn N agents in **ONE** message.
**FORBIDDEN:** Sequential calls.
</phase_3_gate>

**Agent Spec**: `references/agent-researcher.md`

| Property | Value |
|----------|-------|
| Agent Type | Parallel (Sonnet) |
| Critical | Yes |
| Input | `.context/questions.json` + `.context/static-analysis/static-analysis.json` |
| Output | `.context/research.json` |
| Uses from static-analysis | `exportFlows` (symbol locations), `dependencyUsage`, `moduleGraph.internalDependencies` |

**Research Acceleration**: Researchers use `exportFlows` to find symbol definitions without LSP calls. Check `exportFlows[symbol].definedIn` and `publicAPI[].position` before using `lspGotoDefinition`.

> See `references/agent-researcher.md` → **Orchestrator Execution Logic** section for full implementation.

---

## Phase 4: Orchestrator Agent

**Agent Spec**: `references/agent-orchestrator.md`

| Property | Value |
|----------|-------|
| Agent Type | Single (Opus) |
| Critical | Yes |
| Input | `.context/analysis.json`, `.context/questions.json`, `.context/research.json`, `.context/static-analysis/static-analysis.json` |
| Output | `.context/work-assignments.json` |
| Uses from static-analysis | `architecture.layers`, `files[].role`, `moduleGraph`, `insights.mostImported` |

**Assignment Strategy**: Use `architecture.layers` to group files by layer, `files[].role` for priority (entry > barrel > component), and `moduleGraph` for dependency clustering.

> See `references/agent-orchestrator.md` → **Orchestrator Execution Logic** section for full implementation.

---

## Phase 5: Documentation Writers

<phase_5_gate>
**GATE: START Phase 5**
**REQUIRED:** Spawn all writers in **ONE** message.
**FORBIDDEN:** Sequential calls.
</phase_5_gate>

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

> See `references/agent-documentation-writer.md` → **Orchestrator Execution Logic** section for full implementation.

---

## Phase 6: QA Validator

<phase_6_gate>
**GATE: START Phase 6**
**REQUIRED:** Spawn 4 validators in **ONE** message.
**FORBIDDEN:** Sequential calls.
</phase_6_gate>

**Agent Spec**: `references/agent-qa-validator.md`

| Property | Value |
|----------|-------|
| Agent Type | Parallel (4 Sonnet validators) |
| Parallel Validators | 6A-file-refs, 6B-api-refs, 6C-structure, 6D-coverage |
| Critical | No (failure produces warning) |
| Input | `.context/analysis.json`, `.context/questions.json`, `.context/research.json`, `documentation/*.md`, `.context/static-analysis/static-analysis.json` |
| Output | `.context/qa-results.json`, `documentation/QA-SUMMARY.md` |
| Score Range | 0-100 |
| Quality Ratings | `excellent` (≥90), `good` (≥75), `fair` (≥60), `needs-improvement` (<60) |
| Uses from static-analysis | `publicAPI` (coverage check), `files[]` (path validation), `dependencies` (accuracy check) |

**Automated Validation**: Cross-reference documentation against `static-analysis.json`:
- All `publicAPI` exports documented? → Coverage score
- All file paths in docs exist in `files[]`? → Link validation
- Documented deps match `dependencies.declared`? → Accuracy score

### QA Validator Sub-Agents

| Validator ID | Responsibility | Token Budget |
|--------------|----------------|--------------|
| 6A-file-refs | Verify all file paths in docs exist | ~15k |
| 6B-api-refs | LSP-powered API/function verification | ~25k |
| 6C-structure | Schema compliance & cross-links | ~5k |
| 6D-coverage | Component, flow, question coverage | ~10k |

> See `references/agent-qa-validator.md` → **Orchestrator Execution Logic** section for full implementation.
