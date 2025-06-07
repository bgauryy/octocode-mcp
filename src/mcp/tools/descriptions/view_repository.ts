import { TOOL_NAMES } from '../../contstants';

export const VIEW_REPOSITORY_DESCRIPTION = `**CRITICAL: Required first step** - discovers default branch to prevent tool failures.

**PURPOSE:**
Extract repository metadata and default branch information for all subsequent GitHub operations.

**WHY CRITICAL:**
- Wrong branch names cause complete tool failure
- All file operations depend on correct branch discovery
- Prevents expensive retry cycles and API errors

**BRANCH DISCOVERY:**
- Repository metadata analysis
- README badge parsing for branch references
- License/CI badge URL analysis

**REQUIRED BEFORE:**
- ${TOOL_NAMES.SEARCH_GITHUB_CODE} (needs branch context)
- ${TOOL_NAMES.VIEW_REPOSITORY_STRUCTURE} (directory exploration)
- ${TOOL_NAMES.FETCH_GITHUB_FILE_CONTENT} (file operations)

**SUCCESS INDICATORS:**
- Repository info retrieved successfully
- Default branch clearly identified
- Active repository with recent commits

**ERROR HANDLING:**
- Not found: Check owner/repo spelling
- Access denied: Use ${TOOL_NAMES.GET_USER_ORGANIZATIONS} for permissions
- Tool failure blocks all subsequent file operations

**NEVER:**
- Skip before file operations
- Assume default branch names
- Use hardcoded 'main'/'master' without verification
- Proceed if branch discovery fails`;
