import { TOOL_NAMES } from '../../contstants';

export const SEARCH_GITHUB_REPOS_DESCRIPTION = `Find GitHub repositories with progressive discovery methodology.

**AUTO-TRIGGERS:**
- Organization mentions → Auto-call ${TOOL_NAMES.GET_USER_ORGANIZATIONS}
- Package mentions → Use ${TOOL_NAMES.NPM_VIEW} first
- Topics needed → Use ${TOOL_NAMES.SEARCH_GITHUB_TOPICS} for discovery

**SEARCH STRATEGY:**
1. **Start lean**: Single terms ("react", "cli", "docker")
2. **Add context**: Second term only if needed ("react hooks")
3. **Specific targeting**: Combine terms when patterns emerge

**FILTERING APPROACH:**
- **Owner**: Most effective for scoping results
- **Language**: Technology-specific searches
- **Stars**: ">100" established, ">10" active projects
- **Updated**: Recent activity (">2023-01-01")

**RESULT OPTIMIZATION:**
- 0 results: Broaden terms, remove filters except owner
- 1-10: **IDEAL** - Deep analysis opportunity
- 11-30: **GOOD** - Pattern analysis, select relevant
- 31-100: Add filters (language, stars, updated)
- 100+: Too broad - use specific single terms

**QUALITY TARGETS:**
- Sort by "updated" for active repositories
- Balance relevance with recency
- Prioritize maintained projects

**AVOID:**
- Complex phrases ("react command line tools")
- Starting with multiple terms
- Skipping organization discovery when context is clear`;
