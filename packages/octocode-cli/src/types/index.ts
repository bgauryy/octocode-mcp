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

// GitHub auth status
export interface GitHubAuthStatus {
  installed: boolean;
  authenticated: boolean;
  username?: string;
  error?: string;
}
