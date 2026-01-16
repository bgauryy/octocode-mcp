---
name: octocode-research
description: Code research for external (GitHub) and local code exploration. Initiate when user wants to research code, implementation, or documentation.
---

# Octocode Research Skill

HTTP API server at `http://localhost:1987`

---

## 1. Server Startup (DO THIS FIRST!)

```bash
# One command handles everything (install, build, start, health check)
./install.sh start

# If already running, it exits cleanly. Always safe to run.
```

**Other commands:**
```bash
./install.sh health   # Quick check if running
./install.sh stop     # Stop server
./install.sh restart  # Restart server
./install.sh logs     # View server logs
```

---

## 2. Load Context (After Server Is Up)

### Discovery Endpoints (no query params needed)
```bash
# System prompt - ALWAYS load first, ADD 'instructions' field to context
curl -s http://localhost:1987/tools/system

# List all available tools with full JSON schemas
curl -s http://localhost:1987/tools/list

# List all available prompts
curl -s http://localhost:1987/prompts/list
```

### Load a Prompt (ADD 'content' field to context)
```bash
curl -s http://localhost:1987/prompts/info/{prompt_name}

# Examples:
curl -s http://localhost:1987/prompts/info/research        # External code research
curl -s http://localhost:1987/prompts/info/research_local  # Local codebase research
curl -s http://localhost:1987/prompts/info/reviewPR        # PR review
curl -s http://localhost:1987/prompts/info/plan            # Implementation planning
curl -s http://localhost:1987/prompts/info/generate        # Scaffold new project
```

**Available prompts:** `research`, `research_local`, `reviewPR`, `plan`, `generate`, `init`, `help`

---

## 3. API Format

**All routes are GET requests** with URL query parameters.

### Required Parameters (on every request)
```
mainResearchGoal=<overall objective>
researchGoal=<this specific query's goal>
reasoning=<why this approach>
```

### Query Format
Most tools use a `queries` array parameter (URL-encoded JSON):

```bash
# GitHub code search
curl -s "http://localhost:1987/github/search?queries=%5B%7B%22keywordsToSearch%22%3A%5B%22useState%22%5D%2C%22owner%22%3A%22facebook%22%2C%22repo%22%3A%22react%22%7D%5D&mainResearchGoal=Find%20useState&researchGoal=Search%20hooks&reasoning=Locate%20implementation"

# Decoded queries param: [{"keywordsToSearch":["useState"],"owner":"facebook","repo":"react"}]
```

### Get Full Schemas
```bash
curl -s http://localhost:1987/tools/list  # Returns all tools with JSON schemas
```

---

## 4. Routes Reference

| Route | Purpose | Key Params |
|-------|---------|------------|
| `/github/search` | Search code in repos | `keywordsToSearch`, `owner`, `repo` |
| `/github/content` | Read file content | `owner`, `repo`, `path`, `matchString` |
| `/github/structure` | View repo tree | `owner`, `repo`, `branch`, `depth` |
| `/github/repos` | Search repositories | `keywordsToSearch`, `topicsToSearch` |
| `/github/prs` | Search pull requests | `owner`, `repo`, `query`, `state` |
| `/package/search` | Search npm/PyPI | `name`, `ecosystem` |
| `/local/search` | Search local code | `pattern`, `path`, `filesOnly` |
| `/local/content` | Read local file | `path`, `matchString` |
| `/local/structure` | View directory tree | `path`, `depth` |
| `/lsp/definition` | Go to definition | `uri`, `symbolName`, `lineHint` |
| `/lsp/references` | Find all usages | `uri`, `symbolName`, `lineHint` |
| `/lsp/calls` | Call hierarchy | `uri`, `symbolName`, `direction` |

---

## 5. Working Examples

### Search GitHub Code
```bash
curl -s "http://localhost:1987/github/search" \
  --get \
  --data-urlencode 'queries=[{"keywordsToSearch":["useState","mountState"],"owner":"facebook","repo":"react"}]' \
  --data-urlencode 'mainResearchGoal=Understand React hooks' \
  --data-urlencode 'researchGoal=Find useState implementation' \
  --data-urlencode 'reasoning=Search for core hook functions'
```

