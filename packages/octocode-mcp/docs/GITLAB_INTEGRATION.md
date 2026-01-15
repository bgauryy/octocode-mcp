# GitLab Integration

This document describes how to configure GitLab integration with Octocode MCP.

## Overview

Octocode MCP supports both GitHub and GitLab as code hosting providers. When configured, GitLab integration enables:

- **Code Search**: Search for code within GitLab projects and groups
- **File Content**: Fetch file contents from GitLab repositories
- **Repository Search**: Search for projects on GitLab
- **Merge Requests**: Search and view merge requests
- **Repository Structure**: Browse repository file trees

> **Note**: GitLab tools share the same interface as GitHub tools. The provider is automatically selected based on your configuration.

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GITLAB_TOKEN` | GitLab personal access token (primary) | - |
| `GL_TOKEN` | GitLab personal access token (fallback) | - |
| `GITLAB_HOST` | GitLab instance URL | `https://gitlab.com` |

### Token Priority

GitLab token resolution follows this priority:

1. `GITLAB_TOKEN` environment variable
2. `GL_TOKEN` environment variable

### Creating a GitLab Token

1. Go to **GitLab** → **Settings** → **Access Tokens**
2. Create a new token with the following scopes:
   - `read_api` - Read access to the API
   - `read_repository` - Read access to repositories
   - `read_user` - Read access to user information (optional)

For self-hosted GitLab instances, ensure your token has the appropriate scopes for your use case.

### Example Configuration

**Using gitlab.com:**

```bash
export GITLAB_TOKEN="glpat-xxxxxxxxxxxxxxxxxxxx"
```

**Using self-hosted GitLab:**

```bash
export GITLAB_TOKEN="glpat-xxxxxxxxxxxxxxxxxxxx"
export GITLAB_HOST="https://gitlab.mycompany.com"
```

## Provider Selection

The system automatically selects the appropriate provider:

| Scenario | Provider Used |
|----------|---------------|
| Only `GITHUB_TOKEN` configured | GitHub |
| Only `GITLAB_TOKEN` configured | GitLab |
| Both tokens configured | GitHub (default) |

> **Coming Soon**: Explicit provider selection per query will be available in a future release.

## GitLab-Specific Features

### Project ID Formats

GitLab accepts project IDs in two formats:

| Format | Example |
|--------|---------|
| Numeric ID | `12345` |
| Path with namespace | `group/project` or `group/subgroup/project` |

### Code Search Limitations

| Feature | Requirement |
|---------|-------------|
| Project-scoped search | All GitLab tiers |
| Group-scoped search | GitLab Premium |
| Global search | GitLab Premium |

### Terminology Differences

| GitHub Term | GitLab Term |
|-------------|-------------|
| Pull Request | Merge Request |
| PR number | MR iid |
| head branch | source branch |
| base branch | target branch |

## Self-Hosted GitLab

For self-hosted GitLab instances:

1. Set `GITLAB_HOST` to your instance URL (include `https://`)
2. Ensure your token has appropriate scopes
3. Verify network connectivity to your GitLab instance

```bash
export GITLAB_HOST="https://gitlab.internal.company.com"
export GITLAB_TOKEN="glpat-xxxxxxxxxxxxxxxxxxxx"
```

## Troubleshooting

### Token Not Configured

Verify your environment variables are set:

```bash
echo $GITLAB_TOKEN
echo $GL_TOKEN
```

### Project Not Found

- Verify the project ID or path is correct
- Ensure your token has access to the project
- For private projects, check token permissions

### Premium Required

Some features require GitLab Premium. Use project-scoped search instead by specifying the project ID explicitly.

## Related Documentation

- [Token Resolution](./TOKEN_RESOLUTION.md) - How tokens are resolved
- [Architecture](./ARCHITECTURE.md) - System architecture overview
- [GitHub Tools Reference](./GITHUB_TOOLS_REFERENCE.md) - GitHub-specific features
