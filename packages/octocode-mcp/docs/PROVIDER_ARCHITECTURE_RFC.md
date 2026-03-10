# Provider Architecture RFC

> Proposed architecture cleanup for Octocode MCP provider execution, configuration flow, and capability ownership after the foundational provider refactor.

---

## Status

Proposed

---

## Summary

This RFC defines the next architectural step for the Octocode MCP provider layer.

The recent refactor improved the system materially:

- `github*` tool handlers now share a provider execution context instead of instantiating providers inline
- provider capabilities are explicit
- Bitbucket now matches the GitHub/GitLab delegate structure

However, three architectural issues remain:

1. **Provider initialization is too forgiving** — execution context creation currently masks provider-construction failures and can produce misleading downstream errors.
2. **Capabilities have two sources of truth** — provider classes define capabilities, and the execution layer also defines fallback capabilities.
3. **Repository search still bypasses the shared operation abstraction** — it uses the shared provider context but still owns custom provider success/error partitioning.

This RFC resolves those issues without changing public tool names, schemas, or the current global env-driven provider selection model.

---

## Current Problems

### 1. Provider initialization failures are masked

`createProviderExecutionContext()` currently catches `getProvider()` failures and substitutes a fake provider plus default capabilities.

That behavior hides configuration and initialization problems. Instead of failing fast with a clear provider-unavailable error, the system can fail later with method access errors such as `Cannot read properties of undefined`.

This weakens:

- configuration validation
- debugging quality
- operational trust in tool failures

### 2. Capabilities are duplicated

Capabilities are declared:

- in each provider implementation
- again in the execution helper as defaults

This is architectural redundancy. It creates drift risk and weakens the new contract.

### 3. Execution flow is still not fully centralized

Most tool handlers now share execution context and query/result mappers, but repository search still handles provider response orchestration itself because it merges multiple provider result sets.

That makes `githubSearchRepositories` an execution-path exception.

### 4. The public docs still explain behavior, but not the architecture

Current docs describe provider selection and tool behavior well, for example:

- [GitHub, GitLab & Bitbucket Tools Reference](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/docs/GITHUB_GITLAB_TOOLS_REFERENCE.md)
- [Authentication Setup](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/docs/AUTHENTICATION_SETUP.md)

But there is no dedicated architecture document that explains:

- where provider selection happens
- where capability decisions belong
- how tool query/result mapping is layered
- what remains intentionally global vs provider-specific

---

## Goals

- Make provider initialization fail fast and fail clearly
- Reduce provider capability ownership to a single source of truth
- Finish centralizing execution flow for provider-backed tools
- Document the architecture explicitly so future provider work follows the same design

## Non-Goals

- Do not change public tool names
- Do not introduce per-query provider selection
- Do not change query schemas or output schemas
- Do not change the GitHub-only status of clone and directory fetch

---

## Decisions

### Decision 1: Provider initialization must fail fast

`createProviderExecutionContext()` must stop swallowing provider-construction failures.

New behavior:

- if `getProvider()` succeeds, return a valid execution context
- if `getProvider()` fails, throw a typed internal error with provider type and a sanitized message
- provider-backed tool handlers must create execution context inside their existing per-query error path so that init failures still become normal tool errors through existing helpers

This keeps failures early, explicit, and attributable to configuration or provider registration.

### Decision 2: Capabilities must have one source of truth

Capability definitions must live in a single provider-capability registry module under `src/providers/`.

Provider implementations must consume that registry instead of inlining the capability object.

Execution helpers must read capabilities from the initialized provider instance rather than carrying a second capability matrix.

Recommended structure:

```ts
// src/providers/capabilities.ts
export const PROVIDER_CAPABILITIES: Record<ProviderType, ProviderCapabilities> = { ... }
```

Provider classes should expose:

```ts
readonly capabilities = PROVIDER_CAPABILITIES.github
```

The execution layer must not carry a second fallback matrix.

### Decision 3: Shared execution must support multi-call aggregation

The current `executeProviderOperation()` helper is optimized for one provider call per query.

Repository search needs a variant-aware multi-call version that preserves:

- provider error normalization
- success/failure partitioning
- merged-result behavior

Recommended addition:

```ts
executeProviderOperations(query, operations[])
```

This helper should:

- execute multiple provider calls for one tool query
- return raw structured success and failure results so the caller can preserve variant-specific pagination and hint semantics
- let the caller normalize provider errors using the existing `handleProviderError()` path only when a tool-specific flow needs that conversion

`githubSearchRepositories` should then become a normal consumer of the shared execution abstraction rather than a custom orchestration exception.

### Decision 4: Provider capability checks belong at the tool-flow boundary

Capability checks are valid in tool handlers, but only for user-facing flow decisions.

