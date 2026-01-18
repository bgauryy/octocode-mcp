# Global Configuration System - Design Document

> **Package**: `octocode-shared`  
> **Status**: DESIGN (Not Implemented)  
> **Version**: 1.0  
> **Date**: January 2026

---

## 1. Overview

### Problem Statement

Currently, Octocode execution is controlled exclusively through **environment variables**. This approach has limitations:

1. **No Persistence**: Users must set env vars in every shell session or configure shell profiles
2. **IDE Friction**: Cursor/VS Code users need to configure settings in multiple places
3. **No Global Defaults**: Each project requires separate configuration
4. **CI/CD Complexity**: Pipeline configurations become verbose with many env vars

### Solution

Introduce a **global configuration file** at `~/.octocode/.octocoderc` that provides:

- **Persistent Defaults**: Configuration survives across sessions
- **User-Level Control**: One place to configure Octocode behavior globally
- **Environment Override**: Env vars still take precedence (opt-in override)
- **Cross-Platform**: Works on Windows, macOS, and Linux

### Guiding Principles

1. **Env Vars Win**: Environment variables always override config file settings
2. **Fail-Safe Defaults**: Missing or malformed config falls back to hardcoded defaults
3. **No Secrets in Config**: Tokens stay in keychain/env vars, not in `.octocoderc`
4. **Backward Compatible**: Existing env var workflows continue to work unchanged

---

## 2. File Location & Format

### Location

```
~/.octocode/.octocoderc
```

| Platform | Full Path |
|----------|-----------|
| **macOS** | `/Users/<username>/.octocode/.octocoderc` |
| **Linux** | `/home/<username>/.octocode/.octocoderc` |
| **Windows** | `C:\Users\<username>\.octocode\.octocoderc` |

> **Note**: Uses existing `~/.octocode/` directory (same as credentials, session).

### File Format

**JSON5** (JSON with comments and trailing commas) for human-friendly editing:

```jsonc
// ~/.octocode/.octocoderc
{
  // Schema version for forward compatibility
  "$schema": "https://octocode.dev/schemas/octocoderc.json",
  "version": 1,

  // ========================================
  // GitHub Configuration
  // ========================================
  "github": {
    "apiUrl": "https://api.github.com",  // Custom GitHub Enterprise URL
    "defaultOrg": "wix-private"          // Default organization for searches
  },

  // ========================================
  // GitLab Configuration  
  // ========================================
  "gitlab": {
    "host": "https://gitlab.com",        // GitLab instance URL
    "defaultGroup": null                  // Default group for searches
  },

  // ========================================
  // Local Tools Configuration
  // ========================================
  "local": {
    "enabled": false,                     // Enable local filesystem tools
    "allowedPaths": [],                   // Restrict to specific paths (empty = all)
    "excludePaths": [                     // Always exclude these paths
      "node_modules",
      ".git",
      "dist",
      "coverage"
    ]
  },

  // ========================================
  // Tool Control
  // ========================================
  "tools": {
    "enabled": null,                      // Whitelist: ["githubSearchCode", ...]
    "disabled": null                      // Blacklist: ["packageSearch", ...]
  },

  // ========================================
  // Performance & Reliability
  // ========================================
  "network": {
    "timeout": 30000,                     // Request timeout in ms (min: 5000)
    "maxRetries": 3                       // Max retry attempts (0-10)
  },

  // ========================================
  // Telemetry & Logging
  // ========================================
  "telemetry": {
    "enabled": true,                      // Enable session telemetry
    "logging": true                       // Enable debug logging
  },

  // ========================================
  // LSP Configuration
  // ========================================
  "lsp": {
    "enabled": true,                      // Enable LSP tools
    "timeout": 10000,                     // LSP operation timeout
    "languages": {                        // Per-language server config
      "typescript": {
        "serverPath": null                // Custom server path (null = bundled)
      },
      "python": {
        "serverPath": "pylsp"             // Custom Python LSP
      }
    }
  },

  // ========================================
  // Research Defaults
  // ========================================
  "research": {
    "defaultProvider": "github",          // "github" | "gitlab"
    "maxQueriesPerBatch": 3,              // Max parallel queries
    "maxResultsPerQuery": 10              // Default limit for searches
  }
}
```

### Why JSON5 Over YAML?

