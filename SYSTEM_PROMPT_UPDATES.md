# MCP GitHub Tools System Prompt Updates

## **CRITICAL BRANCH WORKFLOW REQUIREMENTS** 

🔴 **MANDATORY FOR ALL GITHUB TOOLS**: Never perform any GitHub repository operations without first determining the correct branch using `view_repository`.

### **Required Workflow Sequence:**

1. **ALWAYS START WITH BRANCH DISCOVERY**:
   ```
   mcp_colombus-mcp_view_repository(owner, repo) 
   → Extract default branch from response (usually 'main' or 'master')
   ```

2. **THEN PROCEED WITH BRANCH-AWARE OPERATIONS**:
   ```
   mcp_colombus-mcp_search_github_code(query, owner, repo, branch)
   mcp_colombus-mcp_view_repository_structure(owner, repo, branch, path?)
   mcp_colombus-mcp_fetch_github_file_content(owner, repo, branch, filePath)
   ```

### **System Prompt Addition:**

Add the following section to your system prompt:

```
## GITHUB REPOSITORY WORKFLOW REQUIREMENTS

**CRITICAL BRANCH HANDLING:**
- 🔴 **NEVER** search code, explore structure, or fetch files without explicit branch specification
- 🔴 **ALWAYS** use `mcp_colombus-mcp_view_repository` FIRST to determine the default branch
- 🔴 **NO ASSUMPTIONS** about branch names - 'main', 'master', 'develop' vary by repository
- ✅ **EXPLICIT BRANCH** required for all GitHub operations

**MANDATORY WORKFLOW:**
1. `mcp_colombus-mcp_view_repository` → Get default branch
2. Extract branch from repository info (check README badges, license links)
3. Use extracted branch in ALL subsequent GitHub tools
4. Never proceed without successful branch determination

**TOOL-SPECIFIC REQUIREMENTS:**
- `mcp_colombus-mcp_search_github_code`: Requires branch parameter (mandatory)
- `mcp_colombus-mcp_view_repository_structure`: Requires branch parameter (mandatory)  
- `mcp_colombus-mcp_fetch_github_file_content`: Already requires branch parameter
- `mcp_colombus-mcp_view_repository`: Use this FIRST to get branch info

**ERROR HANDLING:**
- If `view_repository` fails → Cannot proceed with other GitHub operations
- If branch extraction fails → Ask user for clarification
- If branch-specific operations fail → Verify branch exists and retry

**EXAMPLE CORRECT SEQUENCE:**
```
1. User: "Search React concurrent rendering code"
2. Call: mcp_colombus-mcp_view_repository(owner="facebook", repo="react")
3. Extract: branch="main" (from LICENSE badge or other indicators)
4. Call: mcp_colombus-mcp_search_github_code(query="concurrent rendering", owner="facebook", repo="react", branch="main")
5. Call: mcp_colombus-mcp_view_repository_structure(owner="facebook", repo="react", branch="main", path="packages")
```
```

## **Updated Tool Descriptions**

### Key Changes Made:

1. **Added Branch Parameters**: 
   - `mcp_colombus-mcp_search_github_code` now requires `branch` parameter
   - `mcp_colombus-mcp_view_repository_structure` now requires `branch` parameter

2. **Enhanced Tool Descriptions**:
   - Clear workflow requirements at the top
   - TOOL_NAMES constants used throughout  
   - Branch-specific examples and CLI commands
   - Warning indicators (🔴, ⚠️, ✅) for critical requirements

3. **Consistent Messaging**:
   - All tools reference the need to use `view_repository` first
   - Explicit "NO DEFAULT ASSUMPTIONS" warnings
   - Clear error messaging includes branch information

### **Tool Implementation Updates:**

- **Types**: Added mandatory `branch` parameter to `GitHubCodeSearchParams` and `GitHubRepositoryStructureParams`
- **Implementation**: Updated CLI commands to include `?ref=BRANCH` and `--branch BRANCH` parameters
- **Error Messages**: Enhanced to include branch information for better debugging
- **Cache Keys**: Include branch parameter for proper caching isolation

### **Benefits:**

1. **Reliability**: Eliminates branch-related failures and confusion
2. **Consistency**: All GitHub tools follow the same branch-determination workflow  
3. **User Experience**: Clear error messages and workflow guidance
4. **Maintainability**: Centralized branch handling through `view_repository`

### **Migration Guide:**

For existing implementations:
1. Update all calls to GitHub tools to include branch parameter
2. Add `view_repository` calls before other GitHub operations
3. Update error handling to account for branch-related failures
4. Review system prompts to include new workflow requirements

This ensures robust, predictable GitHub repository interactions with proper branch awareness. 