# Credentials Architecture

> Technical deep-dive into the credential storage system in `octocode-shared`.

## Overview

The credentials module provides secure token storage with encryption, keychain integration, automatic token refresh, and multi-source resolution. It's designed to be the single source of truth for GitHub authentication across all Octocode packages.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           TOKEN RESOLUTION FLOW                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐   Priority: 1 (Highest)                                   │
│  │ Environment  │   ─────────────────────                                   │
│  │   Variables  │   OCTOCODE_TOKEN → GH_TOKEN → GITHUB_TOKEN                │
│  │              │   ⚠️ No auto-refresh (user-managed)                        │
│  └──────┬───────┘                                                            │
│         │ Not found?                                                         │
│         ▼                                                                    │
│  ┌──────────────┐   Priority: 2                                             │
│  │   Keychain   │   ──────────                                              │
│  │  (Native OS) │   macOS Keychain / Windows Credential Manager / libsecret │
│  │              │   ✅ Auto-refresh for Octocode OAuth tokens               │
│  └──────┬───────┘                                                            │
│         │ Not available?                                                     │
│         ▼                                                                    │
│  ┌──────────────┐   Priority: 3                                             │
│  │  Encrypted   │   ──────────                                              │
│  │    File      │   ~/.octocode/credentials.json (AES-256-GCM)              │
│  │              │   ✅ Auto-refresh for Octocode OAuth tokens               │
│  └──────┬───────┘                                                            │
│         │ Not found?                                                         │
│         ▼                                                                    │
│  ┌──────────────┐   Priority: 4 (Lowest)                                    │
│  │   gh CLI     │   ─────────────────────                                   │
│  │   Fallback   │   `gh auth token` command                                 │
│  │              │   ⚠️ No auto-refresh (gh CLI manages its own)             │
│  └──────────────┘                                                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Storage Layers

### Layer 1: System Keychain (Preferred)

**Library**: `@napi-rs/keyring` (native N-API bindings)

| Platform | Backend |
|----------|---------|
| macOS | Keychain Services |
| Windows | Windows Credential Manager |
| Linux | libsecret (GNOME Keyring / KWallet) |

```typescript
import { AsyncEntry } from '@napi-rs/keyring';

// Store credential
const entry = new AsyncEntry('octocode-cli', 'github.com');
await entry.setPassword(JSON.stringify(credentials));

// Retrieve credential
const data = await entry.getPassword();
const credentials = JSON.parse(data);
```

**Advantages**:
- OS-level security (encrypted at rest)
- Survives reinstalls
- No custom encryption key management

**Timeout Protection**: All keychain operations have a 3-second timeout to prevent hangs:

```typescript
const KEYRING_TIMEOUT_MS = 3000;

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new TimeoutError(`Timed out after ${ms}ms`)), ms)
    ),
  ]);
}
```

---

### Layer 2: Encrypted File Storage (Fallback)

When keychain is unavailable (CI environments, containers, SSH sessions), credentials fall back to encrypted file storage.

**File Locations**:

| File | Purpose | Permissions |
|------|---------|-------------|
| `~/.octocode/credentials.json` | Encrypted credentials | `0600` |
| `~/.octocode/.key` | Encryption key | `0600` |

**Encryption Algorithm**: AES-256-GCM

```typescript
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

function encrypt(data: string): string {
  const key = getOrCreateKey();           // 256-bit from ~/.octocode/.key
  const iv = randomBytes(IV_LENGTH);      // Unique per encryption
  const cipher = createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();    // Authentication tag for integrity
  
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}
```

**Format**: `iv:authTag:ciphertext` (hex-encoded, colon-separated)

---

## Token Types & Refresh Policy

| Token Type | Has Expiry? | Has Refresh Token? | Auto-Refresh? |
|------------|-------------|-------------------|---------------|
| **Octocode OAuth** | ✅ 8 hours | ✅ 6 months | ✅ Yes |
| **GitHub PAT (classic)** | ❌ No | ❌ No | ❌ N/A |
| **GitHub PAT (fine-grained)** | ✅ Optional | ❌ No | ❌ No |
| **Environment Variables** | Unknown | Unknown | ❌ No (user-managed) |
| **gh CLI Token** | ✅ 8 hours | ✅ Managed by gh | ❌ No (gh manages) |

