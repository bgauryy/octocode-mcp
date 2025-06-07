import { TOOL_NAMES } from '../../contstants';

export const FETCH_GITHUB_FILE_CONTENT_DESCRIPTION = `Extract complete working code with full context - the core of code analysis.

**PURPOSE:**
Extract complete, working code implementations rather than code snippets.

**CRITICAL FOR SEARCH EXPANSION:**
Transform search results into actionable implementations. Search tools find files - this tool extracts the complete, working code with full context needed for implementation.

**MANDATORY WORKFLOW:**
1. **ALWAYS** Use ${TOOL_NAMES.VIEW_REPOSITORY} first to discover the correct default branch
2. Find files with ${TOOL_NAMES.SEARCH_GITHUB_CODE}  
3. Extract complete implementations with this tool
4. Follow dependency chains to related files

**CRITICAL REQUIREMENT:**
**NEVER** use this tool without first calling ${TOOL_NAMES.VIEW_REPOSITORY} to get the correct branch information. Wrong branch names cause complete tool failure.

**WHAT TO FETCH:**
- **Core implementations**: Main functions/classes with complete logic
- **Dependencies**: Files referenced in imports/exports paths
- **Configuration**: package.json, tsconfig.json, webpack.config.js, etc.
- **Documentation**: README.md, API docs, usage examples
- **Tests**: For usage patterns and validation
- **Related utilities**: Helper functions and shared modules

**ENHANCED AUTO-RECOVERY:**
Tries multiple fallback strategies:
1. Specified branch -> main -> master -> develop -> trunk (with ref parameter)
2. If all fail: Try without ref parameter (uses repository default branch)
Handles incorrect branch info from ${TOOL_NAMES.VIEW_REPOSITORY} and GitHub API limitations.

**SUCCESS CRITERIA:**
Production-ready code with all necessary context for immediate implementation.

**DO NOT:**
- Extract incomplete snippets without context
- Skip dependency files or configuration
- Use this tool without first calling ${TOOL_NAMES.VIEW_REPOSITORY}
- Assume branch names without verification`;
