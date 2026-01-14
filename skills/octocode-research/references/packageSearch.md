# packageSearch

Search npm and PyPI packages to find repository URLs.

**Endpoint**: `GET /package/search`

> **Server runs locally** on user's machine. Package registry API calls are made from the local server.

## HTTP API Examples

```bash
# Look up npm package
curl "http://localhost:1987/package/search?ecosystem=npm&name=express"

# Look up Python package
curl "http://localhost:1987/package/search?ecosystem=python&name=requests"

# Find alternatives (multiple results)
curl "http://localhost:1987/package/search?ecosystem=npm&name=lodash&searchLimit=5"

# With detailed metadata
curl "http://localhost:1987/package/search?ecosystem=npm&name=axios&npmFetchMetadata=true"
```

## Use Case

**Find package → get repository URL → explore source code**.

This is often the **first step** when researching external packages.

## Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | ✅ | Package name |
| `ecosystem` | string | ✅ | `npm` or `python` |
| `mainResearchGoal` | string | ✅ | Overall objective |
| `researchGoal` | string | ✅ | Specific goal |
| `reasoning` | string | ✅ | Why this approach |
| `searchLimit` | number | | Default: 1, max: 10 (use 5 for alternatives) |
| `npmFetchMetadata` | boolean | | Fetch detailed npm metadata |
| `pythonFetchMetadata` | boolean | | Fetch detailed PyPI metadata |

## Response Structure

```json
{
  "status": "hasResults",
  "packages": [
    {
      "name": "express",
      "version": "4.18.2",
      "description": "Fast, unopinionated, minimalist web framework",
      "repository": {
        "type": "git",
        "url": "https://github.com/expressjs/express"
      },
      "homepage": "http://expressjs.com/",
      "license": "MIT",
      "deprecated": false,
      "keywords": ["express", "web", "server"],
      "author": "TJ Holowaychuk",
      "maintainers": ["dougwilson", "wesleytodd"]
    }
  ]
}
```

## Workflow: Package to Source

```bash
# Step 1: Find package info
curl "http://localhost:1987/package/search?ecosystem=npm&name=lodash"
# Response: repository.url = "https://github.com/lodash/lodash"
# Extract: owner=lodash, repo=lodash

# Step 2: Explore structure
curl "http://localhost:1987/github/structure?owner=lodash&repo=lodash&branch=main&path=&depth=1"

# Step 3: Search implementation
curl "http://localhost:1987/github/search?keywordsToSearch=debounce&owner=lodash&repo=lodash"

# Step 4: Read specific file
curl "http://localhost:1987/github/content?owner=lodash&repo=lodash&path=debounce.js&fullContent=true"
```

## /package/search vs /github/repos

| Use Case | Tool |
|----------|------|
| Known package name | `/package/search` (faster) |
| Discover by topic | `/github/repos` |
| Find org repos | `/github/repos` |

## Tips

- **Check `deprecated` first**: Avoid deprecated packages
- **`searchLimit=1` for known name**: Fastest lookup
- **`searchLimit=5` for alternatives**: Compare options
- **Python returns 1 result**: PyPI API limitation
- **NPM uses dashes, Python uses underscores**: `my-package` vs `my_package`
- **Repository URL may need parsing**: Extract owner/repo from URL

## Related Endpoints

- [`/github/structure`](./githubViewRepoStructure.md) - Explore package source
- [`/github/search`](./githubSearchCode.md) - Search package code
- [`/github/content`](./githubGetFileContent.md) - Read package source
