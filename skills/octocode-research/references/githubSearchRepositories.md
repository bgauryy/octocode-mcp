# githubSearchRepositories

Find GitHub repositories by topic or keyword.

**Endpoint**: `GET /github/repos`

> **Server runs locally** on user's machine. GitHub API calls are made from the local server.

## HTTP API Examples

```bash
# Search by topics
curl "http://localhost:1987/github/repos?topicsToSearch=typescript,cli&stars=%3E1000&sort=stars"

# Search by keywords
curl "http://localhost:1987/github/repos?keywordsToSearch=react,state,management&sort=stars&limit=20"

# Search within organization
curl "http://localhost:1987/github/repos?owner=wix-private&keywordsToSearch=auth,service"

# Filter by activity
curl "http://localhost:1987/github/repos?topicsToSearch=typescript&updated=%3E2024-01-01&stars=%3E100"

# Match in specific fields
curl "http://localhost:1987/github/repos?keywordsToSearch=graphql,client&match=readme"
```

## Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `mainResearchGoal` | string | ✅ | Overall objective |
| `researchGoal` | string | ✅ | Specific goal |
| `reasoning` | string | ✅ | Why this approach |
| `topicsToSearch` | string | | Repository topics: `typescript,cli` |
| `keywordsToSearch` | string | | Keywords in name/description |
| `owner` | string | | Filter by owner/org |
| `stars` | string | | Stars: `>1000`, `100..500` |
| `created` | string | | Created date range |
| `updated` | string | | Updated date range |
| `match` | string | | Where to match: `name`, `description`, `readme` |
| `sort` | string | | `stars`, `forks`, `updated`, `best-match` |
| `limit` | number | | Default: 10, max: 100 |
| `page` | number | | Default: 1, max: 10 |

## Response Structure

```json
{
  "status": "hasResults",
  "totalCount": 1523,
  "repositories": [
    {
      "fullName": "facebook/react",
      "description": "A declarative, efficient, and flexible JavaScript library...",
      "stars": 220000,
      "forks": 45000,
      "language": "JavaScript",
      "topics": ["javascript", "react", "ui"],
      "pushedAt": "2024-01-15T10:30:00Z",
      "updatedAt": "2024-01-15T12:00:00Z",
      "url": "https://github.com/facebook/react",
      "defaultBranch": "main"
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 10,
    "hasMore": true
  }
}
```

## Search Strategies

| Strategy | Use Case | Example |
|----------|----------|---------|
| Topics | Open-source discovery | `topicsToSearch=typescript,testing` |
| Keywords | Org repos, specific names | `owner=myorg&keywordsToSearch=auth` |
| Stars filter | Popular projects | `stars=>1000` |

## /package/search vs /github/repos

| Use Case | Tool |
|----------|------|
| Known package name (lodash, express) | `/package/search` |
| Broad discovery by topic | `/github/repos` |
| Organization repos | `/github/repos` |

## Tips

- **Check `pushedAt`** over `updatedAt`: Code change vs metadata change
- **Use `stars=>1000`** to filter noise (may hide new projects)
- **Try synonyms**: `auth` ↔ `authentication`, `plugin` ↔ `extension`
- **Archived repos auto-excluded**: Only active repos returned

## Next Steps

After finding a repository:
- [`/github/structure`](./githubViewRepoStructure.md) - Explore structure
- [`/github/search`](./githubSearchCode.md) - Search code in repo
- [`/github/content`](./githubGetFileContent.md) - Read files

## Related Endpoints

- [`/package/search`](./packageSearch.md) - Find package → repo URL
- [`/github/structure`](./githubViewRepoStructure.md) - Explore found repos
- [`/github/search`](./githubSearchCode.md) - Search code
