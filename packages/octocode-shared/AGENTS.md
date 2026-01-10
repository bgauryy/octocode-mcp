# AGENTS.md - Octocode Shared

> **Location**: `packages/octocode-shared/AGENTS.md`

AI agent guidance for the `octocode-shared` package - Shared utilities for credential management, session persistence, and platform detection across Octocode packages.

This file **overrides** the root [`AGENTS.md`](../../AGENTS.md) for work within this package.

---

## Overview

Octocode Shared provides common utilities used by multiple Octocode packages:

- **Credential Management**: Secure token storage with AES-256-GCM encryption
- **Session Persistence**: Session state with deferred writes and usage statistics
- **Platform Detection**: Cross-platform path and environment utilities
- **Keychain Integration**: Native keychain access via `keychain-napi`

**Key Consumers**: `octocode-cli`, `octocode-mcp`

---

## 🛠️ Commands

All commands run from this package directory (`packages/octocode-shared/`).

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

## 📂 Package Structure

```
src/
├── index.ts                    # Package exports
│
├── credentials/                # 🔐 Secure credential storage
│   ├── index.ts                # Credentials module exports
│   ├── keychain.ts             # System keychain wrapper (internal)
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
│   ├── keychain.test.ts        # Keychain integration tests
│   └── storage.test.ts         # Credential storage tests
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
| `getCredentials` | Function | Retrieve credentials (async) |
| `getCredentialsSync` | Function | Retrieve credentials (sync) |
| `deleteCredentials` | Function | Remove stored credentials |
| `getToken` | Function | Get token for a host (async) |
| `getTokenSync` | Function | Get token for a host (sync) |
| `resolveToken` | Function | Resolve token from env/storage |
| `updateToken` | Function | Update stored token |
| `listStoredHosts` | Function | List all stored hosts |
| `hasCredentials` | Function | Check if credentials exist |
| `isTokenExpired` | Function | Check token expiration |
| `isRefreshTokenExpired` | Function | Check refresh token expiration |
| `initializeSecureStorage` | Function | Initialize keychain-backed storage |
| `isSecureStorageAvailable` | Function | Check if secure storage works |
| `getTokenFromEnv` | Function | Get token from environment |
| `hasEnvToken` | Function | Check for env token |
| `OAuthToken` | Type | OAuth token structure |
| `StoredCredentials` | Type | Credential data structure |
| `TokenSource` | Type | Token origin (env/storage) |

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
│    └── Stored in system keychain (via keychain-napi)        │
│    └── Fallback: File-based key storage                     │
│                                                              │
│  Storage Location:                                           │
│    └── ~/.octocode/credentials.json                         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Security Features

- **AES-256-GCM**: Authenticated encryption with associated data
- **Random IV**: Unique initialization vector per encryption
- **Keychain Integration**: Native OS keychain for encryption key
- **Secure Fallback**: File-based key when keychain unavailable
- **Token Resolution**: Automatic env → storage → null fallback chain

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

- **Deferred Writes**: Batches writes for performance
- **In-Memory Caching**: Fast reads from memory
- **Exit Handlers**: Automatic flush on process exit
- **Statistics Tracking**: Tool calls, prompts, errors, rate limits
- **Atomic Counters**: Thread-safe stat increments

---

## 📦 Package Guidelines

These are the core principles for this shared package:

1. **Minimal Dependencies**: Only `keychain-napi` for keychain access.
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
getTokenFromEnv()  ← Checked first (highest priority)
    ├── 1. Check OCTOCODE_TOKEN
    ├── 2. Check GH_TOKEN
    ├── 3. Check GITHUB_TOKEN
    └── Return { token, source: 'env:*' } if found
    ↓
getTokenWithRefresh(host)
    ├── Read from keychain or encrypted storage
    ├── Auto-refresh if token expired
    └── Return { token, source: 'keychain'|'file' } if found
    ↓
getGhCliToken(host)  ← Fallback
    └── Return { token, source: 'gh-cli' } if found
    ↓
Return result or null
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
│  Primary: System Keychain (keychain-napi)                   │
│    └── Service: "octocode"                                  │
│    └── Account: "encryption-key"                            │
│                                                              │
│  Fallback: File-Based Key                                   │
│    └── Location: ~/.octocode/.key                           │
│    └── Used when keychain unavailable                       │
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

- **Never Modify**: `dist/`, `coverage/`, `node_modules/`
- **Ask Before Modifying**: `package.json`, `tsconfig.json`, `vitest.config.ts`

### Security Considerations

- **Key Isolation**: Encryption keys never leave the system keychain
- **No Plaintext Storage**: Tokens are always encrypted at rest
- **Env Variable Priority**: Environment tokens take precedence
- **Deferred Writes**: Session data is flushed safely on exit

---

## 🧪 Testing Protocol

### Requirements

- **Coverage**: 90% required (Statements, Branches, Functions, Lines)
- **Framework**: Vitest with v8 coverage

### Test Categories

| Category | Path | Purpose |
|----------|------|---------|
| Unit | `tests/credentials/storage.test.ts` | Encryption/decryption, token management |
| Unit | `tests/credentials/keychain.test.ts` | Keychain integration |
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
| `keychain-napi` | Native keychain access |

### Build Output

```
dist/
├── index.js            # Main entry
├── index.d.ts          # Type declarations
├── credentials/        # Credentials module
│   ├── index.js
│   ├── index.d.ts
│   ├── keychain.js     # Internal keychain wrapper
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
