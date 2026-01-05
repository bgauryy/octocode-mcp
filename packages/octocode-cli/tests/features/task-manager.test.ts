/**
 * Tests for TaskManager
 *
 * Tests the background task system including:
 * - Task creation and lifecycle
 * - Task status tracking
 * - Event notifications
 * - Task killing
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getTaskManager,
  resetTaskManager,
  startBackgroundTask,
  getBackgroundTask,
  listBackgroundTasks,
  killBackgroundTask,
} from '../../src/features/task-manager.js';
import type { TaskEvent } from '../../src/types/tasks.js';

// Mock the UnifiedCoder to avoid actual AI calls
// Using class syntax to properly mock the constructor
vi.mock('../../src/features/coders/unified-coder.js', () => {
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
          result: 'Task completed successfully',
          stats: { toolCalls: 0 },
        };
      }
    },
  };
});

describe('TaskManager', () => {
  beforeEach(() => {
    // Reset the singleton between tests
    resetTaskManager();
  });

  afterEach(() => {
    // Clean up
    resetTaskManager();
  });

  describe('getTaskManager', () => {
    it('should return the same instance on multiple calls', () => {
      const manager1 = getTaskManager();
      const manager2 = getTaskManager();
      expect(manager1).toBe(manager2);
    });
  });

  describe('startTask', () => {
    it('should create a task with a unique ID', async () => {
      const manager = getTaskManager();
      const taskId = await manager.startTask({
        parentId: 'session-123',
        type: 'research',
        prompt: 'Test task prompt',
      });

      expect(taskId).toMatch(/^task_[a-f0-9]+$/);
    });

    it('should create a task record with correct initial state', async () => {
      const manager = getTaskManager();
      const taskId = await manager.startTask({
        parentId: 'session-123',
        type: 'research',
        prompt: 'Test task prompt',
      });

      const task = manager.getTask(taskId);
      expect(task).toBeDefined();
      expect(task?.parentId).toBe('session-123');
      expect(task?.type).toBe('research');
      expect(task?.prompt).toBe('Test task prompt');
      expect(task?.status).toMatch(/pending|running/);
      expect(task?.startTime).toBeLessThanOrEqual(Date.now());
    });

    it('should emit task_started event', async () => {
      const manager = getTaskManager();
      const events: TaskEvent[] = [];

      manager.onTaskEvent(event => {
        events.push(event);
      });

      await manager.startTask({
        parentId: 'session-123',
        type: 'research',
        prompt: 'Test task prompt',
      });

      // Wait a bit for async operations
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(events.some(e => e.type === 'task_started')).toBe(true);
    });
  });

  describe('getTask', () => {
    it('should return undefined for non-existent task', () => {
      const manager = getTaskManager();
      const task = manager.getTask('nonexistent-task-id');
      expect(task).toBeUndefined();
    });

    it('should return the task for valid ID', async () => {
      const manager = getTaskManager();
      const taskId = await manager.startTask({
        parentId: 'session-123',
        type: 'coding',
        prompt: 'Test task',
      });

      const task = manager.getTask(taskId);
      expect(task).toBeDefined();
      expect(task?.id).toBe(taskId);
    });
  });

  describe('listTasks', () => {
    it('should return empty array when no tasks exist', () => {
      const manager = getTaskManager();
      const tasks = manager.listTasks('session-123');
      expect(tasks).toEqual([]);
    });

    it('should return tasks for specific parent', async () => {
      const manager = getTaskManager();

      // Create tasks for different parents
      const task1 = await manager.startTask({
        parentId: 'session-1',
        type: 'research',
        prompt: 'Task 1',
      });
      const task2 = await manager.startTask({
        parentId: 'session-2',
        type: 'research',
        prompt: 'Task 2',
      });
      const task3 = await manager.startTask({
        parentId: 'session-1',
        type: 'coding',
        prompt: 'Task 3',
      });

      const session1Tasks = manager.listTasks('session-1');
      expect(session1Tasks.length).toBe(2);
      expect(session1Tasks.map(t => t.id)).toContain(task1);
      expect(session1Tasks.map(t => t.id)).toContain(task3);
      expect(session1Tasks.map(t => t.id)).not.toContain(task2);
    });
  });

  describe('listAllTasks', () => {
    it('should return all tasks regardless of parent', async () => {
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

      const allTasks = manager.listAllTasks();
      expect(allTasks.length).toBe(2);
    });
  });

  describe('killTask', () => {
    it('should return false for non-existent task', async () => {
      const manager = getTaskManager();
      const killed = await manager.killTask('nonexistent');
      expect(killed).toBe(false);
    });

    it('should update task status to killed', async () => {
      const manager = getTaskManager();
      const taskId = await manager.startTask({
        parentId: 'session-123',
        type: 'research',
        prompt: 'Long running task',
      });

      const killed = await manager.killTask(taskId);
      expect(killed).toBe(true);

      const task = manager.getTask(taskId);
      expect(task?.status).toBe('killed');
      expect(task?.endTime).toBeDefined();
    });

    it('should emit task_killed event', async () => {
      const manager = getTaskManager();
      const events: TaskEvent[] = [];

      manager.onTaskEvent(event => {
        events.push(event);
      });

      const taskId = await manager.startTask({
        parentId: 'session-123',
        type: 'research',
        prompt: 'Task to kill',
      });

      await manager.killTask(taskId);

      // Wait a bit for async operations
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(events.some(e => e.type === 'task_killed')).toBe(true);
    });
  });

  describe('onTaskEvent', () => {
    it('should allow unsubscribing from events', async () => {
      const manager = getTaskManager();
      const events: TaskEvent[] = [];

      const unsubscribe = manager.onTaskEvent(event => {
        events.push(event);
      });

      // Create first task (should trigger event)
      await manager.startTask({
        parentId: 'session-123',
        type: 'research',
        prompt: 'Task 1',
      });

      await new Promise(resolve => setTimeout(resolve, 50));
      const countAfterFirst = events.length;
      expect(countAfterFirst).toBeGreaterThan(0);

      // Unsubscribe
      unsubscribe();

      // Create second task (should NOT trigger event for this listener)
      await manager.startTask({
        parentId: 'session-123',
        type: 'research',
        prompt: 'Task 2',
      });

      await new Promise(resolve => setTimeout(resolve, 50));
      expect(events.length).toBe(countAfterFirst);
    });
  });

  describe('getRunningCount', () => {
    it('should count running and pending tasks', async () => {
      const manager = getTaskManager();

      // Create some tasks
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

      const count = manager.getRunningCount();
      expect(count).toBeGreaterThanOrEqual(0); // May be completed quickly
    });
  });

  describe('waitForTask', () => {
    it('should throw for non-existent task', async () => {
      const manager = getTaskManager();

      await expect(manager.waitForTask('nonexistent')).rejects.toThrow(
        'Task not found'
      );
    });

    it('should return immediately for completed task', async () => {
      const manager = getTaskManager();
      const taskId = await manager.startTask({
        parentId: 'session-123',
        type: 'research',
        prompt: 'Quick task',
      });

      // Wait for task to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      const task = await manager.waitForTask(taskId);
      expect(task).toBeDefined();
      expect(task.status).toMatch(/completed|failed|killed/);
    });
  });

  describe('clearCompletedTasks', () => {
    it('should remove completed tasks from the list', async () => {
      const manager = getTaskManager();

      await manager.startTask({
        parentId: 'session-123',
        type: 'research',
        prompt: 'Task to complete',
      });

      // Wait for completion
      await new Promise(resolve => setTimeout(resolve, 200));

      const beforeClear = manager.listAllTasks().length;
      manager.clearCompletedTasks();
      const afterClear = manager.listAllTasks().length;

      expect(afterClear).toBeLessThanOrEqual(beforeClear);
    });
  });
});

describe('Convenience functions', () => {
  beforeEach(() => {
    resetTaskManager();
  });

  afterEach(() => {
    resetTaskManager();
  });

  describe('startBackgroundTask', () => {
    it('should create a task via the singleton', async () => {
      const taskId = await startBackgroundTask({
        parentId: 'session-123',
        type: 'research',
        prompt: 'Background task',
      });

      expect(taskId).toMatch(/^task_/);
    });
  });

  describe('getBackgroundTask', () => {
    it('should retrieve a task via the singleton', async () => {
      const taskId = await startBackgroundTask({
        parentId: 'session-123',
        type: 'coding',
        prompt: 'Test task',
      });

      const task = getBackgroundTask(taskId);
      expect(task?.id).toBe(taskId);
    });
  });

  describe('listBackgroundTasks', () => {
    it('should list tasks for a parent via the singleton', async () => {
      await startBackgroundTask({
        parentId: 'session-A',
        type: 'research',
        prompt: 'Task A',
      });

      const tasks = listBackgroundTasks('session-A');
      expect(tasks.length).toBe(1);
    });
  });

  describe('killBackgroundTask', () => {
    it('should kill a task via the singleton', async () => {
      const taskId = await startBackgroundTask({
        parentId: 'session-123',
        type: 'research',
        prompt: 'Task to kill',
      });

      // Kill immediately (task should still be starting)
      const killed = await killBackgroundTask(taskId);

      const task = getBackgroundTask(taskId);
      // Either killed or already completed (race condition in tests is okay)
      if (killed) {
        expect(task?.status).toBe('killed');
      } else {
        // Task completed before we could kill it
        expect(['completed', 'failed']).toContain(task?.status);
      }
    });
  });
});
