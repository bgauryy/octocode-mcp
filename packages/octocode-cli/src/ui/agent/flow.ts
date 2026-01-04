/**
 * Agent Flow - Main agent orchestration
 *
 * Interactive flow for configuring and running agents.
 */

import { c, bold, dim } from '../../utils/colors.js';
import { loadInquirer, input } from '../../utils/prompts.js';
import { Spinner } from '../../utils/spinner.js';
import {
  promptAgentTask,
  classifyTask,
  getModeDisplayInfo,
  type AgentMode,
} from './prompts.js';
import { printAgentReadiness, printAgentResult } from './display.js';
import {
  checkAgentReadiness,
  runResearchAgent,
  runCodingAgent,
  runFullAgent,
  runPlanningAgent,
  runDelegateAgent,
  runInteractiveAgent,
} from '../../features/agent.js';
import type { AgentModel, AgentPermissionMode } from '../../types/agent.js';

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
 * Flow state for agent configuration
 */
interface AgentFlowState {
  mode: AgentMode | null;
  task: string | null;
  verbose: boolean;
}

/**
 * Flow step identifiers
 * Simplified flow: task → auto-detect → execute
 */
type FlowStep =
  | 'check-readiness'
  | 'enter-task' // Just get the task
  | 'execute' // Run immediately with auto-detected mode
  | 'done';

/**
 * Run the interactive agent flow
 */
export async function runAgentFlow(): Promise<void> {
  await loadInquirer();

  // Section header
  console.log();
  console.log(c('blue', '━'.repeat(66)));
  console.log(`  🤖 ${bold('Octocode Agent')}`);
  console.log(c('blue', '━'.repeat(66)));
  console.log();

  // Initialize state
  const state: AgentFlowState = {
    mode: null,
    task: null,
    verbose: true,
  };

  let currentStep: FlowStep = 'check-readiness';

  // Step-based flow with back navigation
  while (currentStep !== 'done') {
    switch (currentStep) {
      case 'check-readiness': {
        const spinner = new Spinner('Checking agent readiness...').start();
        const readiness = await checkAgentReadiness();
        spinner.stop();

        printAgentReadiness(readiness);

        if (!readiness.ready) {
          console.log();
          console.log(`  ${c('yellow', '⚠')} Agent is not ready.`);
          console.log();

          if (!readiness.sdkInstalled) {
            console.log(`  ${bold('To install Claude Agent SDK:')}`);
            console.log(
              `    ${c('cyan', '→')} npm install @anthropic-ai/claude-agent-sdk`
            );
            console.log();
          }

          if (!readiness.claudeCodeAuth && !readiness.hasAPIKey) {
            console.log(`  ${bold('To authenticate:')}`);
            console.log(`    ${c('cyan', '→')} Install Claude Code`);
            console.log(`    ${dim('or')}`);
            console.log(
              `    ${c('cyan', '→')} Set ANTHROPIC_API_KEY environment variable`
            );
            console.log();
          }

          await pressEnterToContinue();
          return;
        }

        // Smart flow: go to task first, then auto-detect mode
        currentStep = 'enter-task';
        break;
      }

      case 'enter-task': {
        const task = await promptAgentTask();
        if (task === null) {
          // User chose back - exit flow
          return;
        }
        state.task = task;

        // Auto-detect mode silently
        const { mode } = await classifyTask(task);
        state.mode = mode;

        // Show what we detected
        const modeInfo = getModeDisplayInfo(mode);
        console.log();
        console.log(
          `  ${c('green', '●')} Detected: ${modeInfo.icon} ${bold(modeInfo.name)}`
        );

        // Go directly to execution - no confirmation needed
        currentStep = 'execute';
        break;
      }

      case 'execute': {
        await executeAgent(state);
        currentStep = 'done';
        break;
      }
    }
  }
}

/**
 * Execute agent based on configured state
 */
async function executeAgent(state: AgentFlowState): Promise<void> {
  console.log();
  console.log(c('blue', '━'.repeat(66)));
  console.log(`  🚀 ${bold('Running Agent...')}`);
  console.log(c('blue', '━'.repeat(66)));
  console.log();

  // Don't use spinner in verbose mode - it overwrites tool execution logs
  const spinner = state.verbose
    ? null
    : new Spinner('Agent is working...').start();

  let result;

  try {
    // Use appropriate agent based on mode
    switch (state.mode) {
      case 'research':
        result = await runResearchAgent(state.task!, {
          verbose: state.verbose,
        });
        break;

      case 'planning':
        result = await runPlanningAgent(state.task!, {
          verbose: state.verbose,
        });
        break;

      case 'coding':
        result = await runCodingAgent(state.task!, {
          verbose: state.verbose,
        });
        break;

      case 'full':
        result = await runFullAgent(state.task!, {
          verbose: state.verbose,
        });
        break;

      case 'delegate':
        result = await runDelegateAgent(state.task!, {
          verbose: state.verbose,
        });
        break;

      case 'interactive':
        result = await runInteractiveAgent(state.task!, {
          verbose: state.verbose,
        });
        break;

      default:
        // Default to research mode
        result = await runResearchAgent(state.task!, {
          verbose: state.verbose,
        });
    }
  } catch (error) {
    result = {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  spinner?.stop();
  printAgentResult(result);

  await pressEnterToContinue();
}

/**
 * Quick agent run (non-interactive)
 */
export async function quickAgentRun(
  task: string,
  options: {
    mode?: AgentMode;
    model?: AgentModel;
    permissionMode?: AgentPermissionMode;
    enableThinking?: boolean;
    verbose?: boolean;
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

  console.log();
  console.log(`  ${bold('🤖 Running Agent')}`);
  console.log(`  ${dim('Mode:')} ${modeInfo.icon} ${modeInfo.name}`);
  console.log(
    `  ${dim('Task:')} ${task.slice(0, 50)}${task.length > 50 ? '...' : ''}`
  );
  console.log();

  // Don't use spinner in verbose mode - it overwrites tool execution logs
  const spinner = verbose ? null : new Spinner('Agent is working...').start();

  let result;

  try {
    // Use appropriate agent based on mode
    switch (mode) {
      case 'research':
        result = await runResearchAgent(task, { verbose });
        break;

      case 'planning':
        result = await runPlanningAgent(task, { verbose });
        break;

      case 'coding':
        result = await runCodingAgent(task, { verbose });
        break;

      case 'full':
        result = await runFullAgent(task, { verbose });
        break;

      case 'delegate':
        result = await runDelegateAgent(task, { verbose });
        break;

      case 'interactive':
        result = await runInteractiveAgent(task, { verbose });
        break;

      default:
        // Default to research
        result = await runResearchAgent(task, { verbose });
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
