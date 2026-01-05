/**
 * Task Manager
 *
 * Centralized service for managing background task lifecycle.
 * Spawns sub-agents, tracks their status, and provides notifications.
 */

import { randomBytes } from 'crypto';
import { join } from 'path';
import { tmpdir } from 'os';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import type {
  BackgroundTask,
  TaskConfig,
  TaskEvent,
  TaskEventListener,
  ITaskManager,
} from '../types/tasks.js';
import { UnifiedCoder } from './coders/unified-coder.js';

// ============================================
// Task Manager Implementation
// ============================================

/**
 * Generate a unique task ID
 */
function generateTaskId(): string {
  return `task_${randomBytes(6).toString('hex')}`;
}

/**
 * Get transcript directory
 */
function getTranscriptDir(): string {
  return join(tmpdir(), 'octocode-tasks');
}

/**
 * TaskManager - manages background task lifecycle
 */
class TaskManager implements ITaskManager {
  private tasks: Map<string, BackgroundTask> = new Map();
  private listeners: Set<TaskEventListener> = new Set();
  private abortControllers: Map<string, AbortController> = new Map();
  private taskPromises: Map<string, Promise<void>> = new Map();

  /**
   * Start a new background task
   */
  async startTask(config: TaskConfig): Promise<string> {
    const taskId = generateTaskId();
    const transcriptDir = getTranscriptDir();

    // Ensure transcript directory exists
    if (!existsSync(transcriptDir)) {
      await mkdir(transcriptDir, { recursive: true });
    }

    const transcriptPath = join(transcriptDir, `${taskId}.log`);

    // Create task record
    const task: BackgroundTask = {
      id: taskId,
      parentId: config.parentId,
      type: config.type,
      status: 'pending',
      prompt: config.prompt,
      startTime: Date.now(),
      transcriptPath,
    };

    this.tasks.set(taskId, task);

    // Create abort controller for this task
    const abortController = new AbortController();
    this.abortControllers.set(taskId, abortController);

    // Start the task asynchronously
    const taskPromise = this.runTask(taskId, config, abortController.signal);
    this.taskPromises.set(taskId, taskPromise);

    // Emit started event
    this.emitEvent({
      type: 'task_started',
      taskId,
      parentId: config.parentId,
      timestamp: Date.now(),
    });

    return taskId;
  }