| Factor | JSON5 | YAML |
|--------|-------|------|
| **Native Parsing** | ✅ Built-in (with json5 pkg) | ❌ Requires js-yaml |
| **Comments** | ✅ Yes | ✅ Yes |
| **Trailing Commas** | ✅ Yes | N/A |
| **Indentation Errors** | ✅ None | ⚠️ Significant whitespace |
| **IDE Support** | ✅ Excellent | ✅ Good |
| **JSON Schema** | ✅ Full support | ⚠️ Limited |

**Decision**: Use JSON5 with `.octocoderc` extension (no `.json` suffix for cleaner look).

---

## 3. Configuration Schema

### TypeScript Types

```typescript
// packages/octocode-shared/src/config/types.ts

/**
 * Schema version for forward compatibility
 */
export const CONFIG_SCHEMA_VERSION = 1;

/**
 * GitHub-specific configuration
 */
export interface GitHubConfigOptions {
  /** GitHub API URL (default: https://api.github.com) */
  apiUrl?: string;
  /** Default organization for searches */
  defaultOrg?: string;
}

/**
 * GitLab-specific configuration
 */
export interface GitLabConfigOptions {
  /** GitLab instance URL (default: https://gitlab.com) */
  host?: string;
  /** Default group for searches */
  defaultGroup?: string;
}

/**
 * Local filesystem tools configuration
 */
export interface LocalConfigOptions {
  /** Enable local filesystem tools (default: false) */
  enabled?: boolean;
  /** Restrict to specific paths (empty = all allowed) */
  allowedPaths?: string[];
  /** Always exclude these paths */
  excludePaths?: string[];
}

/**
 * Tool enable/disable configuration
 */
export interface ToolsConfigOptions {
  /** Whitelist of tools to enable (null = all) */
  enabled?: string[] | null;
  /** Blacklist of tools to disable */
  disabled?: string[] | null;
}

/**
 * Network/performance configuration
 */
export interface NetworkConfigOptions {
  /** Request timeout in milliseconds (min: 5000, default: 30000) */
  timeout?: number;
  /** Max retry attempts (0-10, default: 3) */
  maxRetries?: number;
}

/**
 * Telemetry and logging configuration
 */
export interface TelemetryConfigOptions {
  /** Enable session telemetry (default: true) */
  enabled?: boolean;
  /** Enable debug logging (default: true) */
  logging?: boolean;
}

/**
 * LSP tools configuration
 */
export interface LspConfigOptions {
  /** Enable LSP tools (default: true) */
  enabled?: boolean;
  /** LSP operation timeout in ms (default: 10000) */
  timeout?: number;
  /** Per-language server configuration */
  languages?: Record<string, {
    /** Custom server path (null = use bundled/detected) */
    serverPath?: string | null;
  }>;
}

/**
 * Research behavior defaults
 */
export interface ResearchConfigOptions {
  /** Default provider: "github" | "gitlab" */
  defaultProvider?: 'github' | 'gitlab';
  /** Max parallel queries per batch (default: 3) */
  maxQueriesPerBatch?: number;
  /** Default limit for search results (default: 10) */
  maxResultsPerQuery?: number;
}

/**
 * Complete .octocoderc configuration schema
 */
export interface OctocodeConfig {
  /** JSON Schema URL (optional) */
  $schema?: string;
  /** Config schema version */
  version: number;
  /** GitHub configuration */
  github?: GitHubConfigOptions;
  /** GitLab configuration */
  gitlab?: GitLabConfigOptions;
  /** Local tools configuration */
  local?: LocalConfigOptions;
  /** Tool enable/disable */
  tools?: ToolsConfigOptions;
  /** Network settings */
  network?: NetworkConfigOptions;
  /** Telemetry settings */
  telemetry?: TelemetryConfigOptions;
  /** LSP settings */
  lsp?: LspConfigOptions;
  /** Research defaults */
  research?: ResearchConfigOptions;
}

/**
 * Resolved configuration with all defaults applied
 */
export interface ResolvedConfig {
  version: number;
  github: Required<GitHubConfigOptions>;
  gitlab: Required<GitLabConfigOptions>;
  local: Required<LocalConfigOptions>;
  tools: Required<ToolsConfigOptions>;
  network: Required<NetworkConfigOptions>;
  telemetry: Required<TelemetryConfigOptions>;
  lsp: Required<LspConfigOptions>;
  research: Required<ResearchConfigOptions>;
  /** Source of this configuration */
  source: 'file' | 'defaults';
  /** Path to config file (if loaded from file) */
  configPath?: string;
}
```

