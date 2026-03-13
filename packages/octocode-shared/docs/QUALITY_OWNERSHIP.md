# Shared Quality Ownership

`octocode-shared` keeps a single blocking package lane:

- `shared:package` → `yarn lint && yarn typecheck && yarn test`

The package already has a clean shipping gate, so the main job here is keeping contract ownership explicit.

## Contract Ownership Map

| Area | Primary source seams | Tests that should fail first |
|------|----------------------|------------------------------|
| Config defaults, file loading, env overrides | `src/config/` | `tests/config/loader.test.ts`, `tests/config/resolver.test.ts`, `tests/config/resolverSections.test.ts`, `tests/config/validator.test.ts` |
| Credential cache and encrypted storage | `src/credentials/credentialCache.ts`, `src/credentials/storage.ts`, `src/credentials/tokenResolution.ts` | `tests/credentials/credentialCache.test.ts`, `tests/credentials/storage.test.ts` |
| Session cache, flush behavior, and persistence | `src/session/sessionCache.ts`, `src/session/storage.ts`, `src/session/sessionDiskIO.ts` | `tests/session/storage.test.ts`, `tests/session/storage.edgecases.test.ts` |
| Platform path resolution | `src/platform/platform.ts` | `tests/platform/platform.test.ts` |

## Usage Rules

1. When an MCP startup/config bug turns out to come from shared resolution logic, add the failing shared test first and then update the MCP contract that depends on it.
2. Keep shared tests deterministic and package-local. This package is the baseline for a clean blocking lane, so do not mix eval harnesses or external dependencies into `shared:package`.
3. Prefer extending the closest existing suite over adding a broad catch-all file.

## Related References

- [API Reference](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-shared/docs/API_REFERENCE.md)
- [Credentials Architecture](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-shared/docs/CREDENTIALS_ARCHITECTURE.md)
- [Session Persistence](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-shared/docs/SESSION_PERSISTENCE.md)
