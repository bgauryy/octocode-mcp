# Octocode CLI Agent Improvements

This document outlines improvements for human-in-the-loop support, plan mode, task tool, and file tools based on the Claude Agent SDK capabilities.

## Current Implementation Status

| Feature | Status | Location |
|---------|--------|----------|
| Subagents (Task tool) | Implemented | `src/features/agent.ts:101-207` |
| Permission modes | Implemented | `src/types/agent.ts:57-61` |
| Hooks | Implemented | `src/features/agent-hooks.ts` |
| MCP integration | Implemented | `src/features/agent.ts:676-684` |
| Planning mode | Partial | `src/features/agent.ts:755-768` |
| Session management | Implemented | `src/features/agent.ts:777-787` |
| Verbose logging | Implemented | `src/features/agent-hooks.ts:552-614` |

---

## 1. Human-in-the-Loop (CRITICAL)

### Current Gap
The SDK provides `canUseTool?: CanUseTool` - a custom permission handler for interactive approval. Your implementation uses hooks but doesn't implement the interactive `canUseTool` callback.

### SDK Signature (`agentSdkTypes.d.ts:145-171`)
```typescript
export type CanUseTool = (
  toolName: string,
  input: Record<string, unknown>,
  options: {
    signal: AbortSignal;
    suggestions?: PermissionUpdate[];
    blockedPath?: string;
    decisionReason?: string;
    toolUseID: string;
    agentID?: string;
  }
) => Promise<PermissionResult>;

export type PermissionResult = {
  behavior: 'allow';
  updatedInput: Record<string, unknown>;
  updatedPermissions?: PermissionUpdate[];
  toolUseID?: string;
} | {
  behavior: 'deny';
  message: string;
  interrupt?: boolean;
  toolUseID?: string;
};
```

### Implementation Location: `src/features/agent.ts`

Add after line 44:
```typescript
import { select } from '../utils/prompts.js';
import { c, bold } from '../utils/colors.js';

/**
 * Interactive permission handler for human-in-the-loop approval
 */
async function createInteractivePermissionHandler(): Promise<CanUseTool> {
  return async (toolName, input, options) => {
    // Auto-approve read-only operations
    const READ_ONLY_TOOLS = ['Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch'];
    const OCTOCODE_TOOLS = toolName.startsWith('mcp__octocode');

    if (READ_ONLY_TOOLS.includes(toolName) || OCTOCODE_TOOLS) {
      return { behavior: 'allow', updatedInput: input };
    }

    // Display permission prompt
    console.log();
    console.log(`${c('yellow', '?')} ${bold('Permission Request')}`);
    console.log(`  Tool: ${c('cyan', toolName)}`);
    console.log(`  Reason: ${options.decisionReason || 'Tool requires approval'}`);

    if (options.blockedPath) {
      console.log(`  Path: ${c('red', options.blockedPath)}`);
    }

    // Show input preview
    const inputPreview = JSON.stringify(input).slice(0, 200);
    console.log(`  Input: ${inputPreview}${inputPreview.length >= 200 ? '...' : ''}`);
    console.log();

    const choice = await select<'allow' | 'allow-always' | 'deny' | 'deny-stop'>({
      message: 'Allow this operation?',
      choices: [
        { name: `${c('green', '✓')} Allow`, value: 'allow' },
        { name: `${c('green', '✓✓')} Always allow this tool`, value: 'allow-always' },
        { name: `${c('red', '✗')} Deny`, value: 'deny' },
        { name: `${c('red', '✗✗')} Deny and stop`, value: 'deny-stop' },
      ],
    });

    if (choice === 'allow' || choice === 'allow-always') {
      return {
        behavior: 'allow',
        updatedInput: input,
        updatedPermissions: choice === 'allow-always' ? options.suggestions : undefined,
      };
    }

    return {
      behavior: 'deny',
      message: 'User denied permission',
      interrupt: choice === 'deny-stop',
    };
  };
}
```

### Update `buildQueryOptions` (line 513):
```typescript
function buildQueryOptions(options: AgentOptions): Record<string, unknown> {
  // ... existing code ...

  // Add interactive permission handler for human-in-the-loop
  if (options.interactive !== false && !options.permissionMode?.includes('bypass')) {
    queryOptions.canUseTool = await createInteractivePermissionHandler();
  }

  // ... rest of existing code ...
}
```

### Add to `AgentOptions` in `src/types/agent.ts:94`:
```typescript
/** Enable interactive permission prompts (human-in-the-loop) */
interactive?: boolean;
```

---

## 2. Plan Mode Improvements

### Current Gap
Your planning mode just prepends "create a detailed plan" to the prompt. The SDK has proper plan mode that prevents tool execution.

### Current Location: `src/features/agent.ts:755-768`

### Improvement: Add Plan File Support
```typescript
/**
 * Run agent in planning mode with plan file output
 */
export async function runPlanningAgent(
  prompt: string,
  options: Partial<AgentOptions> & { planFile?: string } = {}
): Promise<AgentResult> {
  const planPrompt = `You are in PLANNING MODE. Create a detailed implementation plan for:

