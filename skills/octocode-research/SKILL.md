---
name: octocode-research
description: Code research for external (GitHub) and local code exploration. Initiate when user wants to research code, implementation, or documentation.
---

# Octocode Research Skill

HTTP API server for intelligent code research at `http://localhost:1987`

---

## TL;DR

```
0. ENSURE SERVER RUNNING (REQUIRED FIRST!)
   → curl -s http://localhost:1987/health || ./install.sh start
   → If health fails, START the server before anything else!

1. Health check     → curl http://localhost:1987/health
2. Load system      → curl http://localhost:1987/tools/system  (ADD to context!)
3. List tools       → curl http://localhost:1987/tools/list
4. List prompts     → curl http://localhost:1987/prompts/list
5. AUTO-DETECT prompt from user intent (see Prompt Selection)
   → If CLEAR: Inform user "I'll use {{PROMPT_NAME}} to {{user research intention}}"
   → If AMBIGUOUS: Ask user to clarify
6. Load prompt      → curl http://localhost:1987/prompts/info/{name}
7. PLAN research    → Use TodoWrite to create research plan with steps
8. Execute research → Use tools from /tools/list, update todos as you progress
```

---

## Agent UX Rules

### Rule 1: Auto-Detect Prompt from User Intent

**Analyze user input and automatically select the right prompt. DON'T ask unless truly ambiguous.**

**CLEAR intent → Inform and proceed:**
```
User: "How does auth work in this codebase?"

Agent: "I'll use `research_local` to explore your local codebase for auth patterns,
       trace function calls, and analyze the implementation.

       Starting research..."

       [Proceeds immediately - no question needed]
```

```
User: "How does React implement useState?"

Agent: "I'll use `research` to explore React's GitHub repository and find
       the useState implementation in the hooks source code.

       Starting research..."

       [Proceeds immediately - "React" is external, clear signal]
```

### Rule 2: Ask ONLY When Genuinely Ambiguous

**Only ask when multiple prompts could reasonably apply:**

| Ambiguous Signal | Why It's Ambiguous | Ask |
|------------------|-------------------|-----|
| "Research this feature" | No context - local or external? | ✅ Ask |
| "Look into state management" | Could be their code or a library | ✅ Ask |
| "How does X work" + no context | Unknown if X is local or external | ✅ Ask |

**Clear Signals - DON'T ask:**

| Clear Signal | Auto-Select | Why |
|--------------|-------------|-----|
| "in this codebase" / "in my code" / "our implementation" | `research_local` | Explicit local reference |
| "in React" / "how does Express..." / package names | `research` | External library/framework |
| PR URL like `github.com/.../pull/123` | `reviewPR` | PR URL is unambiguous |
| "plan how to..." / "design a..." | `plan` | Planning intent clear |
| "scaffold" / "create new project" | `generate` | Generation intent clear |

**Example of asking (genuinely ambiguous):**
```
User: "Research the authentication flow"

Agent: "I can research authentication in two ways:
       1. `research_local` - Explore YOUR codebase's auth implementation
       2. `research` - Find auth patterns in external GitHub repos

       Which would you like?"
```

### Rule 3: Inform, Then Execute

**When intent is clear, briefly state what you'll do and START immediately:**

```
Agent: "I'll use `research_local` to:
       • Search for 'auth' patterns in your codebase
       • Trace function calls using LSP
       • Analyze the implementation

       Starting research..."

       [Immediately begins tool calls - no waiting for confirmation]
```

**Key difference from asking:**
- ❌ "Proceed with local research?" → Unnecessary friction
- ✅ "Starting research..." → Confident, efficient

### Rule 4: Plan Before Executing

**After selecting the prompt, create a research plan using TodoWrite:**

```
Agent: "I'll use `research` to explore React's useState implementation.

       Research plan:
       1. Search for useState in React's packages
       2. Find the hooks source files
       3. Trace the implementation flow
       4. Analyze state update mechanism

       Starting research..."

       [Uses TodoWrite to track these steps]
```

**Why plan?**
- Gives user visibility into research progress
- Keeps research focused and organized
- Enables tracking of multi-step investigations
- Shows clear progress as steps complete

---

## Server Startup (MUST DO FIRST!)

**⚠️ CRITICAL: The server MUST be running before any API calls!**

### Step 1: Check if server is running

```bash
curl -s --connect-timeout 3 http://localhost:1987/health
```

**If health check succeeds** (returns JSON with `"status": "ok"`):
→ Server is running, proceed to Discovery Flow

**If health check fails** (exit code 7, connection refused, or timeout):
→ Server is NOT running, you MUST start it first!

### Step 2: Start server if not running

```bash
# Navigate to the skill directory and start the server
cd skills/octocode-research && ./install.sh start
```

Or using the full path:
```bash
/path/to/octocode-mcp/skills/octocode-research/install.sh start
```

