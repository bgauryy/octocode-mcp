import { TOOL_NAMES } from '../tools/contstants';

export const VIEW_REPOSITORY_DESCRIPTION = `**CRITICAL: MANDATORY first step for all file operations** - discovers default branch information.

**PURPOSE:**
Extract default branch from repository metadata and README to prevent tool failures. This tool provides the foundation for all subsequent GitHub operations.

**WHY ABSOLUTELY CRITICAL:**
- Wrong branch names cause **COMPLETE TOOL FAILURE** in all file operations
- Only correct branches contain current repository state
- **ALL** subsequent GitHub operations depend on correct branch discovery
- Prevents expensive retry cycles and API rate limiting

**BRANCH DISCOVERY METHODS:**
- License badge URLs: github.com/OWNER/REPO/blob/BRANCH/LICENSE
- CI/CD badge URLs: Check for ?branch=BRANCH parameters  
- Repository metadata: Default branch in CLI output
- README badges and links analysis

**ABSOLUTELY REQUIRED BEFORE:**
- ${TOOL_NAMES.SEARCH_GITHUB_CODE} (needs branch for workflow)
- ${TOOL_NAMES.VIEW_REPOSITORY_STRUCTURE} (needs branch for directory exploration)
- ${TOOL_NAMES.FETCH_GITHUB_FILE_CONTENT} (needs branch for file fetching)

**ENHANCED INTEGRATION:**
Tools now include intelligent fallback mechanisms that complement this tool's branch discovery:
- Multiple branch attempts with common alternatives
- Graceful degradation when specific branches fail
- Comprehensive error reporting for troubleshooting

**SUCCESS INDICATORS:**
- Repository info retrieved successfully
- Branch identifiable in badges/metadata
- Repository appears active with recent commits
- Default branch clearly indicated in output

**ERROR HANDLING:**
- Not found: Check owner/repo spelling and permissions
- Access denied: Use ${TOOL_NAMES.GET_USER_ORGANIZATIONS} for permissions
- If this tool fails, all subsequent file operations will fail

**NEVER:**
- Skip this step before any file operations
- Assume default branch name without verification
- Proceed with file operations if branch discovery fails
- Use hardcoded branch names like 'main' or 'master' without verification`;