### Default Values

```typescript
// packages/octocode-shared/src/config/defaults.ts

import type { ResolvedConfig } from './types.js';

/**
 * Default configuration values
 * Used when .octocoderc is missing or fields are undefined
 */
export const DEFAULT_CONFIG: Omit<ResolvedConfig, 'source' | 'configPath'> = {
  version: 1,
  github: {
    apiUrl: 'https://api.github.com',
    defaultOrg: undefined,
  },
  gitlab: {
    host: 'https://gitlab.com',
    defaultGroup: undefined,
  },
  local: {
    enabled: false,
    allowedPaths: [],
    excludePaths: ['node_modules', '.git', 'dist', 'coverage', '__pycache__'],
  },
  tools: {
    enabled: null,
    disabled: null,
  },
  network: {
    timeout: 30000,
    maxRetries: 3,
  },
  telemetry: {
    enabled: true,
    logging: true,
  },
  lsp: {
    enabled: true,
    timeout: 10000,
    languages: {},
  },
  research: {
    defaultProvider: 'github',
    maxQueriesPerBatch: 3,
    maxResultsPerQuery: 10,
  },
};
```

---

## 4. Resolution Priority

Configuration values are resolved in this order (highest to lowest):

```
┌─────────────────────────────────────────────────────────────┐
│                    RESOLUTION PRIORITY                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Environment Variables      (HIGHEST - always wins)       │
│     └── ENABLE_LOCAL=true overrides local.enabled            │
│                                                              │
│  2. ~/.octocode/.octocoderc    (User-level config)           │
│     └── Persisted global settings                            │
│                                                              │
│  3. Hardcoded Defaults         (LOWEST - fail-safe)          │
│     └── DEFAULT_CONFIG in code                               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Environment Variable Mapping

| Env Variable | Config Path | Type |
|--------------|-------------|------|
| `GITHUB_API_URL` | `github.apiUrl` | string |
| `GITLAB_HOST` | `gitlab.host` | string |
| `ENABLE_LOCAL` / `LOCAL` | `local.enabled` | boolean |
| `TOOLS_TO_RUN` | `tools.enabled` | string[] |
| `ENABLE_TOOLS` | `tools.enabled` | string[] |
| `DISABLE_TOOLS` | `tools.disabled` | string[] |
| `REQUEST_TIMEOUT` | `network.timeout` | number |
| `MAX_RETRIES` | `network.maxRetries` | number |
| `LOG` | `telemetry.logging` | boolean |
| `OCTOCODE_TELEMETRY_DISABLED` | `telemetry.enabled` | boolean (inverted) |

### Resolution Algorithm

```typescript
function resolveConfigValue<T>(
  envValue: T | undefined,
  fileValue: T | undefined,
  defaultValue: T
): T {
  // Env vars always win (if defined)
  if (envValue !== undefined) return envValue;
  // File config second
  if (fileValue !== undefined) return fileValue;
  // Defaults last
  return defaultValue;
}
```

---

## 5. Public API

### Module Structure

```
packages/octocode-shared/src/
├── config/
│   ├── index.ts          # Public exports
│   ├── types.ts          # Type definitions
│   ├── defaults.ts       # Default values
│   ├── loader.ts         # File loading & parsing
│   ├── resolver.ts       # Priority resolution
│   ├── validator.ts      # Schema validation
│   └── watcher.ts        # File change watching (optional)
└── index.ts              # Re-export config module
```

### Exports

```typescript
// packages/octocode-shared/src/config/index.ts

// Types
export type {
  OctocodeConfig,
  ResolvedConfig,
  GitHubConfigOptions,
  GitLabConfigOptions,
  LocalConfigOptions,
  ToolsConfigOptions,
  NetworkConfigOptions,
  TelemetryConfigOptions,
  LspConfigOptions,
  ResearchConfigOptions,
} from './types.js';

// Constants
export { DEFAULT_CONFIG, CONFIG_SCHEMA_VERSION } from './defaults.js';
export { CONFIG_FILE_NAME, CONFIG_FILE_PATH } from './loader.js';

// Functions
export { loadConfig, loadConfigSync } from './loader.js';
export { resolveConfig, resolveConfigSync } from './resolver.js';
export { validateConfig } from './validator.js';
export { watchConfig, unwatchConfig } from './watcher.js';

