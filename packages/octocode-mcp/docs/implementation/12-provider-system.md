# Provider System Architecture

The provider system in octocode-mcp implements a multi-platform code hosting abstraction layer that allows tools to work seamlessly with GitHub, GitLab, and potentially other platforms through a unified interface.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [ICodeHostProvider Interface](#icodehostprovider-interface)
- [Provider Factory and Caching](#provider-factory-and-caching)
- [GitHubProvider Implementation](#githubprovider-implementation)
- [GitLabProvider Implementation](#gitlabprovider-implementation)
- [Adding New Providers](#adding-new-providers)
- [Provider Execution](#provider-execution)
- [Configuration and Authentication](#configuration-and-authentication)

## Architecture Overview

The provider architecture enables tool implementations to be completely platform-agnostic by introducing an abstraction layer between tools and platform-specific APIs.

### Design Goals

1. **Unified Interface**: Tools use one set of types for queries and results, regardless of the underlying platform
2. **Dynamic Routing**: Switch between providers per-request via the `provider` parameter in queries
3. **Instance Caching**: Efficient reuse of provider instances based on type, base URL, and token hash
4. **Extensibility**: Easy to add new providers (e.g., Bitbucket, Azure DevOps) without changing tool logic
5. **Separation of Concerns**: Tool implementations isolated from API-specific details

### Four-Layer Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Tool Implementation                       │
│  (githubSearchCode, githubGetFileContent, etc.)             │
└────────────────────────┬────────────────────────────────────┘
                         │ Calls
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   Execution Layer                           │
│           (executeWithProvider function)                     │
│  • Extracts provider type from query                        │
│  • Calls getProvider() from factory                         │
│  • Invokes provider method                                  │
└────────────────────────┬────────────────────────────────────┘
                         │ Uses
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                  Provider Factory                           │
│           (factory.ts - registration & caching)              │
│  • Provider registry (Map<ProviderType, ProviderClass>)     │
│  • Instance cache with TTL                                  │
│  • Cache key: type:baseUrl:tokenHash                        │
└────────────────────────┬────────────────────────────────────┘
                         │ Creates
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              ICodeHostProvider Interface                    │
│  • searchCode()          • getRepoStructure()               │
│  • getFileContent()      • searchRepos()                    │
│  • searchPullRequests()                                     │
└─────────────────────────┬───────────────────────────────────┘
                          │ Implemented by
        ┌─────────────────┴─────────────────┐
        ▼                                   ▼
┌──────────────────┐              ┌──────────────────┐
│ GitHubProvider   │              │ GitLabProvider   │
└──────────────────┘              └──────────────────┘
```

## ICodeHostProvider Interface

The `ICodeHostProvider` interface defines the contract that all provider implementations must fulfill. Located in `src/providers/types.ts`.

### Interface Definition

```typescript
export interface ICodeHostProvider {
  /** Provider type identifier */
  readonly type: ProviderType;

  /**
   * Search for code within repositories.
   */
  searchCode(
    query: CodeSearchQuery
  ): Promise<ProviderResponse<CodeSearchResult>>;

  /**
   * Get file content from a repository.
   */
  getFileContent(
    query: FileContentQuery
  ): Promise<ProviderResponse<FileContentResult>>;

  /**
   * Search for repositories.
   */
  searchRepos(
    query: RepoSearchQuery
  ): Promise<ProviderResponse<RepoSearchResult>>;

  /**
   * Search for pull/merge requests.
   */
  searchPullRequests(
    query: PullRequestQuery
  ): Promise<ProviderResponse<PullRequestSearchResult>>;

  /**
   * Get repository structure/tree.
   */
  getRepoStructure(
    query: RepoStructureQuery
  ): Promise<ProviderResponse<RepoStructureResult>>;
}
```

### Unified Query Types

All query types extend `BaseProviderQuery`:

```typescript
export interface BaseProviderQuery {
  /** Provider to use (default: 'github') */
  provider?: ProviderType;
  /** Research context fields */
  mainResearchGoal?: string;
  researchGoal?: string;
  reasoning?: string;
}
```

#### CodeSearchQuery

```typescript
export interface CodeSearchQuery extends BaseProviderQuery {
  /** Keywords to search for in code */
  keywords: string[];
  /** Project identifier (GitHub: 'owner/repo', GitLab: numeric ID or 'group/project') */
  projectId?: string;
  /** Filter by file path pattern */
  path?: string;
  /** Filter by filename */
  filename?: string;
  /** Filter by file extension (without dot) */
  extension?: string;
  /** Branch, tag, or commit reference */
  ref?: string;
  /** Maximum results per page (max 100) */
  limit?: number;
  /** Page number for pagination */
  page?: number;
}
```

#### FileContentQuery

```typescript
export interface FileContentQuery extends BaseProviderQuery {
  /** Project identifier */
  projectId: string;
  /** File path within the repository */
  path: string;
  /** Branch, tag, or commit reference */
  ref?: string;
  /** Start line number for partial content */
  startLine?: number;
  /** End line number for partial content */
  endLine?: number;
  /** String to search for in file content */
  matchString?: string;
  /** Context lines around match */
  matchStringContextLines?: number;
  /** Character offset for byte-range fetching */
  charOffset?: number;
  /** Character length for byte-range fetching */
  charLength?: number;
  /** Whether to fetch full content */
  fullContent?: boolean;
}
```

### Unified Result Types

#### ProviderResponse

All provider methods return a `ProviderResponse<T>`:

```typescript
export interface ProviderResponse<T> {
  /** Response data (on success) */
  data?: T;
  /** Error message (on failure) */
  error?: string;
  /** HTTP status code */
  status: number;
  /** Provider that handled the request */
  provider: ProviderType;
  /** Additional hints for the user */
  hints?: string[];
  /** Rate limit info */
  rateLimit?: {
    remaining: number;
    reset: number;
    retryAfter?: number;
  };
}
```

#### Type Guards

```typescript
// Check if response is successful
export function isProviderSuccess<T>(
  response: ProviderResponse<T>
): response is ProviderResponse<T> & { data: T } {
  return response.data !== undefined && !response.error;
}

// Check if response is an error
export function isProviderError<T>(
  response: ProviderResponse<T>
): response is ProviderResponse<T> & { error: string } {
  return response.error !== undefined;
}
```

## Provider Factory and Caching

The provider factory (`src/providers/factory.ts`) manages provider registration and instance caching.

### Provider Registry

Providers register themselves during initialization:

```typescript
const providerRegistry = new Map<
  ProviderType,
  new (config?: ProviderConfig) => ICodeHostProvider
>();

export function registerProvider(
  type: ProviderType,
  providerClass: new (config?: ProviderConfig) => ICodeHostProvider
): void {
  providerRegistry.set(type, providerClass);
}
```

### Provider Initialization

Called during server startup:

```typescript
export async function initializeProviders(): Promise<void> {
  // Import and register GitHub provider
  try {
    const { GitHubProvider } = await import('./github/GitHubProvider.js');
    registerProvider('github', GitHubProvider);
  } catch (error) {
    console.error('Failed to initialize GitHub provider:', error);
  }

  // Import and register GitLab provider
  try {
    const { GitLabProvider } = await import('./gitlab/GitLabProvider.js');
    registerProvider('gitlab', GitLabProvider);
  } catch (error) {
    // GitLab provider is optional
    console.warn('GitLab provider not available:', error);
  }
}
```

### Instance Caching

Provider instances are cached to avoid recreating clients repeatedly:

```typescript
/** Provider cache TTL (1 hour) */
const PROVIDER_CACHE_TTL_MS = 60 * 60 * 1000;

interface CachedProvider {
  provider: ICodeHostProvider;
  createdAt: number;
}

const instanceCache = new Map<string, CachedProvider>();
```

#### Cache Key Generation

Cache keys are generated from type, base URL, and token hash:

```typescript
function getCacheKey(type: ProviderType, config?: ProviderConfig): string {
  const baseUrl = normalizeUrl(config?.baseUrl || 'default');
  const tokenHash = hashToken(config?.token || config?.authInfo?.token);
  return `${type}:${baseUrl}:${tokenHash}`;
}

function hashToken(token?: string): string {
  if (!token) return 'default';
  return createHash('sha256').update(token).digest('hex').slice(0, 16);
}
```

**Security Note**: Raw tokens are never stored in cache keys. Only SHA-256 hashes are used.

#### URL Normalization

URLs are normalized for consistent caching:

```typescript
function normalizeUrl(url: string): string {
  if (url === 'default') return url;

  try {
    const parsed = new URL(url);
    // Remove default ports
    if (
      (parsed.protocol === 'https:' && parsed.port === '443') ||
      (parsed.protocol === 'http:' && parsed.port === '80')
    ) {
      parsed.port = '';
    }
    // Lowercase hostname, remove trailing slash
    let normalized = `${parsed.protocol}//${parsed.hostname.toLowerCase()}`;
    if (parsed.port) normalized += `:${parsed.port}`;
    normalized += parsed.pathname.replace(/\/+$/, '') || '';
    return normalized;
  } catch {
    return url.replace(/\/+$/, '');
  }
}
```

### Getting Provider Instances

```typescript
export function getProvider(
  type: ProviderType = 'github',
  config?: ProviderConfig
): ICodeHostProvider {
  const cacheKey = getCacheKey(type, config);

  // Return cached instance if available and not expired
  const cached = instanceCache.get(cacheKey);
  if (cached && isProviderCacheValid(cached)) {
    return cached.provider;
  }

  // Remove expired entry if present
  if (cached) {
    instanceCache.delete(cacheKey);
  }

  // Get provider class from registry
  const ProviderClass = providerRegistry.get(type);
  if (!ProviderClass) {
    const available = [...providerRegistry.keys()].join(', ') || 'none';
    throw new Error(
      `Unknown provider type: '${type}'. Available providers: ${available}`
    );
  }

  // Create new instance
  const provider = new ProviderClass({
    ...config,
    type,
  });

  // Cache with timestamp and return
  instanceCache.set(cacheKey, {
    provider,
    createdAt: Date.now(),
  });
  return provider;
}
```

## GitHubProvider Implementation

Located in `src/providers/github/GitHubProvider.ts`, the GitHubProvider wraps existing GitHub API functions.

### Class Structure

```typescript
export class GitHubProvider implements ICodeHostProvider {
  readonly type = 'github' as const;
  private authInfo?: AuthInfo;

  constructor(config?: ProviderConfig) {
    if (config?.authInfo) {
      this.authInfo = config.authInfo;
    } else if (config?.token) {
      this.authInfo = { token: config.token } as AuthInfo;
    }
  }
}
```

### Project ID Parsing

GitHub uses `owner/repo` format:

```typescript
private parseProjectId(projectId?: string): {
  owner?: string;
  repo?: string;
} {
  if (!projectId) {
    return { owner: undefined, repo: undefined };
  }

  const parts = projectId.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(
      `Invalid GitHub projectId format: '${projectId}'. Expected 'owner/repo'.`
    );
  }

  return { owner: parts[0], repo: parts[1] };
}
```

### Code Search Implementation

```typescript
async searchCode(
  query: CodeSearchQuery
): Promise<ProviderResponse<CodeSearchResult>> {
  try {
    // Transform unified query to GitHub format
    const { owner, repo } = this.parseProjectId(query.projectId);

    const githubQuery: GitHubCodeSearchQuery = {
      keywordsToSearch: query.keywords,
      owner,
      repo,
      extension: query.extension,
      filename: query.filename,
      path: query.path,
      limit: query.limit,
      page: query.page,
      mainResearchGoal: query.mainResearchGoal,
      researchGoal: query.researchGoal,
      reasoning: query.reasoning,
    };

    const result = await searchGitHubCodeAPI(githubQuery, this.authInfo);

    // Check for error using type guard
    if (isGitHubAPIError(result)) {
      return {
        error: result.error,
        status: result.status || 500,
        provider: 'github',
        hints: result.hints,
      };
    }

    if (!result.data) {
      return {
        error: 'No data returned from GitHub API',
        status: 500,
        provider: 'github',
      };
    }

    return {
      data: this.transformCodeSearchResult(result.data),
      status: 200,
      provider: 'github',
    };
  } catch (error) {
    return this.handleError(error);
  }
}
```

### Error Handling

GitHubProvider includes sophisticated error handling with rate limit extraction:

```typescript
private handleError(error: unknown): ProviderResponse<never> {
  const apiError = handleGitHubAPIError(error);

  return {
    error: apiError.error,
    status: apiError.status || 500,
    provider: 'github',
    hints: apiError.hints,
    rateLimit: this.extractRateLimit(apiError),
  };
}

private extractRateLimit(
  apiError: GitHubAPIError
): ProviderResponse<never>['rateLimit'] {
  if (
    apiError.rateLimitRemaining === undefined &&
    apiError.retryAfter === undefined &&
    apiError.rateLimitReset === undefined
  ) {
    return undefined;
  }

  return {
    remaining: apiError.rateLimitRemaining ?? 0,
    // Convert ms timestamp to seconds
    reset: apiError.rateLimitReset
      ? Math.floor(apiError.rateLimitReset / 1000)
      : Math.floor(Date.now() / 1000) + (apiError.retryAfter ?? 3600),
    retryAfter: apiError.retryAfter,
  };
}
```

## GitLabProvider Implementation

Located in `src/providers/gitlab/GitLabProvider.ts`, the GitLabProvider adapts GitLab API functions to the unified interface.

### Class Structure

```typescript
export class GitLabProvider implements ICodeHostProvider {
  readonly type = 'gitlab' as const;

  constructor(_config?: ProviderConfig) {
    // Config may be used in the future for token/host customization
  }
}
```

### Project ID Parsing

GitLab accepts numeric IDs or URL-encoded paths:

```typescript
private parseProjectId(projectId?: string): number | string {
  if (!projectId) {
    throw new Error('Project ID is required');
  }

  // Check if it's a numeric ID
  const numId = parseInt(projectId, 10);
  if (!isNaN(numId) && String(numId) === projectId) {
    return numId;
  }

  // URL-encode the path for GitLab API
  return encodeURIComponent(projectId);
}
```

### File Content Implementation

GitLab requires a branch reference, so the provider fetches the default branch if not specified:

```typescript
async getFileContent(
  query: FileContentQuery
): Promise<ProviderResponse<FileContentResult>> {
  try {
    const projectId = this.parseProjectId(query.projectId);

    // GitLab requires ref - get default branch if not specified
    let ref = query.ref;
    if (!ref) {
      ref = await getGitLabDefaultBranch(projectId);
    }

    const gitlabQuery = {
      projectId,
      path: query.path,
      ref,
      startLine: query.startLine,
      endLine: query.endLine,
    };

    const result = await fetchGitLabFileContentAPI(gitlabQuery);

    if ('error' in result && result.error) {
      return {
        error: result.error,
        status: result.status || 500,
        provider: 'gitlab',
        hints: 'hints' in result ? result.hints : undefined,
      };
    }

    if (!('data' in result) || !result.data) {
      return {
        error: 'No data returned from GitLab API',
        status: 500,
        provider: 'gitlab',
      };
    }

    return {
      data: {
        path: result.data.file_path,
        content: result.data.content,
        encoding: 'utf-8',
        size: result.data.size,
        ref: result.data.ref,
        lastCommitSha: result.data.last_commit_id,
      },
      status: 200,
      provider: 'gitlab',
    };
  } catch (error) {
    return this.handleError(error);
  }
}
```

### Pull Request Mapping

GitLab uses "merge requests" instead of "pull requests". The provider maps terminology:

```typescript
private mapMRState(
  state?: string
): 'opened' | 'closed' | 'merged' | 'all' | undefined {
  const mapping: Record<string, 'opened' | 'closed' | 'merged' | 'all'> = {
    open: 'opened',
    closed: 'closed',
    merged: 'merged',
    all: 'all',
  };
  return state ? mapping[state] : undefined;
}
```

## Adding New Providers

To add support for a new code hosting platform (e.g., Bitbucket, Azure DevOps):

### 1. Update ProviderType

In `src/providers/types.ts`:

```typescript
export type ProviderType = 'github' | 'gitlab' | 'bitbucket';
```

### 2. Create Provider Class

Create `src/providers/bitbucket/BitbucketProvider.ts`:

```typescript
import type {
  ICodeHostProvider,
  ProviderConfig,
  ProviderResponse,
  // ... import other types
} from '../types.js';

export class BitbucketProvider implements ICodeHostProvider {
  readonly type = 'bitbucket' as const;
  private token?: string;
  private baseUrl: string;

  constructor(config?: ProviderConfig) {
    this.token = config?.token || config?.authInfo?.token;
    this.baseUrl = config?.baseUrl || 'https://api.bitbucket.org/2.0';
  }

  async searchCode(
    query: CodeSearchQuery
  ): Promise<ProviderResponse<CodeSearchResult>> {
    // Implement using Bitbucket API
  }

  async getFileContent(
    query: FileContentQuery
  ): Promise<ProviderResponse<FileContentResult>> {
    // Implement using Bitbucket API
  }

  // ... implement other methods
}
```

### 3. Register Provider

Update `initializeProviders()` in `src/providers/factory.ts`:

```typescript
export async function initializeProviders(): Promise<void> {
  // ... existing providers

  // Import and register Bitbucket provider
  try {
    const { BitbucketProvider } = await import('./bitbucket/BitbucketProvider.js');
    registerProvider('bitbucket', BitbucketProvider);
  } catch (error) {
    console.warn('Bitbucket provider not available:', error);
  }
}
```

### 4. Add Configuration

Add environment variable support in `src/serverConfig.ts`:

```typescript
interface BitbucketConfig {
  token: string | null;
  host: string;
  isConfigured: boolean;
}

async function resolveBitbucketConfig(): Promise<BitbucketConfig> {
  const token = process.env.BITBUCKET_TOKEN || null;
  const host = process.env.BITBUCKET_HOST || 'https://api.bitbucket.org/2.0';
  return {
    token,
    host,
    isConfigured: !!token,
  };
}
```

### 5. Update Tool Schemas

Tools automatically support new providers through the `provider` parameter in `BaseProviderQuery`.

## Provider Execution

The execution layer (`src/providers/execute.ts`) routes queries to the appropriate provider:

```typescript
export async function executeWithProvider<Q extends ProviderQuery, R>(
  query: Q,
  operation: (provider: ICodeHostProvider, query: Q) => Promise<ProviderResponse<R>>,
  options?: ExecutionOptions
): Promise<ProviderResponse<R>> {
  // Extract provider type from query (defaults to 'github')
  const providerType = extractProviderFromQuery(query);

  // Get provider configuration
  const config: ProviderConfig = {
    type: providerType,
    authInfo: options?.authInfo,
    token: options?.token,
    baseUrl: options?.baseUrl,
  };

  // Get provider instance (cached)
  const provider = getProvider(providerType, config);

  // Execute operation
  return operation(provider, query);
}
```

### Usage in Tools

```typescript
import { executeWithProvider } from '../../providers/execute.js';

export async function githubSearchCodeTool(
  query: GitHubCodeSearchBulkQuery,
  authInfo?: AuthInfo
): Promise<CallToolResult> {
  return executeBulkOperation(
    query.queries,
    async (singleQuery) => {
      const result = await executeWithProvider(
        singleQuery,
        (provider, q) => provider.searchCode(q),
        { authInfo }
      );

      if (isProviderError(result)) {
        throw new Error(result.error);
      }

      return formatResponse(result.data);
    }
  );
}
```

## Configuration and Authentication

### GitHub Configuration

GitHub authentication is resolved through multiple sources:

1. **Octocode Storage** - Tokens from `octocode-cli` OAuth flow
2. **Environment Variables** - `GITHUB_TOKEN`
3. **GitHub CLI** - Credentials from `gh auth login`
4. **File-based** - Legacy token storage

### GitLab Configuration

GitLab configuration uses environment variables:

```bash
# Required
export GITLAB_TOKEN="glpat_your_token_here"

# Optional (defaults to https://gitlab.com)
export GITLAB_HOST="https://gitlab.your-company.com"
```

### Provider Selection

The active provider is determined by:

1. **Query parameter**: `query.provider = 'gitlab'`
2. **Default**: `'github'` if not specified

### Multi-Instance Support

The caching system supports multiple instances:

```typescript
// Different hosts
const gitlabSaas = getProvider('gitlab', {
  type: 'gitlab',
  baseUrl: 'https://gitlab.com',
  token: process.env.GITLAB_TOKEN,
});

const gitlabSelfHosted = getProvider('gitlab', {
  type: 'gitlab',
  baseUrl: 'https://gitlab.company.com',
  token: process.env.COMPANY_GITLAB_TOKEN,
});

// Different tokens (same host)
const githubPersonal = getProvider('github', {
  type: 'github',
  token: process.env.GITHUB_PERSONAL_TOKEN,
});

const githubOrg = getProvider('github', {
  type: 'github',
  token: process.env.GITHUB_ORG_TOKEN,
});
```

## Best Practices

### For Provider Implementers

1. **Error Handling**: Always use try-catch and return ProviderResponse with appropriate status codes
2. **Type Safety**: Use TypeScript type guards to validate API responses
3. **Rate Limiting**: Extract and include rate limit information in responses
4. **Pagination**: Respect limit/page parameters and include pagination metadata
5. **URL Normalization**: Normalize base URLs consistently for caching

### For Tool Developers

1. **Use executeWithProvider**: Don't call providers directly
2. **Handle Both Success and Error**: Use type guards to check response status
3. **Provider Agnostic**: Write tools that work with any provider
4. **Document Provider-Specific Behavior**: Note any platform differences in hints

### For Extension Developers

1. **Register Early**: Register providers during `initializeProviders()`
2. **Graceful Degradation**: Don't fail server startup if provider unavailable
3. **Follow Naming Conventions**: Use lowercase provider type names
4. **Cache-Friendly**: Ensure config objects are serializable for caching

## Summary

The provider system in octocode-mcp enables multi-platform support through:

- **Unified Interface**: ICodeHostProvider defines standard operations
- **Factory Pattern**: Centralized provider registration and instance creation
- **Intelligent Caching**: TTL-based caching with secure token hashing
- **Extensibility**: Easy to add new providers without modifying tools
- **Separation of Concerns**: Tools, providers, and APIs remain decoupled

This architecture makes it possible to support GitHub, GitLab, and future platforms while maintaining clean, maintainable code.
