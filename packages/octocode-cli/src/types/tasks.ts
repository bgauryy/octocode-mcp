/**
 * Background Task Types
 *
 * Type definitions for the background task system that enables
 * agents to spawn asynchronous sub-agents running in parallel.
 */

import type { CoderMode } from '../features/coders/types.js';

// ============================================
// Task Status Types
// ============================================

/**
 * Task lifecycle states
 */
export type TaskStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'killed';

// ============================================
// Task Types
// ============================================

/**
 * Background task representation
 */
export interface BackgroundTask {
  /** Unique task ID (e.g., "task_abc123") */
  id: string;
  /** ID of the parent session/agent that spawned this task */
  parentId: string;
  /** Subagent type/mode (e.g., "researcher", "coding") */
  type: CoderMode;
  /** Current task status */
  status: TaskStatus;
  /** Initial instruction/prompt for the task */
  prompt: string;
  /** Short summary of the result (populated on completion) */
  summary?: string;
  /** Full output/result (populated on completion) */
  result?: string;
  /** Error message (populated on failure) */
  error?: string;
  /** Task start timestamp (ms since epoch) */
  startTime: number;
  /** Task end timestamp (ms since epoch) */
  endTime?: number;
  /** Path to task log/transcript file */
  transcriptPath: string;
}

/**
 * Configuration for starting a new background task
 */
export interface TaskConfig {
  /** Parent session ID */
  parentId: string;
  /** Subagent type/mode to use */
  type: CoderMode;
  /** Task prompt/instructions */
  prompt: string;
  /** Working directory for the task */
  cwd?: string;
  /** Model ID to use (optional, uses default if not specified) */
  modelId?: string;
  /** Maximum turns/steps for the task */
  maxTurns?: number;
  /** Verbose output */
  verbose?: boolean;
}

/**
 * Task event types for notifications
 */
export type TaskEventType =
  | 'task_started'
  | 'task_progress'
  | 'task_completed'
  | 'task_failed'
  | 'task_killed';

/**
 * Task event payload
 */
export interface TaskEvent {
  type: TaskEventType;
  taskId: string;
  parentId: string;
  timestamp: number;
  data?: {
    progress?: number;
    message?: string;
    result?: string;
    error?: string;
  };
}

/**
 * Task event listener callback
 */
export type TaskEventListener = (event: TaskEvent) => void;

// ============================================
// Task Manager Types
// ============================================

/**
 * Interface for the task manager
 */
export interface ITaskManager {
  /** Start a new background task */
  startTask(config: TaskConfig): Promise<string>;
  /** Get a task by ID */
  getTask(taskId: string): BackgroundTask | undefined;
  /** List all tasks for a parent session */
  listTasks(parentId: string): BackgroundTask[];
  /** Kill a running task */
  killTask(taskId: string): Promise<boolean>;
  /** Wait for a task to complete */
  waitForTask(taskId: string, timeoutMs?: number): Promise<BackgroundTask>;
  /** Subscribe to task events */
  onTaskEvent(listener: TaskEventListener): () => void;
}

// ============================================
// Tool Input Types
// ============================================

/**
 * Input for the Agent tool with background support
 */
export interface AgentToolInput {
  /** Subagent type to spawn */
  subagent_type: CoderMode;
  /** Prompt/instructions for the subagent */
  prompt: string;
  /** Run in background (default: false) */
  run_in_background?: boolean;
}

/**
 * Input for the TaskOutput tool
 */
export interface TaskOutputToolInput {
  /** Task ID to query */
  task_id: string;
  /** Whether to block/wait for completion */
  block?: boolean;
  /** Timeout in ms if blocking (default: 300000 = 5 min) */
  timeout?: number;
}

/**
 * Input for the TaskList tool
 */
export interface TaskListToolInput {
  /** Filter by status (optional) */
  status?: TaskStatus;
  /** Include completed tasks (default: true) */
  include_completed?: boolean;
}
