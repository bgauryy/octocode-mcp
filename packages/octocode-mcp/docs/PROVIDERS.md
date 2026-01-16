# Provider Architecture Reference

> **Location**: `packages/octocode-mcp/docs/PROVIDERS.md`

This document details the multi-provider abstraction layer in Octocode MCP, which enables seamless integration with GitHub, GitLab, and potential future code hosting platforms.

---

## 1. Overview

The Provider Abstraction Layer isolates tool implementations from the specific details of code hosting APIs. Tools interact with a unified interface (`ICodeHostProvider`), and the system routes requests to the appropriate implementation (`GitHubProvider`, `GitLabProvider`) based on configuration or query parameters.

### Key Goals

- **Unified Interface**: Tools use one set of types for queries and results.
- **Dynamic Routing**: Switch between providers per-request (e.g., `provider: "gitlab"`).
- **Instance Caching**: efficient reuse of provider instances based on tokens and base URLs.
- **Extensibility**: Easy to add new providers (Bitbucket, Azure DevOps) without changing tool logic.

---

## 2. Architecture

The subsystem consists of four main components:

```
┌─────────────────────────────────────────────────────────────────┐
│                        Tool Implementation                       │
│  (uses executeCodeSearch, executeGetFileContent, etc.)          │
└─────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Execution Layer                          │
│  (providers/execute.ts - Routing & Configuration)               │
└─────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Provider Factory                         │
│  (providers/factory.ts - Registry & Caching)                    │
└─────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                     ICodeHostProvider Interface                 │
│  (providers/types.ts - Unified Contract)                        │
└─────────────────────────────────────────────────────────────────┘
              │                                  │
              ▼                                  ▼
┌─────────────────────────┐        ┌──────────────────────────────┐
│     GitHubProvider      │        │        GitLabProvider        │
│  (Octokit REST API)     │        │  (GitLab REST/GraphQL API)   │
└─────────────────────────┘        └──────────────────────────────┘
```

### 2.1 Unified Types (`providers/types.ts`)

All providers must implement the `ICodeHostProvider` interface, which defines standardized methods for core operations.

#### Interface Definition

```typescript
export interface ICodeHostProvider {
  readonly type: ProviderType; // 'github' | 'gitlab'

  // Core Operations
  searchCode(query: CodeSearchQuery): Promise<ProviderResponse<CodeSearchResult>>;
  getFileContent(query: FileContentQuery): Promise<ProviderResponse<FileContentResult>>;
  searchRepos(query: RepoSearchQuery): Promise<ProviderResponse<RepoSearchResult>>;
  searchPullRequests(query: PullRequestQuery): Promise<ProviderResponse<PullRequestSearchResult>>;
  getRepoStructure(query: RepoStructureQuery): Promise<ProviderResponse<RepoStructureResult>>;
}
```

#### Unified Query & Result

The system converts provider-specific concepts to a unified model:

| Unified Concept | GitHub Mapping | GitLab Mapping |
|-----------------|----------------|----------------|
| `projectId` | `owner/repo` (string) | `project_id` (number) or `group/project` |
| `ref` | branch/tag/SHA | branch/tag/SHA |
| `ProviderResponse` | Octokit Response | GitLab API Response |

---

## 3. Provider Factory (`providers/factory.ts`)

The factory manages the lifecycle of provider instances.

### Registration

Providers register themselves at startup:

```typescript
// src/index.ts
import { initializeProviders } from './providers/factory.js';

await initializeProviders();
```

### Instance Caching

Provider instances are cached to reuse connections and authentication states. The cache key is generated from:

1. **Type**: `github` or `gitlab`
2. **Base URL**: e.g., `https://github.com` or `https://gitlab.company.com`
3. **Token Hash**: SHA-256 hash of the auth token (securely stored)

```typescript
// Cache Key Format
const cacheKey = `${type}:${baseUrl}:${tokenHash}`;
```

### Retrieval

Tools retrieve providers via `getProvider()`:

```typescript
import { getProvider } from './providers/factory.js';

const provider = getProvider('github', {
  token: process.env.GITHUB_TOKEN,
  authInfo: requestAuthInfo
});
```

---

## 4. Execution Layer (`providers/execute.ts`)

This layer provides high-level helper functions that handle:

1. **Provider Extraction**: Determining which provider to use from the query (`query.provider`).
2. **Configuration**: Passing tokens, base URLs, and auth info.
3. **Execution**: Calling the appropriate provider method.

### Usage Example

```typescript
import { executeCodeSearch } from '../providers/execute.js';

// The tool just calls this unified function
const result = await executeCodeSearch({
  provider: 'gitlab', // Optional, defaults to 'github'
  projectId: 'gitlab-org/gitlab',
  keywords: ['pipeline', 'config'],
});
```

### Available Execution Functions

- `executeCodeSearch`
- `executeGetFileContent`
- `executeRepoSearch`
- `executePullRequestSearch`
- `executeGetRepoStructure`

---

## 5. Adding a New Provider

To add a new provider (e.g., Bitbucket):

1.  **Create the Provider Class**: Implement `ICodeHostProvider` in `src/providers/bitbucket/BitbucketProvider.ts`.
2.  **Define Types**: Update `ProviderType` in `src/providers/types.ts` to include `'bitbucket'`.
3.  **Register**: Update `initializeProviders` in `src/providers/factory.ts`.

### Example Implementation Skeleton

```typescript
import { ICodeHostProvider, ProviderResponse, CodeSearchQuery } from '../types.js';

export class BitbucketProvider implements ICodeHostProvider {
  readonly type = 'bitbucket';
  
  constructor(private config?: ProviderConfig) {}

  async searchCode(query: CodeSearchQuery): Promise<ProviderResponse<CodeSearchResult>> {
    // 1. Transform unified query to Bitbucket API format
    // 2. Call Bitbucket API
    // 3. Transform response to unified CodeSearchResult
    // 4. Return ProviderResponse
  }
  
  // Implement other methods...
}
```

---

## 6. Authentication & Token Resolution

Providers handle authentication differently but are initialized with a unified `ProviderConfig`.

### GitHub
- Uses `OCTOCODE_TOKEN`, `GH_TOKEN`, or `GITHUB_TOKEN`.
- Supports OAuth via `authInfo`.

### GitLab
- Uses `GITLAB_TOKEN` or `GL_TOKEN`.
- Supports self-hosted instances via `GITLAB_HOST`.

See [`TOKEN_RESOLUTION.md`](./TOKEN_RESOLUTION.md) for detailed authentication flows.
