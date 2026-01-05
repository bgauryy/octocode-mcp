/**
 * Session Store - SQLite-based session persistence
 *
 * Provides CRUD operations for chat sessions, messages, and tool calls.
 * Uses drizzle-orm for type-safe database queries.
 */

import { eq, desc, and, like, sql, lt } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import {
  getDatabase,
  sessions,
  messages,
  toolCalls,
  type Session,
  type NewSession,
  type Message,
  type NewMessage,
  type ToolCall,
  type NewToolCall,
  type MessageRole,
  type SessionStatus,
  type ToolCallStatus,
} from '../db/index.js';
import type { SessionCoderMode, AIProvider } from '../types/agent.js';

// ============================================
// Types
// ============================================

export interface CreateSessionParams {
  prompt: string;
  mode: SessionCoderMode | 'interactive';
  cwd: string;
  provider?: AIProvider;
  model?: string;
  sdkSessionId?: string;
}

export interface ListSessionsOptions {
  limit?: number;
  offset?: number;
  status?: SessionStatus;
  mode?: string;
  search?: string;
}

export interface SessionWithMessages {
  session: Session;
  messages: Message[];
}

export interface AddMessageParams {
  sessionId: string;
  role: MessageRole;
  content: string;
  turnIndex: number;
  messageIndex: number;
  tokenCount?: number;
  toolCallId?: string;
  parentMessageId?: string;
}

export interface AddToolCallParams {
  messageId: string;
  sessionId: string;
  name: string;
  args?: Record<string, unknown>;
}

export interface ResumeMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// ============================================
// Session Store Class
// ============================================

export class SessionStore {
  private db = getDatabase();

  // ============================================
  // Session Operations
  // ============================================

  /**
   * Create a new session
   */
  async createSession(params: CreateSessionParams): Promise<Session> {
    const now = new Date();
    const id = nanoid();

    const session: NewSession = {
      id,
      createdAt: now,
      updatedAt: now,
      prompt: params.prompt,
      promptPreview: this.truncatePrompt(params.prompt, 100),
      title: this.generateTitle(params.prompt),
      mode: params.mode,
      status: 'active',
      cwd: params.cwd,
      provider: params.provider,
      model: params.model,
      sdkSessionId: params.sdkSessionId,
      messageCount: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
    };

    await this.db.insert(sessions).values(session);

    // Return the full session object
    return {
      ...session,
      createdAt: now,
      updatedAt: now,
    } as Session;
  }