${prompt}

IMPORTANT:
1. Do NOT execute any code changes
2. Only research and analyze the codebase
3. Write your plan step-by-step
4. Include specific file paths and line numbers
5. Identify potential risks and dependencies

When done, summarize the plan in a structured format.`;

  const result = await runAgent({
    prompt: planPrompt,
    tools: RESEARCH_TOOLS,
    mcpServers: getOctocodeMCPConfig(),
    permissionMode: 'plan',  // SDK plan mode - no tool execution
    loadProjectSettings: true,
    enableThinking: true,
    ...options,
  });

  // Save plan to file if specified
  if (options.planFile && result.success && result.result) {
    const fs = await import('fs/promises');
    await fs.writeFile(options.planFile, result.result, 'utf-8');
  }

  return result;
}
```

### Add EnterPlanMode/ExitPlanMode Awareness

Location: `src/features/agent.ts` - Add to OCTOCODE_SYSTEM_PROMPT (line 50):

```typescript
const OCTOCODE_SYSTEM_PROMPT = `You are an expert AI coding assistant powered by Octocode.

## Planning Mode Support

When working on complex tasks, consider using plan mode:
- Use \`EnterPlanMode\` tool when you need to design an implementation approach
- In plan mode, explore the codebase, understand patterns, and design solutions
- Use \`ExitPlanMode\` when your plan is ready for user approval
- Wait for user confirmation before implementing

## Octocode MCP Tools...
// ... rest of existing prompt
`;
```

---

## 3. Task Tool / Subagent Improvements

### Current Gap
Subagents are well-defined but could be enhanced with:
1. MCP tool access in subagents
2. Better subagent type declarations
3. Dynamic subagent creation

### Location: `src/features/agent.ts:101-207`

### Improvement: Add MCP Tools to Subagents

```typescript
export const OCTOCODE_SUBAGENTS: OctocodeSubagents = {
  researcher: {
    description:
      'Expert code researcher with Octocode MCP tools. Use for ANY research, exploration, or analysis task.',
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

Be thorough but concise. Provide evidence-based summaries.`,
    // Allow MCP tools by not restricting - inherits all from parent
    tools: undefined,  // Changed from explicit list to inherit all
    model: 'sonnet',
  },

  // Add new planner subagent
  planner: {
    description:
      'Implementation planner for complex multi-step tasks. Use before coding large features.',
    prompt: `You are an implementation planning specialist.

Your job is to:
1. Understand the current codebase structure
2. Identify all files that need changes
3. Plan the order of operations
4. Identify dependencies and risks
5. Create step-by-step implementation plan

Use Octocode MCP tools to research the codebase.
Output a structured plan with:
- Summary of changes
- Files to modify (with line numbers)
- New files to create
- Dependencies to consider
- Testing strategy
- Potential risks`,
    model: 'sonnet',
  },

  // ... rest of existing subagents
};
```

### Add Subagent Types to `src/types/agent.ts`:

After line 270, add:
```typescript
/** Built-in subagent types */
export type OctocodeSubagentType =
  | 'researcher'
  | 'codeReviewer'
  | 'testRunner'
  | 'docWriter'
  | 'securityAuditor'
  | 'refactorer'
  | 'planner';
```

---

## 4. PermissionRequest Hook (NEW SDK Feature)

### Current Gap
SDK has a new `PermissionRequest` hook event that's not being used.

### Location: Add to `src/features/agent-hooks.ts`

After line 440:
```typescript
/**
 * Permission request hook - intercept permission prompts
 * Can be used to auto-approve, modify, or log permission requests
 */
export const permissionRequestHook: HookCallback = async (
  input: HookInput
): Promise<HookOutput> => {
  if (input.hook_event_name !== 'PermissionRequest') return {};

  const toolName = input.tool_name || '';
  const toolInput = input.tool_input || {};

  // Log permission requests
  console.log(`\n${c('yellow', '?')} Permission requested for: ${toolName}`);

  // Auto-approve known safe operations
  if (toolName.startsWith('mcp__octocode')) {
    return {
      hookSpecificOutput: {
        hookEventName: 'PermissionRequest',
        decision: {
          behavior: 'allow',
          updatedInput: toolInput,
        },
      },
    };
  }

  // Let other hooks or user handle
  return {};
};
```

Add to hook configurations:
```typescript
export function getDefaultHooks(): Partial<Record<HookEventName, HookMatcher[]>> {
  return {
    // ... existing hooks ...
    PermissionRequest: [
      { hooks: [permissionRequestHook] },
    ],
  };
}
```

---

## 5. Delegate Mode Support (NEW)

### Current Gap
SDK has `'delegate'` permission mode for team leader pattern (restricts to Task and Teammate tools only).

### Location: `src/types/agent.ts:57-61`

Update:
```typescript
export type AgentPermissionMode =
  | 'default'
  | 'acceptEdits'
  | 'bypassPermissions'
  | 'plan'
  | 'delegate'   // NEW: Team leader mode
  | 'dontAsk';   // NEW: Don't prompt, deny if not pre-approved
```

### Add delegate agent mode in `src/features/agent.ts`:

```typescript
/**
 * Run agent in delegate mode (team leader pattern)
 * Agent can only spawn subagents, not perform direct operations
 */
export async function runDelegateAgent(
  prompt: string,
  options: Partial<AgentOptions> = {}
): Promise<AgentResult> {
  return runAgent({
    prompt: `You are a team leader coordinating work across specialists.

Task: ${prompt}

IMPORTANT:
- You can ONLY delegate work to subagents via the Task tool
- You cannot directly edit files, run commands, or access tools
- Break down the task and assign to appropriate specialists:
  - researcher: for code analysis and research
  - codeReviewer: for reviewing code quality
  - testRunner: for running tests
  - refactorer: for code improvements

Coordinate the work and synthesize results.`,
    tools: ['Task', 'TodoWrite'],  // Only coordination tools
    agents: OCTOCODE_SUBAGENTS,
    mcpServers: getOctocodeMCPConfig(),
    permissionMode: 'delegate',
    loadProjectSettings: true,
    ...options,
  });
}
```

---

## 6. File Checkpointing Support (NEW)

### Current Gap
SDK supports `enableFileCheckpointing` for tracking file changes and rewinding.

### Location: Add to `src/types/agent.ts:94`:
```typescript
/** Enable file change tracking for rewind capability */
enableFileCheckpointing?: boolean;
```

### Location: Update `buildQueryOptions` in `src/features/agent.ts:513`:
```typescript
// File checkpointing for rewind support
if (options.enableFileCheckpointing) {
  queryOptions.enableFileCheckpointing = true;
}
```

---

## 7. Sandbox Support (NEW)

### Current Gap
SDK supports sandbox settings for command execution isolation.

### Location: Add to `src/types/agent.ts`:
```typescript
/** Sandbox settings for command execution isolation */
sandbox?: {
  enabled?: boolean;
  autoAllowBashIfSandboxed?: boolean;
  network?: {
    allowLocalBinding?: boolean;
    allowUnixSockets?: string[];
  };
};
```

---

## 8. Plugin Support (NEW)

### Current Gap
SDK supports plugins for extending capabilities.

### Location: Add to `src/types/agent.ts`:
```typescript
/** Plugins to load for extended capabilities */
plugins?: Array<{
  type: 'local';
  path: string;
}>;
```

---

## 9. SubagentStart/SubagentStop Hooks

### Current Gap
SDK has hooks for subagent lifecycle but they're not being used.

### Location: Add to `src/features/agent-hooks.ts`:

```typescript
/**
 * Subagent lifecycle hooks for tracking spawned agents
 */
export const subagentTrackingHook: HookCallback = async (
  input: HookInput
): Promise<HookOutput> => {
  if (input.hook_event_name === 'SubagentStart') {
    const hookInput = input as SubagentStartHookInput;
    console.log(`\n${c('cyan', '+')} Subagent started: ${hookInput.agent_type} (${hookInput.agent_id})`);
  } else if (input.hook_event_name === 'SubagentStop') {
    const hookInput = input as SubagentStopHookInput;
    console.log(`\n${c('green', '✓')} Subagent completed: ${hookInput.agent_id}`);
  }
  return {};
};
```

---

## 10. Interactive Mode in Flow

### Location: `src/ui/agent/flow.ts`

Update `executeAgent` (line 288) to support interactive mode:

```typescript
async function executeAgent(state: AgentFlowState): Promise<void> {
  // ... existing header code ...

  try {
    switch (state.mode) {
      // ... existing cases ...

      case 'custom': {
        const options: AgentOptions = {
          prompt: state.task!,
          model: state.model,
          permissionMode: state.permissionMode,
          enableThinking: state.enableThinking,
          verbose: state.verbose,
          interactive: true,  // Enable human-in-the-loop
          agents: OCTOCODE_SUBAGENTS,
          mcpServers: getOctocodeMCPConfig(),
          useClaudeCodePrompt: true,
          loadProjectSettings: true,
        };
        result = await runAgent(options);
        break;
      }
    }
  }
  // ... rest of function
}
```

---

## Summary of Files to Modify

| File | Changes |
|------|---------|
| `src/features/agent.ts` | Add `canUseTool` handler, delegate mode, update system prompt |
| `src/features/agent-hooks.ts` | Add `PermissionRequest` hook, subagent tracking |
| `src/types/agent.ts` | Add new types: `interactive`, `sandbox`, `plugins`, delegate mode |
| `src/ui/agent/flow.ts` | Enable interactive mode in flow |
| `src/ui/agent/prompts.ts` | Add delegate mode option |

---

## Implementation Priority

1. **HIGH**: Human-in-the-loop (`canUseTool`) - Core missing feature
2. **HIGH**: PermissionRequest hook - New SDK capability
3. **MEDIUM**: Delegate mode - Advanced orchestration pattern
4. **MEDIUM**: Subagent lifecycle hooks - Better observability
5. **LOW**: File checkpointing - Nice to have for undo
6. **LOW**: Sandbox support - Security enhancement
7. **LOW**: Plugin support - Extensibility
