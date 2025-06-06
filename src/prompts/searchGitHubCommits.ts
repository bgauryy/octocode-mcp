import { TOOL_NAMES } from '../tools/contstants';

export const SEARCH_GITHUB_COMMITS_DESCRIPTION = `Advanced GitHub commits search for development history analysis.

**CORE PURPOSE:**
Track code evolution, debug issues, analyze contributor patterns, and understand development history.

**SEARCH STRATEGY:**
1. **Start Minimal**: Single keywords ("fix", "feature", "update") + owner/repo context
2. **Progressive Expansion**: Add specific terms based on findings
3. **Apply Filters**: Author, date ranges only when patterns emerge

**SEARCH PATTERNS:**
- **General exploration**: "fix" or "update" with owner/repo → activity overview
- **Feature tracking**: Single feature keyword → expand with related terms
- **Bug investigation**: "bug" or "fix" → narrow by time/author
- **Attribution**: Keywords + author filter → contribution analysis

**RESULT TARGETS:**
- 0-5 results: Try broader terms, remove filters
- 6-50 results: OPTIMAL - Extract insights
- 51+ results: Add specific filters or narrow time ranges

**CRITICAL LIMITATIONS:**
- Large organizations may return org-wide results instead of repo-specific
- If irrelevant results: Switch to alternative approaches (changelog files, PR search)

**FALLBACK STRATEGY:**
1. Commit search with minimal keywords
2. Pull request searches for features/changes  
3. Fetch changelog files (CHANGELOG.md, RELEASES.md)
4. Repository structure exploration

**BRANCH AWARENESS:** Verify default branch (main vs master) before file fetching

**ERROR HANDLING:**
- "Search text required" → Use minimal keywords ("fix", "update")
- Irrelevant results → Switch to file-based approaches
- Empty results → Broaden scope or remove repository filters

**INTEGRATION:** Combine with ${TOOL_NAMES.FETCH_GITHUB_FILE_CONTENT} for complete change context.`;
