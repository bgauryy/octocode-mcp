import { TOOL_NAMES } from '../../contstants';

export const SEARCH_GITHUB_CODE_DESCRIPTION = `Find battle-tested code implementations with intelligent pattern matching.

**📚 REFERENCE**: Use \`search-github-code-instructions\` resource for complete syntax examples.

**SEARCH PHASES:**

**1. Semantic Discovery**:
- Function signatures: \`"function handleAuth"\`, \`"async function process"\`
- Class definitions: \`"class AuthProvider"\`, \`"interface UserType"\`
- Import patterns: \`"import { useAuth }"\`, \`"from '@/utils/auth'"\`

**2. Implementation Patterns**:
- Error handling: \`"try {" language:javascript\`, \`"catch (error)"\`
- State management: \`"useState(" language:javascript\`, \`"useEffect("\`
- API patterns: \`"fetch(" language:javascript\`, \`"axios.post"\`

**3. Architecture Discovery**:
- Middleware: \`"app.use(" language:javascript\`
- Routing: \`"router.get" language:javascript\`
- Database: \`"mongoose.Schema"\`, \`"SELECT * FROM" language:sql\`

**PROGRESSIVE REFINEMENT:**
1. Start basic: \`authentication\`
2. Add language: \`authentication language:javascript\`
3. Add context: \`"JWT authentication" language:javascript path:src\`
4. Add exclusions: \`NOT path:test\`

**QUALITY TARGETING:**
- Production code: \`NOT path:test NOT path:spec\`
- Modern patterns: \`"async await"\`
- Documentation: \`"JSDoc" OR "/**"\`

**RESULT PROCESSING:**
- 1-15 results: Extract all via \`${TOOL_NAMES.FETCH_GITHUB_FILE_CONTENT}\`
- 16-50 results: Quality filter, extract top 10
- 51+ results: Add qualifiers, re-search with specificity

**REQUIREMENTS:**
- **MANDATORY**: Use \`${TOOL_NAMES.VIEW_REPOSITORY}\` first for branch discovery
- Target: >1K stars OR recent activity OR enterprise usage
- Extract complete context including imports and types

**AVOID:**
- Wildcard characters in queries
- Overly complex boolean expressions
- Searching without branch discovery
- Ignoring language qualifiers`;
