import { TOOL_NAMES } from '../tools/contstants';

export const SEARCH_GITHUB_TOPICS_DESCRIPTION = `GitHub topics search for technology ecosystem discovery.

** CRITICAL FOR EXPLORATORY GITHUB SEARCH:**
This tool is ESSENTIAL before any exploratory GitHub search - it provides the semantic foundation that makes all other GitHub searches effective and targeted.

**WHY GITHUB SEARCH IS GAME-CHANGING:**
- Access to 100M+ repositories of battle-tested, production-ready code
- Community-validated solutions with usage patterns and quality signals
- Real-world implementations from industry leaders and open source maintainers
- Cross-reference between problems, solutions, and best practices
- Discover architectural patterns and implementation strategies at scale

**CORE PURPOSE:**
Foundation tool for understanding technology landscapes and terminology before other searches.

**WHY CRITICAL:**
- Topics provide semantic layer for structured GitHub discovery
- Featured/Curated topics = community-validated quality signals
- Use BEFORE other searches to understand terminology and scope
- Prevents ineffective searches by establishing proper context and terminology

**SEARCH STRATEGY:**
1. **Single Technology Terms**: "react", "python", "docker"
2. **Explore Combinations**: "machine-learning python" (if needed)
3. **Avoid Complex Phrases**: Keep searches simple and focused

**QUALITY INDICATORS:**
- **Featured topics**: GitHub-promoted = highest quality
- **Curated topics**: Community-maintained = reliable
- **Repository count**: >10K = mature, 1K-10K = growing, <1K = emerging

**RESULT TARGETS:**
- 1-10 results: IDEAL - Deep analysis opportunities
- 11-30 results: GOOD - Manageable scope
- 31-100 results: BROAD - Add featured/curated filters
- 100+ results: TOO GENERIC - Refine terms

**FILTERING STRATEGY:**
- Featured: GitHub-curated highest quality topics
- Curated: Community-maintained reliable topics
- Repository count: Filter by ecosystem maturity
- Creation date: Find emerging vs established topics

**MANDATORY INTEGRATION WORKFLOW:**
1. **START HERE**: Search topics to understand technology landscape and establish proper terminology
2. **Repository Discovery**: Use discovered topics as filters in ${TOOL_NAMES.SEARCH_GITHUB_REPOS} for targeted repository finding
3. **Code Implementation**: Apply topic insights to ${TOOL_NAMES.SEARCH_GITHUB_CODE} searches for precise code discovery
4. **Cross-Reference**: Use terminology in ${TOOL_NAMES.SEARCH_GITHUB_ISSUES}, ${TOOL_NAMES.SEARCH_GITHUB_PULL_REQUESTS}, and ${TOOL_NAMES.SEARCH_GITHUB_DISCUSSIONS}
5. **Quality Validation**: Reference topic quality signals when evaluating search results across all GitHub tools

**EXPLORATORY SEARCH IMPACT:**
- Transforms random searches into strategic discovery
- Establishes semantic context for all subsequent GitHub operations  
- Provides quality benchmarks for evaluating repositories and code
- Creates foundation for building comprehensive understanding of technology ecosystems

**OUTPUT:** Technology ecosystem map with community-validated quality signals for informed search strategy across all GitHub discovery tools.`;
