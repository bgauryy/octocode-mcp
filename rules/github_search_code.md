# GitHub Code Search Tool - Operation Logic & Design

> **Purpose**: This document defines the core logic and operation of the GitHub code search tool. It serves as the definitive reference for maintaining consistency across AI changes and ensures the tool's intelligent behavior is preserved.

## 🎯 Core Philosophy

**Progressive Refinement Strategy**: Start broad → analyze results → narrow systematically → achieve precision

The tool operates on the principle that effective code search requires a systematic approach rather than guessing at specific terms. Users begin with broad, single-term searches that cast a wide net across repositories, then progressively narrow their focus based on what they discover.

**Base Search Logic Check**: ✅ This maintains the core principle that broad discovery precedes targeted searching.

## 🔥 POWERFUL INTEGRATION: Search → Fetch Workflow

**NEW: Smart Match Finding with File Fetch**

The code search tool now integrates seamlessly with `github_fetch_content` through the new `matchString` parameter:

### The Perfect Research Workflow
```typescript
// Step 1: Search broadly to find interesting matches
const searchResults = await githubSearchCode({
  queryTerms: ["render"],
  owner: "facebook"
});

// Step 2: Extract promising results
const match = searchResults.find(r => r.path.includes("reconciler"));
// Result: { repository: "facebook/react", path: "src/ReactFiber.js", matches: ["function render() {"] }

// Step 3: Get full context using matchString
const fileContent = await githubGetFileContent({
  owner: "facebook", 
  repo: "react",
  branch: "main",
  filePath: "src/ReactFiber.js",
  matchString: "function render() {" // 🔥 Automatically finds and extracts context!
});
```

### Key Benefits
- **No Line Number Guessing**: matchString automatically finds the exact location
- **Full Context**: Gets untruncated code around the match with proper line numbers  
- **Handles Changes**: If file changed since search, provides helpful error message
- **Multi-Match Awareness**: Reports if string appears multiple times, uses first occurrence

**Integration Check**: ✅ This creates an intelligent research pipeline that eliminates manual work.

## 🔄 Progressive Refinement Phases

### Phase 1: Broad Discovery
The tool begins by executing five separate single-term queries without any filters or restrictions. Each query searches for one meaningful term that could appear in code, such as function names, class names, or important keywords. The goal is maximum coverage to discover which repositories, files, and programming languages contain relevant code.

This phase intentionally avoids combining multiple terms in a single query because requiring all terms to appear in the same file is too restrictive for initial discovery.

**Base Search Logic Check**: ✅ Single-term approach ensures maximum discovery potential.

### Phase 2: Pattern Analysis  
Users analyze the results from Phase 1 to identify patterns and opportunities for refinement. This involves recognizing which repositories produced the most relevant results, noting common file paths and naming conventions, identifying the primary programming languages being used, and observing the frequency distribution of matches across different codebases.

This analysis phase is critical because it informs all subsequent search decisions and prevents blind narrowing that could miss important results.

**Base Search Logic Check**: ✅ Human-driven analysis ensures intelligent refinement rather than arbitrary filtering.

### Phase 3: Targeted Search
Based on patterns identified in Phase 2, users add specific filters to focus their searches. This includes adding owner or repository filters for the most promising codebases, including language filters for relevant programming languages, and using extension filters for specific file types that showed the best results.

The key principle is that all filters are data-driven based on actual results rather than assumptions about where code might be located.

**Base Search Logic Check**: ✅ Evidence-based filtering maintains search effectiveness while reducing noise.

### Phase 4: Precision Queries
Only after confirming through previous phases that multiple terms actually appear together in the same files should users combine terms in a single query. This phase uses multi-term queries for known co-occurrences that were discovered rather than assumed.

The tool only recommends this approach when there is concrete evidence from earlier phases that the terms are related and likely to appear together.

**Base Search Logic Check**: ✅ Multi-term queries are used only when co-occurrence is proven, maintaining search precision.

## 🚀 Query Execution Logic

### Sequential Processing
```typescript
// CRITICAL: Queries execute sequentially to avoid rate limits
for (let index = 0; index < queries.length; index++) {
  const result = await searchGitHubCode(query);
  // Process each result independently
}
```

**Why Sequential?**
- Prevents GitHub API rate limiting
- Allows graceful handling of partial failures
- Enables smart error recovery per query

### Query Validation Rules
```typescript
// REQUIRED: Every query must have queryTerms
const hasQueryTerms = query.queryTerms && query.queryTerms.length > 0;

// PROGRESSIVE TIP: Guide users toward broad single terms
if (!hasQueryTerms) {
  error: "Start with single broad terms like ['term1'] or ['term2']"
}
```

## 🛠️ Smart Bulk Query Handling

### Mixed Results Intelligence
```typescript
const summary = {
  totalQueries,
  successfulQueries,
  failedQueries,
  // Smart guidance based on result patterns
  guidance: generateSmartGuidance(results)
};
```

### Result Pattern Recognition
- **All Success**: Continue with narrowing strategy
- **All Failed**: Suggest authentication/connection fixes
- **Mixed Results**: Analyze successes, guide failures

### Intelligent Error Aggregation
```typescript
// Each query processes independently
// Failed queries provide specific recovery guidance
// Success queries inform next phase strategy
```

## 🔧 CLI Argument Construction

### Query Term Processing
```bash
# Single term (preferred for broad discovery)
gh search code "render" --owner=facebook --limit=20

# Multi-term (only for known co-occurrences)  
gh search code "workLoop" "shouldYield" --repo=facebook/react
```

