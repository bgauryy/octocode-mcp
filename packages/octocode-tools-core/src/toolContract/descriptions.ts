/** Canonical agent-facing descriptions for the public direct tools. */
export const PUBLIC_TOOL_DESCRIPTIONS = {
  ghSearch:
    'Discover GitHub code with operation:"code", repositories with "repositories", or a known repository tree with "tree". Code search covers the default branch; tree accepts branch. Read known paths with ghGetFileContent. Empty or incomplete search results do not prove absence.',
  ghGetFileContent:
    'Read a known GitHub path. branch is honored when supplied; omission uses the default branch. A path-only call returns bounded, standard-minified content; optionally select fullContent, matchString, or startLine+endLine. minify:"none" preserves text; "symbols" returns an outline. Run returned continuations for partial content. matchedLines are exact source-line anchors. type:"directory" materializes localPath with persistent local access; use ghSearch operation:"tree" to browse remotely.',
  ghSearchHistory:
    'Discover history metadata with operation:"pullRequests", "issues", or "commits". Pull requests may be searched globally; issues and commits require owner+repo. Commit keywords search messages on the default branch; omit keywords to walk history by path/ref/date. Retrieve a known number or commit ref with ghGetHistoryItem.',
  ghGetHistoryItem:
    'Read known history with owner+repo: operation:"pullRequest" or "issue" takes number, "commit" takes ref, and "compare" takes base+head. PR/issue content selectors request bodies, comments, or review/change details; commit/compare includeDiff requests patches. Follow returned continuations for each partial surface.',
  npmSearch:
    'Look up npm package metadata with packageName, or discover npm packages with keywords. Uses npm configuration and registry-scoped credentials; exact scoped names honor scope mappings. Optional registry overrides routing. Keyword search targets one registry and supports page; follow returned continuations. Use returned repository links for source-code research.',
  ghCloneRepo:
    'Create a cached, shallow checkout for repeated reads, local AST/regex, or LSP. Optional sparsePath scopes a file/subtree; complete refers to that scope. branch selects a branch, tag, or full commit SHA; omission uses the default branch. location.commitSha identifies HEAD; cached working-tree contents are not reverified. forceRefresh renews the checkout. Requires git and persistent local storage. Pass results[].data.location.localPath to local tools; ghGetFileContent also supports individual remote reads.',
  localSearch:
    'Find text and regex occurrences with file and line anchors. Matching is lexical; choose literal, Rust regex, or PCRE2 explicitly. Use astSearch for syntax, paths, trees, and file topology. Read matched content with localGetFileContent before an anchored lspSearch.',
  astSearch:
    'Inspect local code structure: files discovers paths and metadata; tree browses a filesystem or one file’s syntax tree; symbols lists native declarations; match selects AST nodes; topology analyzes dependencies, dependents, paths, cycles, reachability, and dead-code candidates. Syntax and graph edges do not establish cross-file symbol identity or safe deletion. Preserve graph scope and configuration when comparing results; verify candidates with exact reads, anchored lspSearch, and runnable checks.',
  localGetFileContent:
    'Read a known local file or anchored region. Content is exact by default; explicitly choose standard for compact content or symbols for an outline. Select fullContent, matchString, or a line range. Follow executable continuations when content is partial. Use exact source lines or positions to anchor lspSearch.',
  lspSearch:
    'Resolve symbol identity, references, call and type hierarchies, implementations, hover, or diagnostics in a configured workspace. Anchor symbol operations to an observed source position or an exact name and line; document and workspace operations have their own scope. Read source first with localGetFileContent. Native syntax fallback is labeled as syntactic evidence; inspect provider and completeness metadata before drawing semantic conclusions.',
} as const;