// Convenience
export { getConfig, getConfigSync, reloadConfig } from './resolver.js';
```

### Core Functions

#### `getConfig()` - Primary Entry Point

```typescript
/**
 * Get fully resolved configuration (async).
 * Loads from file, applies env overrides, returns with defaults.
 * 
 * Results are cached - call reloadConfig() to refresh.
 * 
 * @example
 * ```typescript
 * const config = await getConfig();
 * console.log(config.github.apiUrl); // 'https://api.github.com'
 * console.log(config.local.enabled); // false (or true if ENABLE_LOCAL=true)
 * ```
 */
export async function getConfig(): Promise<ResolvedConfig>;
```

#### `getConfigSync()` - Synchronous Access

```typescript
/**
 * Get fully resolved configuration (sync).
 * Uses cached config or loads synchronously.
 * 
 * @example
 * ```typescript
 * const config = getConfigSync();
 * if (config.local.enabled) {
 *   // Local tools are enabled
 * }
 * ```
 */
export function getConfigSync(): ResolvedConfig;
```

#### `reloadConfig()` - Force Refresh

```typescript
/**
 * Reload configuration from disk, bypassing cache.
 * Useful when config file has been modified.
 * 
 * @returns Fresh resolved configuration
 */
export async function reloadConfig(): Promise<ResolvedConfig>;
```

#### `loadConfig()` - Raw File Loading

```typescript
/**
 * Load raw .octocoderc file without env var resolution.
 * Returns null if file doesn't exist.
 * 
 * @returns Parsed config or null
 */
export async function loadConfig(): Promise<OctocodeConfig | null>;
```

#### `validateConfig()` - Schema Validation

```typescript
/**
 * Validate a config object against the schema.
 * 
 * @param config - Config object to validate
 * @returns Validation result with errors if invalid
 */
export function validateConfig(config: unknown): {
  valid: boolean;
  errors: string[];
  config?: OctocodeConfig;
};
```

---

## 6. Integration with Existing Code

### Integration Points

#### 1. `octocode-mcp/serverConfig.ts`

```typescript
// Before (current implementation)
function parseServerConfig(): ServerConfig {
  return {
    githubApiUrl: process.env.GITHUB_API_URL?.trim() || 'https://api.github.com',
    enableLocal: parseBooleanEnv(process.env.ENABLE_LOCAL, false),
    // ... more env parsing
  };
}

// After (with config integration)
import { getConfigSync } from 'octocode-shared';

function parseServerConfig(): ServerConfig {
  const config = getConfigSync(); // Loads ~/.octocode/.octocoderc
  
  return {
    // Config file provides defaults, env vars override
    githubApiUrl: process.env.GITHUB_API_URL?.trim() || config.github.apiUrl,
    enableLocal: parseBooleanEnv(process.env.ENABLE_LOCAL, undefined) 
                 ?? config.local.enabled,
    timeout: parseInt(process.env.REQUEST_TIMEOUT || '') 
             || config.network.timeout,
    // ... etc
  };
}
```

#### 2. `octocode-cli`

```typescript
// CLI commands can read/write config
import { getConfig, loadConfig, CONFIG_FILE_PATH } from 'octocode-shared';

// Read current config
const config = await getConfig();

// Display config location
console.log(`Config: ${CONFIG_FILE_PATH}`);
```

#### 3. `octocode-vscode`

```typescript
// Extension can sync VS Code settings to .octocoderc
import { loadConfig, validateConfig } from 'octocode-shared';

