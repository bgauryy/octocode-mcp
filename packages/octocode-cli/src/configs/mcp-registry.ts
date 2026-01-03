/**
 * MCP Registry - Top 100 MCP Servers
 * Curated list of popular MCP servers for installation
 * Sources: awesome-mcp-servers, modelcontextprotocol/registry, GitHub stars
 */

/**
 * MCP Server category for grouping in UI
 */
export type MCPCategory =
  | 'browser-automation'
  | 'database'
  | 'cloud-platform'
  | 'developer-tools'
  | 'file-system'
  | 'communication'
  | 'search-web'
  | 'ai-services'
  | 'workflow-automation'
  | 'version-control'
  | 'data-visualization'
  | 'coding-agents'
  | 'security'
  | 'productivity'
  | 'monitoring'
  | 'finance'
  | 'social-media'
  | 'aggregator'
  | 'other';

/**
 * Installation type for MCP server
 */
export type InstallationType =
  | 'npm'
  | 'npx'
  | 'pip'
  | 'docker'
  | 'binary'
  | 'source';

/**
 * MCP Server registry entry
 */
export interface MCPRegistryEntry {
  /** Unique identifier (npm package name or GitHub repo slug) */
  id: string;
  /** Display name */
  name: string;
  /** Short description */
  description: string;
  /** Category for grouping */
  category: MCPCategory;
  /** GitHub repository URL */
  repository: string;
  /** Website or documentation URL */
  website?: string;
  /** GitHub stars count (approximate, for sorting) */
  stars?: number;
  /** Installation type */
  installationType: InstallationType;
  /** NPM package name (if npm/npx installation) */
  npmPackage?: string;
  /** PyPI package name (if pip installation) */
  pipPackage?: string;
  /** Docker image (if docker installation) */
  dockerImage?: string;
  /** Installation configuration for MCP clients */
  installConfig: {
    command: string;
    args: string[];
    env?: Record<string, string>;
  };
  /** Required environment variables that user must provide */
  requiredEnvVars?: Array<{
    name: string;
    description: string;
    example?: string;
  }>;
  /** Is this an official implementation (from vendor/org) */
  official?: boolean;
  /** Tags for search/filter */
  tags?: string[];
}

/**
 * Top 100 MCP Servers Registry
 * Sorted by popularity (stars) and utility
 */
