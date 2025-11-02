# Octocode-MCP Quick Start Guide

Get up and running with Octocode-MCP in 5 minutes!

## 1. Installation

```bash
npm install octocode-mcp
# or
yarn add octocode-mcp
```

## 2. Setup GitHub Token

Create a GitHub Personal Access Token:

1. Go to https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Select scopes:
   - `repo` (Full control of private repositories)
   - `read:org` (Read organization data)
   - `read:user` (Read user profile data)
4. Generate and copy the token

Create `.env` file:

```bash
GITHUB_TOKEN=ghp_your_token_here
```

## 3. Run the Server

```bash
octocode-mcp
```

The server will start and connect via stdio transport.

## 4. Basic Usage Examples

### Example 1: Find React Hook Implementations

```typescript
// Tool: githubSearchCode
{
  keywordsToSearch: ["useEffect", "useState"],
  owner: "facebook",
  repo: "react",
  extension: "js",
  path: "packages/react/src",
  limit: 10
}
```

### Example 2: Discover MCP Projects

```typescript
// Tool: githubSearchRepositories
{
  topicsToSearch: ["mcp", "model-context-protocol"],
  stars: ">50",
  sort: "stars",
  limit: 5
}
```

### Example 3: Read Package Configuration

```typescript
// Tool: githubGetFileContent
{
  owner: "facebook",
  repo: "react",
  path: "package.json",
  fullContent: true
}
```

### Example 4: Explore Repository Structure

```typescript
// Tool: githubViewRepoStructure
{
  owner: "facebook",
  repo: "react",
  branch: "main",
  path: "packages",
  depth: 2
}
```

### Example 5: Find Recent Bug Fix PRs

```typescript
// Tool: githubSearchPullRequests
{
  owner: "facebook",
  repo: "react",
  state: "closed",
  merged: true,
  label: "bug",
  sort: "updated",
  limit: 5
}
```

## 5. Bulk Operations (Power User)

Process multiple related queries in one request:

```typescript
{
  queries: [
    {
      keywordsToSearch: ["authentication", "login"],
      extension: "ts",
      path: "src/auth",
      researchGoal: "Find auth implementation",
      reasoning: "Exploring authentication patterns"
    },
    {
      keywordsToSearch: ["middleware", "interceptor"],
      extension: "ts",
      path: "src/middleware",
      researchGoal: "Find middleware logic",
      reasoning: "Understanding request flow"
    },
    {
      keywordsToSearch: ["validation", "schema"],
      extension: "ts",
      path: "src/utils",
      researchGoal: "Find validation patterns",
      reasoning: "Checking input validation"
    }
  ]
}
```

**Benefits:**
- 3-5x faster execution
- Better context for AI reasoning
- Comprehensive results in one request

## 6. Common Workflows

### Workflow 1: Exploring New Technology

```
1. githubSearchRepositories (topicsToSearch)
   → Discover relevant projects

2. githubViewRepoStructure (depth: 1)
   → Understand project organization

3. githubSearchCode (path filter)
   → Find specific implementations

4. githubGetFileContent (matchString)
   → Read detailed code sections
```

### Workflow 2: Finding Implementation Patterns

```
1. githubSearchCode (match: 'path')
   → Discover files by name pattern

2. githubSearchCode (match: 'file')
   → Find specific code patterns

3. githubGetFileContent (startLine/endLine)
   → Read relevant sections

4. githubSearchPullRequests
   → See related changes and discussions
```

### Workflow 3: Analyzing Production Code

```
1. githubSearchRepositories (stars: ">1000")
   → Find popular projects

2. githubSearchPullRequests (merged: true)
   → Analyze production changes

3. githubGetFileContent (withContent: true)
   → Review diffs and implementations
```

## 7. Tips for Better Results

### Search Strategy

✅ **DO:**
- Use topics for discovery (`topicsToSearch`)
- Apply filters early (`path`, `extension`)
- Use bulk operations for related queries
- Start broad, then narrow down
- Include `researchGoal` and `reasoning`

