import { Implementation } from '@modelcontextprotocol/sdk/types.js';

// Server configuration
export const SERVER_CONFIG: Implementation = {
  name: 'octocode-mcp',
  version: '1.0.0',
  description: `Comprehensive code analysis assistant: Deep exploration and understanding of complex implementations in GitHub repositories and npm packages.
       Specialized in architectural analysis, algorithm explanations, and complete technical documentation.`,
};

// Operational settings
export const OPERATIONAL_CONFIG = {
  SHUTDOWN_TIMEOUT: 5000, // 5 seconds timeout for graceful shutdown
  TOOL_REGISTRATION_TIMEOUT: 3000, // 3 seconds timeout for tool registration
  LOG_LEVEL: (process.env.LOG_LEVEL || 'info') as 'info' | 'warn' | 'error',
  ENABLE_DETAILED_LOGGING: process.env.NODE_ENV === 'development',
} as const;

// MCP Server capabilities
export const SERVER_CAPABILITIES = {
  tools: {},
  resources: {},
  prompts: {},
} as const;
