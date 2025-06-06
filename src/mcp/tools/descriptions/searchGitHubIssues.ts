import { TOOL_NAMES } from '../../contstants';

export const SEARCH_GITHUB_ISSUES_DESCRIPTION = `Advanced GitHub issues search for problem discovery and solution research.

**SEARCH STRATEGY:**
1. **Single Keywords First**: "bug", "feature", "documentation"
2. **Then Combine**: "bug fix", "feature request" (only if needed)
3. **Never Start Complex**: Avoid "critical performance bug in production"

**CORE PURPOSE:**
- Problem discovery and existing issue research
- Solution research and community insights
- Development planning and quality assurance

**SEARCH METHODOLOGY:**
- **Phase 1**: Core discovery ("authentication", "error") → understand patterns
- **Phase 2**: Context expansion ("authentication JWT", "error handling")
- **Phase 3**: Solution focus ("authentication bug resolved")

**RESULT TARGETS:**
- 0 results: Try broader terms, remove filters
- 1-20 results: IDEAL - Deep analysis of patterns and solutions
- 21-100 results: GOOD - Add specificity or filters
- 100+ results: Add specific terms or state/label filters

**TERM SELECTION:**
- Actual error messages: "TypeError", "404", "connection refused"
- Status indicators: "open", "closed", "resolved", "duplicate"
- Impact levels: "critical", "bug", "enhancement", "question"
- Component names: "API", "frontend", "database", "deployment"

**FILTERING STRATEGY:**
- State filter: "open" for current issues, "closed" for resolved patterns
- Label filter: Severity ("bug", "enhancement", "documentation")
- Assignee filter: Issues handled by specific maintainers
- Author filter: Track issues from particular users
- Date filters: Recent issues or historical analysis

**CROSS-REFERENCE APPROACH:**
- Combine with ${TOOL_NAMES.SEARCH_GITHUB_CODE} for implementation details
- Use with ${TOOL_NAMES.SEARCH_GITHUB_COMMITS} for fix implementations
- Cross-reference with ${TOOL_NAMES.SEARCH_GITHUB_PULL_REQUESTS} for solutions
- Explore ${TOOL_NAMES.SEARCH_GITHUB_DISCUSSIONS} for community insights

**PATTERN ANALYSIS:** Focus on issue resolution patterns and community feedback for development insights.`;