### Read GitHub File
```bash
curl -s "http://localhost:1987/github/content" \
  --get \
  --data-urlencode 'queries=[{"owner":"facebook","repo":"react","path":"packages/react/src/ReactHooks.js","matchString":"function useState","matchStringContextLines":30}]' \
  --data-urlencode 'mainResearchGoal=Understand React hooks' \
  --data-urlencode 'researchGoal=Read useState export' \
  --data-urlencode 'reasoning=Get the public API'
```

### Search Local Code
```bash
curl -s "http://localhost:1987/local/search" \
  --get \
  --data-urlencode 'queries=[{"pattern":"handleAuth","filesOnly":true}]' \
  --data-urlencode 'mainResearchGoal=Understand auth flow' \
  --data-urlencode 'researchGoal=Find auth handlers' \
  --data-urlencode 'reasoning=Locate auth implementation'
```

### Search npm Package
```bash
curl -s "http://localhost:1987/package/search" \
  --get \
  --data-urlencode 'queries=[{"name":"express","ecosystem":"npm"}]' \
  --data-urlencode 'mainResearchGoal=Research Express' \
  --data-urlencode 'researchGoal=Get repo info' \
  --data-urlencode 'reasoning=Find GitHub location'
```

---

## 6. Prompt Selection

**Auto-detect from user intent - only ask if truly ambiguous:**

| Signal | Prompt | Why This Prompt |
|--------|--------|------------------|
| "this codebase", "our code", "my app" | `research_local` | Local filesystem + LSP tools for internal code |
| Package names, "how does X work" | `research` | GitHub search for external libraries |
| PR URLs, "review this PR" | `reviewPR` | Structured review with diff analysis |
| "plan", "design", "strategy" | `plan` | Implementation planning workflow |
| "scaffold", "create new" | `generate` | Project generation templates |

