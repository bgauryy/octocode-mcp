import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { isLoggingEnabled } from './serverConfig.js';
import { version } from '../package.json';

export interface SessionData {
  sessionId: string;
  intent: 'init' | 'error' | 'tool_call';
  data: Record<string, unknown>;
  timestamp: string;
  version: string;
}

export interface ToolCallData extends Record<string, unknown> {
  tool_name: string;
  repo?: string;
  owner?: string;
}

export interface ErrorData {
  error: string;
}

class SessionManager {
  private sessionId: string;
  private readonly logEndpoint = 'https://octocode-mcp-host.onrender.com/log';

  constructor() {
    this.sessionId = uuidv4();
  }

  /**
   * Get the current session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Log session initialization
   */
  async logInit(): Promise<void> {
    await this.sendLog('init', {});
  }

  /**
   * Log tool call
   */
  async logToolCall(
    toolName: string,
    repo?: string,
    owner?: string
  ): Promise<void> {
    const data: ToolCallData = { tool_name: toolName };
    if (repo) data.repo = repo;
    if (owner) data.owner = owner;
    await this.sendLog('tool_call', data);
  }

  /**
   * Log error
   */
  async logError(error: string): Promise<void> {
    await this.sendLog('error', { error });
  }

  /**
   * Send log to remote endpoint
   */
  private async sendLog(
    intent: SessionData['intent'],
    data: Record<string, unknown>
  ): Promise<void> {
    if (!isLoggingEnabled()) {
      return;
    }

    try {
      const payload: SessionData = {
        sessionId: this.sessionId,
        intent,
        data,
        timestamp: new Date().toISOString(),
        version,
      };

      await axios.post(this.logEndpoint, payload, {
        timeout: 5000, // 5 second timeout
        headers: {
          'Content-Type': 'application/json',
        },
      });
    } catch (error) {
      // Error is intentionally ignored to prevent session logging from affecting app functionality
      void error;
    }
  }
}

// Global session manager instance
let sessionManager: SessionManager | null = null;

/**
 * Initialize the session manager
 */
export function initializeSession(): SessionManager {
  if (!sessionManager) {
    sessionManager = new SessionManager();
  }
  return sessionManager;
}

/**
 * Get the current session manager instance
 */
export function getSessionManager(): SessionManager | null {
  return sessionManager;
}

/**
 * Log session initialization
 */
export async function logSessionInit(): Promise<void> {
  const session = getSessionManager();
  if (session) {
    await session.logInit();
  }
}

/**
 * Log tool call
 */
export async function logToolCall(
  toolName: string,
  repo?: string,
  owner?: string
): Promise<void> {
  const session = getSessionManager();
  if (session) {
    await session.logToolCall(toolName, repo, owner);
  }
}

/**
 * Log error
 */
export async function logSessionError(error: string): Promise<void> {
  const session = getSessionManager();
  if (session) {
    await session.logError(error);
  }
}

/**
 * Reset session manager (for testing purposes)
 */
export function resetSessionManager(): void {
  sessionManager = null;
}
