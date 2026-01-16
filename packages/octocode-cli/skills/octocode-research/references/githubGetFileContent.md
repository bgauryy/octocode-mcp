# githubGetFileContent

Read file content from GitHub repositories.

**Endpoint**: `GET /github/content`

> **Server runs locally** on user's machine. GitHub API calls are made from the local server.

## HTTP API Examples

```bash
# Read with match string (RECOMMENDED for large files)
curl "http://localhost:1987/github/content?owner=facebook&repo=react&path=packages/react/src/ReactHooks.js&matchString=export%20function&matchStringContextLines=20"

# Read line range
curl "http://localhost:1987/github/content?owner=expressjs&repo=express&path=lib/router/index.js&startLine=1&endLine=50"

# Read full file (small configs only)
curl "http://localhost:1987/github/content?owner=lodash&repo=lodash&path=package.json&fullContent=true"

# Read from specific branch
curl "http://localhost:1987/github/content?owner=facebook&repo=react&path=packages/react/src/React.js&branch=canary&matchString=experimental"

# Character pagination for large files
curl "http://localhost:1987/github/content?owner=microsoft&repo=TypeScript&path=src/compiler/checker.ts&charOffset=0&charLength=10000"
```

## Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `owner` | string | ✅ | Repository owner |
| `repo` | string | ✅ | Repository name |
| `path` | string | ✅ | File path in repo |
| `mainResearchGoal` | string | ✅ | Overall objective |
| `researchGoal` | string | ✅ | Specific goal |
| `reasoning` | string | ✅ | Why this approach |
| `branch` | string | | Branch NAME (not SHA!) Default: default branch |
| `matchString` | string | | Pattern to find |
| `matchStringContextLines` | number | | Default: 5, max: 50 |
| `startLine` | number | | 1-indexed |
| `endLine` | number | | 1-indexed |
| `fullContent` | boolean | | Small files only! (300KB max) |
| `charOffset` | number | | Character offset |
| `charLength` | number | | Max: 50000 |

## Response Structure

```json
{
  "status": "hasResults",
  "owner": "facebook",
  "repo": "react",
  "path": "packages/react/src/ReactHooks.js",
  "branch": "main",
  "content": "export function useState(initialState) {\n  const dispatcher = resolveDispatcher();\n  return dispatcher.useState(initialState);\n}",
  "sha": "abc123...",
  "url": "https://github.com/facebook/react/blob/main/packages/react/src/ReactHooks.js",
  "totalLines": 150,
  "extractedLines": {
    "start": 20,
    "end": 45
  }
}
```

## Extraction Methods

Choose **ONE** method:

| Method | Use Case | Parameters |
|--------|----------|------------|
| Match string | Find specific pattern | `matchString`, `matchStringContextLines` |
| Line range | Known line numbers | `startLine`, `endLine` |
| Full content | Small config files | `fullContent=true` |
| Char pagination | Large files | `charOffset`, `charLength` |

## Tips

- **Use `matchString`** for large files - more efficient than `fullContent`
- **Branch is NAME, not SHA**: Use `main`, `master`, not commit hash
- **300KB max file size**: Larger files return `FILE_TOO_LARGE` error
- **Choose ONE method**: Cannot combine methods

## Workflow

```bash
# 1. Search for code
curl "http://localhost:1987/github/search?keywordsToSearch=useState&owner=facebook&repo=react"

# 2. Read matched file using text_matches as matchString
curl "http://localhost:1987/github/content?owner=facebook&repo=react&path=packages/react/src/ReactHooks.js&matchString=useState&matchStringContextLines=30"
```

## Output: GitHub Links

Include full GitHub links in research output:

```
https://github.com/{owner}/{repo}/blob/{branch}/{path}#L{line}
https://github.com/{owner}/{repo}/blob/{branch}/{path}#L{start}-L{end}
```

## Related Endpoints

- [`/github/search`](./githubSearchCode.md) - Search before reading
- [`/github/structure`](./githubViewRepoStructure.md) - Find file paths
- [`/github/prs`](./githubSearchPullRequests.md) - Find file history
