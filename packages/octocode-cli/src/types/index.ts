/**
 * Shared Types
 */

// Re-export task types
export type {
  TaskStatus,
  BackgroundTask,
  TaskConfig,
  TaskEventType,
  TaskEvent,
  TaskEventListener,
  ITaskManager,
  AgentToolInput,
  TaskOutputToolInput,
  TaskListToolInput,
} from './tasks.js';

// Re-export provider types
export type {
  LLMProvider,
  ModelId,
  ModelDefinition,
  ModelCapabilities,
  ModelPricing,
  ProviderStatus,
  ResolvedModel,
  AIConfig,
} from './provider.js';

// Color names for terminal output
export type ColorName =
  | 'reset'
  | 'bright'
  | 'dim'
  | 'underscore'
  | 'red'
  | 'green'
  | 'yellow'
  | 'blue'
  | 'magenta'
  | 'cyan'
  | 'white'
  | 'bgRed'
  | 'bgGreen'
  | 'bgYellow'
  | 'bgBlue'
  | 'bgMagenta';

// MCP Server configuration
export interface MCPServer {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

// MCP Config file structure
export interface MCPConfig {
  mcpServers?: Record<string, MCPServer>;
}

// Supported MCP Clients
export type MCPClient =
  | 'cursor' // Cursor IDE
  | 'claude-desktop' // Claude Desktop app
  | 'claude-code' // Claude Code CLI
  | 'vscode-cline' // VS Code Cline extension
  | 'vscode-roo' // VS Code Roo-Cline extension
  | 'vscode-continue' // VS Code Continue extension
  | 'windsurf' // Windsurf IDE
  | 'trae' // Trae IDE
  | 'antigravity' // Antigravity IDE
  | 'zed' // Zed editor
  | 'opencode' // Opencode CLI
  | 'custom'; // Custom path

// Legacy alias for backward compatibility
export type IDE = 'cursor' | 'claude';

// MCP Client category for UI grouping
export type MCPClientCategory = 'ide' | 'desktop' | 'extension' | 'cli';

// MCP Client metadata
export interface MCPClientInfo {
  id: MCPClient;
  name: string;
  description: string;
  category: MCPClientCategory;
  url?: string;
  envVars?: string[]; // Environment variables to detect this client
}

// Installation methods
export type InstallMethod = 'direct' | 'npx';

// CLI parsed arguments
export interface ParsedArgs {
  command: string | null;
  args: string[];
  options: Record<string, string | boolean>;
}

// CLI command definition
export interface CLICommand {
  name: string;
  description: string;
  usage?: string;
  options?: CLIOption[];
  handler: (args: ParsedArgs) => Promise<void>;
}

// CLI option definition
export interface CLIOption {
  name: string;
  short?: string;
  description: string;
  hasValue?: boolean;
  default?: string | boolean;
}

// GitHub auth status (legacy - for gh CLI check)
export interface GitHubAuthStatus {
  installed: boolean;
  authenticated: boolean;
  username?: string;
  error?: string;
}

// OAuth token types
export interface OAuthToken {
  token: string;
  tokenType: 'oauth';
  scopes?: string[];
  // For GitHub Apps with expiring tokens
  refreshToken?: string;
  expiresAt?: string;
  refreshTokenExpiresAt?: string;
}

// Stored credentials for a host
export interface StoredCredentials {
  hostname: string;
  username: string;
  token: OAuthToken;
  gitProtocol: 'ssh' | 'https';
  createdAt: string;
  updatedAt: string;
}

// Token source for auth status display
export type TokenSource = 'octocode' | 'gh-cli' | 'none';

// Auth status from our OAuth implementation
export interface OctocodeAuthStatus {
  authenticated: boolean;
  hostname?: string;
  username?: string;
  tokenExpired?: boolean;
  tokenSource?: TokenSource;
  error?: string;
}

// Token result with source information
export interface TokenResult {
  token: string | null;
  source: TokenSource;
  username?: string;
}

// Result from storing credentials (keyring-first strategy)
export interface StoreResult {
  success: boolean;
  /** True if fallback to encrypted file was used (keyring unavailable/failed) */
  insecureStorageUsed: boolean;
}

// Result from deleting credentials
export interface DeleteResult {
  success: boolean;
  deletedFromKeyring: boolean;
  deletedFromFile: boolean;
}
