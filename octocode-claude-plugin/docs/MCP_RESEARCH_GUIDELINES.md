# MCP Research Guidelines

**Purpose:** Comprehensive guide for using octocode-mcp tools effectively for research during planning and implementation.

**Target Audience:** agent-rapid-planner, agent-rapid-planner-implementation, and any agent needing external code patterns.

---

##  Core Principle: Smart Research Until Finding Good Examples

**Don't stop at first result - research until you find quality patterns that actually solve the problem.**

Quality indicators:
- ✅ Repository has >500 stars (proven, community-validated)
- ✅ Code is production-ready (not just proof-of-concept)
- ✅ Patterns match exact requirements (not "close enough")
- ✅ Recent activity (maintained within last 6-12 months)
- ✅ Clear implementation (readable, well-structured code)

---

## 📋 Research Decision Tree

### When to Research

**DO research (thorough, until good examples found):**
- ✅ Unfamiliar framework/stack requested by user
- ✅ Complex architecture patterns (WebSocket + SSE, real-time streaming, microservices)
- ✅ Security-critical implementations (auth, payment, encryption)
- ✅ Performance-critical code (optimization patterns)
- ✅ User explicitly asks "use best practices from X"
- ✅ Novel integrations (combining multiple technologies)

**SKIP research (use existing knowledge):**
- ❌ Common patterns (CRUD, REST API, React hooks, Express routing)
- ❌ Boilerplate already covers it (validated setup commands)
- ❌ Simple applications (todo apps, blogs, basic dashboards)
- ❌ Patterns already in PROJECT_SPEC.md Section 2
- ❌ Standard implementations you're confident about

---

## 🔍 Research Protocol

### Step 1: Check Boilerplate First (Always)

**Resource:** `https://github.com/bgauryy/octocode-mcp/blob/main/resources/boilerplate_cli.md`

**Purpose:** 10x speed boost - don't reinvent setup

**How to use:**
```javascript
// Use Read tool or WebFetch to get boilerplate list
const boilerplates = fetchBoilerplateList();

// Match user requirements to fastest setup
if (userWants === "Next.js + TypeScript + Tailwind") {
  return "npx create-next-app@latest --typescript --tailwind --app";
}
```

**Always include in Research Trace:**
```markdown
### Research Trace

**Boilerplate Selected:**
- Command: `npx create-next-app@latest --typescript --tailwind --app`
- Source: boilerplate_cli.md
- Reason: React SSR + TypeScript + Tailwind = fast modern setup
```

---

### Step 2: Architecture Patterns (If Needed)

**Resource:** `https://github.com/bgauryy/octocode-mcp/tree/main/resources`

**Available patterns:**
- API design (REST, GraphQL, tRPC)
- Authentication & Authorization
- Database patterns (ORM, query builders)
- State management (client-side, server-side)
- Real-time patterns (WebSocket, SSE, polling)
- Testing strategies (unit, integration, e2e)

**How to use:**
```javascript
// Use octocode-mcp tools to explore resources
mcp__octocode-mcp__githubViewRepoStructure({
  owner: "bgauryy",
  repo: "octocode-mcp",
  branch: "main",
  path: "resources",
  depth: 2
});

// Fetch relevant pattern file
mcp__octocode-mcp__githubGetFileContent({
  owner: "bgauryy",
  repo: "octocode-mcp",
  path: "resources/authentication.md",
  branch: "main"
});
```

---

### Step 3: Search Similar Projects (Research Until Good Examples)

**Goal:** Find 2-3 high-quality repositories (>500★) with proven patterns

**Strategy:**

#### A. Repository Search (Find Projects)

```javascript
// Search by topics (most precise)
mcp__octocode-mcp__githubSearchRepositories({
  queries: [{
    topicsToSearch: ["nextjs", "typescript", "authentication"],
    stars: ">500",
    sort: "stars",
    limit: 10,
    researchGoal: "Find Next.js projects with auth implementation",
    reasoning: "Need proven auth patterns for Next.js 14 App Router"
  }]
});

// OR search by keywords (broader)
mcp__octocode-mcp__githubSearchRepositories({
  queries: [{
    keywordsToSearch: ["next.js", "authentication", "JWT"],
    stars: ">1000",
    sort: "stars",
    limit: 5,
    researchGoal: "Find JWT auth implementations",
    reasoning: "User requires JWT-based authentication"
  }]
});
```

