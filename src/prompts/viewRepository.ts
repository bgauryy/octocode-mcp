import { TOOL_NAMES } from '../tools/contstants';

export const VIEW_REPOSITORY_DESCRIPTION = `CRITICAL: Mandatory first step for all file operations - discovers default branch information.

**PURPOSE:**
Extract default branch from repository metadata and README to prevent tool failures.

**WHY CRITICAL:**
- Wrong branch names cause complete tool failure
- Only correct branches contain current repository state
- All subsequent GitHub operations depend on correct branch

**BRANCH DISCOVERY METHODS:**
- License badge URLs: github.com/OWNER/REPO/blob/BRANCH/LICENSE
- CI/CD badge URLs: Check for ?branch=BRANCH parameters  
- Repository metadata: Default branch in CLI output

**REQUIRED BEFORE:**
- ${TOOL_NAMES.SEARCH_GITHUB_CODE} (needs branch for workflow)
- ${TOOL_NAMES.VIEW_REPOSITORY_STRUCTURE} (needs branch for directory exploration)
- ${TOOL_NAMES.FETCH_GITHUB_FILE_CONTENT} (needs branch for file fetching)

**SUCCESS INDICATORS:**
- Repository info retrieved successfully
- Branch identifiable in badges/metadata
- Repository appears active with recent commits

**ERROR HANDLING:**
- Not found: Check owner/repo spelling and permissions
- Access denied: Use ${TOOL_NAMES.GET_USER_ORGANIZATIONS} for permissions

**DO NOT:**
- Skip this step before file operations
- Assume default branch name without verification
- Proceed with operations if branch discovery fails`;
