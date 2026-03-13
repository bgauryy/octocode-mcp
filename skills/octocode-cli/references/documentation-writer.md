# Documentation Writer

Production-ready documentation generation pipeline using octocode-cli CLI for code analysis.

## When to Use
- User asks to "generate documentation", "document this project", "create docs", "write documentation"
- Needs comprehensive codebase documentation with evidence-backed content

## Overview

6-phase pipeline: Discovery → Questions → Research → Orchestration → Writing → QA

The key insight: use CLI tools to research the codebase deeply before writing any documentation. This produces evidence-backed docs, not guesswork.

## Approach

### Phase 1: Discovery & Analysis

Use CLI tools to understand the codebase:

```bash
# Survey structure
npx -y octocode-cli local-tree --path . --depth 3 --details

# Identify languages and frameworks
npx -y octocode-cli local-find --path . --type f --sort-by size --limit 50

# Find entry points
npx -y octocode-cli local-search --pattern "main\|start\|bootstrap\|createApp" --path ./src --files-only

# Find APIs and exports
npx -y octocode-cli local-search --pattern "export.*function\|app\.(get|post|put|delete)" --path ./src --type ts
```

Analyze: language, architecture, components, dependencies, flows, APIs.

### Phase 2: Engineer Questions

Based on the analysis, generate comprehensive questions a developer would ask:
- How does the system start up?
- What are the key data flows?
- How is authentication handled?
- What are the API endpoints?
- How do components interact?

### Phase 3: Research

Answer each question with evidence from the code:

```bash
# For each question, use the funnel method:
# 1. Search for relevant patterns
npx -y octocode-cli local-search --pattern "authenticate" --path ./src --type ts

# 2. Trace definitions and references
npx -y octocode-cli lsp-definition --uri ./src/auth.ts --symbol-name "authenticate" --line-hint 15
npx -y octocode-cli lsp-call-hierarchy --uri ./src/auth.ts --symbol-name "authenticate" --line-hint 15 --direction incoming

# 3. Read implementation details LAST
npx -y octocode-cli local-file --path ./src/auth.ts --match-string "authenticate" --match-string-context-lines 10
```

### Phase 4: Orchestration

Group questions by documentation target file. Assign exclusive file ownership to avoid conflicts if using parallel agents.

### Phase 5: Documentation Writing

Write documentation files to `documentation/` directory. Core files:
1. Project Overview
2. Architecture Guide
3. Getting Started
4. API Reference
5. Development Guide
6. Configuration Reference
7. Deployment Guide
8. Testing Guide

Each section should reference specific code (file:line) as evidence.

### Phase 6: QA Validation

Verify documentation against the codebase:
- Are file references still valid?
- Are API descriptions accurate?
- Are code examples correct?

## Key Principles

- Research before writing — every claim should have code evidence
- Use `local-search` + LSP tools for deep analysis
- Read code LAST, after search and LSP analysis
- Cite file:line for all code references
- Keep docs focused and navigable
