import { TOOL_NAMES } from '../tools/contstants';

export const SEARCH_GITHUB_TOPICS_DESCRIPTION = `**VITAL FOUNDATION TOOL** for effective GitHub discovery - provides semantic context that makes all other GitHub searches targeted and successful.

**WHY ESSENTIAL:**
- **Term Discovery**: Find correct terminology and keywords before searching repositories
- **Quality Signals**: Featured/curated topics = community-validated, battle-tested projects
- **Repository Filters**: Use topic names directly in ${TOOL_NAMES.SEARCH_GITHUB_REPOS} for precise targeting
- **Ecosystem Mapping**: Understand technology landscapes with 100M+ repositories of production code

**CRITICAL WORKFLOW - Topics → Repositories:**
1. **Search topics first** → discover proper terminology (e.g., "machine-learning" not "AI")
2. **Use topic names as filters** → in ${TOOL_NAMES.SEARCH_GITHUB_REPOS} for targeted results
3. **Quality validation** → featured topics = GitHub-promoted, curated = community-maintained

**SEARCH STRATEGY:**
1. **Single Terms First**: "MCP", "RAG", "react", "docker", "cli"
2. **Progressive Discovery**: Start basic and make several queries if needed
3. **Avoid Combined Terms**: API works better with individual terms than complex phrases

**EXAMPLES:**
- Search "javascript" → find topics like "typescript", "nodejs", "frontend"
- Use discovered topics → search repos with topic:"typescript" for quality examples
- Featured topics → guaranteed high-quality repository collections

**RESULT OPTIMIZATION:**
- 1-10 results: IDEAL for deep analysis
- 10+ results: Add featured/curated filters
- Use repository count as maturity indicator (>10K = established, 1K-10K = growing)

**OUTPUT:** Strategic foundation for all GitHub discovery - transforms random searches into targeted, quality-focused repository discovery.`;
