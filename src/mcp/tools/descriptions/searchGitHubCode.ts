import { TOOL_NAMES } from '../../contstants';

export const SEARCH_GITHUB_CODE_DESCRIPTION = `Advanced code discovery engine for finding battle-tested implementations with intelligent pattern recognition.

**📚 ESSENTIAL REFERENCE**: Consult \`search-github-code-instructions\` resource for complete GitHub search syntax and examples.

**🧠 INTELLIGENT SEARCH STRATEGIES:**

**Phase 1 - Semantic Discovery**:
   - **Function Signatures**: \`"function handleAuth"\`, \`"async function process"\`
   - **Class Definitions**: \`"class AuthProvider"\`, \`"class DataManager"\`
   - **Import Patterns**: \`"import { useAuth }"\`, \`"from '@/utils/auth'"\`
   - **Type Definitions**: \`"interface UserType"\`, \`"type ApiResponse"\`

**Phase 2 - Contextual Implementation**:
   - **Error Handling**: \`"try {" language:javascript\`, \`"catch (error)"\`, \`".catch("\`
   - **State Management**: \`"useState(" language:javascript\`, \`"useEffect("\`
   - **API Patterns**: \`"fetch(" language:javascript\`, \`"axios.post"\`, \`"api.get"\`
   - **Testing Patterns**: \`"describe(" language:javascript\`, \`"it('should"\`

**Phase 3 - Architectural Discovery**:
   - **Middleware**: \`"app.use(" language:javascript\`, \`"middleware("\`
   - **Routing**: \`"router.get" language:javascript\`, \`"Route path"\`
   - **Database**: \`"SELECT * FROM" language:sql\`, \`"mongoose.Schema"\`
   - **Configuration**: \`"config." language:javascript\`, \`"process.env."\`

**🎯 PROGRESSIVE SEARCH REFINEMENT:**

**Simple to Complex Queries**:
1. **Start Basic**: \`authentication\`
2. **Add Language**: \`authentication language:javascript\`
3. **Add Context**: \`"JWT authentication" language:javascript\`
4. **Add Location**: \`"JWT authentication" language:javascript path:src\`
5. **Add Exclusions**: \`"JWT authentication" language:javascript path:src NOT path:test\`

**Repository Scoping**:
1. **Broad Search**: \`"useAuth hook" language:javascript\`
2. **Organization**: \`"useAuth hook" language:javascript org:facebook\`
3. **Specific Repo**: \`"useAuth hook" language:javascript repo:facebook/react\`

**🔧 ADVANCED TECHNIQUES:**

**Multi-dimensional Searches**:
- **Cross-Language**: \`(language:typescript OR language:javascript) "API client"\`
- **Pattern Evolution**: \`"class Component" OR "function Component" language:javascript\`
- **Error Investigation**: \`"TypeError" OR "ReferenceError" language:javascript path:src\`

**Quality Filtering**:
- **Production Code**: \`"error handling" language:javascript NOT path:test NOT path:spec\`
- **Documentation**: \`"JSDoc" OR "/**" language:javascript\`
- **Modern Patterns**: \`"async await" language:javascript\`

**🔄 ADAPTIVE RESULT PROCESSING:**
- **1-15 results**: Extract all via \`${TOOL_NAMES.FETCH_GITHUB_FILE_CONTENT}\`
- **16-50 results**: Quality filter → extract top 10
- **51-200 results**: Add qualifiers → re-search
- **200+ results**: Use specific syntax → targeted extraction

**REQUIREMENTS:**
- **MANDATORY**: Always use \`${TOOL_NAMES.VIEW_REPOSITORY}\` first for branch discovery
- **REFERENCE**: Consult \`search-github-code-instructions\` resource for complete syntax guide
- Target repositories: >1K stars OR recent activity OR enterprise usage
- Cross-validate with \`${TOOL_NAMES.SEARCH_GITHUB_ISSUES}\` for problem context
- Extract complete context including imports, types, and documentation

**DO NOT:**
- Search without calling \`${TOOL_NAMES.VIEW_REPOSITORY}\` for branch discovery
- Use wildcard characters in queries
- Start with overly complex boolean expressions
- Ignore language and path qualifiers for precision
- Skip regex patterns for complex matching needs
- Search without considering file size and repository limitations`;
