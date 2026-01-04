/**
 * Full Coder - All capabilities enabled
 *
 * Features:
 * - All tools available
 * - All subagents enabled
 * - Octocode MCP integration
 * - Extended thinking support
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
// All Tools
// ============================================

const ALL_TOOLS: AgentTool[] = [
  'Read',
  'Write',
  'Edit',
  'Bash',
  'Glob',
  'Grep',
  'WebSearch',
  'WebFetch',
  'Task',
  'TodoWrite',
  'AskUserQuestion',
  'NotebookEdit',
  'ListMcpResources',
  'ReadMcpResource',
];

// ============================================
// All Subagents
// ============================================

const ALL_AGENTS: Record<string, AgentDefinition> = {
  researcher: {
    description:
      'Expert code researcher for exploring codebases, finding implementations, and understanding code patterns.',
    prompt: `You are a code research specialist with access to Octocode MCP tools.

## Your MCP Tools:
- \`mcp__octocode-local__localSearchCode\` - Search patterns in local codebase
- \`mcp__octocode-local__localGetFileContent\` - Read local files with targeting
- \`mcp__octocode-local__localViewStructure\` - View directory structure
- \`mcp__octocode-local__githubSearchCode\` - Search GitHub repositories
- \`mcp__octocode-local__githubGetFileContent\` - Read GitHub file contents
- \`mcp__octocode-local__packageSearch\` - Find npm/Python packages

Be thorough but concise. Cite file paths and line numbers.`,
    tools: [
      'Read',
      'Glob',
      'Grep',
      'WebSearch',
      'WebFetch',
      'ListMcpResources',
      'ReadMcpResource',
    ],
    model: 'sonnet',
  },

  codeReviewer: {
    description:
      'Expert code reviewer for quality, security, and best practices analysis.',
    prompt: `You are a senior code reviewer. Analyze code for:
- Security vulnerabilities and risks
- Performance issues and optimizations
- Code quality and maintainability
- Adherence to best practices
- Potential bugs and edge cases

Provide specific, actionable feedback with file paths and line numbers.`,
    tools: ['Read', 'Glob', 'Grep'],
    model: 'sonnet',
  },

  testRunner: {
    description:
      'Test execution specialist for running tests and analyzing results.',
    prompt: `You are a testing specialist. Your role is to:
- Run test suites and analyze results
- Identify failing tests and their causes
- Suggest fixes for test failures
- Ensure adequate test coverage`,
    tools: ['Bash', 'Read', 'Grep', 'Glob'],
    model: 'haiku',
  },

  docWriter: {
    description:
      'Documentation specialist for generating and updating documentation.',
    prompt: `You are a technical documentation specialist. Your role is to:
- Write clear, concise documentation
- Generate API documentation from code
- Create README files and guides
- Update existing documentation`,
    tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'],
    model: 'sonnet',
  },

  securityAuditor: {
    description:
      'Security specialist for vulnerability analysis and security audits.',
    prompt: `You are a security auditor. Analyze code for:
- OWASP Top 10 vulnerabilities
- Authentication and authorization issues
- Input validation problems
- Secrets and credential exposure
- Dependency vulnerabilities

Provide detailed security reports with remediation recommendations.`,
    tools: ['Read', 'Glob', 'Grep', 'Bash', 'WebSearch'],
    model: 'opus',
  },

  refactorer: {
    description:
      'Refactoring specialist for code improvements and modernization.',
    prompt: `You are a refactoring specialist. Your role is to:
- Identify code that needs refactoring
- Apply design patterns appropriately
- Improve code readability and maintainability
- Modernize legacy code patterns
- Ensure refactoring doesn't break functionality

Make incremental, safe changes with clear explanations.`,
    tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash'],
    model: 'sonnet',
  },
};

// ============================================
// Full System Prompt
// ============================================

const FULL_SYSTEM_PROMPT = `You are an expert AI coding assistant powered by Octocode with full capabilities.

## All Octocode MCP Tools Available

### Local Codebase Tools
- \`mcp__octocode-local__localSearchCode\` - Search patterns in local codebase
- \`mcp__octocode-local__localGetFileContent\` - Read local file contents
- \`mcp__octocode-local__localViewStructure\` - View directory structure
- \`mcp__octocode-local__localFindFiles\` - Find files by name/metadata

### GitHub Research Tools
- \`mcp__octocode-local__githubSearchCode\` - Search code across GitHub
- \`mcp__octocode-local__githubGetFileContent\` - Read GitHub files
- \`mcp__octocode-local__githubViewRepoStructure\` - Explore repos
- \`mcp__octocode-local__githubSearchRepositories\` - Find repositories
- \`mcp__octocode-local__githubSearchPullRequests\` - Search PRs
- \`mcp__octocode-local__packageSearch\` - Find packages

## Available Subagents
- **researcher**: Code exploration and analysis
- **codeReviewer**: Quality and security review
- **testRunner**: Test execution and analysis
- **docWriter**: Documentation generation
- **securityAuditor**: Security vulnerability analysis
- **refactorer**: Code improvement specialist

## Task Breakdown
For complex tasks:
1. Use TodoWrite to plan and track progress
2. Use Task to spawn specialized subagents
3. Research before making changes
4. Test and verify after modifications

## Best Practices
- Research First: Understand before changing
- Plan Complex Tasks: Break into steps
- Use Subagents: Delegate specialized work
- Verify Changes: Run tests after edits
- Be Concise: Focus on the goal
`;

// ============================================
// Full Coder Class
// ============================================

export class FullCoder extends BaseCoder {
  readonly mode: CoderMode = 'full';

  constructor(config: Partial<CoderConfig> = {}) {
    super({
      ...config,
      mode: 'full',
      enableThinking: config.enableThinking ?? true,
      useClaudeCodePrompt: true,
      loadProjectSettings: true,
    });
  }

  getCapabilities(): CoderCapabilities {
    return {
      tools: ALL_TOOLS,
      agents: ALL_AGENTS,
      mcpServers: this.getMCPServers(),
      systemPrompt: this.getSystemPrompt(),
      settings: {
        canEdit: true,
        canExecute: true,
        canAccessWeb: true,
        readOnly: false,
      },
    };
  }

  protected getSystemPrompt(): string {
    return FULL_SYSTEM_PROMPT;
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
 * Create a full coder instance
 */
export function createFullCoder(config: Partial<CoderConfig> = {}): FullCoder {
  return new FullCoder(config);
}
