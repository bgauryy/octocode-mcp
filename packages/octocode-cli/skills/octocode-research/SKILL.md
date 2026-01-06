---
name: octocode-research
description: Answers questions about codebases, implementations, dependencies, or bugs using evidence from actual code. Use when researching code, debugging issues, understanding implementations, tracing dependencies, or exploring unfamiliar codebases.
---

# Octocode Research

Evidence-first code forensics using Octocode MCP tools.

## The Iron Laws

```
NO CONCLUSIONS WITHOUT CODE EVIDENCE
```

1. **Code is Truth**: Comments, docs, and variable names lie. Only implementation logic is truth.
2. **Validate Findings**: Cross-reference findings. Check updated dates (avoid >1yr stale).
3. **Follow Hints**: Every tool returns hints - follow them. Empty results = wrong query → try semantic variants.

## When to Use

Use for ANY question about code:
- "How does auth work?"
- "Where is the API defined?"
- "Why did this break?"
- "What dependencies does X use?"

## Tools

**GitHub Tools**:
| Tool | Purpose |
|------|---------|
| `packageSearch` | Package metadata, versions, repo location |
| `githubSearchRepositories` | Discover repos by topics, stars, activity |
| `githubViewRepoStructure` | Explore directory layout and file sizes |
| `githubSearchCode` | Find patterns, implementations, file paths |
| `githubGetFileContent` | Read file content with `matchString` targeting |
| `githubSearchPullRequests` | Fetch PR metadata, diffs, comments, history |

**Local Tools**:
| Tool | Purpose | Replaces |
|------|---------|----------|
| `localViewStructure` | Explore directories with sorting/depth/filtering | `ls`, `tree` |
| `localSearchCode` | Fast content search with pagination & hints | `grep`, `rg` |
| `localFindFiles` | Find files by metadata (name/time/size) | `find` |
| `localGetFileContent` | Read file content with targeting & context | `cat`, `head` |

## Local-First Strategy

**ALWAYS prefer local tools over shell commands** for workspace exploration:

| Instead of... | Use... | Why Better |
|---------------|--------|------------|
| `grep`, `rg` | `localSearchCode` | Structured results, pagination, hints, byte offsets |
| `ls`, `tree` | `localViewStructure` | Filtering, sorting, depth control, summaries |
| `find` | `localFindFiles` | Time/size/permission filters, pagination |
| `cat`, `head` | `localGetFileContent` | matchString targeting, context lines, pagination |

**Local-First Research**:
1. **Start Local**: Use local tools to understand workspace context before GitHub research
2. **Understand Dependencies**: Check `package.json`, imports, local configs first
3. **Inspect node_modules**: Use `localSearchCode(path="node_modules/pkg", noIgnore=true)` to understand dependency internals
4. **Cross-Reference**: Compare local implementations with upstream GitHub repos

**node_modules Inspection**:
- Local tools respect `.gitignore` by default — use `noIgnore=true` to search inside `node_modules`
- Useful for: debugging dependency behavior, understanding library internals, finding undocumented APIs
- Example: `localSearchCode(pattern="createContext", path="node_modules/react", noIgnore=true)`

## When to Use Local vs GitHub

| Scenario | Use Local | Use GitHub |
|----------|-----------|------------|
| Current workspace code | ✅ | |
| Dependency source code | ✅ (node_modules) | ✅ (canonical) |
| External library research | | ✅ |
| PR history / blame | | ✅ |
| Package discovery | | ✅ (packageSearch) |
| Cross-repo patterns | | ✅ |

## The Research Cycle

```
PREPARE → DISCOVER → ANALYZE → OUTPUT
    ↑         ↓          ↓
    └── dead end ←── need more
```

### 1. Prepare
Define exact goal. Identify entry point (repo, package, file). Set success criteria.

### 2. Discover
Use cheapest tool first. Start broad.
- **Local Structure?** `localViewStructure`
- **Local Pattern?** `localSearchCode`
- **Package?** `packageSearch`
- **Remote Repo?** `githubSearchRepositories`

### 3. Analyze
Read actual code. Trace execution flow.
- **Local Read:** `localGetFileContent`
- **Remote Read:** `githubGetFileContent`
- **History:** `githubSearchPullRequests`

### 4. Output
Answer with full file paths or GitHub links. Document gaps.

## Tool Transitions

**Local Transition Matrix**:
| From Tool | Need... | Go To Tool |
|-----------|---------|------------|
| `localViewStructure` | Find Pattern | `localSearchCode` |
| `localViewStructure` | File Content | `localGetFileContent` |
| `localSearchCode` | Context/Content | `localGetFileContent` |
| `localSearchCode` | More Patterns | `localSearchCode` (refine) |
| `localSearchCode` | Upstream Source | `packageSearch` → GitHub tools |
| `localFindFiles` | File Content | `localGetFileContent` |
| `localGetFileContent` | More Context | `localGetFileContent` (widen) |
| `localGetFileContent` | Trace Import | `localSearchCode` or GitHub |

**GitHub Transition Matrix**:
| From Tool | Need... | Go To Tool |
|-----------|---------|------------|
| `githubSearchCode` | Content | `githubGetFileContent` |
| `githubSearchRepositories` | Structure | `githubViewRepoStructure` |
| `packageSearch` | Repo Location | `githubViewRepoStructure` |
| `githubViewRepoStructure` | Find Pattern | `githubSearchCode` |
| `githubGetFileContent` | More Context | `githubGetFileContent` (widen) |

**Cross-Domain Transitions** (Local ↔ GitHub):
| From | Need... | Go To |
|------|---------|-------|
| Local code | Upstream implementation | `packageSearch` → GitHub tools |
| Local node_modules | Canonical source | `githubGetFileContent` (same path) |
| GitHub finding | Local usage | `localSearchCode` (same pattern) |
| GitHub PR | Local impact | `localSearchCode` (changed files) |

## Red Flags - STOP AND THINK

If you catch yourself thinking these, **STOP**:

- "I assume it works like..." → **Find evidence**
- "It's probably in `src/utils`..." → **Search first**
- "Based on the function name..." → **Read implementation**
- "I'll just guess the path..." → **Use structure tools first**
- "3 empty results..." → **Try semantic variants (auth → login)**
- "Too many results..." → **Add filters (path, extension, type)**

## Safety

- **Paths**: Within workspace (relative or absolute)
- **Sensitive paths**: `.git`, `.env*`, credentials filtered automatically
- **UTF-8**: `location.charOffset/charLength` are BYTE offsets (ripgrep)
- **Pagination**: Use `charLength` windows ~1000–4000; use `charOffset` to step

## Verification Checklist

Before outputting an answer:

- [ ] Every claim has a specific code citation
- [ ] File paths or GitHub URLs are complete
- [ ] Code is from the correct branch/version
- [ ] You have verified the code is not deprecated/dead
- [ ] You have checked for recent changes

## When Stuck

1. **Empty Results?** Try synonyms (e.g., `auth` → `credential`, `token`, `login`, `session`).
2. **Too Many?** Filter by extension (`type: "ts"`) or path (`path: "src/"`).
3. **Lost?** Go back to structure tools to understand the map.
4. **Loop (3+ no-progress)?** Refine or switch tools; after 5 → ask user.

## References

- **Tools**: `references/tool-reference.md` (Parameters & Tips)
- **Workflows**: `references/workflow-patterns.md` (Recipes)
