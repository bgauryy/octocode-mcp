import { TOOL_NAMES } from '../../contstants';

export const SEARCH_GITHUB_CODE_DESCRIPTION = `Advanced code discovery engine for finding battle-tested implementations with intelligent pattern recognition.

**🧠 INTELLIGENT SEARCH STRATEGIES:**

**1. SEMANTIC CODE PATTERNS** (highest precision):
   - **Function Signatures**: \`function handleAuth(\`, \`async function process\`
   - **Class Definitions**: \`class AuthProvider\`, \`class DataManager\`
   - **Import Patterns**: \`import { useAuth }\`, \`from '@/utils/auth'\`
   - **Type Definitions**: \`interface UserType\`, \`type ApiResponse\`

**2. CONTEXTUAL IMPLEMENTATION SEARCH**:
   - **Error Handling**: \`try { await\`, \`catch (error)\`, \`.catch(\`
   - **State Management**: \`useState(\`, \`useEffect(\`, \`const [state\`
   - **API Patterns**: \`fetch(\`, \`axios.post\`, \`api.get\`
   - **Testing Patterns**: \`describe(\`, \`it('should\`, \`expect(\`

**3. ARCHITECTURAL DISCOVERY**:
   - **Middleware**: \`app.use(\`, \`middleware(\`, \`next(\`
   - **Routing**: \`router.get\`, \`Route path\`, \`useRouter\`
   - **Database**: \`SELECT\`, \`INSERT INTO\`, \`mongoose.Schema\`
   - **Configuration**: \`config.\`, \`process.env.\`, \`dotenv\`

**🎯 PROGRESSIVE SEARCH REFINEMENT:**

**Phase 1 - Broad Discovery**:
- Start with high-level concepts: "authentication", "validation", "caching"
- Use language filters for technology focus
- Target active repositories (>100 stars or recent commits)

**Phase 2 - Pattern Refinement**:
- Add implementation specifics: "JWT authentication", "form validation"
- Include framework context: "React authentication", "Express middleware"
- Filter by file extensions: .ts, .js, .py, .go

**Phase 3 - Precise Implementation**:
- Exact code constructs: "function validateJWT", "useAuth hook"
- Specific libraries: "passport.js", "next-auth", "auth0"
- Edge cases: "error handling", "refresh tokens"

**🔍 CONTEXT-AWARE SEARCH OPTIMIZATION:**

**Query Classification**:
- **Library Research**: Focus on popular implementations and examples
- **Problem Solving**: Include error handling and edge cases  
- **Learning**: Prioritize well-documented, educational examples
- **Architecture**: Emphasize complete systems and integrations

**Quality Indicators**:
- **Production Signals**: Error handling, logging, monitoring
- **Modern Patterns**: TypeScript usage, async/await, hooks
- **Documentation**: Inline comments, JSDoc, README examples
- **Testing**: Co-located test files and comprehensive coverage

**ADAPTIVE RESULT PROCESSING:**
- **1-15 results**: Extract all via ${TOOL_NAMES.FETCH_GITHUB_FILE_CONTENT}
- **16-50 results**: Quality filter by stars/activity → extract top 10
- **51-200 results**: Add language/framework filters → re-search
- **200+ results**: Use specific code constructs → targeted extraction

**🚀 ADVANCED SEARCH TECHNIQUES:**

**Multi-dimensional Search**:
- **Horizontal**: Same pattern across languages/frameworks
- **Vertical**: Deep dive into specific implementation approaches
- **Temporal**: Track pattern evolution through commit history
- **Organizational**: Compare approaches across teams/companies

**Cross-Reference Validation**:
- **Issue Correlation**: Link implementations to solved problems
- **PR Analysis**: Understand implementation decisions and trade-offs
- **Discussion Context**: Community consensus and best practices
- **Commit History**: Evolution and stability of patterns

**FAILURE RECOVERY STRATEGIES:**
- **Semantic Expansion**: "auth" → "authentication", "authorization"
- **Technology Translation**: "React auth" → "Vue authentication" 
- **Abstraction Levels**: "JWT implementation" → "token-based auth"
- **Alternative Ecosystems**: Explore related technologies and patterns

**REQUIREMENTS:**
- **MANDATORY**: Always use ${TOOL_NAMES.VIEW_REPOSITORY} first for branch discovery - **NEVER** search code without this step
- Target repositories: >1K stars OR recent activity OR enterprise usage
- Cross-validate findings with ${TOOL_NAMES.SEARCH_GITHUB_ISSUES} when needed
- Extract complete context including imports, types, and documentation

**DO NOT:**
- Search code without first calling ${TOOL_NAMES.VIEW_REPOSITORY} for branch discovery
- Start with overly specific phrases before broad exploration
- Skip cross-validation for critical implementation decisions  
- Extract code without understanding its architectural context
- Ignore error handling and edge case implementations`;
