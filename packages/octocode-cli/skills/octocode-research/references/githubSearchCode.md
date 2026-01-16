# githubSearchCode

Search code across GitHub repositories.

**Endpoint**: `GET /github/search`

> **Server runs locally** on user's machine. GitHub API calls are made from the local server.

## HTTP API Examples

```bash
# Search in specific repo
curl "http://localhost:1987/github/search?keywordsToSearch=useState,dispatcher&owner=facebook&repo=react"

# Search with file extension filter
curl "http://localhost:1987/github/search?keywordsToSearch=jwt,verify,token&extension=ts&limit=20"

# Search file names (not content)
curl "http://localhost:1987/github/search?keywordsToSearch=config&match=path"

# Search in organization
curl "http://localhost:1987/github/search?keywordsToSearch=auth,service&owner=wix-private"

# Search all of GitHub
curl "http://localhost:1987/github/search?keywordsToSearch=graphql,client&extension=ts&limit=30"
```

## Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `keywordsToSearch` | string | ✅ | Comma-separated keywords (1-5) |
| `mainResearchGoal` | string | ✅ | Overall objective |
| `researchGoal` | string | ✅ | Specific goal for this query |
| `reasoning` | string | ✅ | Why this approach |
| `owner` | string | | Repository owner |
| `repo` | string | | Repository name |
| `path` | string | | Path prefix (strict!) |
| `extension` | string | | File extension |
| `filename` | string | | Filename pattern |
| `match` | string | | `file` for content, `path` for names |
| `limit` | number | | Default: 10, max: 50 |
| `page` | number | | Default: 1, max: 10 |

## Response Structure

```json
{
  "status": "hasResults",
  "files": [
    {
      "path": "packages/react/src/ReactHooks.js",
      "repo": "facebook/react",
      "text_matches": ["export function useState(initialState) {"],
      "lastModifiedAt": "2024-01-15T10:30:00Z"
    }
  ],
  "repositoryContext": {
    "owner": "facebook",
    "repo": "react",
    "branch": "main"
  },
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "totalMatches": 48,
    "hasMore": true
  }
}
```

## Filter Guidelines

⚠️ **Use 1-2 filters max!** Never combine `extension` + `filename` + `path`.

| Filter | Use Case | Example |
|--------|----------|---------|
| `owner` + `repo` | Search specific repo | `owner=facebook&repo=react` |
| `extension` | File type | `extension=ts` |
| `path` | Directory prefix | `path=src/components` |
| `filename` | Filename pattern | `filename=index` |

## Tips

- **Start lean**: Single filter → verify → add filters
- **Prefer `owner` + `repo`**: Most precise results
- **Use `text_matches`**: Get matched code snippets from results
- **GitHub caps at 1000**: `totalMatches` is capped by GitHub API
- **path is strict prefix**: `path=pkg` finds `pkg/file`, NOT `parent/pkg/file`

## Common Mistakes

```bash
# ❌ BAD: Too many filters
curl "...?keywordsToSearch=auth&extension=ts&filename=index&path=src"
# Will likely return empty!

# ✅ GOOD: Focused query
curl "...?keywordsToSearch=auth&owner=myorg&repo=myrepo"
```

## Next Steps

After finding code:
- [`/github/content`](./githubGetFileContent.md) - Read matched files
- [`/github/structure`](./githubViewRepoStructure.md) - Explore around matches

## Related Endpoints

- [`/github/content`](./githubGetFileContent.md) - Read files
- [`/github/structure`](./githubViewRepoStructure.md) - Explore repo
- [`/package/search`](./packageSearch.md) - Find package repo first