export const MCP_REGISTRY: MCPRegistryEntry[] = [
  // === BROWSER AUTOMATION ===
  {
    id: 'playwright-mcp',
    name: 'Playwright MCP',
    description:
      'Official Microsoft Playwright MCP server for browser automation via accessibility snapshots',
    category: 'browser-automation',
    repository: 'https://github.com/microsoft/playwright-mcp',
    website: 'https://playwright.dev',
    installationType: 'npx',
    npmPackage: '@playwright/mcp',
    official: true,
    installConfig: {
      command: 'npx',
      args: ['-y', '@playwright/mcp@latest'],
    },
    tags: ['browser', 'automation', 'testing', 'microsoft', 'official'],
  },
  {
    id: 'firecrawl-mcp-server',
    name: 'Firecrawl MCP',
    description:
      'Powerful web scraping and search for Claude, Cursor and LLM clients',
    category: 'browser-automation',
    repository: 'https://github.com/firecrawl/firecrawl-mcp-server',
    website: 'https://firecrawl.dev',
    installationType: 'npx',
    npmPackage: 'firecrawl-mcp',
    official: true,
    installConfig: {
      command: 'npx',
      args: ['-y', 'firecrawl-mcp'],
    },
    requiredEnvVars: [
      {
        name: 'FIRECRAWL_API_KEY',
        description: 'Firecrawl API key',
        example: 'fc-xxxxx',
      },
    ],
    tags: ['scraping', 'web', 'search', 'official'],
  },
  {
    id: 'browserbase-mcp',
    name: 'Browserbase MCP',
    description:
      'Cloud browser automation for web navigation, data extraction, form filling',
    category: 'browser-automation',
    repository: 'https://github.com/browserbase/mcp-server-browserbase',
    website: 'https://browserbase.com',
    installationType: 'npx',
    npmPackage: '@browserbasehq/mcp-server-browserbase',
    official: true,
    installConfig: {
      command: 'npx',
      args: ['-y', '@browserbasehq/mcp-server-browserbase'],
    },
    requiredEnvVars: [
      { name: 'BROWSERBASE_API_KEY', description: 'Browserbase API key' },
      { name: 'BROWSERBASE_PROJECT_ID', description: 'Browserbase project ID' },
    ],
    tags: ['browser', 'cloud', 'automation', 'official'],
  },
  {
    id: 'chrome-devtools-mcp',
    name: 'Chrome DevTools MCP',
    description:
      'Chrome DevTools for coding agents - debugging and browser control',
    category: 'browser-automation',
    repository: 'https://github.com/ChromeDevTools/chrome-devtools-mcp',
    installationType: 'npx',
    npmPackage: 'chrome-devtools-mcp',
    official: true,
    installConfig: {
      command: 'npx',
      args: ['-y', 'chrome-devtools-mcp'],
    },
    tags: ['chrome', 'devtools', 'debugging', 'official'],
  },

  // === VERSION CONTROL ===
  {
    id: 'github-mcp-server',
    name: 'GitHub MCP',
    description:
      "GitHub's official MCP Server for repository management, PRs, issues, and more",
    category: 'version-control',
    repository: 'https://github.com/github/github-mcp-server',
    website: 'https://github.com',
    installationType: 'docker',
    dockerImage: 'ghcr.io/github/github-mcp-server',
    official: true,
    installConfig: {
      command: 'docker',
      args: [
        'run',
        '-i',
        '--rm',
        '-e',
        'GITHUB_PERSONAL_ACCESS_TOKEN',
        'ghcr.io/github/github-mcp-server',
      ],
    },
    requiredEnvVars: [
      {
        name: 'GITHUB_PERSONAL_ACCESS_TOKEN',
        description: 'GitHub Personal Access Token',
      },
    ],
    tags: ['github', 'git', 'repository', 'official'],
  },

  // === DATABASES ===
  {
    id: 'sqlite-mcp',
    name: 'SQLite MCP',
    description: 'SQLite database operations with built-in analysis features',
    category: 'database',
    repository:
      'https://github.com/modelcontextprotocol/servers-archived/tree/main/src/sqlite',
    installationType: 'pip',
    pipPackage: 'mcp-server-sqlite',
    official: true,
    installConfig: {
      command: 'uvx',
      args: ['mcp-server-sqlite', '--db-path', '${DATABASE_PATH}'],
    },
    requiredEnvVars: [
      {
        name: 'DATABASE_PATH',
        description: 'Path to SQLite database file',
        example: '/path/to/database.db',
      },
    ],
    tags: ['database', 'sqlite', 'sql', 'official'],
  },
  {
    id: 'mysql-mcp',
    name: 'MySQL MCP',
    description:
      'MySQL database integration with configurable access controls and schema inspection',
    category: 'database',
    repository: 'https://github.com/designcomputer/mysql_mcp_server',
    installationType: 'pip',
    pipPackage: 'mysql-mcp-server',
    installConfig: {
      command: 'uvx',
      args: ['mysql-mcp-server'],
    },
    requiredEnvVars: [
      { name: 'MYSQL_HOST', description: 'MySQL host' },
      { name: 'MYSQL_USER', description: 'MySQL username' },
      { name: 'MYSQL_PASSWORD', description: 'MySQL password' },
      { name: 'MYSQL_DATABASE', description: 'MySQL database name' },
    ],
    tags: ['database', 'mysql', 'sql'],
  },
  {
    id: 'mongodb-mcp',
    name: 'MongoDB MCP',
    description: 'MongoDB integration for querying and analyzing collections',
    category: 'database',
    repository: 'https://github.com/kiliczsh/mcp-mongo-server',
    installationType: 'npx',
    npmPackage: 'mcp-mongo-server',
    installConfig: {
      command: 'npx',
      args: ['-y', 'mcp-mongo-server'],
    },
    requiredEnvVars: [
      {
        name: 'MONGODB_URI',
        description: 'MongoDB connection URI',
        example: 'mongodb://localhost:27017/mydb',
      },
    ],
    tags: ['database', 'mongodb', 'nosql'],
  },
  {
    id: 'redis-mcp',
    name: 'Redis MCP',
    description:
      'Natural language interface for managing and searching data in Redis',
    category: 'database',
    repository: 'https://github.com/redis/mcp-redis',
    website: 'https://redis.io',
    installationType: 'pip',
    pipPackage: 'redis-mcp-server',
    official: true,
    installConfig: {
      command: 'uvx',
      args: ['redis-mcp-server'],
    },
    requiredEnvVars: [
      {
        name: 'REDIS_URL',
        description: 'Redis connection URL',
        example: 'redis://localhost:6379',
      },
    ],
    tags: ['database', 'redis', 'cache', 'official'],
  },
  {
    id: 'neon-mcp',
    name: 'Neon MCP',
    description:
      'Neon Serverless Postgres - create and manage databases with natural language',
    category: 'database',
    repository: 'https://github.com/neondatabase/mcp-server-neon',
    website: 'https://neon.tech',
    installationType: 'npx',
    npmPackage: '@neondatabase/mcp-server-neon',
    official: true,
    installConfig: {
      command: 'npx',
      args: ['-y', '@neondatabase/mcp-server-neon'],
    },
    requiredEnvVars: [{ name: 'NEON_API_KEY', description: 'Neon API key' }],
    tags: ['database', 'postgres', 'serverless', 'official'],
  },
  {
    id: 'qdrant-mcp',
    name: 'Qdrant MCP',
    description: 'Vector search engine for keeping and retrieving memories',
    category: 'database',
    repository: 'https://github.com/qdrant/mcp-server-qdrant',
    website: 'https://qdrant.tech',
    installationType: 'pip',
    pipPackage: 'mcp-server-qdrant',
    official: true,
    installConfig: {
      command: 'uvx',
      args: ['mcp-server-qdrant'],
    },
    requiredEnvVars: [
      { name: 'QDRANT_URL', description: 'Qdrant server URL' },
      { name: 'QDRANT_API_KEY', description: 'Qdrant API key (optional)' },
    ],
    tags: ['database', 'vector', 'search', 'official'],
  },
  {
    id: 'snowflake-mcp',
    name: 'Snowflake MCP',
    description:
      'Snowflake data warehouse integration with read/write capabilities',
    category: 'database',
    repository: 'https://github.com/isaacwasserman/mcp-snowflake-server',
    website: 'https://snowflake.com',
    installationType: 'pip',
    pipPackage: 'mcp-snowflake-server',
    installConfig: {
      command: 'uvx',
      args: ['mcp-snowflake-server'],
    },
    requiredEnvVars: [
      {
        name: 'SNOWFLAKE_ACCOUNT',
        description: 'Snowflake account identifier',
      },
      { name: 'SNOWFLAKE_USER', description: 'Snowflake username' },
      { name: 'SNOWFLAKE_PASSWORD', description: 'Snowflake password' },
    ],
    tags: ['database', 'snowflake', 'data-warehouse'],
  },
  {
    id: 'bigquery-mcp',
    name: 'BigQuery MCP',
    description:
      'Google BigQuery integration for schema inspection and queries',
    category: 'database',
    repository: 'https://github.com/LucasHild/mcp-server-bigquery',
    website: 'https://cloud.google.com/bigquery',
    installationType: 'pip',
    pipPackage: 'mcp-server-bigquery',
    installConfig: {
      command: 'uvx',
      args: ['mcp-server-bigquery'],
    },
    requiredEnvVars: [
      {
        name: 'GOOGLE_APPLICATION_CREDENTIALS',
        description: 'Path to GCP service account JSON',
      },
    ],
    tags: ['database', 'bigquery', 'google', 'analytics'],
  },

  // === CLOUD PLATFORMS ===
  {
    id: 'cloudflare-mcp',
    name: 'Cloudflare MCP',
    description: 'Integration with Cloudflare Workers, KV, R2, and D1',
    category: 'cloud-platform',
    repository: 'https://github.com/cloudflare/mcp-server-cloudflare',
    website: 'https://cloudflare.com',
    installationType: 'npx',
    npmPackage: '@cloudflare/mcp-server-cloudflare',
    official: true,
    installConfig: {
      command: 'npx',
      args: ['-y', '@cloudflare/mcp-server-cloudflare'],
    },
    requiredEnvVars: [
      { name: 'CLOUDFLARE_API_TOKEN', description: 'Cloudflare API Token' },
      { name: 'CLOUDFLARE_ACCOUNT_ID', description: 'Cloudflare Account ID' },
    ],
    tags: ['cloudflare', 'cloud', 'workers', 'official'],
  },
  {
    id: 'kubernetes-mcp',
    name: 'Kubernetes MCP',
    description: 'Kubernetes cluster operations through MCP',
    category: 'cloud-platform',
    repository: 'https://github.com/strowk/mcp-k8s-go',
    installationType: 'binary',
    installConfig: {
      command: 'mcp-k8s',
      args: [],
    },
    tags: ['kubernetes', 'k8s', 'containers', 'devops'],
  },
  {
    id: 'docker-mcp',
    name: 'Docker MCP',
    description: 'Docker operations for container and compose stack management',
    category: 'cloud-platform',
    repository: 'https://github.com/sondt2709/docker-mcp',
    installationType: 'npx',
    npmPackage: 'docker-mcp',
    installConfig: {
      command: 'npx',
      args: ['-y', 'docker-mcp'],
    },
    tags: ['docker', 'containers', 'devops'],
  },

  // === FILE SYSTEMS ===
  {
    id: 'filesystem-mcp',
    name: 'Filesystem MCP',
    description:
      'Direct local file system access with configurable permissions',
    category: 'file-system',
    repository:
      'https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem',
    installationType: 'npx',
    npmPackage: '@modelcontextprotocol/server-filesystem',
    official: true,
    installConfig: {
      command: 'npx',
      args: [
        '-y',
        '@modelcontextprotocol/server-filesystem',
        '${ALLOWED_DIRECTORIES}',
      ],
    },
    requiredEnvVars: [
      {
        name: 'ALLOWED_DIRECTORIES',
        description: 'Comma-separated list of allowed directories',
        example: '/home/user/projects,/tmp',
      },
    ],
    tags: ['filesystem', 'files', 'local', 'official'],
  },
  // === SEARCH & WEB ===
  {
    id: 'exa-mcp',
    name: 'Exa Search MCP',
    description: 'Exa AI Search API for real-time web information retrieval',
    category: 'search-web',
    repository: 'https://github.com/exa-labs/exa-mcp-server',
    website: 'https://exa.ai',
    installationType: 'npx',
    npmPackage: 'exa-mcp-server',
    official: true,
    installConfig: {
      command: 'npx',
      args: ['-y', 'exa-mcp-server'],
    },
    requiredEnvVars: [{ name: 'EXA_API_KEY', description: 'Exa API key' }],
    tags: ['search', 'exa', 'ai', 'official'],
  },
  {
    id: 'tavily-mcp',
    name: 'Tavily MCP',
    description: 'Tavily AI search API for intelligent web search',
    category: 'search-web',
    repository: 'https://github.com/tavily-ai/tavily-mcp',
    website: 'https://tavily.com',
    installationType: 'npx',
    npmPackage: 'tavily-mcp',
    official: true,
    installConfig: {
      command: 'npx',
      args: ['-y', 'tavily-mcp'],
    },
    requiredEnvVars: [
      { name: 'TAVILY_API_KEY', description: 'Tavily API key' },
    ],
    tags: ['search', 'tavily', 'ai', 'official'],
  },

  // === COMMUNICATION ===
  {
    id: 'slack-mcp',
    name: 'Slack MCP',
    description:
      'Most powerful MCP server for Slack with Stdio and SSE transports',
    category: 'communication',
    repository: 'https://github.com/korotovsky/slack-mcp-server',
    website: 'https://slack.com',
    installationType: 'npx',
    npmPackage: 'slack-mcp-server',
    installConfig: {
      command: 'npx',
      args: ['-y', 'slack-mcp-server'],
    },
    requiredEnvVars: [
      { name: 'SLACK_BOT_TOKEN', description: 'Slack Bot OAuth Token' },
    ],
    tags: ['slack', 'chat', 'team'],
  },
  {
    id: 'discord-mcp',
    name: 'Discord MCP',
    description: 'Discord integration for AI assistants',
    category: 'communication',
    repository: 'https://github.com/olivierdebeufderijcker/discord-mcp',
    website: 'https://discord.com',
    installationType: 'npx',
    npmPackage: 'discord-mcp',
    installConfig: {
      command: 'npx',
      args: ['-y', 'discord-mcp'],
    },
    requiredEnvVars: [
      { name: 'DISCORD_TOKEN', description: 'Discord Bot Token' },
    ],
    tags: ['discord', 'chat', 'community'],
  },
  {
    id: 'gmail-mcp',
    name: 'Gmail MCP',
    description: 'Gmail integration via Inbox Zero for email management',
    category: 'communication',
    repository: 'https://github.com/elie222/inbox-zero',
    website: 'https://getinboxzero.com',
    installationType: 'pip',
    pipPackage: 'inbox-zero-mcp',
    installConfig: {
      command: 'uvx',
      args: ['inbox-zero-mcp'],
    },
    requiredEnvVars: [
      {
        name: 'GOOGLE_APPLICATION_CREDENTIALS',
        description: 'Path to Google credentials',
      },
    ],
    tags: ['email', 'gmail', 'google'],
  },
  {
    id: 'linear-mcp',
    name: 'Linear MCP',
    description: 'Linear issue tracking integration',
    category: 'communication',
    repository: 'https://github.com/jerhadf/linear-mcp-server',
    website: 'https://linear.app',
    installationType: 'npx',
    npmPackage: 'linear-mcp-server',
    installConfig: {
      command: 'npx',
      args: ['-y', 'linear-mcp-server'],
    },
    requiredEnvVars: [
      { name: 'LINEAR_API_KEY', description: 'Linear API key' },
    ],
    tags: ['linear', 'issues', 'project-management'],
  },
  {
    id: 'atlassian-mcp',
    name: 'Atlassian MCP',
    description:
      'Confluence and Jira integration for documentation and issue tracking',
    category: 'communication',
    repository: 'https://github.com/sooperset/mcp-atlassian',
    website: 'https://atlassian.com',
    installationType: 'pip',
    pipPackage: 'mcp-atlassian',
    installConfig: {
      command: 'uvx',
      args: ['mcp-atlassian'],
    },
    requiredEnvVars: [
      { name: 'ATLASSIAN_URL', description: 'Atlassian instance URL' },
      { name: 'ATLASSIAN_EMAIL', description: 'Atlassian email' },
      { name: 'ATLASSIAN_API_TOKEN', description: 'Atlassian API token' },
    ],
    tags: ['atlassian', 'jira', 'confluence'],
  },

  // === PRODUCTIVITY ===
  {
    id: 'notion-mcp',
    name: 'Notion MCP',
    description:
      'Notion API integration for managing personal todo lists and notes',
    category: 'productivity',
    repository: 'https://github.com/danhilse/notion_mcp',
    website: 'https://notion.so',
    installationType: 'pip',
    pipPackage: 'notion-mcp',
    installConfig: {
      command: 'uvx',
      args: ['notion-mcp'],
    },
    requiredEnvVars: [
      { name: 'NOTION_API_KEY', description: 'Notion Integration Token' },
    ],
    tags: ['notion', 'notes', 'productivity'],
  },
  {
    id: 'obsidian-mcp',
    name: 'Obsidian MCP',
    description:
      'Obsidian vault integration for file management, search, and manipulation',
    category: 'productivity',
    repository: 'https://github.com/MarkusPfundstein/mcp-obsidian',
    website: 'https://obsidian.md',
    installationType: 'npx',
    npmPackage: 'mcp-obsidian',
    installConfig: {
      command: 'npx',
      args: ['-y', 'mcp-obsidian'],
    },
    requiredEnvVars: [
      { name: 'OBSIDIAN_VAULT_PATH', description: 'Path to Obsidian vault' },
    ],
    tags: ['obsidian', 'notes', 'markdown'],
  },
  {
    id: 'todoist-mcp',
    name: 'Todoist MCP',
    description: 'Natural language task management with Todoist',
    category: 'productivity',
    repository: 'https://github.com/stevengonsalvez/todoist-mcp',
    website: 'https://todoist.com',
    installationType: 'npx',
    npmPackage: 'todoist-mcp-server',
    installConfig: {
      command: 'npx',
      args: ['-y', 'todoist-mcp-server'],
    },
    requiredEnvVars: [
      { name: 'TODOIST_API_TOKEN', description: 'Todoist API token' },
    ],
    tags: ['todoist', 'tasks', 'productivity'],
  },
  {
    id: 'google-workspace-mcp',
    name: 'Google Workspace MCP',
    description:
      'Control Gmail, Calendar, Docs, Sheets, Slides, Chat, Drive and more',
    category: 'productivity',
    repository: 'https://github.com/taylorwilsdon/google_workspace_mcp',
    website: 'https://workspace.google.com',
    installationType: 'pip',
    pipPackage: 'google-workspace-mcp',
    installConfig: {
      command: 'uvx',
      args: ['google-workspace-mcp'],
    },
    requiredEnvVars: [
      {
        name: 'GOOGLE_APPLICATION_CREDENTIALS',
        description: 'Path to Google credentials',
      },
    ],
    tags: ['google', 'workspace', 'gmail', 'docs'],
  },

  // === DEVELOPER TOOLS ===
  {
    id: 'context7-mcp',
    name: 'Context7 MCP',
    description: 'Up-to-date code documentation for LLMs and AI code editors',
    category: 'developer-tools',
    repository: 'https://github.com/upstash/context7',
    website: 'https://context7.com',
    installationType: 'npx',
    npmPackage: '@upstash/context7-mcp',
    official: true,
    installConfig: {
      command: 'npx',
      args: ['-y', '@upstash/context7-mcp'],
    },
    tags: ['documentation', 'context', 'code', 'official'],
  },
  {
    id: 'sentry-mcp',
    name: 'Sentry MCP',
    description:
      'Sentry.io integration for error tracking and performance monitoring',
    category: 'developer-tools',
    repository: 'https://github.com/getsentry/sentry-mcp',
    website: 'https://sentry.io',
    installationType: 'npx',
    npmPackage: '@sentry/mcp-server',
    official: true,
    installConfig: {
      command: 'npx',
      args: ['-y', '@sentry/mcp-server'],
    },
    requiredEnvVars: [
      { name: 'SENTRY_AUTH_TOKEN', description: 'Sentry Auth Token' },
      { name: 'SENTRY_ORG', description: 'Sentry Organization Slug' },
    ],
    tags: ['sentry', 'errors', 'monitoring', 'official'],
  },
  {
    id: 'mcp-memory-service',
    name: 'Memory Service MCP',
    description:
      'Automatic context memory for Claude, VS Code, Cursor - stop re-explaining',
    category: 'developer-tools',
    repository: 'https://github.com/doobidoo/mcp-memory-service',
    installationType: 'pip',
    pipPackage: 'mcp-memory-service',
    installConfig: {
      command: 'uvx',
      args: ['mcp-memory-service'],
    },
    tags: ['memory', 'context', 'persistence'],
  },
  {
    id: 'serena-mcp',
    name: 'Serena MCP',
    description:
      'Powerful coding agent with semantic retrieval and editing via language servers',
    category: 'coding-agents',
    repository: 'https://github.com/oraios/serena',
    installationType: 'pip',
    pipPackage: 'serena',
    installConfig: {
      command: 'uvx',
      args: ['serena'],
    },
    tags: ['coding', 'agent', 'language-server'],
  },
  {
    id: 'figma-mcp',
    name: 'Figma MCP',
    description: 'Get Figma design data in ready-to-implement format',
    category: 'developer-tools',
    repository: 'https://github.com/tianmuji/Figma-Context-MCP',
    website: 'https://figma.com',
    installationType: 'npx',
    npmPackage: 'figma-context-mcp',
    installConfig: {
      command: 'npx',
      args: ['-y', 'figma-context-mcp'],
    },
    requiredEnvVars: [
      {
        name: 'FIGMA_ACCESS_TOKEN',
        description: 'Figma Personal Access Token',
      },
    ],
    tags: ['figma', 'design', 'ui'],
  },
  {
    id: 'talk-to-figma-mcp',
    name: 'Talk to Figma MCP',
    description: 'Cursor + Figma integration for reading and modifying designs',
    category: 'developer-tools',
    repository: 'https://github.com/grab/cursor-talk-to-figma-mcp',
    website: 'https://figma.com',
    installationType: 'npx',
    npmPackage: '@anthropic-ai/talk-to-figma-mcp',
    installConfig: {
      command: 'npx',
      args: ['-y', '@anthropic-ai/talk-to-figma-mcp'],
    },
    requiredEnvVars: [
      {
        name: 'FIGMA_ACCESS_TOKEN',
        description: 'Figma Personal Access Token',
      },
    ],
    tags: ['figma', 'cursor', 'design'],
  },
  {
    id: 'mcp-language-server',
    name: 'Language Server MCP',
    description:
      'Semantic tools like get definition, references, rename, diagnostics',
    category: 'developer-tools',
    repository: 'https://github.com/isaacphi/mcp-language-server',
    installationType: 'binary',
    installConfig: {
      command: 'mcp-language-server',
      args: [],
    },
    tags: ['lsp', 'language-server', 'semantic'],
  },

  // === AI SERVICES ===
  {
    id: 'openai-mcp',
    name: 'OpenAI MCP',
    description: 'Query OpenAI models directly from Claude using MCP protocol',
    category: 'ai-services',
    repository: 'https://github.com/pierrebrunelle/mcp-server-openai',
    website: 'https://openai.com',
    installationType: 'pip',
    pipPackage: 'mcp-server-openai',
    installConfig: {
      command: 'uvx',
      args: ['mcp-server-openai'],
    },
    requiredEnvVars: [
      { name: 'OPENAI_API_KEY', description: 'OpenAI API key' },
    ],
    tags: ['openai', 'gpt', 'llm'],
  },
  {
    id: 'llamacloud-mcp',
    name: 'LlamaCloud MCP',
    description: 'Connect to managed indices on LlamaCloud',
    category: 'ai-services',
    repository: 'https://github.com/run-llama/mcp-server-llamacloud',
    website: 'https://cloud.llamaindex.ai',
    installationType: 'npx',
    npmPackage: '@llamaindex/mcp-server-llamacloud',
    official: true,
    installConfig: {
      command: 'npx',
      args: ['-y', '@llamaindex/mcp-server-llamacloud'],
    },
    requiredEnvVars: [
      { name: 'LLAMA_CLOUD_API_KEY', description: 'LlamaCloud API key' },
    ],
    tags: ['llamaindex', 'rag', 'index', 'official'],
  },
  {
    id: 'huggingface-spaces-mcp',
    name: 'HuggingFace Spaces MCP',
    description:
      'Use HuggingFace Spaces from your MCP Client - images, audio, text',
    category: 'ai-services',
    repository: 'https://github.com/evalstate/mcp-hfspace',
    website: 'https://huggingface.co/spaces',
    installationType: 'npx',
    npmPackage: 'mcp-hfspace',
    installConfig: {
      command: 'npx',
      args: ['-y', 'mcp-hfspace'],
    },
    requiredEnvVars: [
      { name: 'HF_TOKEN', description: 'HuggingFace API token' },
    ],
    tags: ['huggingface', 'spaces', 'models'],
  },

  // === WORKFLOW AUTOMATION ===
  {
    id: 'n8n-mcp',
    name: 'n8n MCP',
    description:
      'Build n8n workflows using Claude Desktop, Cursor, or Windsurf',
    category: 'workflow-automation',
    repository: 'https://github.com/czlonkowski/n8n-mcp',
    website: 'https://n8n.io',
    installationType: 'npx',
    npmPackage: 'n8n-mcp',
    installConfig: {
      command: 'npx',
      args: ['-y', 'n8n-mcp'],
    },
    requiredEnvVars: [
      { name: 'N8N_API_URL', description: 'n8n instance URL' },
      { name: 'N8N_API_KEY', description: 'n8n API key' },
    ],
    tags: ['n8n', 'automation', 'workflows'],
  },

  // === DATA VISUALIZATION ===
  {
    id: 'vegalite-mcp',
    name: 'VegaLite MCP',
    description: 'Generate visualizations from data using VegaLite format',
    category: 'data-visualization',
    repository: 'https://github.com/isaacwasserman/mcp-vegalite-server',
    installationType: 'pip',
    pipPackage: 'mcp-vegalite-server',
    installConfig: {
      command: 'uvx',
      args: ['mcp-vegalite-server'],
    },
    tags: ['visualization', 'charts', 'vegalite'],
  },
  {
    id: 'echarts-mcp',
    name: 'ECharts MCP',
    description: 'Generate visual charts using Apache ECharts dynamically',
    category: 'data-visualization',
    repository: 'https://github.com/hustcc/mcp-echarts',
    website: 'https://echarts.apache.org',
    installationType: 'npx',
    npmPackage: 'mcp-echarts',
    installConfig: {
      command: 'npx',
      args: ['-y', 'mcp-echarts'],
    },
    tags: ['visualization', 'charts', 'echarts'],
  },
  {
    id: 'mermaid-mcp',
    name: 'Mermaid MCP',
    description: 'Generate Mermaid diagrams and charts dynamically',
    category: 'data-visualization',
    repository: 'https://github.com/hustcc/mcp-mermaid',
    website: 'https://mermaid.js.org',
    installationType: 'npx',
    npmPackage: 'mcp-mermaid',
    installConfig: {
      command: 'npx',
      args: ['-y', 'mcp-mermaid'],
    },
    tags: ['diagrams', 'mermaid', 'flowcharts'],
  },

  // === MONITORING ===
  {
    id: 'datadog-mcp',
    name: 'Datadog MCP',
    description: 'Datadog monitoring and observability integration',
    category: 'monitoring',
    repository: 'https://github.com/datadog/mcp-server-datadog',
    website: 'https://datadoghq.com',
    installationType: 'pip',
    pipPackage: 'datadog-mcp',
    official: true,
    installConfig: {
      command: 'uvx',
      args: ['datadog-mcp'],
    },
    requiredEnvVars: [
      { name: 'DD_API_KEY', description: 'Datadog API key' },
      { name: 'DD_APP_KEY', description: 'Datadog Application key' },
    ],
    tags: ['datadog', 'monitoring', 'observability', 'official'],
  },

  // === FINANCE ===
  {
    id: 'stripe-mcp',
    name: 'Stripe MCP',
    description: 'Official Stripe Agent Toolkit for payment integration',
    category: 'finance',
    repository: 'https://github.com/stripe/agent-toolkit',
    website: 'https://stripe.com',
    installationType: 'npx',
    npmPackage: '@stripe/agent-toolkit',
    official: true,
    installConfig: {
      command: 'npx',
      args: ['-y', '@stripe/agent-toolkit', 'mcp'],
    },
    requiredEnvVars: [
      { name: 'STRIPE_SECRET_KEY', description: 'Stripe Secret Key' },
    ],
    tags: ['stripe', 'payments', 'finance', 'official'],
  },
  {
    id: 'paypal-mcp',
    name: 'PayPal MCP',
    description: 'PayPal Agent Toolkit for payment integration',
    category: 'finance',
    repository: 'https://github.com/paypal/agent-toolkit',
    website: 'https://paypal.com',
    installationType: 'npx',
    npmPackage: '@paypal/agent-toolkit',
    official: true,
    installConfig: {
      command: 'npx',
      args: ['-y', '@paypal/agent-toolkit'],
    },
    requiredEnvVars: [
      { name: 'PAYPAL_CLIENT_ID', description: 'PayPal Client ID' },
      { name: 'PAYPAL_CLIENT_SECRET', description: 'PayPal Client Secret' },
    ],
    tags: ['paypal', 'payments', 'finance', 'official'],
  },

  // === SECURITY ===
  {
    id: 'semgrep-mcp',
    name: 'Semgrep MCP',
    description: 'Scan code for security vulnerabilities using Semgrep',
    category: 'security',
    repository: 'https://github.com/semgrep/mcp',
    website: 'https://semgrep.dev',
    installationType: 'pip',
    pipPackage: 'semgrep-mcp',
    official: true,
    installConfig: {
      command: 'uvx',
      args: ['semgrep-mcp'],
    },
    tags: ['semgrep', 'security', 'sast', 'official'],
  },
  {
    id: 'osv-mcp',
    name: 'OSV MCP',
    description: 'Access Open Source Vulnerabilities database',
    category: 'security',
    repository: 'https://github.com/StacklokLabs/osv-mcp',
    website: 'https://osv.dev',
    installationType: 'binary',
    installConfig: {
      command: 'osv-mcp',
      args: [],
    },
    tags: ['osv', 'vulnerabilities', 'security'],
  },

  // === AGGREGATORS ===
  {
    id: 'pipedream-mcp',
    name: 'Pipedream MCP',
    description: 'Connect with 2,500+ APIs with 8,000+ prebuilt tools',
    category: 'aggregator',
    repository:
      'https://github.com/PipedreamHQ/pipedream/tree/master/modelcontextprotocol',
    website: 'https://pipedream.com',
    installationType: 'npx',
    npmPackage: '@pipedream/mcp',
    official: true,
    installConfig: {
      command: 'npx',
      args: ['-y', '@pipedream/mcp'],
    },
    requiredEnvVars: [
      { name: 'PIPEDREAM_API_KEY', description: 'Pipedream API key' },
    ],
    tags: ['pipedream', 'integrations', 'apis', 'official'],
  },
  {
    id: 'mindsdb-mcp',
    name: 'MindsDB MCP',
    description:
      'Connect and unify data across platforms as a single MCP server',
    category: 'aggregator',
    repository: 'https://github.com/mindsdb/mindsdb',
    website: 'https://mindsdb.com',
    installationType: 'pip',
    pipPackage: 'mindsdb-mcp',
    official: true,
    installConfig: {
      command: 'uvx',
      args: ['mindsdb-mcp'],
    },
    tags: ['mindsdb', 'data', 'ml', 'official'],
  },

  // === FRAMEWORKS ===
  {
    id: 'fastmcp',
    name: 'FastMCP',
    description: 'The fast, Pythonic way to build MCP servers and clients',
    category: 'developer-tools',
    repository: 'https://github.com/jlowin/fastmcp',
    installationType: 'pip',
    pipPackage: 'fastmcp',
    installConfig: {
      command: 'pip',
      args: ['install', 'fastmcp'],
    },
    tags: ['framework', 'python', 'sdk'],
  },
  {
    id: 'mcp-use',
    name: 'MCP Use',
    description: 'Easiest way to interact with MCP servers with custom agents',
    category: 'developer-tools',
    repository: 'https://github.com/mcp-use/mcp-use',
    installationType: 'pip',
    pipPackage: 'mcp-use',
    installConfig: {
      command: 'pip',
      args: ['install', 'mcp-use'],
    },
    tags: ['framework', 'agents', 'python'],
  },

  // === GAMING ===
  {
    id: 'unity-mcp',
    name: 'Unity MCP',
    description: 'MCP server for Unity Editor control and game development',
    category: 'other',
    repository: 'https://github.com/Artmann/unity-mcp',
    website: 'https://unity.com',
    installationType: 'npx',
    npmPackage: 'unity-mcp',
    installConfig: {
      command: 'npx',
      args: ['-y', 'unity-mcp'],
    },
    tags: ['unity', 'game-dev', 'editor'],
  },

  // === RESEARCH ===
  {
    id: 'arxiv-mcp',
    name: 'ArXiv MCP',
    description: 'Search ArXiv research papers',
    category: 'other',
    repository: 'https://github.com/blazickjp/arxiv-mcp-server',
    website: 'https://arxiv.org',
    installationType: 'pip',
    pipPackage: 'arxiv-mcp-server',
    installConfig: {
      command: 'uvx',
      args: ['arxiv-mcp-server'],
    },
    tags: ['arxiv', 'research', 'papers'],
  },
  {
    id: 'gpt-researcher-mcp',
    name: 'GPT Researcher MCP',
    description: 'LLM agent for deep research on any topic with citations',
    category: 'other',
    repository: 'https://github.com/assafelovic/gpt-researcher',
    installationType: 'pip',
    pipPackage: 'gpt-researcher',
    installConfig: {
      command: 'uvx',
      args: ['gpt-researcher-mcp'],
    },
    tags: ['research', 'agent', 'citations'],
  },

  // === OTHER POPULAR ===
  {
    id: 'apple-shortcuts-mcp',
    name: 'Apple Shortcuts MCP',
    description: 'Integration with Apple Shortcuts on macOS',
    category: 'other',
    repository: 'https://github.com/recursechat/mcp-server-apple-shortcuts',
    installationType: 'npx',
    npmPackage: 'mcp-server-apple-shortcuts',
    installConfig: {
      command: 'npx',
      args: ['-y', 'mcp-server-apple-shortcuts'],
    },
    tags: ['apple', 'shortcuts', 'macos', 'automation'],
  },
  {
    id: 'octocode-mcp',
    name: 'Octocode MCP',
    description: 'AI-powered developer assistant for GitHub and NPM research',
    category: 'developer-tools',
    repository: 'https://github.com/bgauryy/octocode-mcp',
    installationType: 'npx',
    npmPackage: 'octocode-mcp',
    installConfig: {
      command: 'npx',
      args: ['-y', 'octocode-mcp'],
    },
    requiredEnvVars: [
      {
        name: 'GITHUB_PERSONAL_ACCESS_TOKEN',
        description: 'GitHub Personal Access Token',
      },
    ],
    tags: ['github', 'npm', 'research', 'code'],
  },
];

