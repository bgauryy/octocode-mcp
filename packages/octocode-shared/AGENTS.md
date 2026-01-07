# AGENTS.md - Octocode Shared

> **Location**: `packages/octocode-shared/AGENTS.md`

AI agent guidance for the `octocode-shared` package - Shared utilities for credential management and platform detection across Octocode packages.

This file **overrides** the root [`AGENTS.md`](../../AGENTS.md) for work within this package.

---

## Overview

Octocode Shared provides common utilities used by multiple Octocode packages:

- **Credential Management**: Secure token storage with AES-256-GCM encryption
- **Platform Detection**: Cross-platform path and environment utilities
- **Keychain Integration**: Native keychain access via `keytar`

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
│   ├── storage.ts              # AES-256-GCM encrypted storage
│   └── types.ts                # Credential type definitions
│
└── platform/                   # 🖥️ Platform utilities
    ├── index.ts                # Platform module exports
    └── platform.ts             # OS detection & paths
```

### Tests Structure

```
tests/
├── credentials/
│   └── storage.test.ts         # Credential storage tests
└── platform/
    └── platform.test.ts        # Platform detection tests
```

---

## 📦 Module Exports

The package provides three entry points:

```typescript
// Main entry - all exports
import { ... } from 'octocode-shared';

// Credentials only
import { ... } from 'octocode-shared/credentials';

// Platform only
import { ... } from 'octocode-shared/platform';
```

### Credentials Module

| Export | Type | Purpose |
|--------|------|---------|
| `TokenStorage` | Class | Encrypted credential storage manager |
| `CredentialType` | Enum | Token types (GitHub, etc.) |
| `StoredCredential` | Type | Credential data structure |

### Platform Module

| Export | Type | Purpose |
|--------|------|---------|
| `getPlatform()` | Function | Get current OS (`darwin`, `win32`, `linux`) |
| `getConfigPath()` | Function | Platform-specific config directory |
| `isWindows()` | Function | Windows detection |
| `isMacOS()` | Function | macOS detection |
| `isLinux()` | Function | Linux detection |

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
│    └── Stored in system keychain (via keytar)               │
│    └── Fallback: Machine-derived key                        │
│                                                              │
│  Storage Location:                                           │
│    └── ~/.octocode/credentials.json                         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Security Features

- **AES-256-GCM**: Authenticated encryption with associated data
- **Random IV**: Unique initialization vector per encryption
- **Keytar Integration**: Native OS keychain for encryption key
- **Secure Fallback**: Machine-derived key when keychain unavailable

---

## 📦 Package Guidelines

These are the core principles for this shared package:

1. **Zero External Dependencies**: Only `keytar` for keychain access.
2. **Cross-Platform**: Must work on macOS, Linux, and Windows.
3. **Type-Safe Exports**: Full TypeScript types with strict mode.
4. **Security First**: All credential operations use encryption.
5. **Minimal API Surface**: Export only what's needed by consumers.

---

## 🏗️ Architecture Patterns

### Token Storage Flow

```
storeToken(type, token)
    ↓
getOrCreateEncryptionKey()
    ├── Try keytar.getPassword()
    ├── If not found: generate random key, store in keytar
    └── Fallback: derive from machine ID
    ↓
encrypt(token, key)
    ├── Generate random 12-byte IV
    ├── AES-256-GCM encrypt
    └── Return { iv, tag, ciphertext }
    ↓
writeCredentials(path, encrypted)
```

### Key Management

```
┌─────────────────────────────────────────────────────────────┐
│                    KEY MANAGEMENT                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Primary: System Keychain (keytar)                          │
│    └── Service: "octocode"                                  │
│    └── Account: "encryption-key"                            │
│                                                              │
│  Fallback: Machine-Derived Key                              │
│    └── SHA-256(hostname + os.platform + os.arch)            │
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
- **Secure Wipe**: Consider adding secure memory wipe for sensitive data

---

## 🧪 Testing Protocol

### Requirements

- **Coverage**: 90% required (Statements, Branches, Functions, Lines)
- **Framework**: Vitest with v8 coverage

### Test Categories

| Category | Path | Purpose |
|----------|------|---------|
| Unit | `tests/credentials/storage.test.ts` | Encryption/decryption, key management |
| Unit | `tests/platform/platform.test.ts` | OS detection, path resolution |

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
| `keytar` | Native keychain access |

### Build Output

```
dist/
├── index.js            # Main entry
├── index.d.ts          # Type declarations
├── credentials/        # Credentials module
│   ├── index.js
│   ├── index.d.ts
│   ├── storage.js
│   └── types.d.ts
└── platform/           # Platform module
    ├── index.js
    ├── index.d.ts
    └── platform.js
```