Examples:

- `githubCloneRepo` checks `cloneRepo`
- `githubGetFileContent` directory mode checks `fetchDirectoryToDisk`

Capability checks must not replace provider-level validation for provider-specific API constraints.

Examples that still belong in the provider implementation:

- Bitbucket requiring workspace scope
- GitLab project-scoped code search semantics

### Decision 5: Architecture documentation becomes a first-class package doc

The package should keep setup/reference docs separate from architecture docs.

This RFC should be followed by a durable architecture document that explains:

- provider selection
- provider registry and factory behavior
- provider capability ownership
- execution adapter responsibilities
- mapping-layer responsibilities
- provider delegate structure

---

## Proposed Architecture

### Layering

```text
Tool Schema / Input Types
  -> Tool Execution Handler
    -> Shared Provider Execution Adapter
      -> Query Mapper
        -> Provider Adapter
          -> Provider Delegate Module
            -> Host-Specific API Client

Provider Result
  -> Provider Adapter
    -> Result Mapper
      -> Tool Execution Handler
        -> Response Formatting / Hints
```

### Responsibility Split

#### Tool handlers

Own:

- input validation specific to the tool contract
- tool-specific flow decisions
- result shaping for final response formatting
- hint composition

Do not own:

- provider construction
- provider capability defaults
- duplicated provider error normalization

#### Shared provider execution adapter

Own:

- active provider resolution from server config
- provider construction
- typed provider unavailability errors
- single-call and multi-call provider execution helpers
- normalized provider error conversion

#### Query/result mappers

Own:

- tool query -> provider query translation
- provider result -> tool result translation
- stable pagination transformation helpers

Do not own:

- provider selection
- tool-specific business decisions

#### Providers

Own:

- capability declaration via shared registry
- provider-specific parameter translation
- provider-specific validation
- API error extraction and rate-limit normalization

Do not own:

- public tool response formatting
- tool-layer hint orchestration

---

## Implementation Plan

### Phase 1: Fix capability ownership

- Add `src/providers/capabilities.ts`
- Move the capability matrix there
- Update all providers to reference the shared registry
- Remove default capability duplication from `providerExecution.ts`

### Phase 2: Fix provider initialization flow

- Change `createProviderExecutionContext()` to fail fast
- Introduce a typed provider-initialization error
- Ensure all tool handlers surface that failure as a user-facing tool error, not as a property-access crash

### Phase 3: Finish execution centralization

- Add a shared multi-operation execution helper for one-query-many-provider-calls patterns
- Refactor `githubSearchRepositories` to use it
- Remove direct provider success/error partitioning from that handler

### Phase 4: Add contract coverage

- Add tests for provider-initialization failure behavior
- Add tests proving capability registry is the single source of truth
- Add tests for multi-operation execution in repository search
- Keep provider-specific behavior tests unchanged except where contract shape improves

### Phase 5: Promote the architecture doc

- Convert the stable parts of this RFC into a long-lived package architecture document
- Link it from package-level docs and agent guidance

---

## Test Requirements

### New tests

- `createProviderExecutionContext()` throws a clear provider-unavailable error when provider construction fails
- each provider exposes capabilities from the shared registry
- `githubSearchRepositories` uses shared execution helpers for mixed success/failure provider results
- capability-based GitHub-only flows still return the same user-facing errors

### Regression expectations

- `githubCloneRepo` remains GitHub-only
- `githubGetFileContent` directory mode remains GitHub-only
- global provider selection remains `GitLab -> Bitbucket -> GitHub`
- existing output shapes remain backward-compatible

---

## Risks

- Failing fast may break tests that currently rely on permissive context creation; those tests should be updated because the old behavior is architecturally incorrect
- Centralizing multi-call execution can accidentally flatten repository-search semantics if merge behavior is not preserved exactly
- Capability centralization must not erase provider-specific validation that belongs below the tool layer

---

## Success Criteria

- provider initialization failures are reported clearly and immediately
- provider capabilities are defined in one place only
- no `github*` execution handler performs custom provider construction
- repository search is no longer a custom execution-path exception
- architecture documentation exists and matches the implemented layering

---

## Related References

- [GitHub, GitLab & Bitbucket Tools Reference](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/docs/GITHUB_GITLAB_TOOLS_REFERENCE.md)
- [Authentication Setup](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/docs/AUTHENTICATION_SETUP.md)
- [GitHub Setup Guide](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/docs/GITHUB_SETUP_GUIDE.md)
- [GitLab Setup Guide](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/docs/GITLAB_SETUP_GUIDE.md)
- [Bitbucket Setup Guide](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-mcp/docs/BITBUCKET_SETUP_GUIDE.md)
