/**
 * Global Configuration Types
 *
 * Type definitions for ~/.octocode/.octocoderc configuration file.
 * Provides global control over Octocode execution across all packages.
 */

/**
 * Schema version for forward compatibility
 */
export const CONFIG_SCHEMA_VERSION = 1;

/**
 * Config file name
 */
export const CONFIG_FILE_NAME = '.octocoderc';

// ============================================================================
// CONFIGURATION SECTION TYPES
// ============================================================================

/**
 * GitHub-specific configuration
 */
export interface GitHubConfigOptions {
  /** GitHub API URL (default: https://api.github.com) */
  apiUrl?: string;
}

/**
 * GitLab-specific configuration
 */
export interface GitLabConfigOptions {
  /** GitLab instance URL (default: https://gitlab.com) */
  host?: string;
}

/**
 * Local filesystem tools configuration
 */
export interface LocalConfigOptions {
  /** Enable local filesystem tools (default: true) */
  enabled?: boolean;
  /** Restrict to specific paths (empty = all allowed) */
  allowedPaths?: string[];
  /** Root directory for path validation (default: cwd()) */
  workspaceRoot?: string;
}

/**
 * Tool enable/disable configuration
 */
export interface ToolsConfigOptions {
  /** Whitelist of tools to enable (null = all) */
  enabled?: string[] | null;
  /** Additional tools to enable on top of defaults */
  enableAdditional?: string[] | null;
  /** Blacklist of tools to disable */
  disabled?: string[] | null;
  /** Disable MCP prompts/slash commands (default: false) */
  disablePrompts?: boolean;
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
  /** Enable debug logging (default: true) */
  logging?: boolean;
}

/**
 * LSP tools configuration
 */
export interface LspConfigOptions {
  /** Path to custom LSP servers config file (default: ~/.octocode/lsp-servers.json) */
  configPath?: string;
  /** Force octocode-mcp LSP tools even when native LSP is available (default: false) */
  forceMcpLsp?: boolean;
}

/**
 * Security configuration
 */
export interface SecurityConfigOptions {
  /** Redact filesystem paths in error messages (default: false) */
  redactErrorPaths?: boolean;
}

// ============================================================================
// MAIN CONFIGURATION TYPES
// ============================================================================

/**
 * Complete .octocoderc configuration schema (raw file structure)
 */
export interface OctocodeConfig {
  /** JSON Schema URL (optional) */
  $schema?: string;
  /** Config schema version */
  version?: number;
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
  /** Security settings */
  security?: SecurityConfigOptions;
}

/**
 * Required versions of config options (all fields populated)
 */
export interface RequiredGitHubConfig {
  apiUrl: string;
}

export interface RequiredGitLabConfig {
  host: string;
}

export interface RequiredLocalConfig {
  enabled: boolean;
  allowedPaths: string[];
  workspaceRoot: string | undefined;
}

export interface RequiredToolsConfig {
  enabled: string[] | null;
  enableAdditional: string[] | null;
  disabled: string[] | null;
  disablePrompts: boolean;
}

export interface RequiredNetworkConfig {
  timeout: number;
  maxRetries: number;
}

export interface RequiredTelemetryConfig {
  logging: boolean;
}

export interface RequiredLspConfig {
  configPath: string | undefined;
  forceMcpLsp: boolean;
}

export interface RequiredSecurityConfig {
  redactErrorPaths: boolean;
}

/**
 * Resolved configuration with all defaults applied
 */
export interface ResolvedConfig {
  /** Config schema version */
  version: number;
  /** GitHub configuration */
  github: RequiredGitHubConfig;
  /** GitLab configuration */
  gitlab: RequiredGitLabConfig;
  /** Local tools configuration */
  local: RequiredLocalConfig;
  /** Tool enable/disable */
  tools: RequiredToolsConfig;
  /** Network settings */
  network: RequiredNetworkConfig;
  /** Telemetry settings */
  telemetry: RequiredTelemetryConfig;
  /** LSP settings */
  lsp: RequiredLspConfig;
  /** Security settings */
  security: RequiredSecurityConfig;
  /** Source of this configuration */
  source: 'file' | 'defaults' | 'mixed';
  /** Path to config file (if loaded from file) */
  configPath?: string;
}

// ============================================================================
// VALIDATION TYPES
// ============================================================================

/**
 * Result of configuration validation
 */
export interface ValidationResult {
  /** Whether the config is valid */
  valid: boolean;
  /** List of validation errors */
  errors: string[];
  /** List of validation warnings */
  warnings: string[];
  /** Validated config (with invalid fields removed) */
  config?: OctocodeConfig;
}

/**
 * Result of loading config from file
 */
export interface LoadConfigResult {
  /** Whether loading succeeded */
  success: boolean;
  /** Loaded config (if success) */
  config?: OctocodeConfig;
  /** Error message (if failed) */
  error?: string;
  /** Path to config file */
  path: string;
}
