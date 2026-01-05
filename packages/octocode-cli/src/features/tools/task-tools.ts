/**
 * Task Tools
 *
 * Tools for managing background tasks in the agent system.
 * Allows agents to check on, wait for, and manage background tasks.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { getTaskManager, startBackgroundTask } from '../task-manager.js';
import { getCurrentSessionId } from '../session-context.js';
import type { CoderMode } from '../coders/types.js';

// ============================================
// Task Output Tool
// ============================================

/**
 * TaskOutput tool - Get the output or status of a background task
 */
export const taskOutputTool = tool({
  description: `Get the output or status of a background task. Use this to check on tasks started with run_in_background=true. Can optionally block/wait for the task to complete.`,
  parameters: z.object({
    task_id: z.string().describe('The ID of the task to query'),
    block: z
      .boolean()
      .optional()
      .default(false)
      .describe('Wait for the task to complete before returning'),
    timeout: z
      .number()
      .optional()
      .default(300000)
      .describe('Timeout in milliseconds if blocking (default: 5 minutes)'),
  }),
  execute: async ({ task_id, block, timeout }) => {
    const manager = getTaskManager();
    let task = manager.getTask(task_id);

    if (!task) {
      return JSON.stringify({
        error: `Task not found: ${task_id}`,
        found: false,
      });
    }

    // If blocking and task is still running, wait for it
    if (block && (task.status === 'pending' || task.status === 'running')) {
      try {
        task = await manager.waitForTask(task_id, timeout);
      } catch (error) {
        return JSON.stringify({
          task_id,
          status: 'timeout',
          error: error instanceof Error ? error.message : String(error),
          partial_result: task.result,
        });
      }
    }

    // Format the response
    const response: Record<string, unknown> = {
      task_id: task.id,
      status: task.status,
      type: task.type,
      started: new Date(task.startTime).toISOString(),
    };

    if (task.endTime) {
      response.ended = new Date(task.endTime).toISOString();
      response.duration_ms = task.endTime - task.startTime;
    }

    if (task.status === 'completed') {
      response.summary = task.summary;
      response.result = task.result;
    } else if (task.status === 'failed') {
      response.error = task.error;
    } else if (task.status === 'running' || task.status === 'pending') {
      response.elapsed_ms = Date.now() - task.startTime;
    }

    response.transcript_path = task.transcriptPath;

    return JSON.stringify(response, null, 2);
  },
});

// ============================================
// Task List Tool
// ============================================

/**
 * TaskList tool - List all background tasks
 */
export const taskListTool = tool({
  description: `List all background tasks, optionally filtered by status. Use this to see what tasks are running or have completed.`,
  parameters: z.object({
    status: z
      .enum(['pending', 'running', 'completed', 'failed', 'killed'])
      .optional()
      .describe('Filter by task status'),
    include_completed: z
      .boolean()
      .optional()
      .default(true)
      .describe('Include completed/failed/killed tasks in the list'),
  }),
  execute: async ({ status, include_completed }) => {
    const manager = getTaskManager();
    let tasks = manager.listAllTasks();

    // Filter by status if specified
    if (status) {
      tasks = tasks.filter(t => t.status === status);
    } else if (!include_completed) {
      tasks = tasks.filter(
        t => t.status === 'pending' || t.status === 'running'
      );
    }

    // Sort by start time (newest first)
    tasks.sort((a, b) => b.startTime - a.startTime);

    // Format the response
    const formatted = tasks.map(task => ({
      task_id: task.id,
      type: task.type,
      status: task.status,
      prompt_preview:
        task.prompt.slice(0, 100) + (task.prompt.length > 100 ? '...' : ''),
      started: new Date(task.startTime).toISOString(),
      duration_ms: task.endTime
        ? task.endTime - task.startTime
        : Date.now() - task.startTime,
      summary: task.summary,
      error: task.error,
    }));

    return JSON.stringify(
      {
        total: formatted.length,
        running: tasks.filter(
          t => t.status === 'pending' || t.status === 'running'
        ).length,
        tasks: formatted,
      },
      null,
      2
    );
  },
});

// ============================================
// Task Kill Tool
// ============================================

/**
 * TaskKill tool - Kill a running background task
 */
export const taskKillTool = tool({
  description: `Kill a running background task. Use this to stop a task that is no longer needed or is taking too long.`,
  parameters: z.object({
    task_id: z.string().describe('The ID of the task to kill'),
  }),
  execute: async ({ task_id }) => {
    const manager = getTaskManager();
    const task = manager.getTask(task_id);

    if (!task) {
      return JSON.stringify({
        success: false,
        error: `Task not found: ${task_id}`,
      });
    }

    if (task.status !== 'pending' && task.status !== 'running') {
      return JSON.stringify({
        success: false,
        error: `Task ${task_id} is not running (status: ${task.status})`,
      });
    }

    const killed = await manager.killTask(task_id);

    return JSON.stringify({
      success: killed,
      task_id,
      message: killed
        ? `Task ${task_id} has been killed`
        : `Failed to kill task ${task_id}`,
    });
  },
});

// ============================================
// Agent Tool (with background support)
// ============================================

/**
 * Agent tool - Spawn a subagent to handle a task
 *
 * Supports running in background mode for long-running tasks.
 */
export const agentTool = tool({
  description: `Spawn a subagent to handle a specific task. Use subagent_type to specify the agent mode:
- "research": Read-only exploration and analysis
- "coding": File editing and shell commands
- "full": All capabilities enabled
- "planning": Create detailed implementation plans

Set run_in_background=true for long-running tasks (like "run all tests", "research entire directory"). The tool will return a task_id that you can use with TaskOutput to check results later.`,
  parameters: z.object({
    subagent_type: z
      .enum(['research', 'coding', 'full', 'planning'])
      .describe('The type of subagent to spawn'),
    prompt: z.string().describe('The task/instructions for the subagent'),
    run_in_background: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        'Run the task in the background (returns immediately with task_id)'
      ),
  }),
  execute: async (
    { subagent_type, prompt, run_in_background },
    { abortSignal: _abortSignal }
  ) => {
    // For background tasks, start and return immediately
    if (run_in_background) {
      const taskId = await startBackgroundTask({
        parentId: getCurrentSessionId(),
        type: subagent_type as CoderMode,
        prompt,
        cwd: process.cwd(),
        verbose: false,
      });

      return JSON.stringify({
        background: true,
        task_id: taskId,
        message: `Started background task ${taskId}. Use TaskOutput tool with this task_id to check results.`,
      });
    }

    // For foreground tasks, run synchronously
    const { UnifiedCoder } = await import('../coders/unified-coder.js');
    const coder = new UnifiedCoder(subagent_type as CoderMode, {
      cwd: process.cwd(),
      verbose: false,
    });

    const result = await coder.run(prompt);

    if (result.success) {
      return JSON.stringify({
        background: false,
        success: true,
        result: result.result,
        stats: result.stats,
      });
    } else {
      return JSON.stringify({
        background: false,
        success: false,
        error: result.error,
      });
    }
  },
});

// ============================================
// Tool Collection Export
// ============================================

/**
 * Task tools collection
 */
export const taskTools = {
  TaskOutput: taskOutputTool,
  TaskList: taskListTool,
  TaskKill: taskKillTool,
  Agent: agentTool,
};