  /**
   * Run a task in the background
   */
  private async runTask(
    taskId: string,
    config: TaskConfig,
    _signal: AbortSignal
  ): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) return;

    // Update status to running
    task.status = 'running';
    this.tasks.set(taskId, task);

    try {
      // Create a coder for this task
      const coder = new UnifiedCoder(config.type, {
        cwd: config.cwd || process.cwd(),
        verbose: config.verbose ?? false,
        maxTurns: config.maxTurns,
      });

      // Run the coder
      const result = await coder.run(config.prompt);

      // Update task with result
      task.status = result.success ? 'completed' : 'failed';
      task.endTime = Date.now();

      if (result.success) {
        task.result = result.result;
        task.summary = this.generateSummary(result.result ?? '');
      } else {
        task.error = result.error;
      }

      this.tasks.set(taskId, task);

      // Write transcript
      await this.writeTranscript(task);

      // Emit completion event
      this.emitEvent({
        type: result.success ? 'task_completed' : 'task_failed',
        taskId,
        parentId: task.parentId,
        timestamp: Date.now(),
        data: result.success
          ? { result: task.result, message: task.summary }
          : { error: task.error },
      });
    } catch (error) {
      // Handle unexpected errors
      task.status = 'failed';
      task.endTime = Date.now();
      task.error = error instanceof Error ? error.message : String(error);
      this.tasks.set(taskId, task);

      await this.writeTranscript(task);

      this.emitEvent({
        type: 'task_failed',
        taskId,
        parentId: task.parentId,
        timestamp: Date.now(),
        data: { error: task.error },
      });
    } finally {
      // Cleanup
      this.abortControllers.delete(taskId);
      this.taskPromises.delete(taskId);
    }
  }

  /**
   * Generate a short summary from the result
   */
  private generateSummary(result: string): string {
    // Take first 200 chars, cut at last sentence or newline
    const truncated = result.slice(0, 200);
    const lastSentence = truncated.lastIndexOf('.');
    const lastNewline = truncated.lastIndexOf('\n');
    const cutPoint = Math.max(lastSentence, lastNewline);

    if (cutPoint > 50) {
      return truncated.slice(0, cutPoint + 1).trim();
    }
    return truncated.trim() + (result.length > 200 ? '...' : '');
  }

  /**
   * Write task transcript to file
   */
  private async writeTranscript(task: BackgroundTask): Promise<void> {
    const content = [
      `Task ID: ${task.id}`,
      `Parent ID: ${task.parentId}`,
      `Type: ${task.type}`,
      `Status: ${task.status}`,
      `Started: ${new Date(task.startTime).toISOString()}`,
      task.endTime ? `Ended: ${new Date(task.endTime).toISOString()}` : '',
      `Duration: ${task.endTime ? (task.endTime - task.startTime) / 1000 : 0}s`,
      '',
      '=== Prompt ===',
      task.prompt,
      '',
      '=== Result ===',
      task.result ?? task.error ?? 'No result',
    ]
      .filter(Boolean)
      .join('\n');

    await writeFile(task.transcriptPath, content, 'utf-8');
  }

  /**
   * Get a task by ID
   */
  getTask(taskId: string): BackgroundTask | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * List all tasks for a parent session
   */
  listTasks(parentId: string): BackgroundTask[] {
    return Array.from(this.tasks.values()).filter(
      task => task.parentId === parentId
    );
  }

  /**
   * List all tasks (regardless of parent)
   */
  listAllTasks(): BackgroundTask[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Kill a running task
   */
  async killTask(taskId: string): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    if (task.status !== 'running' && task.status !== 'pending') {
      return false;
    }

    // Abort the task
    const controller = this.abortControllers.get(taskId);
    if (controller) {
      controller.abort();
    }

    // Update status
    task.status = 'killed';
    task.endTime = Date.now();
    this.tasks.set(taskId, task);

    await this.writeTranscript(task);

    // Emit killed event
    this.emitEvent({
      type: 'task_killed',
      taskId,
      parentId: task.parentId,
      timestamp: Date.now(),
    });

    return true;
  }

  /**
   * Wait for a task to complete
   */
  async waitForTask(
    taskId: string,
    timeoutMs: number = 300000
  ): Promise<BackgroundTask> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    // If already completed, return immediately
    if (
      task.status === 'completed' ||
      task.status === 'failed' ||
      task.status === 'killed'
    ) {
      return task;
    }

    // Wait for the task promise or timeout
    const taskPromise = this.taskPromises.get(taskId);
    if (!taskPromise) {
      // Task is in a weird state, return current state
      return task;
    }

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error(`Task timed out after ${timeoutMs}ms`)),
        timeoutMs
      );
    });

    await Promise.race([taskPromise, timeoutPromise]);

    // Return updated task
    return this.tasks.get(taskId) ?? task;
  }

  /**
   * Subscribe to task events
   */
  onTaskEvent(listener: TaskEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Emit a task event to all listeners
   */
  private emitEvent(event: TaskEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Ignore listener errors
      }
    }
  }

  /**
   * Get running task count
   */
  getRunningCount(): number {
    return Array.from(this.tasks.values()).filter(
      t => t.status === 'running' || t.status === 'pending'
    ).length;
  }

  /**
   * Clear completed tasks
   */
  clearCompletedTasks(): void {
    for (const [id, task] of this.tasks.entries()) {
      if (
        task.status === 'completed' ||
        task.status === 'failed' ||
        task.status === 'killed'
      ) {
        this.tasks.delete(id);
      }
    }
  }
}

// ============================================
// Singleton Instance
// ============================================

let taskManagerInstance: TaskManager | null = null;

/**
 * Get the singleton task manager instance
 */
export function getTaskManager(): TaskManager {
  if (!taskManagerInstance) {
    taskManagerInstance = new TaskManager();
  }
  return taskManagerInstance;
}

/**
 * Reset the task manager (for testing)
 */
export function resetTaskManager(): void {
  taskManagerInstance = null;
}

// ============================================
// Convenience Functions
// ============================================

/**
 * Start a background task
 */
export async function startBackgroundTask(config: TaskConfig): Promise<string> {
  return getTaskManager().startTask(config);
}

/**
 * Get a background task by ID
 */
export function getBackgroundTask(taskId: string): BackgroundTask | undefined {
  return getTaskManager().getTask(taskId);
}

/**
 * List background tasks for a session
 */
export function listBackgroundTasks(parentId: string): BackgroundTask[] {
  return getTaskManager().listTasks(parentId);
}

/**
 * Kill a background task
 */
export async function killBackgroundTask(taskId: string): Promise<boolean> {
  return getTaskManager().killTask(taskId);
}

/**
 * Wait for a background task to complete
 */
export async function waitForBackgroundTask(
  taskId: string,
  timeoutMs?: number
): Promise<BackgroundTask> {
  return getTaskManager().waitForTask(taskId, timeoutMs);
}

// Export types
export type { TaskManager };