**Quality filters:**
- Use `stars: ">500"` for community validation
- Use `updated: ">=2024-01-01"` for recent/maintained projects
- Sort by `"stars"` for popularity or `"updated"` for activity

#### B. Explore Repository Structure

```javascript
// Understand project organization
mcp__octocode-mcp__githubViewRepoStructure({
  queries: [{
    owner: "vercel",
    repo: "next.js",
    branch: "canary",
    path: "examples/with-iron-session",
    depth: 2,
    researchGoal: "Understand Next.js auth example structure",
    reasoning: "Need to see how auth is organized in Next.js projects"
  }]
});
```

**Look for:**
- `/examples/` folders (official examples)
- `/src/auth/` or `/lib/auth/` (auth implementations)
- `/api/` routes (API patterns)
- Configuration files (setup patterns)

#### C. Search Code Patterns

```javascript
// Find specific implementation patterns
mcp__octocode-mcp__githubSearchCode({
  queries: [{
    keywordsToSearch: ["useAuth", "hook", "context"],
    owner: "vercel",
    repo: "next.js",
    path: "examples",
    extension: "tsx",
    limit: 10,
    researchGoal: "Find React auth hook patterns",
    reasoning: "Need reusable auth hook implementation"
  }]
});

// Search across multiple repos
mcp__octocode-mcp__githubSearchCode({
  queries: [{
    keywordsToSearch: ["JWT", "verify", "middleware"],
    extension: "ts",
    stars: ">500",
    limit: 15,
    researchGoal: "Find JWT verification patterns",
    reasoning: "Need secure JWT middleware implementation"
  }]
});
```

**Search strategies:**
- Use specific function/hook names (e.g., "useAuth", "withAuth")
- Filter by extension (ts, tsx, js for code quality)
- Use path to narrow scope (e.g., "src/api" for API patterns)

#### D. Fetch Complete Implementation

```javascript
// Get full context for implementation
mcp__octocode-mcp__githubGetFileContent({
  queries: [{
    owner: "vercel",
    repo: "next.js",
    path: "examples/with-iron-session/lib/auth.ts",
    branch: "canary",
    fullContent: true,
    researchGoal: "Get complete auth implementation",
    reasoning: "Need full code to understand pattern"
  }]
});

// OR get specific sections with context
mcp__octocode-mcp__githubGetFileContent({
  queries: [{
    owner: "vercel",
    repo: "next.js",
    path: "examples/api-routes/pages/api/user.ts",
    branch: "canary",
    matchString: "export default async function handler",
    matchStringContextLines: 10,
    researchGoal: "Get API route handler pattern",
    reasoning: "Need handler implementation with context"
  }]
});
```

---

## 📊 Research Quality Standards

### Must Collect for Each Pattern

1. **Repository Information**
   - Name and URL
   - Star count (for credibility)
   - Last update date (for relevance)
   - Tech stack used

2. **Pattern Details**
   - What problem it solves
   - How it's implemented (key files)
   - Why this approach (trade-offs)
   - Dependencies required

3. **Code Examples**
   - Core implementation (key functions/components)
   - Configuration (if needed)
   - Usage example (how to call it)

### Example Research Summary

