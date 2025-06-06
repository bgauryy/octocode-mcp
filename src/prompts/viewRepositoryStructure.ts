import { TOOL_NAMES } from '../tools/contstants';

export const VIEW_REPOSITORY_STRUCTURE_DESCRIPTION = `Strategic repository exploration for code analysis.

**CRITICAL REQUIREMENT:**
**MANDATORY:** Must use ${TOOL_NAMES.VIEW_REPOSITORY} FIRST to get branch. **NEVER** explore repository structure without explicit branch discovery.

**EXPLORATION PHASES:**
1. **Root Analysis**: Project type (package.json, requirements.txt), README, docs, config files
2. **Source Discovery**: Navigate src/, lib/, components/, utils/, types/  
3. **Validation**: Explore test/, examples/, demos/ directories

**DIRECTORY PRIORITIES:**
- HIGH: src/, lib/, components/, utils/, types/ (Core implementations)
- MEDIUM: docs/, examples/, config/ (Context/documentation) 
- TEST: test/, __tests__/, spec/ (Quality/patterns)

**NAVIGATION STRATEGY:**
- Start with root for project overview
- Target core implementation directories
- Extract promising files via ${TOOL_NAMES.FETCH_GITHUB_FILE_CONTENT}
- Cross-reference with tests for usage patterns

**RESULT TARGETS:**
- 1-10 results: IDEAL - Focused exploration
- 11-50 results: MANAGEABLE - Prioritize by conventions
- 50+ results: TOO BROAD - Explore subdirectories

**ENHANCED BRANCH FALLBACK:** 
Automatically tries multiple fallback strategies:
1. Specified branch → main → master → develop → trunk (with ref parameter)
2. If all fail: Try without ref parameter (uses repository default branch)
Handles branch discovery failures gracefully with comprehensive error reporting.

**OUTPUT:** Architectural map to guide intelligent code extraction.

**NEVER:**
- Explore without calling ${TOOL_NAMES.VIEW_REPOSITORY} first
- Use hardcoded branch names without verification
- Assume default branch names across repositories`;
