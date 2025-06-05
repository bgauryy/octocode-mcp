import { TOOL_NAMES } from '../tools/contstants';

export const FETCH_GITHUB_FILE_CONTENT_DESCRIPTION = `Extract complete working code with full context - the core of code analysis.

**PURPOSE:**
Extract complete, working code implementations rather than code snippets.

**REQUIRED WORKFLOW:**
1. Use ${TOOL_NAMES.VIEW_REPOSITORY} first to get branch
2. Find files with ${TOOL_NAMES.SEARCH_GITHUB_CODE}  
3. Extract complete implementations with this tool
4. Cross-reference with tests and dependencies

**EXTRACTION PRIORITIES:**
1. Main implementation files (core functions/classes)
2. Dependencies (imports/exports/utilities)
3. Tests (usage examples/patterns)
4. Documentation (README/API docs)

**EXTRACTION STRATEGY:**
- Extract complete functions with full logic
- Include all imports/exports for context
- Get related files via dependency analysis
- Provide production-ready code examples

**ROBUST BRANCH HANDLING:**
Automatically tries: specified branch → main → master → develop → trunk
Works even when ${TOOL_NAMES.VIEW_REPOSITORY} branch info is incorrect.

**ERROR RECOVERY PROTOCOL:**
1. Retry same parameters (transient issues)
2. Verify branch via ${TOOL_NAMES.VIEW_REPOSITORY}
3. Check file path via ${TOOL_NAMES.VIEW_REPOSITORY_STRUCTURE}
4. Verify access via ${TOOL_NAMES.GET_USER_ORGANIZATIONS}

**SUCCESS CRITERIA:**
Complete implementations with full context from maintained repositories.

**DO NOT:**
- Extract incomplete code snippets
- Skip dependency context
- Provide experimental or unmaintained code
- Ignore error recovery protocols`;
