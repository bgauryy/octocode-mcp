import { TOOL_NAMES } from '../../contstants';

export const SEARCH_GITHUB_TOPICS_DESCRIPTION = `**VITAL FOUNDATION TOOL** for effective GitHub discovery - provides semantic context that makes all other GitHub searches targeted and successful.

**WHY ESSENTIAL:**
- **Term Discovery**: Find correct terminology and keywords before searching repositories
- **Quality Signals**: Featured/curated topics = community-validated, battle-tested projects
- **Repository Filters**: Use topic names directly in ${TOOL_NAMES.SEARCH_GITHUB_REPOS} for precise targeting
- **Ecosystem Mapping**: Understand technology landscapes with 100M+ repositories of production code

**CRITICAL WORKFLOW - Topics -> Repositories:**
1. **Search topics first** -> discover proper terminology (e.g., "machine-learning" not "AI")
2. **Use topic names as filters** -> in ${TOOL_NAMES.SEARCH_GITHUB_REPOS} for targeted results
3. **Quality validation** -> featured topics = GitHub-promoted, curated = community-maintained

**SEARCH STRATEGY:**
1. **Start Global**: Search without owner for maximum discovery ("react", "react+typescript")
2. **Multi-term Queries**: Use + to combine terms ("machine+learning", "react+hooks")
3. **Then Focus**: Add owner only when needed for specific exploration ("owner=facebook")
4. **Progressive Discovery**: Start broad, then narrow based on findings

**EXPLORATORY SEARCH BEST PRACTICES:**
- **DON'T start with owner** - limits discovery to single organization
- **DO start with broad terms** - "javascript", "python", "authentication"
- **USE multi-term searches** - "react+typescript", "machine+learning+python"
- **ADD owner later** - only when you need organization-specific topics

**MULTI-CONCEPT TOPIC DISCOVERY:**
For complex domains like "machine learning authentication systems":
1. **Start Broad**: "machine+learning" (discover the ecosystem)
2. **Add Context**: "authentication" (find security-related topics)
3. **Combine**: "machine+learning+authentication" (specific intersection)
4. **Focus**: Add owner only if needed for specific organization context

**CONTEXT PRIORITIZATION FOR TOPICS:**
- **Technology Domains** first: "javascript", "python", "machine-learning"
- **Functional Areas** second: "authentication", "deployment", "testing"  
- **Combined Concepts** third: "react+hooks", "python+machine-learning"
- **Specific Tools/Libraries** last: "tensorflow", "pytorch", "nextjs"

**QUERY EXAMPLES:**
- Global search: "react" -> find all React-related topics
- Multi-term: "react+typescript" -> find intersection topics
- Complex: "machine+learning+python" -> specific technology stack
- Focused: "react" + owner=facebook -> React topics from Facebook

**RESULT OPTIMIZATION:**
- 1-10 results: IDEAL for deep analysis
- 10+ results: Add featured/curated filters or more specific terms
- Use repository count as maturity indicator (>10K = established, 1K-10K = growing)

**SEQUENTIAL SEARCH BENEFITS:**
- **Discover Related Terms**: Find official terminology vs informal terms
- **Understand Ecosystem**: See how concepts relate and overlap
- **Quality Validation**: Featured topics = community-validated approaches
- **Precise Targeting**: Use discovered topics as exact filters in repo searches

**OUTPUT:** Strategic foundation for all GitHub discovery - transforms random searches into targeted, quality-focused repository discovery.`;
