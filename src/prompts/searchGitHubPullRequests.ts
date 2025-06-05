import { TOOL_NAMES } from '../tools/contstants';

export const SEARCH_GITHUB_PULL_REQUESTS_DESCRIPTION = `Advanced GitHub pull requests search for code review and feature analysis.

**SEARCH STRATEGY:**
1. **Single Keywords First**: "bug", "feature", "refactor" 
2. **Then Combine**: "bug fix", "feature implementation" (only if needed)
3. **Never Start Complex**: Avoid phrases like "comprehensive bug fix implementation"

**CORE PURPOSE:**
- Code review insights and team collaboration patterns
- Feature implementation lifecycle tracking
- Breaking changes and quality assurance analysis

**SEARCH METHODOLOGY:**
- **Phase 1**: Core discovery with fundamental terms ("authentication", "error")
- **Phase 2**: Add context ("authentication JWT", "error handling")  
- **Phase 3**: Solution focus ("authentication bug fixed")

**RESULT TARGETS:**
- 0 results: Try broader terms, remove filters
- 1-20 results: IDEAL - Deep analysis of patterns and solutions
- 21-100 results: GOOD - Add specificity or filters
- 100+ results: Add specific terms or state/reviewer filters

**FILTERING BEST PRACTICES:**
- State filter: "open" for current issues, "closed" for resolved patterns
- Author/reviewer filters: Understand team collaboration
- Draft filter: Work-in-progress vs completed features
- Branch filters: Release and feature branch workflows
- Language filter: Focus on specific technology stacks

**ADAPTIVE TACTICS:**
- Start broad with feature keywords, narrow based on findings
- Use owner/repo parameters when repository context is known
- Widen scope if targeted searches yield insufficient results
- Apply precise filters only after broader searches confirm patterns

**CROSS-REFERENCE STRATEGY:**
- Combine with ${TOOL_NAMES.SEARCH_GITHUB_COMMITS} for complete development understanding
- Use with ${TOOL_NAMES.SEARCH_GITHUB_CODE} for current implementations
- Cross-reference with ${TOOL_NAMES.SEARCH_GITHUB_REPOS} for similar patterns

**QUALITY FOCUS:** Use review-related filters to find thoroughly vetted code examples.`;
