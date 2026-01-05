/**
 * useBackgroundTasks Hook
 *
 * React hook for subscribing to background task updates in the UI.
 * Provides real-time task status updates for the AgentView.
 */

import { useState, useEffect, useCallback } from 'react';
import { getTaskManager } from '../../features/task-manager.js';
import type { BackgroundTask, TaskEvent } from '../../types/tasks.js';
import type { BackgroundTaskInfo } from './types.js';

/**
 * Convert internal BackgroundTask to UI-friendly BackgroundTaskInfo
 */
function toTaskInfo(task: BackgroundTask): BackgroundTaskInfo {
  return {
    id: task.id,
    type: task.type,
    status: task.status,
    promptPreview:
      task.prompt.length > 100
        ? task.prompt.slice(0, 100) + '...'
        : task.prompt,
    startTime: task.startTime,
    endTime: task.endTime,
    summary: task.summary,
    error: task.error,
  };
}

/**
 * Hook to subscribe to background task updates
 *
 * @param parentId - Filter tasks by parent session ID (optional)
 * @returns Object with tasks array and helper functions
 */
export function useBackgroundTasks(parentId?: string): {
  tasks: BackgroundTaskInfo[];
  runningCount: number;
  refresh: () => void;
} {
  const [tasks, setTasks] = useState<BackgroundTaskInfo[]>([]);

  // Refresh task list from manager
  const refresh = useCallback(() => {
    const manager = getTaskManager();
    const allTasks = parentId
      ? manager.listTasks(parentId)
      : manager.listAllTasks();
    setTasks(allTasks.map(toTaskInfo));
  }, [parentId]);

  // Subscribe to task events
  useEffect(() => {
    const manager = getTaskManager();

    // Initial load
    refresh();

    // Subscribe to updates
    const unsubscribe = manager.onTaskEvent((event: TaskEvent) => {
      // Only update if event matches our filter
      if (!parentId || event.parentId === parentId) {
        refresh();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [parentId, refresh]);

  // Calculate running count
  const runningCount = tasks.filter(
    t => t.status === 'running' || t.status === 'pending'
  ).length;

  return { tasks, runningCount, refresh };
}

/**
 * Hook to get a single task's status with live updates
 */
export function useTaskStatus(taskId: string): {
  task: BackgroundTaskInfo | null;
  isRunning: boolean;
  isComplete: boolean;
  refresh: () => void;
} {
  const [task, setTask] = useState<BackgroundTaskInfo | null>(null);

  const refresh = useCallback(() => {
    const manager = getTaskManager();
    const t = manager.getTask(taskId);
    setTask(t ? toTaskInfo(t) : null);
  }, [taskId]);

  useEffect(() => {
    const manager = getTaskManager();

    // Initial load
    refresh();

    // Subscribe to updates for this task
    const unsubscribe = manager.onTaskEvent((event: TaskEvent) => {
      if (event.taskId === taskId) {
        refresh();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [taskId, refresh]);

  const isRunning = task?.status === 'running' || task?.status === 'pending';
  const isComplete =
    task?.status === 'completed' ||
    task?.status === 'failed' ||
    task?.status === 'killed';

  return { task, isRunning, isComplete, refresh };
}

/**
 * Hook to receive task completion notifications
 *
 * Calls the callback when any task (or a specific task) completes.
 */
export function useTaskNotification(
  callback: (event: TaskEvent) => void,
  options?: {
    taskId?: string;
    parentId?: string;
    eventTypes?: TaskEvent['type'][];
  }
): void {
  useEffect(() => {
    const manager = getTaskManager();

    const unsubscribe = manager.onTaskEvent((event: TaskEvent) => {
      // Filter by taskId if specified
      if (options?.taskId && event.taskId !== options.taskId) {
        return;
      }

      // Filter by parentId if specified
      if (options?.parentId && event.parentId !== options.parentId) {
        return;
      }

      // Filter by event type if specified
      if (options?.eventTypes && !options.eventTypes.includes(event.type)) {
        return;
      }

      callback(event);
    });

    return () => {
      unsubscribe();
    };
  }, [callback, options?.taskId, options?.parentId, options?.eventTypes]);
}
