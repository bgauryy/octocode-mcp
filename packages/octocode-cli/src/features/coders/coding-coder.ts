/**
 * Coding Coder - Specialized coder for code editing tasks
 *
 * Features:
 * - File editing capabilities
 * - Code review integration
 * - Test running support
 * - Linting integration
 */

import { BaseCoder } from './base-coder.js';
import type { CoderMode, CoderCapabilities, CoderConfig } from './types.js';
import type { AgentTool, AgentDefinition } from '../../types/agent.js';

// ============================================
// Coding Tools & Agents
// ============================================

const CODING_TOOLS: AgentTool[] = [
  'Read',
  'Write',
  'Edit',
  'Bash',
  'Glob',
  'Grep',
  'Task',
  'TodoWrite',
  'AskUserQuestion',
];

const CODE_REVIEWER_AGENT: AgentDefinition = {
  description:
    'Expert code reviewer for quality, security, and best practices analysis.',
  prompt: `You are a senior code reviewer. Analyze code for:
- Security vulnerabilities and risks
- Performance issues and optimizations
- Code quality and maintainability
- Adherence to best practices
- Potential bugs and edge cases

Provide specific, actionable feedback with file paths and line numbers. Prioritize issues by severity.`,
  tools: ['Read', 'Glob', 'Grep'],
  model: 'sonnet',
};

const TEST_RUNNER_AGENT: AgentDefinition = {
  description:
    'Test execution specialist for running tests and analyzing results.',
  prompt: `You are a testing specialist. Your role is to:
- Run test suites and analyze results
- Identify failing tests and their causes
- Suggest fixes for test failures
- Ensure adequate test coverage

Execute tests using appropriate commands (npm test, pytest, etc.) and provide clear analysis of results.`,
  tools: ['Bash', 'Read', 'Grep', 'Glob'],
  model: 'haiku',
};

// ============================================
// Coding System Prompt
// ============================================

const CODING_SYSTEM_PROMPT = `You are an expert AI coding assistant powered by Octocode.

## Your Capabilities
- Read and understand codebases
- Write and edit code files
- Run shell commands and tests
- Review code quality
- Debug issues

## Coding Workflow

1. **Understand First**: Read relevant files before making changes
2. **Plan Changes**: Break down complex tasks into steps
3. **Make Incremental Changes**: Edit one thing at a time
4. **Test Changes**: Run tests after modifications
5. **Review**: Check for issues before completing

## Best Practices
- **Read Before Edit**: Always understand context before changing code
- **Small Changes**: Make minimal, focused edits
- **Test Early**: Run tests frequently
- **Clean Code**: Follow existing code style
- **Document**: Add comments for complex logic

## Task Management
- Use TodoWrite to track multi-step tasks
- Mark items complete as you progress
- Use Task to spawn specialized subagents

## Code Review
- Use the codeReviewer subagent for quality checks
- Address security concerns first
- Fix bugs before optimization
`;

// ============================================
// Coding Coder Class
// ============================================

export class CodingCoder extends BaseCoder {
  readonly mode: CoderMode = 'coding';

  constructor(config: Partial<CoderConfig> = {}) {
    super({
      ...config,
      mode: 'coding',
      useClaudeCodePrompt: true,
      loadProjectSettings: true,
    });
  }

  getCapabilities(): CoderCapabilities {
    return {
      tools: CODING_TOOLS,
      agents: {
        codeReviewer: CODE_REVIEWER_AGENT,
        testRunner: TEST_RUNNER_AGENT,
      },
      mcpServers: {},
      systemPrompt: this.getSystemPrompt(),
      settings: {
        canEdit: true,
        canExecute: true,
        canAccessWeb: false,
        readOnly: false,
      },
    };
  }

  protected getSystemPrompt(): string {
    return CODING_SYSTEM_PROMPT;
  }
}

/**
 * Create a coding coder instance
 */
export function createCodingCoder(
  config: Partial<CoderConfig> = {}
): CodingCoder {
  return new CodingCoder(config);
}
