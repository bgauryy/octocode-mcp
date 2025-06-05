import { TOOL_NAMES } from '../tools/contstants';

export const SEARCH_GITHUB_TOPICS_DESCRIPTION = `GitHub topics search for technology ecosystem discovery.

**CORE PURPOSE:**
Foundation tool for understanding technology landscapes and terminology before other searches.

**WHY CRITICAL:**
- Topics provide semantic layer for structured GitHub discovery
- Featured/Curated topics = community-validated quality signals
- Use BEFORE other searches to understand terminology and scope

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

**INTEGRATION WORKFLOW:**
1. Search topics to understand technology landscape
2. Use discovered topics as filters in ${TOOL_NAMES.SEARCH_GITHUB_REPOS}
3. Apply topic insights to ${TOOL_NAMES.SEARCH_GITHUB_CODE} searches
4. Reference for terminology in other search tools

**OUTPUT:** Technology ecosystem map with community-validated quality signals for informed search strategy.`;