### Octocode OAuth Token Structure

```typescript
interface OAuthToken {
  token: string;              // Access token
  tokenType: 'oauth';
  scopes?: string[];          // e.g., ['repo', 'read:user']
  refreshToken?: string;      // For refreshing expired tokens
  expiresAt?: string;         // ISO 8601 timestamp
  refreshTokenExpiresAt?: string;
}
```

### Expiration Checking

```typescript
export function isTokenExpired(credentials: StoredCredentials): boolean {
  const { expiresAt } = credentials.token;
  if (!expiresAt) return false;  // No expiry = never expires
  return new Date(expiresAt) < new Date();
}

export function isRefreshTokenExpired(credentials: StoredCredentials): boolean {
  const { refreshTokenExpiresAt } = credentials.token;
  if (!refreshTokenExpiresAt) return false;
  return new Date(refreshTokenExpiresAt) < new Date();
}
```

---

## Token Refresh Flow

When a token is expired, `getTokenWithRefresh()` automatically refreshes it:

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│ Get Token   │────▶│ Check Expiry │────▶│ Token Valid?    │
└─────────────┘     └──────────────┘     └────────┬────────┘
                                                  │
                            ┌─────────────────────┴─────────────────────┐
                            │ Yes                                       │ No
                            ▼                                           ▼
                    ┌───────────────┐                          ┌────────────────┐
                    │ Return Token  │                          │ Has Refresh    │
                    └───────────────┘                          │ Token?         │
                                                               └───────┬────────┘
                                                                       │
                                              ┌────────────────────────┴────────┐
                                              │ Yes                             │ No
                                              ▼                                 ▼
                                     ┌────────────────┐              ┌──────────────┐
                                     │ Refresh via    │              │ Return       │
                                     │ @octokit/oauth │              │ Expired      │
                                     └───────┬────────┘              │ Token        │
                                             │                       └──────────────┘
                                             ▼
                                     ┌────────────────┐
                                     │ Store New      │
                                     │ Token          │
                                     └───────┬────────┘
                                             │
                                             ▼
                                     ┌────────────────┐
                                     │ Return Fresh   │
                                     │ Token          │
                                     └────────────────┘
```

**Refresh Implementation** (using `@octokit/oauth-methods`):

```typescript
import { refreshToken as octokitRefreshToken } from '@octokit/oauth-methods';

export async function refreshAuthToken(
  credentials: StoredCredentials,
  clientId: string = DEFAULT_CLIENT_ID
): Promise<RefreshResult> {
  const { refreshToken } = credentials.token;
  
  const { data } = await octokitRefreshToken({
    clientType: 'github-app',
    clientId,
    refreshToken,
  });
  
  // Update stored credentials with new token
  const updatedCredentials = {
    ...credentials,
    token: {
      ...credentials.token,
      token: data.access_token,
      expiresAt: data.expires_at,
      refreshToken: data.refresh_token,
      refreshTokenExpiresAt: data.refresh_token_expires_at,
    },
  };
  
  await storeCredentials(updatedCredentials);
  return { success: true, token: data.access_token };
}
```

---

## In-Memory Caching

To avoid repeated keychain/file reads, credentials are cached in memory:

```typescript
interface CachedCredentials {
  credentials: StoredCredentials;
  cachedAt: number;
}

const credentialsCache = new Map<string, CachedCredentials>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function isCacheValid(hostname: string): boolean {
  const cached = credentialsCache.get(hostname);
  if (!cached) return false;
  return Date.now() - cached.cachedAt < CACHE_TTL_MS;
}
```

**Cache Invalidation**:

```typescript
// Invalidate specific host
invalidateCredentialsCache('github.com');

