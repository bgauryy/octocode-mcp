import { TOOL_NAMES } from '../../contstants';

export const SEARCH_GITHUB_DISCUSSIONS_DESCRIPTION = `GitHub discussions search for community knowledge discovery.

**CORE PURPOSE:**
Access community Q&A, tutorials, and best practices for learning and problem-solving.

**DISCOVERY WORKFLOW:**
1. Use ${TOOL_NAMES.NPM_VIEW} for packages -> get repo URL
2. Use ${TOOL_NAMES.SEARCH_GITHUB_REPOS} for projects -> get owner/repo  
3. Search discussions with discovered owner/repo context

**SEARCH STRATEGY:**
1. **Start Lean**: Single keywords ("help", "tutorial", "authentication")
2. **Build Complexity**: Combinations if needed ("help deployment")
3. **Avoid Complex**: Don't start with full phrases

**RESULT TARGETS:**
- 1-15 results: IDEAL - Deep analysis opportunities
- 16-50 results: GOOD - Manageable scope
- 51-100 results: BROAD - Add category filters
- 100+ results: TOO GENERIC - Refine terms

**KEY FILTERS:**
- **Answered**: True for validated solutions
- **Category**: Q&A, General, Show and Tell
- **Author/maintainer**: For authoritative responses
- **Date filters**: Recent vs historical discussions

**SEARCH PATTERNS:**
- **Problem solving**: "deployment help", "authentication tutorial"
- **Best practices**: "testing patterns", "architecture decisions"
- **Community insights**: "performance tips", "migration guide"

**QUALITY INDICATORS:**
- Answered discussions for validated solutions
- Maintainer participation for authoritative guidance
- Recent activity for current relevance

**FALLBACK STRATEGY:**
If no discussions found, try ${TOOL_NAMES.SEARCH_GITHUB_ISSUES} for alternative community insights.

**OUTPUT:** Community-validated knowledge and solutions for development challenges.`;
