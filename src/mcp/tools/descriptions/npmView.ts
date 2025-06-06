import { TOOL_NAMES } from '../../contstants';

export const NPM_VIEW_DESCRIPTION = `Transform package names into GitHub repositories for code analysis.

**WHEN TO USE:**
- User mentions package names ("react", "lodash", "@types/node")
- Code snippets with imports: import { useState } from 'react'
- Dependency/module references in user queries

**WORKFLOW:**
1. Extract repository URL from package.json
2. Parse owner/repo from GitHub URL formats
3. Chain to ${TOOL_NAMES.VIEW_REPOSITORY} for branch discovery
4. Continue to ${TOOL_NAMES.SEARCH_GITHUB_CODE} for implementations

**OUTPUT:**
Repository context + package metadata for intelligent code search

**EXAMPLES:**
- "react" → github.com/facebook/react → Code search in React repo
- "lodash" → github.com/lodash/lodash → Extract utility implementations  
- "@org/some-lib" → Private repo discovery → Organizational code analysis

**SUCCESS CRITERIA:**
Accurate repository mapping that enables battle-tested code extraction

**DO NOT:**
- Skip package-to-repository mapping when packages are mentioned
- Assume package names without verification
- Use for non-npm package references`;