// Invalidate all
invalidateCredentialsCache();
```

The cache is automatically invalidated when:
- `storeCredentials()` is called
- `deleteCredentials()` is called
- `updateToken()` is called

---

## Hostname Normalization

All hostnames are normalized before storage/lookup:

```typescript
function normalizeHostname(hostname: string): string {
  return hostname
    .toLowerCase()
    .replace(/^https?:\/\//, '')  // Remove protocol
    .replace(/\/$/, '');          // Remove trailing slash
}

// Examples:
// 'GitHub.com' → 'github.com'
// 'https://github.com/' → 'github.com'
// 'GITHUB.ENTERPRISE.COM' → 'github.enterprise.com'
```

---

## Migration Strategy

When keychain becomes available after credentials were stored in files, automatic migration occurs:

```typescript
async function fetchCredentialsFromStorage(hostname: string) {
  // Try keychain first
  if (isSecureStorageAvailable()) {
    const creds = await keychainGet(hostname);
    if (creds) return creds;
  }
  
  // Fallback to file
  const store = readCredentialsStore();
  const fileCreds = store.credentials[hostname];
  
  if (fileCreds) {
    // Migrate to keychain in background if available
    if (isSecureStorageAvailable()) {
      migrateSingleCredential(hostname, fileCreds).catch(() => {});
    }
    return fileCreds;
  }
  
  return null;
}
```

---

## API Reference

### Primary Functions

| Function | Purpose | Async? |
|----------|---------|--------|
| `resolveTokenFull(options)` | Complete token resolution with all fallbacks | ✅ |
| `getTokenWithRefresh(host)` | Get token with auto-refresh | ✅ |
| `storeCredentials(creds)` | Store credentials securely | ✅ |
| `getCredentials(host)` | Retrieve credentials | ✅ |
| `deleteCredentials(host)` | Remove credentials | ✅ |

### Synchronous Variants

| Function | Purpose |
|----------|---------|
| `getCredentialsSync(host)` | Sync credential retrieval (file only) |
| `getTokenSync(host)` | Sync token retrieval (no refresh) |
| `hasCredentialsSync(host)` | Sync credential existence check |

### Token Source Detection

| Function | Purpose |
|----------|---------|
| `getTokenFromEnv()` | Get token from environment |
| `getEnvTokenSource()` | Get which env var has token |
| `hasEnvToken()` | Check if env token exists |

### Utility Functions

| Function | Purpose |
|----------|---------|
| `isTokenExpired(creds)` | Check token expiration |
| `isRefreshTokenExpired(creds)` | Check refresh token expiration |
| `invalidateCredentialsCache(host?)` | Clear credential cache |
| `listStoredHosts()` | List all stored hostnames |

---

## Security Considerations

### ✅ What We Do

1. **AES-256-GCM**: Authenticated encryption prevents tampering
2. **Unique IVs**: Each encryption uses a random initialization vector
3. **File Permissions**: `0600` (owner read/write only)
4. **Keychain Priority**: Native OS security when available
5. **Memory Cache TTL**: Credentials expire from memory after 5 minutes
6. **Timeout Protection**: Keychain operations timeout after 3 seconds

### ⚠️ Limitations

1. **File-based Key**: When keychain unavailable, encryption key is in `~/.octocode/.key`
2. **Single-User**: Designed for single-user workstations, not multi-tenant
3. **No HSM Support**: Does not integrate with hardware security modules
4. **Trust on First Use**: No certificate pinning for token refresh endpoints

---

## Error Handling

```typescript
// Keychain timeout
try {
  await getCredentials('github.com');
} catch (error) {
  if (error instanceof TimeoutError) {
    // Keychain operation timed out (>3s)
    // Falls back to file storage automatically
  }
}

// Corrupted credentials file
const store = readCredentialsStore();
// Returns { version: 1, credentials: {} } on parse errors
// Warns user: "Could not read credentials file. You may need to login again."
```

---

## Related Documentation

- [SESSION_PERSISTENCE.md](./SESSION_PERSISTENCE.md) - Session storage architecture
- [API_REFERENCE.md](./API_REFERENCE.md) - Complete API documentation

---

*Part of [octocode-shared](../README.md) - Shared utilities for Octocode packages*
