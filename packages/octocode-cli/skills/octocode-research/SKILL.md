---
name: octocode-research
description: Use when researching codebases, tracing implementations, understanding dependencies, investigating bugs, or answering "how does X work" questions requiring evidence from code.
---

# Octocode Research

Evidence-first code forensics using Octocode MCP tools.

## Iron Laws

```
1. NO CONCLUSIONS WITHOUT CODE EVIDENCE
   Every claim cites actual source code with full GitHub links.

2. VALIDATE BEFORE TRUSTING
   Cross-reference findings. Check updated dates (avoid >1yr stale).

3. FOLLOW THE HINTS
   Every tool returns hints - follow them.
   Empty results = wrong query → try semantic variants.
```

## Required Fields

Every Octocode tool call MUST include:
```yaml
mainResearchGoal: "Overall objective"
researchGoal: "This query's target"
reasoning: "Why this helps"
```

## Four Phases

```
PREPARE → DISCOVER → ANALYZE → OUTPUT
```

| Phase | Actions |
|-------|---------|
| **PREPARE** | Define goal, identify entry point, set success criteria |
| **DISCOVER** | Use cheapest tool first, start broad, narrow based on results |
| **ANALYZE** | Read actual code, trace flow, map dependencies |
| **OUTPUT** | Answer with evidence, document gaps, ask next steps |

## Tool Selection

| Need | Tool |
|------|------|
| Package → Repo | `packageSearch` |
| Find Repos | `githubSearchRepositories` |
| Map Structure | `githubViewRepoStructure` |
| Find Patterns | `githubSearchCode` |
| Read Code | `githubGetFileContent` |
| History/Why | `githubSearchPullRequests` |
| Local: Structure | `local_view_structure` |
| Local: Search | `local_ripgrep` |
| Local: Read | `local_fetch_content` |
| Local: Metadata | `local_find_files` |

## Transitions

```
FROM                     → NEED          → GO TO
githubSearchCode         → Content       → githubGetFileContent
githubSearchRepositories → Structure     → githubViewRepoStructure
packageSearch            → Repo          → githubViewRepoStructure
githubViewRepoStructure  → Pattern       → githubSearchCode
local_ripgrep            → Content       → local_fetch_content
```

## Red Flags

- "I assume..." → Find evidence
- "Probably in..." → Search first
- "Based on naming..." → Read implementation
- "3 empty results" → Try semantic variants
- "Too many results" → Add filters

## Semantic Variants

| Term | Try Also |
|------|----------|
| auth | login, security, credentials, token |
| config | settings, options, env |
| error | exception, failure, fault |
| create | add, insert, new, generate |

## Output Format

```markdown
# Research: [Goal]

## TL;DR
[1-2 sentence answer]

## Evidence
[Code citations with full GitHub links]

## Gaps
[What remains uncertain]
```

## Resources

- `resources/tool-reference.md` - Complete tool parameters
- `resources/workflow-patterns.md` - Common research flows

---
*<160 lines. See resources/ for details.*