  /**
   * Get a session by ID
   */
  async getSession(id: string): Promise<Session | null> {
    const result = await this.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, id))
      .limit(1);

    return result[0] ?? null;
  }

  /**
   * Get a session with all its messages
   */
  async getSessionWithMessages(
    id: string
  ): Promise<SessionWithMessages | null> {
    const session = await this.getSession(id);
    if (!session) return null;

    const msgs = await this.db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, id))
      .orderBy(messages.turnIndex, messages.messageIndex);

    return { session, messages: msgs };
  }

  /**
   * List sessions with optional filtering
   */
  async listSessions(options: ListSessionsOptions = {}): Promise<Session[]> {
    const { limit = 20, offset = 0, status, mode, search } = options;

    const conditions = [];

    if (status) {
      conditions.push(eq(sessions.status, status));
    }

    if (mode) {
      conditions.push(eq(sessions.mode, mode));
    }

    if (search) {
      conditions.push(like(sessions.prompt, `%${search}%`));
    }

    let query = this.db.select().from(sessions);

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    return query.orderBy(desc(sessions.updatedAt)).limit(limit).offset(offset);
  }

  /**
   * Update a session
   */
  async updateSession(
    id: string,
    updates: Partial<Omit<Session, 'id' | 'createdAt'>>
  ): Promise<boolean> {
    const result = await this.db
      .update(sessions)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(sessions.id, id));

    return (result.changes ?? 0) > 0;
  }

  /**
   * Complete a session with final stats
   */
  async completeSession(
    id: string,
    stats?: {
      totalInputTokens?: number;
      totalOutputTokens?: number;
    }
  ): Promise<boolean> {
    return this.updateSession(id, {
      status: 'completed',
      ...stats,
    });
  }

  /**
   * Mark a session as errored
   */
  async errorSession(id: string): Promise<boolean> {
    return this.updateSession(id, { status: 'error' });
  }

  /**
   * Delete a session (cascade deletes messages and tool calls)
   */
  async deleteSession(id: string): Promise<boolean> {
    const result = await this.db.delete(sessions).where(eq(sessions.id, id));
    return (result.changes ?? 0) > 0;
  }

  /**
   * Clear sessions older than specified days
   */
  async clearOldSessions(olderThanDays: number = 30): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);

    const result = await this.db
      .delete(sessions)
      .where(lt(sessions.updatedAt, cutoff));

    return result.changes ?? 0;
  }

  /**
   * Clear all sessions
   */
  async clearAllSessions(): Promise<number> {
    const result = await this.db.delete(sessions);
    return result.changes ?? 0;
  }

  // ============================================
  // Message Operations
  // ============================================

  /**
   * Add a message to a session
   */
  async addMessage(params: AddMessageParams): Promise<Message> {
    const id = nanoid();
    const now = new Date();

    const message: NewMessage = {
      id,
      sessionId: params.sessionId,
      role: params.role,
      content: params.content,
      createdAt: now,
      turnIndex: params.turnIndex,
      messageIndex: params.messageIndex,
      tokenCount: params.tokenCount,
      toolCallId: params.toolCallId,
      parentMessageId: params.parentMessageId,
    };

    await this.db.insert(messages).values(message);

    // Update session message count and timestamp
    await this.db
      .update(sessions)
      .set({
        messageCount: sql`${sessions.messageCount} + 1`,
        updatedAt: now,
      })
      .where(eq(sessions.id, params.sessionId));

    return { ...message, createdAt: now } as Message;
  }

  /**
   * Get all messages for a session
   */
  async getMessages(sessionId: string): Promise<Message[]> {
    return this.db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, sessionId))
      .orderBy(messages.turnIndex, messages.messageIndex);
  }

  /**
   * Get messages formatted for session resume
   * Excludes tool messages and returns only the content needed for AI context
   */
  async getMessagesForResume(sessionId: string): Promise<ResumeMessage[]> {
    const msgs = await this.getMessages(sessionId);

    return msgs
      .filter(m => m.role !== 'tool')
      .map(m => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
      }));
  }

  /**
   * Get the last turn index for a session
   */
  async getLastTurnIndex(sessionId: string): Promise<number> {
    const result = await this.db
      .select({ maxTurn: sql<number>`MAX(${messages.turnIndex})` })
      .from(messages)
      .where(eq(messages.sessionId, sessionId));

    return result[0]?.maxTurn ?? -1;
  }

  // ============================================
  // Tool Call Operations
  // ============================================

  /**
   * Add a tool call
   */
  async addToolCall(params: AddToolCallParams): Promise<ToolCall> {
    const id = nanoid();
    const now = new Date();

    const toolCall: NewToolCall = {
      id,
      messageId: params.messageId,
      sessionId: params.sessionId,
      name: params.name,
      args: params.args ? JSON.stringify(params.args) : null,
      status: 'pending',
      startedAt: now,
    };

    await this.db.insert(toolCalls).values(toolCall);

    return { ...toolCall, startedAt: now } as ToolCall;
  }

  /**
   * Complete a tool call with result
   */
  async completeToolCall(
    id: string,
    result: unknown,
    status: ToolCallStatus = 'completed'
  ): Promise<boolean> {
    const now = new Date();

    // Get the tool call to calculate duration
    const existing = await this.db
      .select()
      .from(toolCalls)
      .where(eq(toolCalls.id, id))
      .limit(1);

    const startedAt = existing[0]?.startedAt;
    const durationMs = startedAt ? now.getTime() - startedAt.getTime() : null;

    const updateResult = await this.db
      .update(toolCalls)
      .set({
        result: JSON.stringify(result),
        status,
        completedAt: now,
        durationMs,
      })
      .where(eq(toolCalls.id, id));

    return (updateResult.changes ?? 0) > 0;
  }

  /**
   * Get all tool calls for a session
   */
  async getToolCalls(sessionId: string): Promise<ToolCall[]> {
    return this.db
      .select()
      .from(toolCalls)
      .where(eq(toolCalls.sessionId, sessionId))
      .orderBy(toolCalls.startedAt);
  }

  /**
   * Get tool calls for a specific message
   */
  async getToolCallsForMessage(messageId: string): Promise<ToolCall[]> {
    return this.db
      .select()
      .from(toolCalls)
      .where(eq(toolCalls.messageId, messageId))
      .orderBy(toolCalls.startedAt);
  }

  // ============================================
  // Statistics Operations
  // ============================================

  /**
   * Update session token usage
   */
  async updateSessionTokens(
    sessionId: string,
    inputTokens: number,
    outputTokens: number
  ): Promise<void> {
    await this.db
      .update(sessions)
      .set({
        totalInputTokens: sql`${sessions.totalInputTokens} + ${inputTokens}`,
        totalOutputTokens: sql`${sessions.totalOutputTokens} + ${outputTokens}`,
        updatedAt: new Date(),
      })
      .where(eq(sessions.id, sessionId));
  }

  /**
   * Get session statistics
   */
  async getSessionStats(sessionId: string): Promise<{
    messageCount: number;
    toolCallCount: number;
    totalInputTokens: number;
    totalOutputTokens: number;
  } | null> {
    const session = await this.getSession(sessionId);
    if (!session) return null;

    const toolCallResult = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(toolCalls)
      .where(eq(toolCalls.sessionId, sessionId));

    return {
      messageCount: session.messageCount ?? 0,
      toolCallCount: toolCallResult[0]?.count ?? 0,
      totalInputTokens: session.totalInputTokens ?? 0,
      totalOutputTokens: session.totalOutputTokens ?? 0,
    };
  }

  // ============================================
  // Helper Methods
  // ============================================

  /**
   * Generate a title from the prompt
   */
  private generateTitle(prompt: string): string {
    const firstLine = prompt.split('\n')[0].trim();
    if (firstLine.length <= 50) return firstLine;
    return firstLine.slice(0, 47) + '...';
  }

  /**
   * Truncate a prompt for preview display
   */
  private truncatePrompt(prompt: string, maxLength: number): string {
    const cleaned = prompt.replace(/\s+/g, ' ').trim();
    if (cleaned.length <= maxLength) return cleaned;
    return cleaned.slice(0, maxLength - 3) + '...';
  }
}

// ============================================
// Singleton Instance
// ============================================

let storeInstance: SessionStore | null = null;

/**
 * Get the singleton session store instance
 */
export function getSessionStore(): SessionStore {
  if (!storeInstance) {
    storeInstance = new SessionStore();
  }
  return storeInstance;
}

/**
 * Create a new session store instance (for testing)
 */
export function createSessionStore(): SessionStore {
  return new SessionStore();
}
