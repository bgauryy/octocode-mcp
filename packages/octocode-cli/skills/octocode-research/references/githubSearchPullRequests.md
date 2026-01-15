# githubSearchPullRequests

Search and analyze pull request history on GitHub.

**Endpoint**: `GET /github/prs`

> **Server runs locally** on user's machine. GitHub API calls are made from the local server.

## HTTP API Examples

```bash
# Search merged PRs
curl "http://localhost:1987/github/prs?owner=expressjs&repo=express&state=closed&merged=true&query=authentication&type=metadata"

# Get specific PR by number
curl "http://localhost:1987/github/prs?owner=facebook&repo=react&prNumber=123&type=metadata&withComments=true"

# Get file changes from PR
curl "http://localhost:1987/github/prs?owner=facebook&repo=react&prNumber=456&type=partialContent"

# Search by author
curl "http://localhost:1987/github/prs?owner=facebook&repo=react&author=gaearon&merged=true&limit=10"

# Get PR with specific file changes
curl "http://localhost:1987/github/prs?owner=expressjs&repo=express&prNumber=789&type=partialContent&partialContentFiles=lib/router/index.js"
```

## Use Case

**Code archaeology**: Understand WHY code was written the way it is.

## Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `mainResearchGoal` | string | ✅ | Overall objective |
| `researchGoal` | string | ✅ | Specific goal |
| `reasoning` | string | ✅ | Why this approach |
| `prNumber` | number | | Specific PR (ignores ALL other filters!) |
| `owner` | string | | Repository owner |
| `repo` | string | | Repository name |
| `query` | string | | Search terms |
| `state` | string | | `open` or `closed` |
| `merged` | boolean | | Only merged PRs |
| `author` | string | | PR author |
| `assignee` | string | | Assigned reviewer |
| `label` | string | | PR labels |
| `created` | string | | Date range |
| `closed` | string | | Closed date range |
| `type` | string | | `metadata`, `partialContent`, `fullContent` |
| `withComments` | boolean | | Include review comments |
| `withCommits` | boolean | | Include commit list |
| `partialContentFiles` | string | | Comma-separated file paths for partialContent |
| `limit` | number | | Default: 3, max: 10 |

## Content Types

| Type | Use Case | Data Included |
|------|----------|---------------|
| `metadata` | Quick overview (START HERE) | Title, author, state, stats |
| `partialContent` | Specific file changes | Diffs for selected files |
| `fullContent` | Complete PR (expensive!) | All diffs, comments, commits |

## Response Structure

```json
{
  "status": "hasResults",
  "pullRequests": [
    {
      "number": 123,
      "title": "Add authentication middleware",
      "state": "closed",
      "merged": true,
      "author": "developer",
      "body": "This PR adds...",
      "changedFiles": 5,
      "additions": 150,
      "deletions": 30,
      "url": "https://github.com/org/repo/pull/123",
      "createdAt": "2024-01-10T10:00:00Z",
      "mergedAt": "2024-01-15T15:00:00Z",
      "labels": ["feature", "auth"],
      "comments": [
        {
          "author": "reviewer",
          "body": "Great implementation!",
          "createdAt": "2024-01-12T09:00:00Z"
        }
      ],
      "files": [
        {
          "filename": "src/auth/middleware.ts",
          "status": "added",
          "additions": 50,
          "deletions": 0,
          "patch": "@@ -0,0 +1,50 @@\n+export function authenticate..."
        }
      ]
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 3,
    "hasMore": true
  }
}
```

## Workflow

```bash
# Step 1: Find PRs (metadata first)
curl "http://localhost:1987/github/prs?owner=myorg&repo=myrepo&query=auth&state=closed&merged=true&type=metadata"

# Step 2: Deep dive into specific PR
curl "http://localhost:1987/github/prs?prNumber=123&type=partialContent&partialContentFiles=src/auth/middleware.ts&withComments=true"
```

## Tips

- **`prNumber` ignores all filters**: Use alone for specific PR lookup
- **Start with `type=metadata`**: Faster, then drill down
- **Avoid `fullContent` on large PRs**: Token expensive
- **Use `withComments=true`**: Understand WHY decisions were made
- **Filter by `merged=true`**: Focus on accepted changes

## Related Endpoints

- [`/github/search`](./githubSearchCode.md) - Find code first
- [`/github/content`](./githubGetFileContent.md) - Read current state
- [`/github/structure`](./githubViewRepoStructure.md) - Explore around changes