The install script will:
- Check requirements (Node.js 20+)
- Install dependencies if needed
- Build the server if needed
- Start the server in background on port 1987
- Wait until server is healthy before returning

### Step 3: Verify server is ready

```bash
curl -s http://localhost:1987/health
```

Expected response:
```json
{"status": "ok", "port": 1987, "version": "2.0.0"}
```

**Only proceed to Discovery Flow once health check passes!**

---

## Discovery Flow (Order Matters!)

**Before ANY research**, follow this sequence:

```bash
# 0. FIRST - Ensure server is running (see "Server Startup" section above)
curl -s --connect-timeout 3 http://localhost:1987/health || echo "SERVER NOT RUNNING - Start it first!"

# 1. Health check (should pass if step 0 succeeded)
curl -s http://localhost:1987/health

# 2. SYSTEM PROMPT FIRST - Load into context immediately!
curl http://localhost:1987/tools/system
# → ADD the 'instructions' field to your context

# 3. List all tools with schemas
curl http://localhost:1987/tools/list

# 4. List all prompts
curl http://localhost:1987/prompts/list

# 5. AUTO-DETECT prompt from user intent (see Prompt Selection section)
#    → If clear intent: Inform user and proceed
#    → If ambiguous: Ask user to clarify

# 6. Load selected prompt
curl http://localhost:1987/prompts/info/{selected_prompt}
# → ADD the 'content' field to your context
```

---

## Prompt Selection

### Quick Reference

| Prompt | Use When | Signal Keywords |
|--------|----------|-----------------|
| `research_local` | Explore local codebase | "this codebase", "my code", "our", "here", file paths |
| `research` | Explore external code | Package names (React, Express), "how does X work", GitHub URLs |
| `reviewPR` | Review a Pull Request | PR URLs, "review this PR", "check this pull request" |
| `plan` | Plan implementation | "plan", "design", "how should I", "strategy for" |
| `generate` | Scaffold new project | "scaffold", "create new", "generate", "bootstrap" |
| `init` | Initialize context | First interaction, "set up", "configure" |
| `help` | Explain capabilities | "what can you do", "help", "how do I use" |

### Signal Detection Guide

**`research_local`** - Local codebase exploration:
```
✅ "How does auth work in this codebase?"
✅ "Find where UserService is used"
✅ "What calls the handleSubmit function?"
✅ "Explain our payment implementation"
✅ "Search for error handling in src/"

Signals: "this", "our", "my", "here", relative paths, local file references
```

**`research`** - External GitHub/package exploration:
```
✅ "How does React implement useState?"
✅ "How does Express handle middleware?"
✅ "Find examples of OAuth in popular repos"
✅ "What's the implementation of lodash.debounce?"

Signals: Known package/library names, "how does [library] work", external GitHub URLs
```

**`reviewPR`** - Pull request review:
```
✅ "Review https://github.com/org/repo/pull/123"
✅ "Check this PR: [URL]"
✅ "Review the changes in PR #456"

Signals: PR URLs, "review", "PR", "pull request" + number/URL
```

**`plan`** - Implementation planning:
```
✅ "Plan how to add authentication"
✅ "Design a caching strategy"
✅ "How should I implement dark mode?"

Signals: "plan", "design", "strategy", "how should I", "approach for"
```

### Decision Flow

```
User Input
    │
    ▼
┌─────────────────────────────────────┐
│ Contains PR URL?                    │──Yes──▶ `reviewPR`
└─────────────────────────────────────┘
    │ No
    ▼
┌─────────────────────────────────────┐
│ Contains "plan/design/strategy"?    │──Yes──▶ `plan`
└─────────────────────────────────────┘
    │ No
    ▼
┌─────────────────────────────────────┐
│ Contains "scaffold/generate/new"?   │──Yes──▶ `generate`
└─────────────────────────────────────┘
    │ No
    ▼
┌─────────────────────────────────────┐
│ References local code?              │──Yes──▶ `research_local`
│ ("this", "our", "my", paths)        │
└─────────────────────────────────────┘
    │ No
    ▼
┌─────────────────────────────────────┐
│ References external library/repo?   │──Yes──▶ `research`
│ (React, Express, GitHub URLs)       │
└─────────────────────────────────────┘
    │ No
    ▼
┌─────────────────────────────────────┐
│ AMBIGUOUS - Ask user to clarify     │
│ "Local codebase or external repos?" │
└─────────────────────────────────────┘
```

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

## Troubleshooting

### Server not responding (exit code 7)
```bash
# Check if server is running
lsof -i :1987

# If nothing on port, start the server
cd skills/octocode-research && ./install.sh start

# If something else on port, check what
lsof -i :1987
# May need to kill that process first
```

### Server crashes after health check passes
- Possible token issue - check GITHUB_TOKEN is set
- Run `./install.sh logs` to see error messages
- Try `./install.sh restart` to reset state
