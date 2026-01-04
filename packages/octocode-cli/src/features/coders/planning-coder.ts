/**
 * Planning Coder - Specialized coder for planning and architecture tasks
 *
 * Features:
 * - Research capabilities
 * - No execution (plan only mode)
 * - Extended thinking enabled
 * - Architecture design focus
 */

import { BaseCoder } from './base-coder.js';
import type { CoderMode, CoderCapabilities, CoderConfig } from './types.js';
import type { AgentTool, MCPServerConfig } from '../../types/agent.js';
import { OCTOCODE_NPX } from '../../configs/octocode.js';

// ============================================
// Planning Tools
// ============================================

const PLANNING_TOOLS: AgentTool[] = [
  'Read',
  'Glob',
  'Grep',
  'WebSearch',
  'WebFetch',
  'Task',
  'TodoWrite',
  'ListMcpResources',
  'ReadMcpResource',
];

// ============================================
// Planning System Prompt
// ============================================

const PLANNING_SYSTEM_PROMPT = `You are an expert AI planning assistant powered by Octocode.

## Your Role
Create detailed, actionable plans for software development tasks. You research and analyze, but do NOT execute changes.

## Planning Workflow

1. **Understand Requirements**: Clarify goals and constraints
2. **Research Current State**: Analyze existing code and architecture
3. **Identify Dependencies**: Map out what needs to change
4. **Break Down Tasks**: Create actionable steps
5. **Estimate Complexity**: Note challenges and risks
6. **Document Plan**: Provide clear, structured output

## Octocode Research Tools

### Local Analysis
- \`mcp__octocode-local__localViewStructure\` - Understand project layout
- \`mcp__octocode-local__localSearchCode\` - Find implementations
- \`mcp__octocode-local__localGetFileContent\` - Read file details
- \`mcp__octocode-local__localFindFiles\` - Find relevant files

### GitHub Research
- \`mcp__octocode-local__githubSearchCode\` - Find patterns in other repos
- \`mcp__octocode-local__packageSearch\` - Research dependencies
- \`mcp__octocode-local__githubViewRepoStructure\` - Explore libraries

## Output Format

Your plans should include:
1. **Overview**: High-level summary
2. **Tasks**: Numbered, actionable items
3. **Dependencies**: What each task depends on
4. **Files to Modify**: Specific files and changes
5. **Risks**: Potential challenges
6. **Testing Strategy**: How to verify changes

## Best Practices
- Think deeply about architecture implications
- Consider edge cases and error handling
- Plan for testability
- Note security considerations
- Keep plans realistic and achievable
`;

// ============================================
// Planning Coder Class
// ============================================

export class PlanningCoder extends BaseCoder {
  readonly mode: CoderMode = 'planning';

  constructor(config: Partial<CoderConfig> = {}) {
    super({
      ...config,
      mode: 'planning',
      permissionMode: 'plan',
      enableThinking: true,
      loadProjectSettings: true,
    });
  }

  getCapabilities(): CoderCapabilities {
    return {
      tools: PLANNING_TOOLS,
      agents: {},
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
    return PLANNING_SYSTEM_PROMPT;
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

  /**
   * Override run to prepend planning instruction
   */
  async run(prompt: string): Promise<import('./types.js').CoderResult> {
    const planningPrompt = `Think carefully and create a detailed plan for: ${prompt}

Do NOT execute any code changes. Only create a plan with:
1. Overview of the approach
2. Specific tasks (numbered)
3. Files that need to be modified
4. Dependencies between tasks
5. Potential risks or challenges
6. Testing strategy`;

    return super.run(planningPrompt);
  }
}

/**
 * Create a planning coder instance
 */
export function createPlanningCoder(
  config: Partial<CoderConfig> = {}
): PlanningCoder {
  return new PlanningCoder(config);
}
