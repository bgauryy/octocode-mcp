/**
 * UI Constants - Display text for IDEs and install methods
 */

// Legacy IDE info (for backward compatibility)
export const IDE_INFO = {
  cursor: {
    name: 'Cursor',
    description: 'AI-first code editor',
    url: 'https://cursor.sh',
  },
  claude: {
    name: 'Claude Desktop',
    description: "Anthropic's Claude desktop app",
    url: 'https://claude.ai/download',
  },
} as const;

// Comprehensive client info (used by new API)
export const CLIENT_INFO = {
  cursor: {
    name: 'Cursor',
    description: 'AI-first code editor',
    url: 'https://cursor.sh',
  },
  'claude-desktop': {
    name: 'Claude Desktop',
    description: "Anthropic's Claude desktop app",
    url: 'https://claude.ai/download',
  },
  'claude-code': {
    name: 'Claude Code',
    description: 'Claude CLI for terminal',
    url: 'https://docs.anthropic.com/claude-code',
  },
  'vscode-cline': {
    name: 'Cline (VS Code)',
    description: 'AI coding assistant extension',
    url: 'https://marketplace.visualstudio.com/items?itemName=saoudrizwan.claude-dev',
  },
  'vscode-roo': {
    name: 'Roo-Cline (VS Code)',
    description: 'Roo AI coding extension',
    url: 'https://github.com/RooVetGit/Roo-Cline',
  },
  'vscode-continue': {
    name: 'Continue (VS Code)',
    description: 'Open-source AI assistant',
    url: 'https://continue.dev',
  },
  windsurf: {
    name: 'Windsurf',
    description: 'Codeium AI IDE',
    url: 'https://codeium.com/windsurf',
  },
  zed: {
    name: 'Zed',
    description: 'High-performance code editor',
    url: 'https://zed.dev',
  },
  custom: {
    name: 'Custom Path',
    description: 'Specify your own MCP config path',
    url: '',
  },
} as const;

export const INSTALL_METHOD_INFO = {
  direct: {
    name: 'Direct (curl)',
    description: 'Download and run directly from octocodeai.com',
    pros: ['Always latest version', 'No npm required'],
    cons: ['Requires curl (or PowerShell on Windows)', 'Slower startup'],
  },
  npx: {
    name: 'NPX',
    description: 'Run via npx from npm registry',
    pros: ['Standard npm workflow', 'Faster after first run (cached)'],
    cons: ['Requires Node.js/npm'],
  },
} as const;
