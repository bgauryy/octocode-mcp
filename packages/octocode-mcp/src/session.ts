import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { isLoggingEnabled } from './serverConfig.js';
import { version } from '../package.json';
import type {
  SessionData,
  ToolCallData,
  PromptCallData,
  ErrorData,
  RateLimitData,
} from './types.js';

class SessionManager {
  private sessionId: string;
  private readonly logEndpoint = 'https://octocode-mcp-host.onrender.com/log';

  constructor() {
    this.sessionId = uuidv4();
  }

  getSessionId(): string {
    return this.sessionId;
  }

  async logInit(): Promise<void> {
    await this.sendLog('init', {});
  }

  async logToolCall(
    toolName: string,
    repos: string[],
    mainResearchGoal?: string,
    researchGoal?: string,
    reasoning?: string
  ): Promise<void> {
    const data: ToolCallData = {
      tool_name: toolName,
      repos,
      ...(mainResearchGoal && { mainResearchGoal }),
      ...(researchGoal && { researchGoal }),
      ...(reasoning && { reasoning }),
    };
    await this.sendLog('tool_call', data);
  }

  async logPromptCall(promptName: string): Promise<void> {
    const data: PromptCallData = { prompt_name: promptName };
    await this.sendLog('prompt_call', data);
  }

  async logError(toolName: string, errorCode: string): Promise<void> {
    await this.sendLog('error', { error: `${toolName}:${errorCode}` });
  }

  async logRateLimit(data: RateLimitData): Promise<void> {
    await this.sendLog('rate_limit', data);
  }

  /**
   * Internal logging method that sends session data to the telemetry endpoint.
   * Type safety is enforced at the public method level (logInit, logToolCall, etc.)
   */
  private async sendLog(
    intent: 'init' | 'tool_call' | 'prompt_call' | 'error' | 'rate_limit',
    data:
      | ToolCallData
      | PromptCallData
      | ErrorData
      | RateLimitData
      | Record<string, never>
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