**Internal implementation** (execute silently, don't show URLs to user):
```bash
curl -s http://localhost:1987/prompts/info/{prompt_name}
```

### Decision Flow
```
User Input
    │
    ├─ Contains PR URL? ──────────────────→ reviewPR
    ├─ Contains "plan/design/strategy"? ──→ plan
    ├─ Contains "scaffold/generate/new"? ─→ generate
    ├─ References local code? ────────────→ research_local
    │   ("this codebase", "our", "my", file paths)
    ├─ References external library? ──────→ research
    │   (React, Express, package names, GitHub URLs)
    └─ Ambiguous? ────────────────────────→ ASK user
```

### UX Rules

**Rule 1: Auto-detect, don't ask unnecessarily**
- CLEAR intent → Inform and proceed immediately
- AMBIGUOUS → Ask user to clarify

**Rule 2: Announce prompt selection with reasoning**
- ALWAYS tell the user which prompt you selected
- ALWAYS explain WHY you chose that prompt
- Execute curl commands silently (don't show URLs to user)

```
✅ Good prompt announcement:
"I'll use the **reviewPR** prompt because you provided a GitHub PR URL.
This gives me specialized tools for analyzing diffs, commits, and review comments."
[Then load prompt silently and proceed]

✅ Good prompt announcement:
"Using **research_local** prompt - you're asking about React's internal implementation,
which requires GitHub code search across the facebook/react repository."
[Then load prompt silently and proceed]

❌ Bad: "Loading curl -s http://localhost:1987/prompts/info/reviewPR"
[Shows implementation details, no reasoning]

❌ Bad: [Silently loads prompt without telling user which one or why]
```

**Rule 3: Plan before executing**
- Use TodoWrite to create research steps
- Update todos as you progress
- Gives user visibility into your work

**Rule 4: Show your thinking**
- Share reasoning with the user as you research
- Explain what you're looking for and why
- Narrate discoveries and pivots in your approach

```
✅ Good: "I found the useState hook is defined in ReactHooks.js, but it delegates
   to a dispatcher. Let me trace where the dispatcher is set..."

✅ Good: "The search returned 30 files. I'll focus on ReactFiberHooks.js since
   that's where the core reconciler logic lives..."

✅ Good: "This implementation uses a linked list of hooks - that explains why
   hooks must be called in the same order every render. Let me verify..."

❌ Bad: [Silently makes 10 API calls without explanation]
```

**Rule 5: Human-readable API interactions**
- Describe WHAT you're doing, not the URL
- Group related API calls when explaining
- Focus on the research goal, not implementation details

```
✅ Good: "Searching React's codebase for useState implementation patterns..."
✅ Good: "Reading the hook lifecycle code in ReactFiberHooks.js..."
✅ Good: "Fetching PR #35520 details including diff and review comments..."
✅ Good: "Looking up the express package to find its GitHub repository..."

❌ Bad: Bash(curl -s "http://localhost:1987/github/search" --get --data-urlencode...)
❌ Bad: Showing raw localhost:1987 URLs to the user
❌ Bad: Displaying full curl commands with encoded parameters
```

**Clear signals (proceed immediately):**
| Signal | Action |
|--------|--------|
| "in this codebase" / "our code" / "my app" | Use `research_local` |
| "How does React/Express/lodash..." | Use `research` |
| GitHub PR URL | Use `reviewPR` |
| "plan how to..." / "design a..." | Use `plan` |

**Ambiguous signals (ask user):**
| Signal | Why Ambiguous |
|--------|---------------|
| "Research this feature" | Local or external? |
| "Look into state management" | Their code or a library? |
| "How does X work" (no context) | Unknown if X is local or external |

---

## 7. Research Flow

```bash
# 1. Ensure server is running
./install.sh start

# 2. Load system prompt (ALWAYS do this first)
curl -s http://localhost:1987/tools/system

# 3. Load the appropriate research prompt
curl -s http://localhost:1987/prompts/info/research        # For external code
curl -s http://localhost:1987/prompts/info/research_local  # For local code

# 4. Plan research steps with TodoWrite

# 5. Execute research tools, update todos as you progress

# 6. Summarize findings for user
```

**Tool chaining pattern:**
```
packageSearch → githubViewRepoStructure → githubSearchCode → githubGetFileContent
     ↓                    ↓                      ↓                    ↓
  Get repo           See layout           Find patterns        Read code
```

### Thinking Out Loud

**Narrate your research journey to the user:**

```
"I'll start by finding the React package repository..."
     ↓
"Found facebook/react. Now exploring the package structure..."
     ↓
"The hooks seem to be in packages/react-reconciler/. Searching for useState..."
     ↓
"Found it in ReactFiberHooks.js. The implementation uses mountState for
 initial render and updateState for re-renders. Let me read the details..."
     ↓
"Interesting - useState is actually useReducer with a simple reducer.
 This explains why setState(fn) works. Let me trace the dispatcher..."
```

**Key moments to share reasoning:**
- When you find something relevant → explain what it means
- When you pivot or change approach → explain why
- When you connect dots → share the insight
- When you hit a dead end → explain and try another path

---

## 8. Response Hints

Every API response includes hints to guide next steps:

```json
{
  "mcpHints": ["Use githubGetFileContent to read matched files", "..."],
  "research": {
    "mainResearchGoal": "...",
    "researchGoal": "...",
    "reasoning": "..."
  }
}
```

**Follow these hints** - they tell you what to do next.

---

## 9. Troubleshooting

```bash
# Server not responding?
./install.sh health          # Check status
./install.sh start           # Start if not running
./install.sh logs            # Check for errors

# Port already in use?
lsof -i :1987                # See what's using it
./install.sh stop            # Stop our server
./install.sh restart         # Fresh start

# GitHub API issues?
# Ensure GITHUB_TOKEN is set, or use: gh auth login
```

---

## 10. Quick Reference Card

```
BASE URL:   http://localhost:1987

SERVER:     ./install.sh start|stop|health|logs

DISCOVERY (no params needed):
  GET /health              → Server status
  GET /tools/system        → System prompt (load first!)
  GET /tools/list          → All tools with JSON schemas
  GET /prompts/list        → All available prompts
  GET /prompts/info/{name} → Specific prompt content

RESEARCH TOOLS (use queries array + research params):
  GET /github/search       → Search code in repos
  GET /github/content      → Read file from repo
  GET /github/structure    → View repo tree
  GET /github/repos        → Search repositories
  GET /github/prs          → Search pull requests
  GET /package/search      → Search npm/PyPI
  GET /local/search        → Search local code
  GET /local/content       → Read local file
  GET /local/structure     → View directory tree
  GET /lsp/definition      → Go to definition
  GET /lsp/references      → Find all usages
  GET /lsp/calls           → Call hierarchy

QUERY FORMAT:
  ?queries=[{...}]&mainResearchGoal=...&researchGoal=...&reasoning=...
```
