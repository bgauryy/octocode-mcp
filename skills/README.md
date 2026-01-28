# OctoCode Skills

This folder contains specialized AI agent skills that extend OctoCode's capabilities for specific workflows.

---

## 1. OctoCode Research

**Location:** `octocode-research/`

### What It Does
A deep-dive code exploration and investigation skill that performs systematic codebase analysis using LSP semantic navigation, local tools, and GitHub API. It operates as an expert technical investigator that provides data-driven answers supported by exact file references and line numbers.

### Input
- **Research queries**: Questions like "How does X work?", "Where is Y defined?", "Who calls Z?", "Trace code flow from A to B"
- **Repository path**: Local codebase or external GitHub repository
- **PR URLs**: For pull request review workflows

### Output
- **TL;DR**: Clear summary of findings
- **Detailed Analysis**: In-depth exploration with evidence
- **References**: All citations with file:line format (local) or full GitHub URLs (external)
- **Checkpoint files**: `.octocode/research/{session-id}/` for long research sessions

### When to Use
| Trigger | Example |
|---------|---------|
| "Research code" | "Research how authentication works" |
| "How does X work?" | "How does the payment flow work?" |
| "Where is X defined?" | "Where is the UserService class defined?" |
| "Who calls X?" | "Who calls the validateToken function?" |
| "Trace code flow" | "Trace the request flow from API to database" |
| "Find usages" | "Find all usages of the deprecated API" |
| "Review a PR" | "Review PR #123 in repo X" |
| "Explore this library" | "Explore how React useState works" |

### Key Features
- 5-phase execution: Init → Context → Fast-Path → Plan → Research → Output
- Supports both local (LSP-powered) and external (GitHub API) research
- Parallel agent spawning for multi-domain research
- Automatic checkpointing for long research sessions
- Hint-driven navigation through tool responses

---

## 2. OctoCode Prompt Optimizer

**Location:** `octocode-prompt-optimizer/`

### What It Does
A 10-phase systematic pipeline that transforms weak prompts, SKILL.md files, or agent instructions into reliable, enforceable protocols. It applies prompt engineering best practices including command strengthening, gate injection, tool control, and failure mode analysis.

### Input
- **Prompt file**: Any `.md` file containing agent instructions
- **SKILL.md**: Agent skill definitions
- **AGENTS.md**: Repository-level agent guidelines
- **Documentation**: Any instruction-based document

### Output
- **Optimized document** with:
  - Strong command hierarchy (MUST/NEVER/FORBIDDEN)
  - Gate checkpoints with reflection steps
  - Explicit FORBIDDEN/ALLOWED tool lists
  - XML-structured sections
  - Standardized `{{VARIABLE}}` delimiters
  - Failure mode analysis with recovery paths
- **Summary report**: Issue count, fixes applied, token change

### When to Use
| Trigger | Example |
|---------|---------|
| Creating new agent skills | "Optimize this new SKILL.md" |
| Prompts being ignored | "My agent keeps skipping steps" |
| Agents skip checkpoints | "The agent doesn't follow the gates" |
| Inconsistent output format | "Output varies every time" |
| Reviewing instruction files | "Review this AGENTS.md for weaknesses" |
| Adding enforcement | "Make this prompt more reliable" |

### When NOT to Use
- Prompts under 50 lines → Use Short-form path (Phases 2, 3, 6 only)
- Already-optimized prompts with gates, FORBIDDEN lists, XML tags
- Non-instruction documents (data files, configs, code)

### Key Features
- 10-phase pipeline: Analysis → Audit → Strengthen → Gates → Tools → Format → XML → Delimiters → Failure → Validate
- Command strength hierarchy: NEVER/ALWAYS > STOP/HALT > REQUIRED > should
- Triple Lock Pattern: STATE + FORBID + REQUIRE for critical rules
- Content value guide for removing filler and maximizing density
- Self-critique reflection checkpoints at every gate

---

## 3. OctoCode Documentation Writer

**Location:** `octocode-documentaion-writer/`

### What It Does
A 6-phase documentation generation pipeline that orchestrates multiple AI agents to analyze a codebase and produce comprehensive documentation. It uses intelligent parallel execution, research-first validation, and conflict-free file ownership for efficient, high-quality output.

### Input
- **Repository path**: Path to the codebase to document
- **Existing state**: Optional resume from previous interrupted run

### Output
- **`.context/analysis.json`**: Repository structure, components, dependencies, APIs
- **`.context/questions.json`**: Engineer-generated questions about the codebase
- **`.context/research.json`**: Evidence-backed answers with code traces
- **`.context/work-assignments.json`**: File ownership assignments for writers
- **`documentation/*.md`**: 16 core documentation files (5 required + supplementary)
- **`documentation/QA-SUMMARY.md`**: Quality validation report with scores

### When to Use
| Trigger | Example |
|---------|---------|
| New repository needs docs | "Generate documentation for this project" |
| Documentation is outdated | "Update the documentation" |
| Onboarding new developers | "Create docs to help new devs understand the codebase" |
| Comprehensive coverage needed | "Document all APIs and flows" |
| Quality validation required | "Generate docs with QA validation" |

### Key Features
- **6 Phases**:
  1. **Discovery+Analysis**: 4 parallel agents analyze language, components, dependencies, flows
  2. **Engineer Questions**: Generates comprehensive questions based on analysis
  3. **Research**: Deep-dive code forensics to answer questions with evidence
  4. **Orchestrator**: Assigns exclusive file ownership to prevent conflicts
  5. **Documentation Writers**: 1-8 parallel writers with exclusive file ownership
  6. **QA Validator**: LSP-powered verification with quality scores (0-100)

- **True Parallel Execution**: Phases 1, 3, 5 spawn ALL agents in a single message
- **Evidence-Based Writing**: Research phase proves answers before documentation
- **Conflict-Free**: Orchestrator assigns exclusive file ownership per writer
- **State Recovery**: Resume from any phase if interrupted
- **Dynamic Scaling**: Agent count scales based on question volume

---

## Quick Reference

| Skill | Purpose | Key Input | Key Output |
|-------|---------|-----------|------------|
| **Research** | Deep code exploration | Query + repo path | Analysis with file:line refs |
| **Prompt Optimizer** | Improve agent instructions | Prompt/SKILL.md file | Optimized, enforceable document |
| **Documentation Writer** | Generate repo documentation | Repository path | 16+ documentation files + QA report |

---

## Installation

These skills are designed to work with the OctoCode MCP server. Ensure the server is running before using any skill:

```bash
# From the skill directory
npm run server-init
```

For detailed usage, refer to each skill's `SKILL.md` file.
