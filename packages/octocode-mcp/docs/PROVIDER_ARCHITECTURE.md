# Provider Architecture

This document describes the current provider architecture for `octocode-mcp`.

## Overview

Provider-backed tools follow a consistent path:

1. Resolve the active provider from server configuration.
2. Build a provider execution context.
3. Map tool queries into provider queries.
4. Execute provider operations through the shared execution layer.
5. Map provider results back into tool output shapes.

The current implementation keeps provider selection global per server process. It does not support per-query provider overrides.

## Core Modules

| Responsibility | Module |
|----------------|--------|
| Active provider selection | `src/serverConfig.ts` |
| Provider registry and instance cache | `src/providers/factory.ts` |
| Provider capability registry | `src/providers/capabilities.ts` |
| Shared provider interfaces and response types | `src/providers/types.ts` |
| Tool-to-provider query/result mapping | `src/tools/providerMappers.ts` |
| Shared provider execution and failure handling | `src/tools/providerExecution.ts` |

## Provider Selection

`getActiveProvider()` and `getActiveProviderConfig()` in `src/serverConfig.ts` choose the provider for the current server process.

Selection priority:

1. GitLab when GitLab auth/config is available.
2. Bitbucket when Bitbucket auth/config is available.
3. GitHub otherwise.

The resolved config then feeds provider creation through `createProviderExecutionContext()`.

## Provider Registry And Cache

`src/providers/factory.ts` is the single place that:

- registers provider classes
- creates provider instances
- caches provider instances per provider/base URL/token hash
- initializes optional providers during startup

Provider startup diagnostics are returned from `initializeProviders()` and provider creation failures are surfaced as typed initialization errors by the execution layer.

## Capability Ownership

Provider capability flags live in `src/providers/capabilities.ts`.

These capabilities are used only for tool-flow decisions such as:

- whether clone is supported
- whether directory fetch to disk is supported
- whether code search must be project-scoped
- whether merged-state and multi-topic search features are available

Tool handlers should not hardcode provider names when the decision is really capability-based.

## Execution Layer

`src/tools/providerExecution.ts` provides the shared execution seam for provider-backed tools.

Key behavior:

- `createProviderExecutionContext()` resolves the active provider and fails fast with `ProviderInitializationError` when the provider cannot be created.
- `executeProviderOperation()` normalizes a single provider call into either a typed success or a tool-ready error result.
- `executeProviderOperations()` executes multiple provider calls for one tool query while preserving partial successes and raw provider failures.

This keeps provider initialization, partial-failure handling, and rate-limit propagation out of individual tool handlers.

## Mapping Layer

`src/tools/providerMappers.ts` owns translation between tool contracts and provider contracts.

Examples:

- `mapCodeSearchToolQuery()`
- `mapCodeSearchProviderResult()`
- `mapRepoSearchToolQuery()`
- `mapPullRequestToolQuery()`

This layer is where tool-facing pagination, repository identity normalization, and provider-independent response shaping should live.

## Provider Implementations

Each provider implements the shared `ICodeHostProvider` interface from `src/providers/types.ts`.

Current providers:

- GitHub
- GitLab
- Bitbucket

The provider classes live under `src/providers/<provider>/` and delegate to host-specific modules for search, file content, repository structure, and pull request or merge request behavior.

## Critical Path Tests

Provider and flow regressions should fail the contract suites before they leak into the broader package run.

Key tests:

- `tests/tools/providerExecution.test.ts`
- `tests/providers/factory.diagnostics.test.ts`
- `tests/providers/factory.test.ts`
- `tests/flows/remote.search-to-fetch-content.flow.test.ts`
- `tests/index.test.ts`
- `tests/serverConfig*.test.ts`

For lane ownership and contract expectations, see [TDD Quality Guide](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/docs/TDD_QUALITY_GUIDE.md).
