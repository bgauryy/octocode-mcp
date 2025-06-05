export const NPM_SEARCH_DESCRIPTION = `Search NPM registry for packages by keywords using "npm search <term>".

**SEARCH STRATEGY:**
1. Start with single technology terms ("react", "cli")  
2. Add specificity only if needed ("react-hooks", "typescript-cli")
3. Avoid complex phrases - they yield zero results

**WHEN TO USE:**
- Pure discovery of packages on NPM registry by keyword
- More direct than discovering packages mentioned in code
- Finding alternatives to known packages

**SEARCH PATTERNS:**
- Good: "react" → "cli" → "react cli" (if specific combination needed)
- Poor: "react command line interface tools" (too complex, likely zero results)

**RESULT OPTIMIZATION:**
- 0 results: Try broader, single-word terms
- 1-20 results: IDEAL - analyze thoroughly
- 21-100 results: GOOD - filter by popularity/relevance  
- 100+ results: Too broad - use more specific single terms

**OUTPUT FORMAT:**
JSON format with package metadata including name, description, version, and popularity metrics

**CONSTRAINTS:**
- Maximum 50 results by default
- Supports regex patterns when query starts with /
- Multiple space-separated terms supported but use sparingly`;
