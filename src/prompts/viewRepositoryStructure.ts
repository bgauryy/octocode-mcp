import { TOOL_NAMES } from '../tools/contstants';

export const VIEW_REPOSITORY_STRUCTURE_DESCRIPTION = `Strategic repository exploration for code analysis.

**CRITICAL REQUIREMENT:**
Must use ${TOOL_NAMES.VIEW_REPOSITORY} FIRST to get branch (MANDATORY).

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

**BRANCH FALLBACK:** Automatically tries main → master → develop → trunk

**OUTPUT:** Architectural map to guide intelligent code extraction.`;
