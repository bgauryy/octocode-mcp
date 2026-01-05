/**
 * Research Coder - Specialized coder for research and exploration tasks
 *
 * Features:
 * - Read-only operations
 * - Octocode MCP integration
 * - Web search capabilities
 * - Code exploration tools
 */

import { BaseCoder } from './base-coder.js';
import type { CoderMode, CoderCapabilities, CoderConfig } from './types.js';
import type {
  AgentTool,
  AgentDefinition,
  MCPServerConfig,
} from '../../types/agent.js';
import { OCTOCODE_NPX } from '../../configs/octocode.js';

// ============================================
// Research Tools & Agents
// ============================================

const RESEARCH_TOOLS: AgentTool[] = [
  'Read',
  'Glob',
  'Grep',
  'WebSearch',
  'WebFetch',
  'Task',
  'TodoWrite', // Added for tracking multi-step research tasks
  'ListMcpResources',
  'ReadMcpResource',
];

const RESEARCHER_AGENT: AgentDefinition = {
  description:
    'Expert code researcher for exploring codebases, finding implementations, and understanding code patterns.',
  prompt: `You are a code research specialist with access to Octocode MCP tools.

## Your MCP Tools (use exact names):
- \`mcp__octocode-local__localSearchCode\` - Search patterns in local codebase
- \`mcp__octocode-local__localGetFileContent\` - Read local files with matchString targeting
- \`mcp__octocode-local__localViewStructure\` - View directory structure
- \`mcp__octocode-local__githubSearchCode\` - Search GitHub repositories
- \`mcp__octocode-local__githubGetFileContent\` - Read GitHub file contents
- \`mcp__octocode-local__packageSearch\` - Find npm/Python packages

## Research Process:
1. Start with structure (localViewStructure) to understand layout
2. Search for patterns (localSearchCode) to find implementations
3. Read with context (localGetFileContent + matchString) for details
4. Trace imports and dependencies across files
5. Cite file paths and line numbers in findings

Be thorough but concise. Provide evidence-based summaries.
Use TodoWrite to track multi-step research tasks and findings.`,
  tools: RESEARCH_TOOLS,
  model: 'sonnet',
};

// ============================================
// Research System Prompt
// ============================================

const RESEARCH_SYSTEM_PROMPT = `You are an expert AI research assistant powered by Octocode.

## Octocode MCP Tools (ALWAYS USE THESE FOR RESEARCH)

You have access to powerful Octocode MCP tools:

### Local Codebase Tools (PREFERRED)
- \`mcp__octocode-local__localSearchCode\` - Search patterns in local codebase (replaces grep)
- \`mcp__octocode-local__localGetFileContent\` - Read local file contents with targeting
- \`mcp__octocode-local__localViewStructure\` - View directory structure (replaces ls/tree)
- \`mcp__octocode-local__localFindFiles\` - Find files by name/metadata (replaces find)

### GitHub Research Tools
- \`mcp__octocode-local__githubSearchCode\` - Search code patterns across GitHub repositories
- \`mcp__octocode-local__githubGetFileContent\` - Read file contents from GitHub repos
- \`mcp__octocode-local__githubViewRepoStructure\` - Explore repository directory structure
- \`mcp__octocode-local__githubSearchRepositories\` - Find repositories by keywords/topics
- \`mcp__octocode-local__githubSearchPullRequests\` - Search PR history and changes
- \`mcp__octocode-local__packageSearch\` - Find npm/Python packages and their repos

## Research Workflow

1. **Start Local**: Use localViewStructure to understand project layout
2. **Search Patterns**: Use localSearchCode to find implementations
3. **Read Context**: Use localGetFileContent with matchString for targeted reading
4. **Trace Dependencies**: Follow imports and usages across files
5. **Cross-Reference**: Compare with upstream GitHub repos when needed
6. **Cite Evidence**: Always provide file paths and line numbers

## Best Practices
- **Evidence First**: Every finding must be backed by code evidence
- **Validate Findings**: Cross-check important discoveries
- **Cite Precisely**: Include file paths and line numbers
- **Be Thorough**: Explore all relevant aspects
- **Be Concise**: Summarize findings clearly
- **Track Progress**: Use TodoWrite for multi-step research tasks
`;

// ============================================
// Research Coder Class
// ============================================

export class ResearchCoder extends BaseCoder {
  readonly mode: CoderMode = 'research';

  constructor(config: Partial<CoderConfig> = {}) {
    super({
      ...config,
      mode: 'research',
      permissionMode: config.permissionMode || 'default',
    });
  }

  getCapabilities(): CoderCapabilities {
    return {
      tools: RESEARCH_TOOLS,
      agents: {
        researcher: RESEARCHER_AGENT,
      },
      mcpServers: this.getMCPServers(),
      systemPrompt: this.getSystemPrompt(),
      settings: {
        canEdit: false,
        canExecute: false,
        canAccessWeb: true,
        readOnly: true,
      },
    };
  }

  protected getSystemPrompt(): string {
    return RESEARCH_SYSTEM_PROMPT;
  }

  protected getMCPServers(): Record<string, MCPServerConfig> {
    return {
      'octocode-local': {
        type: 'stdio',
        command: OCTOCODE_NPX.command,
        args: OCTOCODE_NPX.args,
      },
    };
  }
}

/**
 * Create a research coder instance
 */
export function createResearchCoder(
  config: Partial<CoderConfig> = {}
): ResearchCoder {
  return new ResearchCoder(config);
}
