/**
 * Tests for Task Tools
 *
 * Tests the background task tools including:
 * - TaskOutput tool
 * - TaskList tool
 * - TaskKill tool
 * - Agent tool with background support
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  taskOutputTool,
  taskListTool,
  taskKillTool,
  agentTool,
} from '../../../src/features/tools/task-tools.js';
import {
  getTaskManager,
  resetTaskManager,
} from '../../../src/features/task-manager.js';

// Mock the UnifiedCoder to avoid actual AI calls
// Using class syntax to properly mock the constructor
vi.mock('../../../src/features/coders/unified-coder.js', () => {
  return {
    UnifiedCoder: class MockUnifiedCoder {
      constructor() {
        // Mock constructor
      }
      async run() {
        // Add a small delay so we can test running/pending states
        await new Promise(resolve => setTimeout(resolve, 50));
        return {
          success: true,
          result: 'Mock task result',
          stats: { toolCalls: 2 },
        };
      }
    },
  };
});

describe('TaskOutput Tool', () => {
  beforeEach(() => {
    resetTaskManager();
  });

  afterEach(() => {
    resetTaskManager();
  });

  it('should return error for non-existent task', async () => {
    const result = await taskOutputTool.execute(
      {
        task_id: 'nonexistent-task',
        block: false,
        timeout: 1000,
      },
      {
        toolCallId: 'test',
        messages: [],
        abortSignal: new AbortController().signal,
      }
    );

    const parsed = JSON.parse(result as string);
    expect(parsed.error).toContain('Task not found');
    expect(parsed.found).toBe(false);
  });

  it('should return task status for existing task', async () => {
    const manager = getTaskManager();
    const taskId = await manager.startTask({
      parentId: 'session-123',
      type: 'research',
      prompt: 'Test task',
    });

    // Wait for task to initialize
    await new Promise(resolve => setTimeout(resolve, 50));

    const result = await taskOutputTool.execute(
      {
        task_id: taskId,
        block: false,
        timeout: 1000,
      },
      {
        toolCallId: 'test',
        messages: [],
        abortSignal: new AbortController().signal,
      }
    );

    const parsed = JSON.parse(result as string);
    expect(parsed.task_id).toBe(taskId);
    expect(parsed.status).toBeDefined();
    expect(parsed.type).toBe('research');
  });

  it('should wait for completion when block=true', async () => {
    const manager = getTaskManager();
    const taskId = await manager.startTask({
      parentId: 'session-123',
      type: 'research',
      prompt: 'Quick test task',
    });

    const result = await taskOutputTool.execute(
      {
        task_id: taskId,
        block: true,
        timeout: 5000,
      },
      {
        toolCallId: 'test',
        messages: [],
        abortSignal: new AbortController().signal,
      }
    );

    const parsed = JSON.parse(result as string);
    expect(parsed.task_id).toBe(taskId);
    // Status should be final (completed/failed/killed)
    expect(['completed', 'failed', 'killed']).toContain(parsed.status);
  });
});

describe('TaskList Tool', () => {
  beforeEach(() => {
    resetTaskManager();
  });

  afterEach(() => {
    resetTaskManager();
  });

  it('should return empty list when no tasks exist', async () => {
    const result = await taskListTool.execute(
      {
        include_completed: true,
      },
      {
        toolCallId: 'test',
        messages: [],
        abortSignal: new AbortController().signal,
      }
    );

    const parsed = JSON.parse(result as string);
    expect(parsed.total).toBe(0);
    expect(parsed.tasks).toEqual([]);
  });

  it('should list all tasks', async () => {
    const manager = getTaskManager();
    await manager.startTask({
      parentId: 'session-1',
      type: 'research',
      prompt: 'Task 1',
    });
    await manager.startTask({
      parentId: 'session-2',
      type: 'coding',
      prompt: 'Task 2',
    });

    // Wait for tasks to initialize
    await new Promise(resolve => setTimeout(resolve, 50));

    const result = await taskListTool.execute(
      {
        include_completed: true,
      },
      {
        toolCallId: 'test',
        messages: [],
        abortSignal: new AbortController().signal,
      }
    );

    const parsed = JSON.parse(result as string);
    expect(parsed.total).toBe(2);
    expect(parsed.tasks.length).toBe(2);
  });

  it('should filter by status', async () => {
    const manager = getTaskManager();
    const taskId = await manager.startTask({
      parentId: 'session-1',
      type: 'research',
      prompt: 'Task to kill',
    });

    await manager.killTask(taskId);

    const result = await taskListTool.execute(
      {
        status: 'killed',
        include_completed: true,
      },
      {
        toolCallId: 'test',
        messages: [],
        abortSignal: new AbortController().signal,
      }
    );

    const parsed = JSON.parse(result as string);
    expect(
      parsed.tasks.every((t: { status: string }) => t.status === 'killed')
    ).toBe(true);
  });
});

describe('TaskKill Tool', () => {
  beforeEach(() => {
    resetTaskManager();
  });

  afterEach(() => {
    resetTaskManager();
  });

  it('should return error for non-existent task', async () => {
    const result = await taskKillTool.execute(
      {
        task_id: 'nonexistent',
      },
      {
        toolCallId: 'test',
        messages: [],
        abortSignal: new AbortController().signal,
      }
    );

    const parsed = JSON.parse(result as string);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('Task not found');
  });

  it('should kill a running task', async () => {
    const manager = getTaskManager();
    const taskId = await manager.startTask({
      parentId: 'session-123',
      type: 'research',
      prompt: 'Long running task',
    });

    const result = await taskKillTool.execute(
      {
        task_id: taskId,
      },
      {
        toolCallId: 'test',
        messages: [],
        abortSignal: new AbortController().signal,
      }
    );

    const parsed = JSON.parse(result as string);
    // Either killed or task completed before we could kill it (race condition)
    if (parsed.success) {
      expect(parsed.task_id).toBe(taskId);
    } else {
      // Task may have already completed
      expect(parsed.error).toMatch(/not running|Task not found/);
    }
  });
});

describe('Agent Tool', () => {
  beforeEach(() => {
    resetTaskManager();
  });

  afterEach(() => {
    resetTaskManager();
  });

  it('should run task synchronously when run_in_background=false', async () => {
    const result = await agentTool.execute(
      {
        subagent_type: 'research',
        prompt: 'Research the codebase',
        run_in_background: false,
      },
      {
        toolCallId: 'test',
        messages: [],
        abortSignal: new AbortController().signal,
      }
    );

    const parsed = JSON.parse(result as string);
    expect(parsed.background).toBe(false);
    expect(parsed.success).toBe(true);
    expect(parsed.result).toBe('Mock task result');
  });

  it('should return task_id when run_in_background=true', async () => {
    const result = await agentTool.execute(
      {
        subagent_type: 'research',
        prompt: 'Long research task',
        run_in_background: true,
      },
      {
        toolCallId: 'test',
        messages: [],
        abortSignal: new AbortController().signal,
      }
    );

    const parsed = JSON.parse(result as string);
    expect(parsed.background).toBe(true);
    expect(parsed.task_id).toMatch(/^task_/);
    expect(parsed.message).toContain('Started background task');
  });

  it('should support all subagent types', async () => {
    const types = ['research', 'coding', 'full', 'planning'] as const;

    for (const type of types) {
      const result = await agentTool.execute(
        {
          subagent_type: type,
          prompt: `Test ${type} task`,
          run_in_background: false,
        },
        {
          toolCallId: 'test',
          messages: [],
          abortSignal: new AbortController().signal,
        }
      );

      const parsed = JSON.parse(result as string);
      expect(parsed.success).toBe(true);
    }
  });
});

describe('Tool Integration', () => {
  beforeEach(() => {
    resetTaskManager();
  });

  afterEach(() => {
    resetTaskManager();
  });

  it('should spawn background task and retrieve output', async () => {
    // Step 1: Start a background task
    const startResult = await agentTool.execute(
      {
        subagent_type: 'research',
        prompt: 'Research task for integration test',
        run_in_background: true,
      },
      {
        toolCallId: 'test',
        messages: [],
        abortSignal: new AbortController().signal,
      }
    );

    const startParsed = JSON.parse(startResult as string);
    const taskId = startParsed.task_id;

    // Step 2: Wait a bit and get the output
    await new Promise(resolve => setTimeout(resolve, 100));

    const outputResult = await taskOutputTool.execute(
      {
        task_id: taskId,
        block: true,
        timeout: 5000,
      },
      {
        toolCallId: 'test',
        messages: [],
        abortSignal: new AbortController().signal,
      }
    );

    const outputParsed = JSON.parse(outputResult as string);
    expect(outputParsed.task_id).toBe(taskId);
    expect(['completed', 'failed', 'killed']).toContain(outputParsed.status);
  });

  it('should list, check, and kill a background task', async () => {
    // Start a task
    const startResult = await agentTool.execute(
      {
        subagent_type: 'coding',
        prompt: 'Long coding task',
        run_in_background: true,
      },
      {
        toolCallId: 'test',
        messages: [],
        abortSignal: new AbortController().signal,
      }
    );

    const startParsed = JSON.parse(startResult as string);
    const taskId = startParsed.task_id;

    // List tasks - should include our task
    const listResult = await taskListTool.execute(
      {
        include_completed: true,
      },
      {
        toolCallId: 'test',
        messages: [],
        abortSignal: new AbortController().signal,
      }
    );

    const listParsed = JSON.parse(listResult as string);
    expect(
      listParsed.tasks.some((t: { task_id: string }) => t.task_id === taskId)
    ).toBe(true);

    // Kill the task
    const killResult = await taskKillTool.execute(
      {
        task_id: taskId,
      },
      {
        toolCallId: 'test',
        messages: [],
        abortSignal: new AbortController().signal,
      }
    );

    // Parse kill result to verify it ran (not used further)
    JSON.parse(killResult as string);

    // Verify final state (either killed or completed)
    const verifyResult = await taskOutputTool.execute(
      {
        task_id: taskId,
        block: false,
        timeout: 1000,
      },
      {
        toolCallId: 'test',
        messages: [],
        abortSignal: new AbortController().signal,
      }
    );

    const verifyParsed = JSON.parse(verifyResult as string);
    // Task should be in a final state
    expect(['killed', 'completed', 'failed']).toContain(verifyParsed.status);
  });
});
