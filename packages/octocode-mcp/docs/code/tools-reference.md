# Tools Reference

Complete reference for all available MCP tools.

## github_search_repos

Search GitHub repositories with advanced filters.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| query | string | Yes | Search query (keywords, qualifiers) |
| maxResults | number | No | Maximum results to return (default: 30) |
| sort | string | No | Sort by: stars, forks, updated |
| order | string | No | Order: asc, desc |

### Example

```json
{
  "query": "language:typescript mcp",
  "maxResults": 10,
  "sort": "stars",
  "order": "desc"
}
```

### Response

Returns repository information including name, description, URL, stars, forks, language, and topics.

---

## github_search_code

Search for code across GitHub repositories.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| query | string | Yes | Code search query |
| maxResults | number | No | Maximum results (default: 30) |
| sort | string | No | Sort by: indexed |

### Example

```json
{
  "query": "McpServer language:typescript",
  "maxResults": 20
}
```

### Response

Returns code snippets with file path, repository, and surrounding context.

---

## github_fetch_content

Fetch file or directory contents from a GitHub repository.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| owner | string | Yes | Repository owner/organization |
| repo | string | Yes | Repository name |
| path | string | Yes | File or directory path |
| branch | string | No | Branch name (default: default branch) |

### Example

```json
{
  "owner": "octocode",
  "repo": "mcp",
  "path": "src/index.ts",
  "branch": "main"
}
```

### Response

Returns file content (decoded from base64) or directory listing.

---

## github_view_repo_structure

View the directory structure of a repository.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| owner | string | Yes | Repository owner |
| repo | string | Yes | Repository name |
| path | string | No | Subdirectory path (default: root) |
| branch | string | No | Branch name |
| maxDepth | number | No | Maximum depth to traverse |

### Example

```json
{
  "owner": "octocode",
  "repo": "mcp",
  "path": "src",
  "maxDepth": 3
}
```

### Response

Returns hierarchical directory tree with files and folders.

---

## github_search_pull_requests

Search and filter pull requests.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| query | string | Yes | PR search query |
| owner | string | No | Filter by repository owner |
| repo | string | No | Filter by repository name |
| state | string | No | Filter by state: open, closed, all |
| maxResults | number | No | Maximum results (default: 30) |

### Example

```json
{
  "query": "is:pr is:open label:bug",
  "owner": "octocode",
  "repo": "mcp",
  "maxResults": 10
}
```

### Response

Returns pull request information including title, number, state, author, and dates.

---

## Rate Limits

All tools respect GitHub API rate limits:
- **Authenticated**: 5,000 requests/hour
- **Search API**: 30 requests/minute

Tools automatically handle rate limiting with retries and backoff.

## Caching

Results are cached to improve performance:
- **File contents**: Cached for 5 minutes
- **Repository metadata**: Cached for 10 minutes
- **Directory structures**: Cached for 10 minutes

Cache can be cleared by restarting the server.

## Error Handling

Common errors:
- `GITHUB_AUTH_ERROR`: Invalid or missing GitHub token
- `GITHUB_NOT_FOUND`: Repository or file not found
- `GITHUB_RATE_LIMIT`: Rate limit exceeded
- `GITHUB_API_ERROR`: General API error
- `VALIDATION_ERROR`: Invalid input parameters

See [Error Handling](error-handling.md) for details.
