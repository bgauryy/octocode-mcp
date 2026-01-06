/**
 * Session Manager - Handles persistence and retrieval of chat sessions
 *
 * Sessions are stored in ~/.octocode/sessions/ as JSON files.
 * Each session file contains metadata about the chat session for later resume.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import type {
  SessionInfo,
  SessionCoderMode,
  AIProvider,
} from '../types/index.js';
import { HOME } from '../utils/platform.js';

// ============================================
// Constants
// ============================================

const DEFAULT_SESSIONS_DIR = join(HOME, '.octocode', 'sessions');
const SESSION_FILE_EXT = '.json';
const PROMPT_PREVIEW_LENGTH = 100;

// ============================================
// Session Manager Class
// ============================================

export class SessionManager {
  private sessionsDir: string;

  constructor(baseDir?: string) {
    this.sessionsDir = baseDir ?? DEFAULT_SESSIONS_DIR;
    this.ensureSessionsDir();
  }

  /**
   * Ensure the sessions directory exists with proper permissions
   */
  private ensureSessionsDir(): void {
    if (!existsSync(this.sessionsDir)) {
      mkdirSync(this.sessionsDir, { recursive: true, mode: 0o700 });
    }
  }

  /**
   * Get the file path for a session
   */
  private getSessionPath(sessionId: string): string {
    // Sanitize session ID to prevent path traversal
    const sanitizedId = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return join(this.sessionsDir, `${sanitizedId}${SESSION_FILE_EXT}`);
  }

  /**
   * List all saved sessions, sorted by lastActiveAt (most recent first)
   */
  async listSessions(): Promise<SessionInfo[]> {
    this.ensureSessionsDir();

    const files = readdirSync(this.sessionsDir).filter(f =>
      f.endsWith(SESSION_FILE_EXT)
    );

    const sessions: SessionInfo[] = [];

    for (const file of files) {
      try {
        const content = readFileSync(join(this.sessionsDir, file), 'utf-8');
        const session = JSON.parse(content) as SessionInfo;
        sessions.push(session);
      } catch {
        // Skip invalid session files
        continue;
      }
    }

    // Sort by lastActiveAt descending (most recent first)
    return sessions.sort((a, b) => {
      const dateA = new Date(a.lastActiveAt).getTime();
      const dateB = new Date(b.lastActiveAt).getTime();
      return dateB - dateA;
    });
  }

  /**
   * Get a specific session by ID
   */
  async getSession(sessionId: string): Promise<SessionInfo | null> {
    const sessionPath = this.getSessionPath(sessionId);

    if (!existsSync(sessionPath)) {
      return null;
    }

    try {
      const content = readFileSync(sessionPath, 'utf-8');
      return JSON.parse(content) as SessionInfo;
    } catch {
      return null;
    }
  }

  /**
   * Save a session
   */
  async saveSession(session: SessionInfo): Promise<void> {
    this.ensureSessionsDir();

    // Ensure promptPreview is set
    if (!session.promptPreview) {
      session.promptPreview = truncatePrompt(
        session.prompt,
        PROMPT_PREVIEW_LENGTH
      );
    }

    const sessionPath = this.getSessionPath(session.id);
    writeFileSync(sessionPath, JSON.stringify(session, null, 2), {
      encoding: 'utf-8',
      mode: 0o600, // Owner read/write only
    });
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    const sessionPath = this.getSessionPath(sessionId);

    if (!existsSync(sessionPath)) {
      return false;
    }

    try {
      unlinkSync(sessionPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Update an existing session's status and metadata
   */
  async updateSession(
    sessionId: string,
    updates: Partial<Omit<SessionInfo, 'id'>>
  ): Promise<boolean> {
    const existing = await this.getSession(sessionId);
    if (!existing) {
      return false;
    }

    const updated: SessionInfo = {
      ...existing,
      ...updates,
      lastActiveAt: new Date().toISOString(),
    };

    await this.saveSession(updated);
    return true;
  }

  /**
   * Create a new session info object
   */
  createSessionInfo(params: {
    id: string;
    prompt: string;
    mode: SessionCoderMode;
    cwd: string;
    provider?: AIProvider;
    transcriptPath?: string;
  }): SessionInfo {
    const now = new Date().toISOString();
    return {
      id: params.id,
      startedAt: now,
      lastActiveAt: now,
      prompt: params.prompt,
      promptPreview: truncatePrompt(params.prompt, PROMPT_PREVIEW_LENGTH),
      mode: params.mode,
      status: 'active',
      cwd: params.cwd,
      provider: params.provider,
      transcriptPath: params.transcriptPath,
    };
  }

  /**
   * Mark a session as completed with final stats
   */
  async completeSession(
    sessionId: string,
    stats?: {
      totalTokens?: number;
      transcriptPath?: string;
    }
  ): Promise<boolean> {
    return this.updateSession(sessionId, {
      status: 'completed',
      ...stats,
    });
  }

  /**
   * Mark a session as errored
   */
  async errorSession(sessionId: string): Promise<boolean> {
    return this.updateSession(sessionId, {
      status: 'error',
    });
  }

  /**
   * Get the sessions directory path
   */
  getSessionsDirectory(): string {
    return this.sessionsDir;
  }

  /**
   * Clear all sessions (use with caution)
   */
  async clearAllSessions(): Promise<number> {
    const files = readdirSync(this.sessionsDir).filter(f =>
      f.endsWith(SESSION_FILE_EXT)
    );

    let deleted = 0;
    for (const file of files) {
      try {
        unlinkSync(join(this.sessionsDir, file));
        deleted++;
      } catch {
        continue;
      }
    }

    return deleted;
  }
}

// ============================================
// Helper Functions
// ============================================

/**
 * Truncate a prompt for display preview
 */
export function truncatePrompt(prompt: string, maxLength: number): string {
  const cleaned = prompt.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxLength) {
    return cleaned;
  }
  return cleaned.slice(0, maxLength - 3) + '...';
}

// ============================================
// Singleton Export
// ============================================

let defaultManager: SessionManager | null = null;

/**
 * Get the default session manager instance
 */
export function getSessionManager(): SessionManager {
  if (!defaultManager) {
    defaultManager = new SessionManager();
  }
  return defaultManager;
}
