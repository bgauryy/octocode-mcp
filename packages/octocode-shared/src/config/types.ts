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
 * LSP language server configuration
 */
export interface LspLanguageConfig {
  /** Custom server path (null = use bundled/detected) */
  serverPath?: string | null;
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
  languages?: Record<string, LspLanguageConfig>;
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
  /** Research defaults */
  research?: ResearchConfigOptions;
}

/**
 * Required versions of config options (all fields populated)
 */
export interface RequiredGitHubConfig {
  apiUrl: string;
  defaultOrg: string | undefined;
}

export interface RequiredGitLabConfig {
  host: string;
  defaultGroup: string | undefined;
}

export interface RequiredLocalConfig {
  enabled: boolean;
  allowedPaths: string[];
  excludePaths: string[];
}

export interface RequiredToolsConfig {
  enabled: string[] | null;
  disabled: string[] | null;
}

export interface RequiredNetworkConfig {
  timeout: number;
  maxRetries: number;
}

export interface RequiredTelemetryConfig {
  enabled: boolean;
  logging: boolean;
}

export interface RequiredLspConfig {
  enabled: boolean;
  timeout: number;
  languages: Record<string, LspLanguageConfig>;
}

export interface RequiredResearchConfig {
  defaultProvider: 'github' | 'gitlab';
  maxQueriesPerBatch: number;
  maxResultsPerQuery: number;
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
  /** Research defaults */
  research: RequiredResearchConfig;
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
