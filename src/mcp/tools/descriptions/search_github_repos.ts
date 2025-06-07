import { TOOL_NAMES } from '../../contstants';

export const SEARCH_GITHUB_REPOS_DESCRIPTION = `**⚠️ LAST RESORT TOOL** - Use only when NPM discovery provides no repository context.

**MANDATORY PREREQUISITES:**
1. **ALWAYS FIRST**: ${TOOL_NAMES.SEARCH_GITHUB_TOPICS} - ecosystem mapping (never skip)
2. **PRIMARY DISCOVERY**: ${TOOL_NAMES.NPM_SEARCH} and ${TOOL_NAMES.NPM_VIEW} - extract repository URLs
3. **ONLY IF NPM FAILS**: Use this tool as last resort with single terms only

**CRITICAL LIMITATIONS:**
- **SINGLE TERMS ONLY**: Never use multi-term searches ("react angular auth" ❌)
- **LAST RESORT**: Use only when NPM provides no repository context
- **API INTENSIVE**: Consumes GitHub API quota - NPM discovery is preferred

**MANDATORY SEARCH STRATEGY:**
1. **Single terms only**: "react", "authentication", "deployment" ✅
2. **Never combine**: "react hooks", "full-stack app", "microservices api" ❌
3. **Decompose complex queries**: "react typescript auth" → ["react", "typescript", "authentication"]

**WHEN TO USE (Rare Cases):**
- NPM search found no relevant packages
- Need repositories outside NPM ecosystem (e.g., system tools, non-Node.js)
- Specific organization exploration when not discoverable via NPM

**PREFERRED WORKFLOW (95% of cases):**
1. ${TOOL_NAMES.SEARCH_GITHUB_TOPICS} → discover terminology
2. ${TOOL_NAMES.NPM_SEARCH} → find relevant packages
3. ${TOOL_NAMES.NPM_VIEW} → extract repository URLs from package.json
4. Skip this tool entirely → proceed to code search

**SINGLE-TERM SEARCH EXAMPLES:**
- ✅ "react" → broad React ecosystem
- ✅ "authentication" → auth-related projects  
- ✅ "deployment" → deployment tools
- ❌ "react authentication" → use NPM discovery instead
- ❌ "full-stack framework" → too complex, use topics + NPM

**FILTERING STRATEGY (When Forced to Use):**
- **Owner**: Most effective for scoping results
- **Language**: Technology-specific searches
- **Stars**: ">100" established, ">10" active projects
- **Updated**: Recent activity (">2023-01-01")

**RESULT OPTIMIZATION:**
- 0 results: Try broader single terms, remove filters
- 1-10: **IDEAL** - Deep analysis opportunity
- 11-30: **GOOD** - Add language/star filters
- 31-100: Add specific filters gradually
- 100+: Term too broad - use more specific single term

**API CONSERVATION RULES:**
- Check rate limits before use
- Prefer NPM discovery (60% less API usage)
- Use only when absolutely necessary
- Single searches reduce API consumption

**EXAMPLES OF PROPER USAGE:**
- Last resort search: "kubernetes" (after NPM fails to provide K8s repos)
- Organization-specific: "cli" --owner=github (when GitHub's CLI tools needed)
- Non-NPM ecosystem: "rust" --language=rust (when looking for Rust projects)

**REMEMBER**: This tool should be avoided in 95% of cases. Topics + NPM discovery provides better results with less API usage.`;