async function syncToOctocodeConfig() {
  const vsSettings = vscode.workspace.getConfiguration('octocode');
  // Write to .octocoderc for cross-tool consistency
}
```

### Migration Path

1. **Phase 1** (Non-Breaking): Add config module to `octocode-shared`
   - Exports `getConfig()`, `getConfigSync()`
   - Returns defaults if no `.octocoderc` exists
   - No behavior change for existing users

2. **Phase 2** (Opt-In): Update `octocode-mcp` to use config
   - Use config values as defaults
   - Env vars still override everything
   - Add deprecation warnings for some env vars

3. **Phase 3** (CLI Support): Add `octocode config` commands
   - `octocode config init` - Create `.octocoderc` with defaults
   - `octocode config get <key>` - Read config value
   - `octocode config set <key> <value>` - Update config
   - `octocode config edit` - Open in editor

---

## 7. Error Handling

### File Not Found

```typescript
// If ~/.octocode/.octocoderc doesn't exist, return defaults silently
const config = await getConfig();
// config.source === 'defaults'
```

### Parse Errors

```typescript
// If file is malformed JSON5, log warning and return defaults
const config = await getConfig();
// config.source === 'defaults'
// Warning logged: "Failed to parse .octocoderc: Unexpected token at line 5"
```

### Schema Validation Errors

```typescript
// If file has invalid values, log warnings per field
const config = await getConfig();
// Warnings logged for each invalid field
// Invalid fields use defaults, valid fields are preserved
```

### Error Recovery Strategy

```
┌─────────────────────────────────────────────────────────────┐
│                    ERROR RECOVERY                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  File Missing     → Use DEFAULT_CONFIG (no warning)          │
│  File Unreadable  → Use DEFAULT_CONFIG + log warning         │
│  Parse Error      → Use DEFAULT_CONFIG + log error           │
│  Invalid Field    → Use default for field + log warning      │
│  Invalid Version  → Try migration or use defaults            │
│                                                              │
│  PRINCIPLE: Never fail, always provide usable config         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 8. Caching Strategy

### In-Memory Cache

```typescript
// Config is cached on first load
let cachedConfig: ResolvedConfig | null = null;
let cacheTimestamp: number = 0;

const CACHE_TTL_MS = 60000; // 1 minute

export function getConfigSync(): ResolvedConfig {
  const now = Date.now();
  if (cachedConfig && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return cachedConfig;
  }
  cachedConfig = loadAndResolveSync();
  cacheTimestamp = now;
  return cachedConfig;
}
```

### Cache Invalidation

```typescript
// Manual invalidation
export function invalidateConfigCache(): void {
  cachedConfig = null;
  cacheTimestamp = 0;
}

// Auto-invalidation on file change (optional)
export function watchConfig(callback?: (config: ResolvedConfig) => void): void {
  // Watch ~/.octocode/.octocoderc for changes
  // On change: invalidateConfigCache() + callback()
}
```

---

## 9. Security Considerations

### No Secrets in Config File

```
┌─────────────────────────────────────────────────────────────┐
│                    SECURITY MODEL                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  .octocoderc: BEHAVIOR configuration only                   │
│    ✅ API URLs, timeouts, tool settings                     │
│    ❌ NO tokens, passwords, API keys                        │
│                                                              │
│  credentials.json: SECRETS only (encrypted)                 │
│    ✅ OAuth tokens, refresh tokens                          │
│    ✅ AES-256-GCM encrypted                                 │
│                                                              │
│  Environment Variables: OVERRIDE mechanism                  │
│    ✅ GITHUB_TOKEN, GH_TOKEN (for CI/CD)                    │
│    ✅ Takes precedence over all config                      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### File Permissions

```typescript
// Ensure config file has secure permissions
function ensureSecurePermissions(filePath: string): void {
  if (process.platform !== 'win32') {
    // Unix: readable/writable by owner only
    chmodSync(filePath, 0o600);
  }
  // Windows: ACLs handled by user profile
}
```

### Validation Against Injection

```typescript
// Validate URLs to prevent SSRF
function validateUrl(url: string, field: string): string | null {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return `${field}: Only http/https URLs allowed`;
    }
    return null;
  } catch {
    return `${field}: Invalid URL format`;
  }
}
```

---

## 10. Testing Strategy

### Unit Tests

```typescript
describe('config/loader', () => {
  it('returns null when file does not exist', async () => {
    const config = await loadConfig();
    expect(config).toBeNull();
  });

  it('parses valid JSON5 config', async () => {
    mockFs({ '~/.octocode/.octocoderc': '{ "version": 1 }' });
    const config = await loadConfig();
    expect(config?.version).toBe(1);
  });

  it('handles comments in JSON5', async () => {
    mockFs({ '~/.octocode/.octocoderc': '{ /* comment */ "version": 1 }' });
    const config = await loadConfig();
    expect(config?.version).toBe(1);
  });
});

describe('config/resolver', () => {
  it('env vars override file config', async () => {
    process.env.ENABLE_LOCAL = 'true';
    mockFs({ '~/.octocode/.octocoderc': '{ "local": { "enabled": false } }' });
    
    const config = await getConfig();
    expect(config.local.enabled).toBe(true);
    
    delete process.env.ENABLE_LOCAL;
  });

  it('file config overrides defaults', async () => {
    mockFs({ '~/.octocode/.octocoderc': '{ "network": { "timeout": 60000 } }' });
    
    const config = await getConfig();
    expect(config.network.timeout).toBe(60000);
  });
});

