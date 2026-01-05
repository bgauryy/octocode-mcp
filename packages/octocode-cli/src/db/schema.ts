/**
 * Database Schema for Session Persistence
 *
 * Defines the SQLite schema for storing chat sessions, messages, and tool calls.
 * Uses Drizzle ORM for type-safe database operations.
 */

import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

// ============================================
// Sessions Table
// ============================================

/**
 * Sessions table - main session metadata
 * Stores information about each chat session including status and context.
 */
export const sessions = sqliteTable('sessions', {
  /** Unique session identifier (nanoid) */
  id: text('id').primaryKey(),

  /** When the session was created */
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),

  /** When the session was last updated */
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),

  /** Auto-generated title from first message */
  title: text('title'),

  /** Initial prompt that started the session */
  prompt: text('prompt').notNull(),

  /** Truncated preview for display (max 100 chars) */
  promptPreview: text('prompt_preview'),

  /** Session mode: 'research' | 'coding' | 'full' | 'planning' | 'custom' | 'interactive' */
  mode: text('mode').notNull(),

  /** Session status: 'active' | 'completed' | 'error' */
  status: text('status').notNull(),

  /** Working directory for this session */
  cwd: text('cwd').notNull(),

  /** AI provider used */
  provider: text('provider'),

  /** Model used for this session */
  model: text('model'),

  /** Total input tokens used */
  totalInputTokens: integer('total_input_tokens'),

  /** Total output tokens used */
  totalOutputTokens: integer('total_output_tokens'),

  /** Number of messages in the session */
  messageCount: integer('message_count').default(0),

  /** Claude Agent SDK session ID for resume */
  sdkSessionId: text('sdk_session_id'),

  /** Path to full transcript file */
  transcriptPath: text('transcript_path'),
});

// ============================================
// Messages Table
// ============================================

/**
 * Messages table - conversation history
 * Stores each message in a session with ordering and token counts.
 */
export const messages = sqliteTable('messages', {
  /** Unique message identifier (nanoid) */
  id: text('id').primaryKey(),

  /** Foreign key to sessions table */
  sessionId: text('session_id')
    .notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),

  /** Message role: 'user' | 'assistant' | 'system' | 'tool' */
  role: text('role').notNull(),

  /** Message content (text or JSON for tool messages) */
  content: text('content').notNull(),

  /** When the message was created */
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),

  /** Token count for this message */
  tokenCount: integer('token_count'),

  /** Conversation turn number (for ordering) */
  turnIndex: integer('turn_index').notNull(),

  /** Message index within turn (for ordering multiple messages in same turn) */
  messageIndex: integer('message_index').notNull(),

  /** Tool call ID if this is a tool result */
  toolCallId: text('tool_call_id'),

  /** Parent message ID for threading */
  parentMessageId: text('parent_message_id'),
});

// ============================================
// Tool Calls Table
// ============================================

/**
 * Tool calls table - track tool usage
 * Stores each tool invocation with arguments, results, and timing.
 */
export const toolCalls = sqliteTable('tool_calls', {
  /** Unique tool call identifier (nanoid) */
  id: text('id').primaryKey(),

  /** Foreign key to messages table */
  messageId: text('message_id')
    .notNull()
    .references(() => messages.id, { onDelete: 'cascade' }),

  /** Foreign key to sessions table */
  sessionId: text('session_id')
    .notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),

  /** Tool name */
  name: text('name').notNull(),

  /** JSON-encoded tool arguments */
  args: text('args'),

  /** JSON-encoded tool result */
  result: text('result'),

  /** Tool call status: 'pending' | 'completed' | 'error' */
  status: text('status').notNull(),

  /** When the tool call started */
  startedAt: integer('started_at', { mode: 'timestamp' }),

  /** When the tool call completed */
  completedAt: integer('completed_at', { mode: 'timestamp' }),

  /** Duration in milliseconds */
  durationMs: integer('duration_ms'),
});

// ============================================
// Relations
// ============================================

export const sessionsRelations = relations(sessions, ({ many }) => ({
  messages: many(messages),
  toolCalls: many(toolCalls),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
  session: one(sessions, {
    fields: [messages.sessionId],
    references: [sessions.id],
  }),
  toolCalls: many(toolCalls),
}));

export const toolCallsRelations = relations(toolCalls, ({ one }) => ({
  message: one(messages, {
    fields: [toolCalls.messageId],
    references: [messages.id],
  }),
  session: one(sessions, {
    fields: [toolCalls.sessionId],
    references: [sessions.id],
  }),
}));

// ============================================
// Type Exports
// ============================================

/** Session record type (inferred from schema) */
export type Session = typeof sessions.$inferSelect;

/** New session insert type */
export type NewSession = typeof sessions.$inferInsert;

/** Message record type (inferred from schema) */
export type Message = typeof messages.$inferSelect;

/** New message insert type */
export type NewMessage = typeof messages.$inferInsert;

/** Tool call record type (inferred from schema) */
export type ToolCall = typeof toolCalls.$inferSelect;

/** New tool call insert type */
export type NewToolCall = typeof toolCalls.$inferInsert;

/** Message role enum */
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

/** Session status enum */
export type SessionStatus = 'active' | 'completed' | 'error';

/** Tool call status enum */
export type ToolCallStatus = 'pending' | 'completed' | 'error';
