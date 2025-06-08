export const SEARCH_GITHUB_CODE_DESCRIPTION = `Advanced GitHub code search with intelligent pattern matching, mandatory repository scoping, and smart fallback strategies.

**MANDATORY REPOSITORY SCOPING:**
Every search automatically includes "repo:owner/repository" for surgical precision:
- Eliminates noise from unrelated repositories
- Guarantees results from target codebase only
- Enables deep analysis of specific implementations

**🔥 AUTOMATIC BOOLEAN OPERATORS PRIORITY:**
Multi-term queries automatically use Boolean AND for maximum precision:
- **Auto-Enhanced**: \`useState hooks\` → \`useState AND hooks\`
- **Preserved**: \`useState OR useEffect\` → \`useState OR useEffect\` (unchanged)
- **Intelligent**: Single terms get exact matching, multi-terms get Boolean precision
- **Surgical Accuracy**: Every multi-word search becomes a precise Boolean query

**SOPHISTICATED SEARCH INTELLIGENCE:**
Supports complex query patterns with battle-tested accuracy:
- **Single Terms**: \`useState\`, \`scheduleCallback\`, \`workLoopConcurrent\`
- **Auto-Boolean Multi-Terms**: \`concurrent rendering\` → \`concurrent AND rendering\`
- **Function Patterns**: \`useEffect(() =>\`, \`React.createElement\`, \`export default\`
- **🔥 POWERFUL BOOLEAN OPERATORS**: \`hooks AND state\`, \`(useState OR useEffect)\`, \`error NOT warning\`
- **Technical Implementations**: Complex internal function names and patterns

**BOOLEAN SEARCH MASTERY:**
Unlock advanced code discovery with automatic and manual logical operators:
- **AUTO-AND**: Multi-word queries automatically become AND operations
- **Manual AND**: \`authentication AND jwt\` - Explicit intersecting concepts
- **OR**: \`useState OR useEffect\` - Multiple hook patterns  
- **NOT**: \`error NOT test\` - Exclude test files from error handling
- **Grouping**: \`(react OR vue) AND typescript\` - Complex logic combinations
- **🎯 Game-Changer**: All multi-term searches become precision Boolean queries

**LANGUAGE-AWARE FILTERING:**
- **JavaScript**: Frontend implementations, Node.js backends
- **TypeScript**: Type definitions, interfaces, advanced patterns
- **Extension Filtering**: \`.ts\`, \`.js\`, \`.jsx\`, \`.tsx\` files

**PROVEN SEARCH METHODOLOGIES:**
✅ **Single Term Discovery**: Core functions and exports
✅ **Auto-Boolean Multi-Terms**: Feature implementations with AND precision  
✅ **Pattern Matching**: Arrow functions, hooks, class patterns
✅ **🎯 Boolean Combinations**: Complex logical queries with laser accuracy
✅ **Technical Deep-Dive**: Internal scheduler, reconciler code
✅ **Interface Discovery**: TypeScript definitions and contracts
✅ **Language Scoping**: Technology-specific implementations

**ENTERPRISE-GRADE ACCURACY:**
- **File Context**: Complete file paths with line-level precision
- **Implementation Focus**: Actual source code, not documentation
- **Quality Results**: React core, scheduler, reconciler implementations
- **Zero False Positives**: Repository scoping eliminates irrelevant matches

**INTELLIGENT FALLBACK STRATEGIES:**

**No Results Found (0 results):**
- **Broaden Query**: Remove boolean operators, try individual terms
- **Alternative Terms**: Use synonyms ("auth" → "authentication", "config" → "configuration")
- **Expand Scope**: Remove language/extension filters
- **Path Exploration**: Remove path restrictions, search entire repository
- **Case Variations**: Try different casing ("React" → "react")

**Too Many Results (100+ results):**
- **Add Specificity**: Include language filter (\`language:typescript\`)
- **Path Restrictions**: Focus on source code (\`path:src\`)
- **File Type Filtering**: Use extension filter (\`extension:ts\`)
- **Exclude Patterns**: Add NOT operators (\`component NOT test\`)
- **Date Constraints**: Recent implementations (\`created:>2023-01-01\`)

**Wrong Context Results:**
- **Framework Qualifiers**: Add specific framework terms (\`react component\`)
- **Environment Context**: Specify runtime (\`nodejs express\`)
- **Use Case Context**: Add purpose (\`production deployment\`)
- **Architecture Context**: Include pattern (\`microservice api\`)

**Outdated/Legacy Results:**
- **Date Filtering**: Recent code (\`created:>2022-01-01\`)
- **Activity Sorting**: Sort by recent updates
- **Modern Patterns**: Include current framework versions
- **Maintenance Check**: Look for active repositories

**Rate Limit Mitigation:**
- **NPM-First Strategy**: Use npm_search to discover repositories first
- **Targeted Searches**: Use discovered owner/repo for precise targeting
- **Batch Processing**: Group related searches efficiently
- **Cache Utilization**: Leverage built-in response caching

**Authentication/Access Issues:**
- **Public Alternatives**: Search public repositories with similar patterns
- **Organization Discovery**: Use get_user_organizations to check access
- **Scope Verification**: Ensure proper GitHub CLI authentication
- **Fallback Repositories**: Use popular open-source alternatives

**POWERFUL USE CASES:**
- **Architecture Analysis**: Study React's concurrent rendering implementation
- **API Discovery**: Find actual usage patterns of complex functions
- **Pattern Learning**: Expert TypeScript interface structures
- **Implementation Deep-Dive**: Scheduler, reconciler, fiber logic
- **Migration Planning**: Breaking changes and new APIs

**RESULT OPTIMIZATION GUIDE:**
- **1-10 Results**: IDEAL - Deep analysis opportunity
- **11-30 Results**: GOOD - Manageable scope for review
- **31-100 Results**: ACCEPTABLE - May need refinement
- **100+ Results**: TOO BROAD - Apply filters and restrictions

**SEARCH PRECISION:**
Transforms code discovery from guesswork into pinpoint accuracy. Every multi-term query automatically becomes a Boolean AND operation for maximum relevance with intelligent fallback strategies for any scenario.`;
