# githubViewRepoStructure

Explore repository directory structure on GitHub.

**Endpoint**: `GET /github/structure`

> **Server runs locally** on user's machine. GitHub API calls are made from the local server.

## HTTP API Examples

```bash
# View root structure (START HERE)
curl "http://localhost:1987/github/structure?owner=facebook&repo=react&branch=main&path=&depth=1"

# Drill into subdirectory
curl "http://localhost:1987/github/structure?owner=facebook&repo=react&branch=main&path=packages&depth=2"

# Monorepo exploration
curl "http://localhost:1987/github/structure?owner=vercel&repo=next.js&branch=canary&path=packages&depth=1"

# Paginated results
curl "http://localhost:1987/github/structure?owner=microsoft&repo=TypeScript&branch=main&path=src/compiler&entryPageNumber=2&entriesPerPage=100"
```

## Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `owner` | string | ✅ | Repository owner |
| `repo` | string | ✅ | Repository name |
| `branch` | string | ✅ | Branch NAME (not SHA!) |
| `mainResearchGoal` | string | ✅ | Overall objective |
| `researchGoal` | string | ✅ | Specific goal |
| `reasoning` | string | ✅ | Why this approach |
| `path` | string | | Subdirectory (default: root `""`) |
| `depth` | number | | 1 or 2 (default: 1) |
| `entriesPerPage` | number | | Max: 200 |
| `entryPageNumber` | number | | Default: 1 |

## Response Structure

```json
{
  "status": "hasResults",
  "owner": "facebook",
  "repo": "react",
  "path": "packages",
  "branch": "main",
  "entries": [
    { "name": "react", "type": "dir", "path": "packages/react" },
    { "name": "react-dom", "type": "dir", "path": "packages/react-dom" },
    { "name": "shared", "type": "dir", "path": "packages/shared" }
  ],
  "summary": {
    "totalEntries": 25,
    "truncated": false
  },
  "pagination": {
    "currentPage": 1,
    "totalPages": 2,
    "hasMore": true
  }
}
```

## Exploration Workflow

```
1. Root (path="", depth=1)    → Get overview
2. Identify key directories   → Look for src/, lib/, packages/
3. Drill (path="src", depth=2) → Explore source
4. Search or read             → Find specific code
```

## Common Paths to Explore

| Project Type | Key Paths |
|--------------|-----------|
| Library | `src/`, `lib/` |
| Monorepo | `packages/`, `apps/` |
| React app | `src/components/`, `src/hooks/` |
| API | `src/routes/`, `src/controllers/` |
| CLI | `src/commands/`, `bin/` |

## Tips

- **Start at root** with `path=""` and `depth=1`
- **depth=2 is slow** on large directories - use on subdirs
- **Monorepos**: Check `packages/`, `apps/`, `libs/`
- **Auto-filters noisy dirs**: `.git`, `node_modules`, `dist` excluded
- **Max 200 items**: Check `summary.truncated` if results cut off
- **Use branch NAME**: `main`, not commit SHA

## Next Steps

After viewing structure:
- [`/github/search`](./githubSearchCode.md) - Search in discovered dirs
- [`/github/content`](./githubGetFileContent.md) - Read discovered files
- [`/github/prs`](./githubSearchPullRequests.md) - Find changes

## Related Endpoints

- [`/github/repos`](./githubSearchRepositories.md) - Find repos first
- [`/github/search`](./githubSearchCode.md) - Search code
- [`/github/content`](./githubGetFileContent.md) - Read files