```markdown
### Research Trace

**Boilerplate Selected:**
- Command: `npx create-t3-app@latest`
- Source: boilerplate_cli.md
- Reason: Full-stack type-safe (tRPC + Prisma + NextAuth)

**MCP Queries Used:**

1. **githubSearchRepositories:**
   - Query: topics=["nextjs", "trpc", "prisma"], stars=">1000"
   - Found: t3-oss/create-t3-app (23k★), calcom/cal.com (28k★)
   - Selected: create-t3-app (official T3 stack)

2. **githubViewRepoStructure:**
   - Repo: t3-oss/create-t3-app
   - Path: cli/template/base
   - Learned: Project structure with src/server, src/pages/api

3. **githubSearchCode:**
   - Query: keywords=["createTRPCRouter", "protectedProcedure"]
   - Found: 45 examples in t3-oss repos
   - Pattern: Server-side type-safe API with auth

4. **githubGetFileContent:**
   - File: t3-oss/create-t3-app/cli/template/extras/src/server/api/routers/post.ts
   - Pattern: tRPC router with Zod validation

**Reference Repos:**
- t3-oss/create-t3-app (23k★) - T3 Stack template
  - Pattern: tRPC router structure, auth middleware
  - File: src/server/api/routers/example.ts

- calcom/cal.com (28k★) - Production T3 app
  - Pattern: Complex tRPC procedures, error handling
  - File: apps/api/v2/src/modules/auth/auth.guard.ts

**Decisions Made:**
- tRPC over REST: End-to-end type safety, no code generation
- Prisma over Drizzle: Better DX for complex relations
- NextAuth.js: Official Next.js auth, supports multiple providers
```

---

## 🎓 Example Research Workflows

### Workflow 1: Authentication Research

**Scenario:** User wants JWT authentication for Next.js app

```javascript
// Step 1: Check boilerplate
const boilerplate = "npx create-next-app@latest --typescript";

// Step 2: Search repos with auth
mcp__octocode-mcp__githubSearchRepositories({
  queries: [{
    topicsToSearch: ["nextjs", "authentication", "jwt"],
    stars: ">500",
    sort: "stars",
    limit: 5
  }]
});
// Results: next-auth examples, iron-session, custom JWT implementations

// Step 3: Explore best match
mcp__octocode-mcp__githubViewRepoStructure({
  queries: [{
    owner: "vercel",
    repo: "next.js",
    path: "examples/with-iron-session",
    depth: 2
  }]
});
// Found: lib/auth.ts, pages/api/login.ts, middleware.ts

// Step 4: Get implementation
mcp__octocode-mcp__githubGetFileContent({
  queries: [{
    owner: "vercel",
    repo: "next.js",
    path: "examples/with-iron-session/lib/auth.ts",
    fullContent: true
  }]
});
// Got: Session handling, cookie encryption, type definitions

// Step 5: Document in Research Trace
// (See example above)
```

---

### Workflow 2: WebSocket + React Research

**Scenario:** User wants real-time features with WebSocket

```javascript
// Step 1: Search WebSocket patterns
mcp__octocode-mcp__githubSearchCode({
  queries: [{
    keywordsToSearch: ["WebSocket", "useEffect", "React"],
    extension: "tsx",
    stars: ">500",
    limit: 10
  }]
});

// Step 2: Find connection management
mcp__octocode-mcp__githubSearchCode({
  queries: [{
    keywordsToSearch: ["WebSocket", "reconnect", "heartbeat"],
    extension: "ts",
    stars: ">1000",
    limit: 10
  }]
});

// Step 3: Get complete example
mcp__octocode-mcp__githubGetFileContent({
  queries: [{
    owner: "[found-repo]",
    repo: "[found-repo]",
    path: "src/hooks/useWebSocket.ts",
    fullContent: true
  }]
});

// Patterns found:
// - Connection lifecycle management
// - Reconnection with exponential backoff
// - Message queuing
// - Type-safe message handling
```

---

### Workflow 3: State Management Research

**Scenario:** Complex client state needs

```javascript
// Step 1: Compare state libraries
mcp__octocode-mcp__githubSearchRepositories({
  queries: [{
    topicsToSearch: ["zustand"],
    stars: ">1000",
    sort: "stars"
  }, {
    topicsToSearch: ["jotai"],
    stars: ">1000",
    sort: "stars"
  }]
});

// Step 2: Find usage patterns
mcp__octocode-mcp__githubSearchCode({
  queries: [{
    keywordsToSearch: ["create", "zustand", "store"],
    extension: "ts",
    stars: ">500",
    limit: 15
  }]
});

// Step 3: Get real-world examples
mcp__octocode-mcp__githubSearchRepositories({
  queries: [{
    keywordsToSearch: ["dashboard", "admin"],
    topicsToSearch: ["zustand", "react"],
    stars: ">500"
  }]
});
```

