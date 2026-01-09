/**
 * Shared Types
 */

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

// MCP Server configuration (supports both stdio and SSE transports)
export interface MCPServer {
  // Stdio transport
  command?: string;
  args?: string[];
  // SSE transport
  url?: string;
  // Shared
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

// GitHub auth status (legacy - for gh CLI check)
export interface GitHubAuthStatus {
  installed: boolean;
  authenticated: boolean;
  username?: string;
  error?: string;
}

// Re-export credential types from shared package
export type { OAuthToken, StoredCredentials } from 'octocode-shared';

// Token source for auth status display
export type TokenSource = 'octocode' | 'gh-cli' | 'env' | 'none';

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
  /** Specific env var name when source is 'env' (e.g., 'env:OCTOCODE_TOKEN') */
  envSource?: string;
}
