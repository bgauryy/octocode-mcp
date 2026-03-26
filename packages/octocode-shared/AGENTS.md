# AGENTS.md - Octocode Shared

> **Location**: `packages/octocode-shared/AGENTS.md`

AI agent guidance for the `octocode-shared` package - Shared utilities for credential management, session persistence, and platform detection across Octocode packages.

This file **overrides** the root [`AGENTS.md`](https://github.com/bgauryy/octocode-mcp/blob/main/AGENTS.md) for work within this package.

---

## Overview

Octocode Shared provides common utilities used by multiple Octocode packages:

* **Credential Management**: Secure token storage with AES-256-GCM encryption
* **Session Persistence**: Session state with deferred writes and usage statistics
* **Platform Detection**: Cross-platform path and environment utilities
* **Encrypted File Storage**: Pure JavaScript AES-256-GCM storage in `~/.octocode/`

**Key Consumers**: `octocode-cli`, `octocode-mcp`

---

## 🛠️ Commands

All commands run from this package directory (`packages/octocode-shared/`).
For monorepo-wide setup and workflow commands, see [docs/DEVELOPMENT_GUIDE.md](https://github.com/bgauryy/octocode-mcp/blob/main/docs/DEVELOPMENT_GUIDE.md).

| Task | Command | Description |
|------|---------|-------------|
| **Build** | `yarn build` | Lint + compile TypeScript |
| **Build (Dev)** | `yarn build:dev` | Compile without lint |
| **Clean** | `yarn clean` | Remove `dist/` directory |
| **Test** | `yarn test` | Run tests with coverage |
| **Test (Quiet)** | `yarn test:quiet` | Minimal test output |
| **Test (Watch)** | `yarn test:watch` | Watch mode for tests |
| **Lint** | `yarn lint` | ESLint check |
| **Lint (Fix)** | `yarn lint:fix` | Auto-fix linting issues |
| **Typecheck** | `yarn typecheck` | TypeScript type checking |

---

## 📚 Documentation

Technical documentation for the shared utilities:

| Document | Description |
|----------|-------------|
| [`API_REFERENCE.md`](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-shared/docs/API_REFERENCE.md) | Complete API documentation for all modules |
| [`CREDENTIALS_ARCHITECTURE.md`](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-shared/docs/CREDENTIALS_ARCHITECTURE.md) | Token storage, encryption, file storage integration, refresh flow |
| [`SESSION_PERSISTENCE.md`](https://github.com/bgauryy/octocode-mcp/blob/main/packages/octocode-shared/docs/SESSION_PERSISTENCE.md) | Deferred writes, exit handlers, statistics tracking |

---

## 📂 Package Structure

```
src/
├── index.ts                    # Package exports
│
├── credentials/                # 🔐 Secure credential storage
│   ├── index.ts                # Credentials module exports
│   ├── credentialEncryption.ts   # AES-256-GCM encryption + file I/O
│   ├── storage.ts              # AES-256-GCM encrypted storage
│   └── types.ts                # Credential type definitions
│
├── platform/                   # 🖥️ Platform utilities
│   ├── index.ts                # Platform module exports
│   └── platform.ts             # OS detection & paths
│
└── session/                    # 📊 Session persistence
    ├── index.ts                # Session module exports
    ├── storage.ts              # Session storage with deferred writes
    └── types.ts                # Session type definitions
```

### Tests Structure

```
tests/
├── credentials/
│   └── storage.test.ts           # Credential storage tests
├── platform/
│   └── platform.test.ts        # Platform detection tests
└── session/
    └── storage.test.ts         # Session storage tests
```

---

## 📦 Module Exports

The package provides four entry points:

```typescript
// Main entry - all exports
import { ... } from 'octocode-shared';

// Credentials only
import { ... } from 'octocode-shared/credentials';

// Platform only
import { ... } from 'octocode-shared/platform';

// Session only
import { ... } from 'octocode-shared/session';
```

### Credentials Module

| Export | Type | Purpose |
|--------|------|---------|
| `storeCredentials` | Function | Store encrypted credentials |
| `getCredentials` | Function | Retrieve credentials (async, cached) |
| `getCredentialsSync` | Function | Retrieve credentials (sync, file only) |
| `deleteCredentials` | Function | Remove stored credentials |
| `getToken` | Function | Get token for a host (async) |
| `getTokenSync` | Function | Get token for a host (sync) |
| `getTokenWithRefresh` | Function | Get token with auto-refresh (recommended) |
| `resolveToken` | Function | Resolve token from env/storage |
| `resolveTokenWithRefresh` | Function | Resolve with auto-refresh |
| `resolveTokenFull` | Function | Full resolution with gh CLI fallback |
| `refreshAuthToken` | Function | Manually refresh an expired token |
| `updateToken` | Function | Update stored token |
| `invalidateCredentialsCache` | Function | Invalidate cached credentials |
| `listStoredHosts` | Function | List all stored hosts |
| `hasCredentials` | Function | Check if credentials exist |
| `isTokenExpired` | Function | Check token expiration |
| `isRefreshTokenExpired` | Function | Check refresh token expiration |
| `getTokenFromEnv` | Function | Get token from environment |
| `hasEnvToken` | Function | Check for env token |
| `OAuthToken` | Type | OAuth token structure |
| `StoredCredentials` | Type | Credential data structure |
| `TokenSource` | Type | Token origin (env/storage) |
| `GetCredentialsOptions` | Type | Options for getCredentials |

### Platform Module

| Export | Type | Purpose |
|--------|------|---------|
| `getPlatform()` | Function | Get current OS (`darwin`, `win32`, `linux`) |
| `getConfigPath()` | Function | Platform-specific config directory |
| `isWindows()` | Function | Windows detection |
| `isMacOS()` | Function | macOS detection |
| `isLinux()` | Function | Linux detection |

### Session Module

| Export | Type | Purpose |
|--------|------|---------|
| `readSession` | Function | Read current session from cache/disk |
| `writeSession` | Function | Write session (deferred to disk) |
| `getOrCreateSession` | Function | Get existing or create new session |
| `getSessionId` | Function | Get current session ID |
| `deleteSession` | Function | Delete session file |
| `flushSession` | Function | Flush pending writes to disk |
| `flushSessionSync` | Function | Sync flush for exit handlers |
| `updateSessionStats` | Function | Update session statistics |
| `incrementToolCalls` | Function | Increment tool call counter |
| `incrementPromptCalls` | Function | Increment prompt call counter |
| `incrementErrors` | Function | Increment error counter |
| `incrementRateLimits` | Function | Increment rate limit counter |
| `resetSessionStats` | Function | Reset all statistics |
| `SESSION_FILE` | Constant | Path to session file |
| `PersistedSession` | Type | Session data structure |
| `SessionStats` | Type | Usage statistics structure |
| `SessionUpdateResult` | Type | Update result type |
| `SessionOptions` | Type | Session creation options |

---

## 🔐 Credential Storage Architecture

### Encryption Details

```
┌─────────────────────────────────────────────────────────────┐
│                    CREDENTIAL STORAGE                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Token → AES-256-GCM Encryption → Base64 → File Storage     │
│                                                              │
│  Encryption Key:                                             │
│    └── Stored in system file storage (via file storage-napi)        │
│    └── Fallback: File-based key storage                     │
│                                                              │
│  Storage Location:                                           │
│    └── ~/.octocode/credentials.json                         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Security Features

* **AES-256-GCM**: Authenticated encryption with associated data
* **Random IV**: Unique initialization vector per encryption
* **File-Based Key Storage**: Encryption key stored securely in `~/.octocode/.key`
* **Secure Fallback**: File-based key when file storage unavailable
* **Token Resolution**: Automatic env → storage → gh CLI fallback chain
* **Auto-Refresh**: Octocode tokens refreshed automatically when expired (via `@octokit/oauth-methods`)
* **In-Memory Cache**: 5-minute TTL with automatic invalidation on credential updates

---

## 📊 Session Storage Architecture

### Session Persistence

```
┌─────────────────────────────────────────────────────────────┐
│                    SESSION STORAGE                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  In-Memory Cache ←→ Deferred Writes → File Storage          │
│                                                              │
│  Write Strategy:                                             │
│    └── Writes are cached in memory                          │
│    └── Flushed to disk on timer or explicit flush           │
│    └── Sync flush on process exit (SIGINT, SIGTERM)         │
│                                                              │
│  Storage Location:                                           │
│    └── ~/.octocode/session.json                             │
│                                                              │
│  Data Tracked:                                               │
│    └── sessionId, createdAt, lastActiveAt                   │
│    └── stats: toolCalls, promptCalls, errors, rateLimits    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Session Features

* **Deferred Writes**: Batches writes for performance
* **In-Memory Caching**: Fast reads from memory
* **Exit Handlers**: Automatic flush on process exit
* **Statistics Tracking**: Tool calls, prompts, errors, rate limits
* **Atomic Counters**: Thread-safe stat increments

---

## 📦 Package Guidelines

These are the core principles for this shared package:

1. **Minimal Dependencies**: Keep runtime dependencies small and portable.
2. **Cross-Platform**: Must work on macOS, Linux, and Windows.
3. **Type-Safe Exports**: Full TypeScript types with strict mode.
4. **Security First**: All credential operations use encryption.
5. **Performance**: Session writes are deferred for efficiency.
6. **Minimal API Surface**: Export only what's needed by consumers.

---

## 🏗️ Architecture Patterns

### Token Resolution Flow

```
resolveTokenFull(options)
    ↓
getTokenFromEnv()  ← Checked first (highest priority, NO REFRESH)
    ├── 1. Check OCTOCODE_TOKEN
    ├── 2. Check GH_TOKEN
    ├── 3. Check GITHUB_TOKEN
    └── Return { token, source: 'env:*' } if found (user manages these)
    ↓
getTokenWithRefresh(host)  ← ONLY OCTOCODE TOKENS ARE REFRESHED
    ├── Read from in-memory cache (5-min TTL)
    ├── Fallback to file storage or encrypted storage
    ├── Auto-refresh if token expired (using @octokit/oauth-methods)
    └── Return { token, source: 'file storage'|'file' } if found
    ↓
getGhCliToken(host)  ← Fallback (NO REFRESH - gh CLI manages its own tokens)
    └── Return { token, source: 'gh-cli' } if found
    ↓
Return result or null
```

### Token Refresh Policy

| Token Source | Auto-Refresh? | Reason |
|--------------|---------------|--------|
| **Env vars** (`OCTOCODE_TOKEN`, `GH_TOKEN`, `GITHUB_TOKEN`) | ❌ No | User-managed tokens |
| **Octocode credentials** (file storage/file) | ✅ If supported | GitHub App tokens only (see below) |
| **gh CLI token** | ❌ No | gh CLI handles its own token refresh |

**Token Type Support:**

| Token Type | Expires? | Refresh Token? | Auto-Refresh? |
|------------|----------|----------------|---------------|
| **GitHub App user tokens** | ✅ 8 hours | ✅ Yes | ✅ Yes |
| **OAuth App tokens** (classic) | ❌ Never | ❌ No | ❌ N/A |

**Note:** Only tokens with a `refreshToken` field are auto-refreshed. OAuth App tokens never expire and don't need refresh. Octocode uses a GitHub App, so tokens from `octocode login` support auto-refresh.

### Credentials Caching

```
┌─────────────────────────────────────────────────────────────┐
│                 IN-MEMORY CREDENTIALS CACHE                  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Cache TTL: 5 minutes (matches token expiry buffer)         │
│                                                              │
│  Cache Invalidation:                                         │
│    └── storeCredentials() → invalidates hostname             │
│    └── deleteCredentials() → invalidates hostname            │
│    └── updateToken() → calls storeCredentials()              │
│    └── refreshAuthToken() → calls updateToken()              │
│                                                              │
│  Bypass Cache:                                               │
│    └── getCredentials(host, { bypassCache: true })          │
│                                                              │
│  Manual Invalidation:                                        │
│    └── invalidateCredentialsCache(hostname?)                │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Session Write Flow

```
writeSession(session)
    ↓
cachedSession = session
isDirty = true
    ↓
registerExitHandlers() (once)
    ├── SIGINT → flushSessionSync()
    ├── SIGTERM → flushSessionSync()
    └── beforeExit → flushSessionSync()
    ↓
startFlushTimer()
    └── setTimeout → flushSession() → writeSessionToDisk()
```

### Key Management

```
┌─────────────────────────────────────────────────────────────┐
│                    KEY MANAGEMENT                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  File-Based Key Storage                                     │
│    └── Location: ~/.octocode/.key                           │
│    └── Used by AES-256-GCM encryption/decryption            │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 🛡️ Safety & Permissions

### Package-Level Access

| Path | Access | Description |
|------|--------|-------------|
| `src/` | ✅ FULL | Source code |
| `tests/` | ✅ FULL | Test files |
| `*.json`, `*.config.*` | ⚠️ ASK | Package configs |
| `dist/`, `coverage/`, `node_modules/` | ❌ NEVER | Generated files |

### Protected Files

* **Never Modify**: `dist/`, `coverage/`, `node_modules/`
* **Ask Before Modifying**: `package.json`, `tsconfig.json`, `vitest.config.ts`

### Security Considerations

* **Key Isolation**: Encryption keys are stored locally in `~/.octocode/.key` with restrictive permissions
* **No Plaintext Storage**: Tokens are always encrypted at rest
* **Env Variable Priority**: Environment tokens take precedence
* **Deferred Writes**: Session data is flushed safely on exit

---

## 🧪 Testing Protocol

### Requirements

* **Coverage**: 90% required (Statements, Branches, Functions, Lines)
* **Framework**: Vitest with v8 coverage

### Test Categories

| Category | Path | Purpose |
|----------|------|---------|
| Unit | `tests/credentials/storage.test.ts` | Encryption/decryption, token management |
| Unit | `tests/credentials/storage.test.ts` | Credential storage, encryption, token management |
| Unit | `tests/platform/platform.test.ts` | OS detection, path resolution |
| Unit | `tests/session/storage.test.ts` | Session persistence, stats, flushing |

### Running Tests

```bash
yarn test              # Full test with coverage
yarn test:watch        # Watch mode
yarn test:quiet        # Minimal output
```

---

## 📝 Development Notes

### Adding New Modules

1. Create module directory under `src/`
2. Add `index.ts` with exports
3. Update `src/index.ts` to re-export
4. Add export path in `package.json` exports field
5. Create corresponding test file

### Dependencies

| Dependency | Purpose |
|------------|---------|
| `zod` | Runtime schema validation for stored credential payloads |
| `@octokit/oauth-methods` | GitHub OAuth token refresh |
| `@octokit/request` | HTTP requests to GitHub API |

### Build Output

```
dist/
├── index.js            # Main entry
├── index.d.ts          # Type declarations
├── credentials/        # Credentials module
│   ├── index.js
│   ├── index.d.ts
│   ├── credentialEncryption.js
│   ├── storage.js
│   └── types.d.ts
├── platform/           # Platform module
│   ├── index.js
│   ├── index.d.ts
│   └── platform.js
└── session/            # Session module
    ├── index.js
    ├── index.d.ts
    ├── storage.js
    └── types.d.ts
```
