/**
 * Agent Flow - Main agent orchestration
 *
 * Interactive flow for configuring and running agents.
 * Now uses Ink-based UI for rich terminal experience.
 * Opens the UI immediately - task input is within the UI.
 */

import { c, bold, dim } from '../../utils/colors.js';
import { input } from '../../utils/prompts.js';
import { Spinner } from '../../utils/spinner.js';
import { classifyTask, getModeDisplayInfo, type AgentMode } from './prompts.js';
import { printAgentResult } from './display.js';
import {
  getOctocodeMCPConfig,
  OCTOCODE_SUBAGENTS,
} from '../../features/agent.js';
import type {
  AgentModel,
  AgentPermissionMode,
  AgentTool,
} from '../../types/agent.js';
import { getCurrentDefaultModel } from '../ai-providers/index.js';
import { type ModelId } from '../../features/providers/index.js';
import { runAgentUI } from '../agent-ink/index.js';

/**
 * Wait for user to press enter
 */
async function pressEnterToContinue(): Promise<void> {
  console.log();
  await input({
    message: dim('Press Enter to continue...'),
    default: '',
  });
}

/**
 * Run the interactive agent flow
 *
 * Opens the agent UI immediately - the user enters their task within the UI.
 * This provides a smoother UX than prompting before showing the interface.
 */
export async function runAgentFlow(): Promise<void> {
  // Get current model for the UI
  const currentModel = getCurrentDefaultModel();

  // Run the agent UI directly - it will prompt for task within the interface
  // Note: AgentView displays results inline - we skip printAgentResult to avoid duplication
  await runAgentUI({
    model: currentModel || undefined,
    uiConfig: {
      verbose: true,
      showToolCalls: true,
      showThinking: true,
    },
  });

  // Result is already displayed in the UI - just wait for user acknowledgment
  await pressEnterToContinue();
}

/**
 * Get agent options based on mode
 */
function getAgentOptionsForMode(
  mode: AgentMode,
  verbose: boolean
): Record<string, unknown> {
  const mcpServers = getOctocodeMCPConfig();

  const RESEARCH_TOOLS: AgentTool[] = [
    'Read',
    'Glob',
    'Grep',
    'WebSearch',
    'WebFetch',
    'Task',
    'ListMcpResources',
    'ReadMcpResource',
  ];

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

  switch (mode) {
    case 'research':
      return {
        tools: RESEARCH_TOOLS,
        agents: { researcher: OCTOCODE_SUBAGENTS.researcher },
        mcpServers,
        loadProjectSettings: true,
        verbose,
      };

    case 'planning':
      return {
        tools: RESEARCH_TOOLS,
        mcpServers,
        permissionMode: 'plan',
        loadProjectSettings: true,
        enableThinking: true,
        verbose,
      };

    case 'coding':
      return {
        tools: CODING_TOOLS,
        agents: {
          codeReviewer: OCTOCODE_SUBAGENTS.codeReviewer,
          testRunner: OCTOCODE_SUBAGENTS.testRunner,
        },
        useClaudeCodePrompt: true,
        loadProjectSettings: true,
        verbose,
      };

    case 'full':
      return {
        tools: ALL_TOOLS,
        agents: OCTOCODE_SUBAGENTS,
        mcpServers,
        useClaudeCodePrompt: true,
        loadProjectSettings: true,
        enableThinking: true,
        verbose,
      };

    case 'delegate':
      return {
        tools: ['Task', 'TodoWrite'] as AgentTool[],
        agents: OCTOCODE_SUBAGENTS,
        mcpServers,
        permissionMode: 'delegate',
        loadProjectSettings: true,
        enableThinking: true,
        verbose,
      };

    case 'interactive':
      return {
        tools: ALL_TOOLS,
        agents: OCTOCODE_SUBAGENTS,
        mcpServers,
        useClaudeCodePrompt: true,
        loadProjectSettings: true,
        enableThinking: true,
        interactive: true,
        verbose,
      };

    default:
      return {
        tools: RESEARCH_TOOLS,
        agents: { researcher: OCTOCODE_SUBAGENTS.researcher },
        mcpServers,
        loadProjectSettings: true,
        verbose,
      };
  }
}