describe('config/validator', () => {
  it('rejects invalid timeout values', () => {
    const result = validateConfig({ version: 1, network: { timeout: -1 } });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('network.timeout: Must be >= 5000');
  });
});
```

### Integration Tests

```typescript
describe('serverConfig integration', () => {
  it('uses config file values when env vars not set', async () => {
    // Create .octocoderc with custom values
    await writeConfig({ github: { apiUrl: 'https://github.example.com/api/v3' } });
    
    // Initialize server config
    await initialize();
    const config = getServerConfig();
    
    expect(config.githubApiUrl).toBe('https://github.example.com/api/v3');
  });
});
```

---

## 11. CLI Commands (Future)

```bash
# Initialize config with interactive prompts
$ octocode config init
✓ Created ~/.octocode/.octocoderc

# Show current resolved config
$ octocode config show
{
  "version": 1,
  "github": {
    "apiUrl": "https://api.github.com",
    "defaultOrg": "wix-private"  // from file
  },
  "local": {
    "enabled": true  // from ENABLE_LOCAL env var
  },
  ...
}

# Get specific value
$ octocode config get github.apiUrl
https://api.github.com

# Set value
$ octocode config set local.enabled true
✓ Updated local.enabled = true

# Edit in default editor
$ octocode config edit
# Opens ~/.octocode/.octocoderc in $EDITOR

# Show config file path
$ octocode config path
/Users/username/.octocode/.octocoderc

# Validate config file
$ octocode config validate
✓ Configuration is valid
```

---

## 12. Dependencies

### Required

| Package | Version | Purpose |
|---------|---------|---------|
| `json5` | `^2.2.3` | Parse JSON5 with comments |

### No Additional Dependencies Needed

- File system: Node.js `fs` module
- Path handling: Node.js `path` module  
- Home directory: Already in `platform.ts` (`HOME`)

---

## 13. Open Questions

1. **Config file name**: `.octocoderc` vs `config.json` vs `settings.json`?
   - **Recommendation**: `.octocoderc` (follows `.npmrc`, `.eslintrc` convention)

2. **JSON5 vs plain JSON**?
   - **Recommendation**: JSON5 (comments are valuable for self-documenting config)

3. **File watching**: Should we auto-reload on file changes?
   - **Recommendation**: Opt-in via `watchConfig()`, not by default

4. **Project-level config**: Support `.octocoderc` in project root?
   - **Future**: Could add `project > user > defaults` hierarchy

5. **Config migration**: How to handle version upgrades?
   - **Recommendation**: Bump version number, add migration functions

---

## 14. Implementation Checklist

- [ ] Create `packages/octocode-shared/src/config/` directory
- [ ] Implement `types.ts` with all interfaces
- [ ] Implement `defaults.ts` with DEFAULT_CONFIG
- [ ] Implement `loader.ts` with JSON5 parsing
- [ ] Implement `validator.ts` with schema validation
- [ ] Implement `resolver.ts` with priority resolution
- [ ] Implement `watcher.ts` (optional)
- [ ] Update `packages/octocode-shared/src/index.ts` to export config
- [ ] Update `packages/octocode-shared/package.json` exports
- [ ] Add `json5` dependency
- [ ] Write unit tests (90% coverage)
- [ ] Update `octocode-mcp/serverConfig.ts` to use config
- [ ] Update documentation (API_REFERENCE.md)
- [ ] Add CLI commands to `octocode-cli`

---

## 15. Related Documents

- [`API_REFERENCE.md`](./API_REFERENCE.md) - Current API documentation
- [`CREDENTIALS_ARCHITECTURE.md`](./CREDENTIALS_ARCHITECTURE.md) - Token storage (separate from config)
- [`SESSION_PERSISTENCE.md`](./SESSION_PERSISTENCE.md) - Session storage patterns
- [`../../octocode-mcp/docs/TOKEN_RESOLUTION.md`](../../octocode-mcp/docs/TOKEN_RESOLUTION.md) - Token resolution flow

---

*Design Document v1.0 - January 2026*  
*Package: `octocode-shared` | Module: `config`*
