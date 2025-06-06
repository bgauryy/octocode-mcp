import { TOOL_NAMES } from '../../contstants';

export const SEARCH_GITHUB_REPOS_DESCRIPTION = `GitHub repository search with progressive discovery methodology.
- **RELATED TOOLS:**
  - ${TOOL_NAMES.SEARCH_GITHUB_TOPICS}: Essential for topic-based search (e.g. "react", "typescript", "nodejs", "rag")  and more discovery

**AUTO-TRIGGER CONDITIONS:**
- Organization mentions: "I work at [Company Name]", "our team", "organization codebase"
- Private repository indicators: "internal code", "team repositories"
→ Auto-call ${TOOL_NAMES.GET_USER_ORGANIZATIONS}

**SEARCH STRATEGY:**
1. **Start Ultra-Lean**: Single technical terms ("react", "cli", "docker")
2. **Gradual Expansion**: Add second term only if first yields too many/few results  
3. **Specific Targeting**: Combine terms only when patterns emerge

**SEARCH METHODOLOGY:**
- Phase 1: Single keywords ("graphql", "kubernetes", "typescript")
- Phase 2: Add context if needed ("graphql server", "kubernetes operator")
- Phase 3: Specific combinations only when necessary

**CONTEXT DETECTION:**
- Organization context → Auto-call ${TOOL_NAMES.GET_USER_ORGANIZATIONS}
- Package mentions → Use ${TOOL_NAMES.NPM_VIEW} first
- General queries → Start without owner filter

**FILTERING STRATEGY:**
- Owner filter: Most effective for scoping results
- Language filter: For technology-specific searches
- Stars filter: ">100" for established, ">10" for active projects
- Updated filter: Prioritize recent activity (">2023-01-01")

**RESULT QUALITY TARGETS:**
- 0 results: Broaden terms, remove filters except owner
- 1-10: IDEAL - Deep dive analysis
- 11-30: GOOD - Analyze patterns and select relevant
- 31-100: Add specificity filters (language, stars, updated)
- 100+: Too broad - use more specific single terms

**DEFAULT BEHAVIOR:**
- Sort by "updated" for active repositories first
- Balance relevance with recency

**DO NOT:**
- Start with complex phrases like "react command line tools"
- Use "react" when you mean single keyword search
- Skip organization discovery when company context is clear`;