/**
 * Quick agent run (non-interactive) with Ink UI
 */
export async function quickAgentRun(
  task: string,
  options: {
    mode?: AgentMode;
    model?: AgentModel | ModelId;
    permissionMode?: AgentPermissionMode;
    enableThinking?: boolean;
    verbose?: boolean;
    persistSession?: boolean;
    resumeSession?: string;
    useInkUI?: boolean;
  } = {}
): Promise<void> {
  // Auto-detect mode if not specified
  let mode = options.mode;

  if (!mode) {
    const classification = await classifyTask(task);
    mode = classification.mode;
  }

  const modeInfo = getModeDisplayInfo(mode);
  const verbose = options.verbose ?? true;
  const currentModel = options.model ?? getCurrentDefaultModel();
  const useInkUI = options.useInkUI ?? true; // Default to Ink UI

  // Use Ink UI for rich terminal experience
  if (useInkUI) {
    const agentOptions = getAgentOptionsForMode(mode, verbose);

    // Add session options
    if (options.persistSession) {
      (agentOptions as Record<string, unknown>).persistSession = true;
    }
    if (options.resumeSession) {
      (agentOptions as Record<string, unknown>).resumeSession =
        options.resumeSession;
    }
    if (options.enableThinking) {
      (agentOptions as Record<string, unknown>).enableThinking = true;
    }
    if (options.permissionMode) {
      (agentOptions as Record<string, unknown>).permissionMode =
        options.permissionMode;
    }

    // Result is displayed inline in AgentView - no need to call printAgentResult
    await runAgentUI({
      task,
      mode,
      model: currentModel || undefined,
      agentOptions,
      uiConfig: {
        verbose,
        showToolCalls: true,
        showThinking: true,
      },
    });

    // Result already displayed in UI
    return;
  }

  // Fallback to simple console output (legacy mode)
  console.log();
  console.log(`  ${bold('🤖 Running Agent')}`);
  console.log(`  ${dim('Mode:')} ${modeInfo.icon} ${modeInfo.name}`);
  if (currentModel) {
    console.log(`  ${dim('Model:')} ${c('cyan', String(currentModel))}`);
  }
  console.log(
    `  ${dim('Task:')} ${task.slice(0, 50)}${task.length > 50 ? '...' : ''}`
  );
  console.log();

  // Don't use spinner in verbose mode - it overwrites tool execution logs
  const spinner = verbose ? null : new Spinner('Agent is working...').start();

  // Import agent functions for legacy mode
  const {
    runResearchAgent,
    runCodingAgent,
    runFullAgent,
    runPlanningAgent,
    runDelegateAgent,
    runInteractiveAgent,
  } = await import('../../features/agent.js');

  // Build agent options with session support
  const legacyOptions = {
    verbose,
    persistSession: options.persistSession,
    resumeSession: options.resumeSession,
  };

  let result;

  try {
    // Use appropriate agent based on mode
    switch (mode) {
      case 'research':
        result = await runResearchAgent(task, legacyOptions);
        break;

      case 'planning':
        result = await runPlanningAgent(task, legacyOptions);
        break;

      case 'coding':
        result = await runCodingAgent(task, legacyOptions);
        break;

      case 'full':
        result = await runFullAgent(task, legacyOptions);
        break;

      case 'delegate':
        result = await runDelegateAgent(task, legacyOptions);
        break;

      case 'interactive':
        result = await runInteractiveAgent(task, legacyOptions);
        break;

      default:
        // Default to research
        result = await runResearchAgent(task, legacyOptions);
    }
  } catch (error) {
    result = {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  spinner?.stop();
  printAgentResult(result);
}