### Filter Application Logic
```typescript
// Owner + Repo combination (most specific)
if (params.owner && params.repo) {
  args.push(`--repo=${ownerStr}/${repoStr}`);
}
// Owner only (organization-wide search)  
else if (params.owner) {
  args.push(`--owner=${ownerStr}`);
}
```

### Limit Strategy
```typescript
// Default 30, max 100 per query
// Balances comprehensiveness with rate limits
const limit = Math.min(params.limit || 30, 100);
```

## 🛡️ Advanced Error Handling & Fallbacks

### Rate Limit Recovery
```
PHASE 1: Wait 5-10 minutes, restart with broad single-term queries
PHASE 2: Use owner/repo filters to narrow scope
PHASE 3: Try npm package search for package-related queries  
PHASE 4: Reduce query count - use fewer, more targeted searches
```

### Authentication Failures
```
1. Run: gh auth login
2. Verify access: gh auth status
3. For private repos: use api_status_check to verify org access
4. Restart with broad discovery queries
```

### Network Timeout Strategy
```
PHASE 1: Reduce scope - start with single-term queries
PHASE 2: Add owner filter after success  
PHASE 3: Use github_search_repos to find repositories first
PHASE 4: Try npm package search for package discovery
```

### Invalid Query Fixes
```
PHASE 1: Start simple - single terms, not multiple terms
Remove special characters: ()[]{}*?^$|.\
Use quotes only for exact phrases
PROGRESSIVE EXAMPLE: ["term1"] → ["term1.method"] → ["methodName"]  
```

### Repository Not Found
```
PHASE 1: Remove owner/repo filters, search broadly
PHASE 2: Use github_search_repos to find correct names
PHASE 3: Check for typos in owner/repo names
PHASE 4: Use npm package search if looking for packages
```

## 🎨 Content Transformation Pipeline

### Processing Order
```typescript
// 1. Sanitization (security first)
const sanitizationResult = ContentSanitizer.sanitizeContent(fragment);

// 2. Minification (token efficiency)  
const minifyResult = await minifyContentV2(processedFragment, path);

// 3. Context Optimization (readability)
context: optimizeTextMatch(processedFragment, 120)
```

### Security Validation
```typescript
// Collect and report security issues
if (sanitizationResult.hasSecrets) {
  warnings.push(`Secrets detected: ${secretsDetected.join(', ')}`);
}
if (sanitizationResult.hasPromptInjection) {
  warnings.push(`Prompt injection detected`);  
}
```

### Repository Context Intelligence
```typescript
// Single repo optimization
const singleRepo = extractSingleRepository(items);
if (singleRepo) {
  result.repository = {
    name: singleRepo.nameWithOwner,
    url: simplifyRepoUrl(singleRepo.url)
  };
}
```

## ⚡ Performance Optimizations

### Caching Strategy
```typescript
// Cache based on query parameters
const cacheKey = generateCacheKey('gh-code', params);
return withCache(cacheKey, async () => {
  // Expensive GitHub CLI operation
});
```

### Token Efficiency
- **Auto-minification**: Reduces response size by default
- **Content sanitization**: Removes security risks
- **Context optimization**: Trims to essential 120 characters
- **Duplicate removal**: Deduplicates warnings and metadata

## 🚨 Critical Invariants (Never Change)

### 1. Progressive Refinement Order
```
✅ ALWAYS: Single terms first → analyze → add filters → precision
❌ NEVER: Start with multiple terms or narrow filters
```

### 2. Sequential Execution
```
✅ ALWAYS: Execute queries one by one with await
❌ NEVER: Use Promise.all() or parallel execution  
```

### 3. Independent Query Processing
```
✅ ALWAYS: Each query succeeds/fails independently
❌ NEVER: Fail entire operation if one query fails
```

### 4. Generic Examples
```
✅ ALWAYS: Use ["term1"], ["term2"], "target_owner", "repo_owner"
❌ NEVER: Use specific code examples like "React", "Vue", "facebook"
```

### 5. Smart Error Guidance
```
✅ ALWAYS: Provide specific recovery steps per error type
❌ NEVER: Generic "try again" error messages
```

## 📊 Success Metrics

### Query Success Patterns
- **Phase 1 Success**: 5 broad queries return diverse results
- **Phase 2 Success**: Pattern recognition identifies key repositories  
- **Phase 3 Success**: Filtered queries return relevant, focused results
- **Phase 4 Success**: Precision queries find exact implementations

### Quality Indicators
- **High Repository Diversity**: Multiple repos in Phase 1 results
- **Clear Pattern Emergence**: Consistent file paths, naming conventions
- **Successful Narrowing**: Phase 3 filters reduce noise, increase relevance
- **Precision Achievement**: Phase 4 finds specific code implementations

## 🔄 Maintenance Guidelines

### When Making Changes
1. **Preserve Progressive Strategy**: Never skip broad discovery phase
2. **Maintain Error Intelligence**: Keep specific recovery guidance  
3. **Validate Query Logic**: Test with actual GitHub repositories
4. **Check Generic Examples**: Ensure no specific code references
5. **Verify Sequential Processing**: Confirm rate limit protection

### Red Flags (Immediate Review)
- Adding parallel query execution
- Removing broad discovery phase
- Using specific company/framework names in examples
- Simplifying error handling to generic messages
- Changing query validation to allow empty terms

---

> **Note**: This document captures the essential intelligence of the GitHub code search tool. Any changes to the tool should preserve these patterns and behaviors to maintain its effectiveness and reliability.
