---
name: octocode-research
description: Use when answering questions about codebases, implementations, dependencies, or bugs that require evidence from actual code.
---

# Octocode Research

Evidence-first code forensics using Octocode MCP tools.

## The Iron Laws

```
NO CONCLUSIONS WITHOUT CODE EVIDENCE
```

1.  **Code is Truth**: Comments, docs, and variable names lie. Only implementation logic is truth.
2.  **Validate Findings**: Cross-reference findings. Check updated dates (avoid >1yr stale).
3.  **Follow Hints**: Every tool returns hints - follow them. Empty results = wrong query → try semantic variants.

## When to Use

Use for ANY question about code:
- "How does auth work?"
- "Where is the API defined?"
- "Why did this break?"
- "What dependencies does X use?"

## The Research Cycle

```dot
digraph research_cycle {
    rankdir=LR;
    prepare [label="PREPARE\nDefine Goal", shape=box];
    discover [label="DISCOVER\nMap & Search", shape=box];
    analyze [label="ANALYZE\nRead & Trace", shape=box];
    output [label="OUTPUT\nAnswer with Evidence", shape=box];
    
    prepare -> discover;
    discover -> analyze [label="found\nleads"];
    analyze -> discover [label="need\nmore"];
    analyze -> output [label="proven"];
    discover -> prepare [label="dead\nend"];
}
```

### 1. Prepare
Define exact goal. Identify entry point (repo, package, file). Set success criteria.

### 2. Discover
Use cheapest tool first. Start broad.
- **Package?** `packageSearch`
- **Repo?** `githubSearchRepositories`
- **Structure?** `githubViewRepoStructure`
- **Pattern?** `githubSearchCode`

### 3. Analyze
Read actual code. Trace execution flow.
- **Read:** `githubGetFileContent`
- **History:** `githubSearchPullRequests`

### 4. Output
Answer with full GitHub links. Document gaps.

## Red Flags - STOP AND THINK

If you catch yourself thinking these, **STOP**:

- "I assume it works like..." → **Find evidence**
- "It's probably in `src/utils`..." → **Search first**
- "Based on the function name..." → **Read implementation**
- "I'll just guess the path..." → **Use `viewRepoStructure`**
- "3 empty results..." → **Try semantic variants (auth → login)**
- "Too many results..." → **Add filters (path, extension)**

## Common Rationalizations

| Excuse | Reality |
| ------ | ------- |
| "I know how this usually works" | Implementations vary. Assumptions cause hallucinations. |
| "Searching takes too long" | Guessing and being wrong takes longer. |
| "Docs say X" | Docs are often outdated. Code is truth. |
| "I can't find it immediately" | You haven't tried semantic variants yet. |
| "It's a standard pattern" | Standards are often violated or customized. |

## Tool Transitions

| From Tool | Need | Go To |
| --------- | ---- | ----- |
| `githubSearchCode` | Content | `githubGetFileContent` |
| `githubSearchRepositories` | Structure | `githubViewRepoStructure` |
| `packageSearch` | Repo Location | `githubViewRepoStructure` |
| `githubViewRepoStructure` | Find Pattern | `githubSearchCode` |
| `localSearchCode` | Content | `localGetFileContent` |

## Verification Checklist

Before outputting an answer:

- [ ] Every claim has a specific code citation
- [ ] Links are full GitHub URLs (owner/repo/blob/branch/path)
- [ ] Code is from the correct branch/version
- [ ] You have verified the code is not deprecated/dead
- [ ] You have checked for recent changes (last 6 months)

## When Stuck

1.  **Empty Results?** Try synonyms (e.g., `auth` → `credential`, `token`, `login`, `session`).
2.  **Too Many?** Filter by file extension (`extension: "ts"`) or path (`path: "src/"`).
3.  **Lost?** Go back to `githubViewRepoStructure` to understand the map.
4.  **Still Stuck?** Ask the user for context or a specific pointer.

## Resources

- **Tools**: `resources/tool-reference.md` (Parameters & Tips)
- **Workflows**: `resources/workflow-patterns.md` (Recipes)
