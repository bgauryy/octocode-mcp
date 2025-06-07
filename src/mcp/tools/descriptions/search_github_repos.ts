import { TOOL_NAMES } from '../../contstants';

export const SEARCH_GITHUB_REPOS_DESCRIPTION = `Find GitHub repositories with progressive discovery methodology.

**AUTO-TRIGGERS:**
- Organization mentions → Auto-call ${TOOL_NAMES.GET_USER_ORGANIZATIONS}
- Package mentions → Use ${TOOL_NAMES.NPM_VIEW} first
- Topics needed → Use ${TOOL_NAMES.SEARCH_GITHUB_TOPICS} for discovery

**SEARCH STRATEGY:**
1. **Start lean**: Single terms ("react", "cli", "docker") for broad discovery
2. **Add context**: Multi-word searches ("react hooks", "cli tools") for specific targeting
3. **Progressive refinement**: Start broad, then narrow with filters

**MULTI-WORD SEARCH SUPPORT:**
✅ **Now Fully Supported**: Multi-word queries work with natural AND behavior
- "react hooks" → finds repos containing both "react" AND "hooks"
- "machine learning" → finds repos containing both "machine" AND "learning"
- "docker deployment" → finds repos containing both "docker" AND "deployment"

**SEARCH PATTERNS:**
- **Single term**: "react" → broad technology search
- **Multi-word**: "react hooks" → specific feature/concept search
- **With filters**: "react" + language:javascript → technology + context

**CONTEXT PRIORITIZATION RULES:**
- **Problem/Solution** terms: "authentication", "deployment", "testing"
- **Technology Stack**: "react", "node", "python"  
- **Implementation Details**: "JWT", "OAuth", "Docker"
- **Quality Indicators**: stars, updated, maintained

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
- 100+: Too broad - add specific filters or narrow terms

**QUALITY TARGETS:**
- Sort by "updated" for active repositories
- Balance relevance with recency
- Prioritize maintained projects

**BEST PRACTICES:**
- Start with single terms for exploration
- Use multi-word for specific targeting
- Add filters progressively based on results
- Prioritize owner context when available

**EXAMPLES:**
- Single term: "react" → broad ecosystem discovery
- Multi-word: "react authentication" → specific functionality search
- With owner: "hooks" --owner=facebook → organization-specific search
- With filters: "cli" --language=typescript --stars=">100" → quality filtering`;
