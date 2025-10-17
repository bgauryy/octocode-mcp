/**
 * Tool descriptions for MCP registration
 */

import { TOOL_NAMES } from '../constants.js';

/**
 * Tool descriptions object
 * Centralized location for all tool descriptions used in MCP registration
 */
export const TOOL_DESCRIPTIONS = {
  [TOOL_NAMES.LOCAL_SEARCH_CONTENT]: `Search file content using grep (unix text search tool).

Why: Fast pattern matching in code - find implementations, usage, strings, or patterns across files.

SEMANTIC: YOU are the semantic layer - translate user intent → multiple patterns → bulk parallel execution = instant semantic search. No embeddings!
Example: "auth flow?" → queries=[{pattern:"login|auth"}, {pattern:"session|token"}, {pattern:"password"}]

Examples:
• Semantic bulk: queries=[{pattern:"try|catch|error"}, {pattern:"throw|reject"}, {pattern:"Error\\("}]
• Multi-pattern: queries=[{pattern:"TODO"}, {pattern:"FIXME"}, {pattern:"BUG"}]
• Function calls: pattern="functionName\\(", regex=true, include=["*.ts"]
• Literal (3x faster): pattern="import React", fixedString=true
• Context aware: pattern="error", contextLines=3-5

Best Practices:
- Break user intent into multiple related patterns (synonyms, variations)
- Bulk queries = 5-10x faster, better semantic coverage
- Combine patterns: "auth|login|signin" for comprehensive search
- contextLines=3-5 for code flow understanding
- excludeDir=["node_modules","dist",".git"] to skip artifacts`,

  [TOOL_NAMES.LOCAL_VIEW_STRUCTURE]: `Explore directory structure using ls (unix directory listing).

Why: Understand codebase organization, find entry points, identify file types, spot patterns.

SEMANTIC: Map user concepts to directory patterns → bulk parallel = instant structural understanding.
Example: "main code?" → queries=[{path:"src"}, {path:"lib"}, {path:"app"}]

Examples:
• Semantic: "architecture" → queries=[{path:"src",depth:2}, {path:"config"}, {path:"docs"}]
• Bulk explore: queries=[{path:"src"}, {path:"tests"}, {path:"config"}]
• Recent: sortBy="time", details=true, reverse=false
• Large files: sortBy="size", reverse=true, humanReadable=true
• By type: extensions=["ts","tsx"], filesOnly=true, summary=true

Best Practices:
- Map concepts to multiple dirs: "frontend" → src/, components/, pages/, app/
- Bulk queries explore related locations in parallel
- details=true + humanReadable=true for metadata
- Start depth=1-2, use summary=true for stats`,

  [TOOL_NAMES.LOCAL_FIND_FILES]: `Advanced file discovery using find (unix file search tool).

Why: Locate files by name, type, size, modification time, or permissions - more powerful than ls.

SEMANTIC: Map concepts to file patterns → bulk parallel = complete discovery.
Example: "config files?" → queries=[{name:"*config*"}, {name:"*.env*"}, {name:"*.json"}, {name:"*.yaml"}]

Examples:
• Semantic: "API" → queries=[{name:"*api*"}, {name:"*endpoint*"}, {containsPattern:"@app.route"}]
• Bulk patterns: queries=[{name:"*.ts"}, {name:"*.test.*"}, {name:"README*"}]
• Recent: modifiedWithin="7d", type="f", details=true
• Large: sizeGreater="1M", type="f", details=true
• With content: name="*.js", containsPattern="export default"

Best Practices:
- Think variations: "test" → *.test.*, *.spec.*, __tests__/, test_*
- Bulk queries = 5-10x faster parallel discovery
- Combine filters: type="f" + name + modifiedWithin
- containsPattern bridges discovery + content search
- excludeDir=["node_modules",".git","dist"] skips artifacts`,

  [TOOL_NAMES.LOCAL_FETCH_CONTENT]: `Fetch file content with partial read support for token optimization.

Why: Get exact file content with control over what portions to read - essential for understanding code without loading entire large files.

SEMANTIC: Use matchString to extract semantically relevant sections → bulk parallel + minified = maximum token efficiency.
Example: "validation logic?" → matchString="validate", get implementation + context

Modes:
• Full Content: fullContent=true - Returns entire file (minified)
• Line Range: startLine=10, endLine=50 - Specific line range
• Match String: matchString="function", matchStringContextLines=5 - Pattern with context (BEST for semantic!)

Examples:
• Semantic: "error handling" → queries=[{path:"utils.ts",matchString:"catch"}, {path:"utils.ts",matchString:"throw"}]
• Bulk fetch: queries=[{path:"src/index.ts"}, {path:"src/utils.ts"}]
• Pattern extract: path="config.ts", matchString="export", matchStringContextLines=10
• Multi-section: Multiple matchStrings on same file for complete picture

Best Practices:
- matchString mode = most token-efficient for semantic extraction
- matchStringContextLines=5-15 balances context vs tokens
- Bulk queries = 5-10x faster parallel fetching
- minified=true (default) optimizes tokens
- Progressive: matchString first, line ranges if needed`,
} as const;
