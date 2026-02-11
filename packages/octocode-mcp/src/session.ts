import axios from 'axios';
import { isLoggingEnabled } from './serverConfig.js';
import { version } from '../package.json';
import {
  getOrCreateSession,
  incrementToolCalls,
  incrementPromptCalls,
  incrementErrors,
  incrementRateLimits,
  type PersistedSession,
} from 'octocode-shared';
import type {
  SessionData,
  ToolCallData,
  PromptCallData,
  ErrorData,
  RateLimitData,
} from './types.js';
import { isLocalTool } from './tools/toolNames.js';

/**
 * SessionManager handles both:
 * 1. Local session persistence (via octocode-shared)
 * 2. Remote telemetry logging (existing behavior)
 *
 * The session ID is persisted in ~/.octocode/session.json and reused
 * across server restarts. Statistics are also tracked persistently.
 */
class SessionManager {
  private session: PersistedSession;
  private readonly logEndpoint = 'https://octocode-mcp-host.onrender.com/log';

  constructor() {
    // Load existing session or create new one
    // Session ID will be reused across restarts
    this.session = getOrCreateSession();
  }

  getSessionId(): string {
    return this.session.sessionId;
  }

  getSession(): PersistedSession {
    return this.session;
  }

  async logInit(): Promise<void> {
    await this.sendLog('init', {});
  }

  async logToolCall(
    toolName: string,
    repos: string[],
    _mainResearchGoal?: string,
    _researchGoal?: string,
    _reasoning?: string
  ): Promise<void> {
    // Update persistent stats
    const result = incrementToolCalls(1);
    if (result.session) {
      this.session = result.session;
    }

    // Only send tool name and anonymized repo count
    const data: ToolCallData = {
      tool_name: toolName,
      repos: !isLocalTool(toolName) ? repos.map(() => '[redacted]') : [],
    };
    await this.sendLog('tool_call', data);
  }

  async logPromptCall(promptName: string): Promise<void> {
    // Update persistent stats
    const result = incrementPromptCalls(1);
    if (result.session) {
      this.session = result.session;
    }

    const data: PromptCallData = { prompt_name: promptName };
    await this.sendLog('prompt_call', data);
  }

  async logError(toolName: string, errorCode: string): Promise<void> {
    // Update persistent stats
    const result = incrementErrors(1);
    if (result.session) {
      this.session = result.session;
    }

    await this.sendLog('error', { error: `${toolName}:${errorCode}` });
  }

  async logRateLimit(data: RateLimitData): Promise<void> {
    // Update persistent stats
    const result = incrementRateLimits(1);
    if (result.session) {
      this.session = result.session;
    }

    await this.sendLog('rate_limit', data);
  }

  private async sendLog(
    intent: 'init' | 'tool_call' | 'prompt_call' | 'error' | 'rate_limit',
    data:
      | ToolCallData
      | PromptCallData
      | ErrorData
      | RateLimitData
      | Record<string, never>
  ): Promise<void> {
    // LOG gate applies to ALL intents including init
    if (!isLoggingEnabled()) {
      return;
    }

    try {
      const payload: SessionData = {
        sessionId: this.session.sessionId,
        intent,
        data,
        timestamp: new Date().toISOString(),
        version,
      };

      await axios.post(this.logEndpoint, payload, {
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      process.stderr.write(
        `[session] Failed to send log (${intent}): ${errorMessage}\n`
      );
    }
  }
}

let sessionManager: SessionManager | null = null;

export function initializeSession(): SessionManager {
  if (!sessionManager) {
    sessionManager = new SessionManager();
  }
  return sessionManager;
}

export function getSessionManager(): SessionManager | null {
  return sessionManager;
}

export async function logSessionInit(): Promise<void> {
  const session = getSessionManager();
  if (session) {
    await session.logInit();
  }
}

export async function logToolCall(
  toolName: string,
  repos: string[],
  mainResearchGoal?: string,
  researchGoal?: string,
  reasoning?: string
): Promise<void> {
  const session = getSessionManager();
  if (session) {
    await session.logToolCall(
      toolName,
      repos,
      mainResearchGoal,
      researchGoal,
      reasoning
    );
  }
}

export async function logPromptCall(promptName: string): Promise<void> {
  const session = getSessionManager();
  if (session) {
    await session.logPromptCall(promptName);
  }
}

export async function logSessionError(
  toolName: string,
  errorCode: string
): Promise<void> {
  const session = getSessionManager();
  if (session) {
    await session.logError(toolName, errorCode);
  }
}

export async function logRateLimit(data: RateLimitData): Promise<void> {
  const session = getSessionManager();
  if (session) {
    await session.logRateLimit(data);
  }
}

export function resetSessionManager(): void {
  sessionManager = null;
}
