import { TOOL_NAMES } from '../tools/contstants';

export const SEARCH_GITHUB_CODE_DESCRIPTION = `Primary tool for finding battle-tested code implementations.

**SEARCH STRATEGY (in priority order):**

1. **Code Constructs** (highest success rate):
   - JavaScript/TypeScript: "function MyFunction", "class MyClass"
   - Python: "def my_function", "class MyClass"
   - Java: "public class", "public static"

2. **Multi-term Search** (all terms must be present):
   - Non-strict: "authentication jwt middleware"
   - Language-focused: language:"TypeScript" "authentication"

3. **Progressive Refinement**:
   - Start with 3 terms → reduce to 2 terms → reduce to 1 term
   - Remove filters if no results

**QUALITY THRESHOLDS:**
- 1-15 results: IDEAL - Extract all via ${TOOL_NAMES.FETCH_GITHUB_FILE_CONTENT}
- 16-50 results: GOOD - Apply quality filters
- 51-200 results: Add language/extension filters
- 200+ results: Use specific code constructs

**REQUIREMENTS:**
- Always use ${TOOL_NAMES.VIEW_REPOSITORY} first to get branch
- Target repositories with >1K stars or recent activity
- Retry with same parameters once if search fails (transient issues)

**DO NOT:**
- Change core search terms immediately on failure
- Use overly specific phrases initially
- Skip branch discovery step`;
