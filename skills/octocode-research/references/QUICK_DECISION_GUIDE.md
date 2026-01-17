# Quick Decision Guide (Examples)

## Local (workspace)

| Question | Tool Chain |
|----------|------------|
| "Where is X defined?" | `localSearchCode` → `lspGotoDefinition(lineHint)` |
| "Who calls X?" | `localSearchCode` → `lspCallHierarchy(incoming, lineHint)` |
| "What does X call?" | `localSearchCode` → `lspCallHierarchy(outgoing, lineHint)` |
| "All usages of X?" | `localSearchCode` → `lspFindReferences(lineHint)` |
| "Show directory structure" | `localViewStructure(depth=2)` |
| "Find files by name" | `localFindFiles(iname="pattern")` |
| "Read file content" | `localGetFileContent(matchString)` |

## External (GitHub)

| Question | Tool Chain |
|----------|------------|
| "Find repos about X" | `githubSearchRepositories` → `githubViewRepoStructure` |
| "How does library X work?" | `githubSearchCode` → `githubViewRepoStructure` → `githubGetFileContent` |
| "Understand repo structure" | `githubViewRepoStructure` → read configs (`package.json`, `README`) |
| "Search files/code in repo" | `githubSearchCode(owner, repo, path/keywords)` |
| "Read file from GitHub" | `githubGetFileContent(owner, repo, path)` |
| "Find PRs about X" | `githubSearchPullRequests(query)` |
| "npm package info" | `packageSearch(name)` *(npm only)* |

## Rules

- **Local**: `localSearchCode` first → get `lineHint` → then LSP tools
- **External**: `githubSearchCode` or `githubSearchRepositories` → get owner/repo → `githubViewRepoStructure` → `githubGetFileContent`