---

## ⚠️ Common Mistakes to Avoid

### DON'T:
1. ❌ **Stop at first search result** - Research until finding quality examples
2. ❌ **Use low-star repos** - Unvalidated patterns may have bugs
3. ❌ **Skip code inspection** - Always verify implementation quality
4. ❌ **Ignore recent updates** - Old patterns may be deprecated
5. ❌ **Research common patterns** - CRUD/REST/basic hooks are known
6. ❌ **Copy blindly** - Understand trade-offs before adopting
7. ❌ **Use proof-of-concepts** - Find production-ready code
8. ❌ **Forget to document** - Research Trace is critical for reproducibility

### DO:
1. ✅ **Iterate searches** - Refine queries until finding what you need
2. ✅ **Use star filters** - >500★ for validation, >1000★ for confidence
3. ✅ **Check recent activity** - Updated in last year preferred
4. ✅ **Read actual code** - Don't just trust README
5. ✅ **Compare approaches** - 2-3 examples to see patterns
6. ✅ **Document thoroughly** - Research Trace with sources
7. ✅ **Extract key patterns** - Not entire implementations
8. ✅ **Validate fit** - Does it solve the exact problem?

---

## 📝 Research Trace Template

**Always include in PROJECT_SPEC.md Section 2:**

```markdown
### Research Trace (Decisions & Sources)

**Boilerplate Selected:**
- Command: `[exact CLI command]`
- Source: boilerplate_cli.md
- Reason: [1-line justification]

**MCP Queries Used:** [Skip if no external research done]

1. **Query Type:** [githubSearchRepositories | githubSearchCode | etc.]
   - Query: [describe search]
   - Found: [key results with stars]
   - Selected: [what you chose and why]

2. **Query Type:** [next query]
   - Query: [describe search]
   - Found: [results]
   - Pattern: [what you learned]

**Reference Repos:** [2-3 repos used]
- [repo-name] (stars) - [Brief description]
  - Pattern: [What pattern you extracted]
  - File: [Specific file reference]

**Decisions Made:**
- [Decision]: [Choice made] - [1-line rationale]
- [Decision]: [Choice made] - [1-line rationale]
```

---

## 🚀 Quick Reference Commands

### Search Repositories
```javascript
mcp__octocode-mcp__githubSearchRepositories({
  queries: [{
    topicsToSearch: ["topic1", "topic2"],  // Most precise
    stars: ">500",                          // Quality filter
    sort: "stars",                          // Popularity
    limit: 5
  }]
});
```

### Explore Structure
```javascript
mcp__octocode-mcp__githubViewRepoStructure({
  queries: [{
    owner: "owner",
    repo: "repo",
    branch: "main",
    path: "src",
    depth: 2
  }]
});
```

### Search Code
```javascript
mcp__octocode-mcp__githubSearchCode({
  queries: [{
    keywordsToSearch: ["term1", "term2"],
    extension: "ts",
    stars: ">500",
    limit: 10
  }]
});
```

### Get File Content
```javascript
mcp__octocode-mcp__githubGetFileContent({
  queries: [{
    owner: "owner",
    repo: "repo",
    path: "src/file.ts",
    branch: "main",
    fullContent: true  // or use matchString for sections
  }]
});
```

---

## 📖 Additional Resources

**Boilerplate Reference:**
- https://github.com/bgauryy/octocode-mcp/blob/main/resources/boilerplate_cli.md

**Architecture Patterns:**
- https://github.com/bgauryy/octocode-mcp/tree/main/resources

**Tool Documentation:**
- Review tool schemas in agent files for complete parameter reference
- Use bulk queries (multiple in parallel) for efficiency

---

**Remember:** Research smart until finding good examples. Quality over speed. Document everything for reproducibility.

**Created by Octocode**