❌ **DON'T:**
- Use very generic keywords alone
- Fetch full content unnecessarily
- Ignore empty result hints
- Skip authentication checks

### Performance Optimization

1. **Prefer `matchString` over `fullContent`**
   ```typescript
   {
     path: "src/index.ts",
     matchString: "export function",
     matchStringContextLines: 10
   }
   ```

2. **Use line ranges for known locations**
   ```typescript
   {
     path: "package.json",
     startLine: 1,
     endLine: 30
   }
   ```

3. **Filter by path and extension**
   ```typescript
   {
     keywordsToSearch: ["API"],
     path: "src/api",
     extension: "ts"
   }
   ```

4. **Set reasonable limits**
   ```typescript
   {
     keywordsToSearch: ["config"],
     limit: 10  // Instead of 100
   }
   ```

## 8. Error Handling

### Rate Limit Error
```
Error: API rate limit exceeded
```
**Solution:** Wait for reset time or authenticate with higher limits

### Authentication Error
```
Error: Bad credentials
```
**Solution:** Verify GITHUB_TOKEN in `.env` file

### Empty Results
```
Status: empty
```
**Solution:** Check hints in response:
- Try broader search terms
- Remove restrictive filters
- Verify repository exists
- Check permissions

## 9. Debugging

### Enable Logging

```bash
ENABLE_LOGGING=true octocode-mcp
```

### Use MCP Inspector

```bash
yarn debug
```

This opens an interactive debugger to inspect:
- Tool calls and responses
- Server logs
- Performance metrics

### Check Cache Stats

The server tracks cache performance internally. Review logs to see:
- Cache hits/misses
- Total cached keys
- Cache efficiency

## 10. Next Steps

- Read full [DOCUMENTATION.md](./DOCUMENTATION.md) for detailed API reference
- Explore the codebase for more implementation examples
- Check [tests/](../tests/) for test patterns
- Review [ARCHITECTURE.md](./ARCHITECTURE.md) for system design

## Common Patterns

### Pattern: Progressive Search

```typescript
// 1. Broad discovery
{ topicsToSearch: ["react", "hooks"] }

// 2. Narrow by quality
{ topicsToSearch: ["react", "hooks"], stars: ">1000" }

// 3. Specific implementation
{ keywordsToSearch: ["useEffect"], owner: "facebook", repo: "react" }

// 4. Read code
{ owner: "facebook", repo: "react", path: "...", matchString: "useEffect" }
```

### Pattern: Multi-Repository Analysis

```typescript
{
  queries: [
    {
      keywordsToSearch: ["authentication"],
      owner: "vercel",
      repo: "next.js",
      path: "packages/next-auth"
    },
    {
      keywordsToSearch: ["authentication"],
      owner: "supabase",
      repo: "supabase",
      path: "packages/auth"
    },
    {
      keywordsToSearch: ["authentication"],
      owner: "lucia-auth",
      repo: "lucia",
      path: "packages/lucia"
    }
  ]
}
```

### Pattern: Feature Research

```typescript
// Step 1: Find repositories implementing the feature
{
  topicsToSearch: ["graphql", "code-generator"],
  stars: ">500"
}

// Step 2: Explore structure
{
  owner: "dotansimha",
  repo: "graphql-code-generator",
  branch: "master",
  path: "",
  depth: 2
}

// Step 3: Find implementation
{
  keywordsToSearch: ["codegen", "generator"],
  owner: "dotansimha",
  repo: "graphql-code-generator",
  path: "packages/graphql-codegen-core"
}

// Step 4: Read specific code
{
  owner: "dotansimha",
  repo: "graphql-code-generator",
  path: "packages/graphql-codegen-core/src/codegen.ts",
  matchString: "export function generate"
}
```

---

**Happy Coding! 🚀**

For questions or issues, visit: https://github.com/bgauryy/octocode-mcp/issues