/**
 * Get MCPs by category
 */
export function getMCPsByCategory(category: MCPCategory): MCPRegistryEntry[] {
  return MCP_REGISTRY.filter(mcp => mcp.category === category);
}

/**
 * Get MCPs sorted by stars (popularity)
 */
export function getMCPsByPopularity(): MCPRegistryEntry[] {
  return [...MCP_REGISTRY].sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0));
}

/**
 * Search MCPs by name, description, or tags
 */
export function searchMCPs(query: string): MCPRegistryEntry[] {
  const lowerQuery = query.toLowerCase();
  return MCP_REGISTRY.filter(
    mcp =>
      mcp.name.toLowerCase().includes(lowerQuery) ||
      mcp.description.toLowerCase().includes(lowerQuery) ||
      mcp.tags?.some(tag => tag.toLowerCase().includes(lowerQuery))
  );
}

/**
 * Get only official MCPs
 */
export function getOfficialMCPs(): MCPRegistryEntry[] {
  return MCP_REGISTRY.filter(mcp => mcp.official);
}

/**
 * Get all unique categories
 */
export function getAllCategories(): MCPCategory[] {
  return Array.from(new Set(MCP_REGISTRY.map(mcp => mcp.category)));
}

/**
 * Get MCP by ID
 */
export function getMCPById(id: string): MCPRegistryEntry | undefined {
  return MCP_REGISTRY.find(mcp => mcp.id === id);
}

/**
 * Get total count
 */
export function getMCPCount(): number {
  return MCP_REGISTRY.length;
}
