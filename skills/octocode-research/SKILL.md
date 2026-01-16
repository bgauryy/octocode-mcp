---
name: octocode-research
description: Code research for external (GitHub) and local code exploration. Initiate when user wants to research code, implementation, or documentation.
---

# Octocode Research Skill

HTTP API server for intelligent code research at `http://localhost:1987`

---

## TL;DR

```
1. Health check     → curl http://localhost:1987/health
2. Load system      → curl http://localhost:1987/tools/system  (ADD to context!)
3. List tools       → curl http://localhost:1987/tools/list
4. List prompts     → curl http://localhost:1987/prompts/list
5. CONFIRM with user → "I'll research using `research_local`. Proceed?"
6. Load prompt      → curl http://localhost:1987/prompts/info/{name}
7. Execute research → Use tools from /tools/list
```

---

## Agent UX Rules

### Rule 1: Confirm Before Research

**ALWAYS ask user before loading a prompt:**

```
User: "How does auth work in this codebase?"

Agent: "I'll investigate using the `research_local` prompt to explore
       your local codebase. This will search for auth-related code,
       trace function calls, and analyze the implementation.

       Proceed with local research?"

       [Yes] [No, use GitHub research] [Other]
```

### Rule 2: Clarify Ambiguous Intent

**If user intent is unclear, ASK before proceeding:**

| Ambiguous Request | Clarify With |
|-------------------|--------------|
| "Research this feature" | "Should I research your **local codebase** or **external GitHub repos**?" |
| "Help me understand X" | "Do you want me to **research X** or **plan an implementation** for X?" |
| "Look into this PR" | "Should I **review the PR** or **research the code** it changes?" |

**Example:**
```
User: "Look into how React handles state"

Agent: "I can help with that! Should I:
       1. `research` - Search GitHub for React's state implementation
       2. `research_local` - Search your local codebase for state patterns

       Which approach?"
```

### Rule 3: Explain What You'll Do

**Before executing, briefly explain:**
```
Agent: "I'll use `research_local` to:
       1. Search for 'auth' patterns in your codebase
       2. Trace function calls using LSP
       3. Read relevant implementations

       Starting research..."
```

---

## Discovery Flow (Order Matters!)

**Before ANY research**, follow this sequence:

```bash
# 1. Health check
curl -s http://localhost:1987/health

# 2. SYSTEM PROMPT FIRST - Load into context immediately!
curl http://localhost:1987/tools/system
# → ADD the 'instructions' field to your context

# 3. List all tools with schemas
curl http://localhost:1987/tools/list

# 4. List all prompts
curl http://localhost:1987/prompts/list

# 5. ⚠️ CONFIRM with user which prompt to use!

# 6. Load selected prompt
curl http://localhost:1987/prompts/info/{selected_prompt}
# → ADD the 'content' field to your context
```

---

## Prompt Selection

| User Intent | Prompt | When to Use |
|-------------|--------|-------------|
| Explore **local codebase** | `research_local` | User asks about their code, local files, workspace |
| Explore **external code** | `research` | User asks about GitHub repos, open source, packages |
| Review a **Pull Request** | `reviewPR` | User shares PR URL or asks for review |
| **Plan** a feature/fix | `plan` | User wants implementation strategy before coding |
| **Generate** a project | `generate` | User wants to scaffold a new project |
| **Initialize** context | `init` | First interaction, setting up preferences |
| **Help** with tools | `help` | User asks "what can you do?" |

---

## Tool Chaining Examples

### Example 1: Understanding a Function (Local)

```
Goal: "How does the auth middleware work?"

Chain:
1. localSearchCode(pattern="authMiddleware", filesOnly=true)
   → Find file locations

2. lspGotoDefinition(uri, symbolName, lineHint)
   → Navigate to definition

3. lspCallHierarchy(direction="incoming")
   → Find all callers

4. localGetFileContent(path, matchString="authMiddleware")
   → Read implementation details
```

### Example 2: Researching a Package (GitHub)

```
Goal: "How does Express handle routing?"

Chain:
1. packageSearch(name="express", ecosystem="npm")
   → Get owner/repo info

2. githubViewRepoStructure(owner, repo, depth=2)
   → Understand project layout

3. githubSearchCode(keywords=["Router", "route"], owner, repo)
   → Find routing implementation

4. githubGetFileContent(owner, repo, path, matchString="Router")
   → Read specific code
```

### Example 3: Impact Analysis (Multi-Tool)

```
Goal: "What would break if I change this function?"

Chain (run in parallel where possible):
1. localSearchCode(pattern="functionName")
   → Get file + line number

2. Parallel:
   - lspFindReferences(uri, symbolName, lineHint)
     → All usages
   - lspCallHierarchy(direction="incoming", depth=2)
     → All callers (transitive)

3. localSearchCode(path="tests/", pattern="functionName")
   → Check test coverage

4. Summarize impact across all results
```

---

## Complex Research Patterns

### Pattern: Local + GitHub Combined

When user needs both local context AND external reference:

```
User: "Compare our auth implementation to best practices"

1. First, research LOCAL:
   → Load `research_local` prompt
   → Find and analyze local auth code

2. Then, research EXTERNAL:
   → Load `research` prompt
   → Search GitHub for auth patterns in similar projects

3. Compare and report findings
```

### Pattern: Research → Plan → Generate

For feature implementation:

```
User: "Add OAuth support to our app"

1. `research_local` → Understand current auth setup
2. `research` → Find OAuth implementation examples
3. `plan` → Create implementation strategy
4. Execute plan with user approval at each step
```

---

## Response Hints

Every API response includes contextual hints:

```yaml
mainResearchGoal: "Your overall objective"
researchGoal: "This specific query's goal"
reasoning: "Why this approach was taken"

# Status-based hints adapt to your results:
hasResultsStatusHints: [...]  # What to do with results
emptyStatusHints: [...]       # How to broaden search
errorStatusHints: [...]       # Recovery strategies
```

**Follow these hints** - they guide your next action.

---

## Research Tools Reference

| Route Group | Purpose | Key Tools |
|-------------|---------|-----------|
| `/local/*` | Local filesystem | `search`, `content`, `find`, `structure` |
| `/lsp/*` | Language Server | `definition`, `references`, `calls` |
| `/github/*` | GitHub API | `search`, `content`, `repos`, `structure`, `prs` |
| `/package/*` | Package registries | `search` (npm/PyPI) |

**Get full schemas:** `curl http://localhost:1987/tools/list`

---

## Key Principles

1. **Confirm intent** before starting research
2. **Load system prompt** first (defines behavior)
3. **Chain tools** logically (search → navigate → analyze → read)
4. **Follow hints** in responses for next steps
5. **Ask when stuck** - clarify with user, don't guess

> **Philosophy**: Discover capabilities dynamically. Let the data guide you.
