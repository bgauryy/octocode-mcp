import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as Tools from './mcp/tools/index.js';
import { PROMPT_SYSTEM_PROMPT } from './mcp/systemPrompts.js';
import { Implementation } from '@modelcontextprotocol/sdk/types.js';

const SERVER_CONFIG: Implementation = {
  name: 'octocode-mcp',
  version: '1.0.0',
  description: `Comprehensive code analysis assistant: Deep exploration and understanding of complex implementations in GitHub repositories and npm packages.
       Specialized in architectural analysis, algorithm explanations, and complete technical documentation.`,
};

function registerAllTools(server: McpServer) {
  const toolRegistrations = [
    { name: 'ApiStatusCheck', fn: Tools.registerApiStatusCheckTool },
    { name: 'GitHubSearchCode', fn: Tools.registerGitHubSearchCodeTool },
    {
      name: 'FetchGitHubFileContent',
      fn: Tools.registerFetchGitHubFileContentTool,
    },
    { name: 'SearchGitHubRepos', fn: Tools.registerSearchGitHubReposTool },
    { name: 'SearchGitHubCommits', fn: Tools.registerSearchGitHubCommitsTool },
    {
      name: 'SearchGitHubPullRequests',
      fn: Tools.registerSearchGitHubPullRequestsTool,
    },
    {
      name: 'GetUserOrganizations',
      fn: Tools.registerGetUserOrganizationsTool,
    },
    { name: 'NpmSearch', fn: Tools.registerNpmSearchTool },
    {
      name: 'ViewRepositoryStructure',
      fn: Tools.registerViewRepositoryStructureTool,
    },
    { name: 'SearchGitHubIssues', fn: Tools.registerSearchGitHubIssuesTool },
    { name: 'SearchGitHubTopics', fn: Tools.registerSearchGitHubTopicsTool },
    { name: 'SearchGitHubUsers', fn: Tools.registerSearchGitHubUsersTool },

    { name: 'NpmGetDependencies', fn: Tools.registerNpmGetDependenciesTool },

    { name: 'NpmGetReleases', fn: Tools.registerNpmGetReleasesTool },
    { name: 'NpmGetExports', fn: Tools.registerNpmGetExportsTool },
  ];

  for (const tool of toolRegistrations) {
    try {
      tool.fn(server);
    } catch (error) {
      // ignore
    }
  }
}

async function startServer() {
  try {
    const server = new McpServer(SERVER_CONFIG, {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
      },
      instructions: `
    #COMPREHENSIVE_CODE_ANALYSIS_SYSTEM
    ${PROMPT_SYSTEM_PROMPT}
    
    ANALYSIS EXECUTION GUIDELINES:
    
    FOR IMPLEMENTATION QUERIES (e.g., "how does React implement concurrent rendering"):
    1. PARALLEL DISCOVERY: Use multiple boolean search terms simultaneously
    2. CORE FILE IDENTIFICATION: Find scheduler, reconciler, work loop implementations
    3. DEEP FILE ANALYSIS: Examine complete implementations, not just snippets
    4. ARCHITECTURE MAPPING: Understand relationships between components
    5. COMPREHENSIVE EXPLANATION: Cover algorithms, data structures, design patterns
    
    FOR FEATURE EXPLORATION (e.g., "explain React's fiber architecture"):
    1. MULTI-DIMENSIONAL SEARCH: Core implementation + related systems + performance optimizations
    2. INTERCONNECTED ANALYSIS: Follow dependency chains and data flow
    3. COMPARATIVE CONTEXT: Explain design decisions and trade-offs
    4. PRACTICAL UNDERSTANDING: How it works in practice, edge cases, limitations
    
    FOR ECOSYSTEM RESEARCH (e.g., "find best state management libraries"):
    1. COMPREHENSIVE DISCOVERY: Use NPM + GitHub + community insights
    2. TECHNICAL COMPARISON: Architecture differences, performance characteristics
    3. IMPLEMENTATION ANALYSIS: Examine core algorithms and design patterns
    4. PRACTICAL GUIDANCE: Usage patterns, ecosystem fit, migration considerations
    
    QUALITY ASSURANCE:
    - COMPLETENESS: Single response should answer the full query depth
    - TECHNICAL ACCURACY: Verify understanding across multiple source files
    - PRACTICAL VALUE: Provide actionable insights and real-world context
    - ARCHITECTURAL CLARITY: Use diagrams and structured explanations
    
    ALWAYS PRIORITIZE: Deep understanding over surface-level summaries`,
    });

    registerAllTools(server);
    const transport = new StdioServerTransport();
    await server.connect(transport);

    const gracefulShutdown = async (_signal: string) => {
      try {
        await server.close();
        process.exit(0);
      } catch (error) {
        process.exit(1);
      }
    };

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

    process.stdin.on('close', async () => {
      await gracefulShutdown('STDIN_CLOSE');
    });

    process.on('uncaughtException', () => {
      gracefulShutdown('UNCAUGHT_EXCEPTION');
    });

    process.on('unhandledRejection', () => {
      gracefulShutdown('UNHANDLED_REJECTION');
    });
  } catch (error) {
    process.exit(1);
  }
}

startServer().catch(() => {
  process.exit(1);
});
