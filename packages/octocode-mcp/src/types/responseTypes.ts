/**
 * Response Types for Role-Based MCP Tool Responses
 *
 * Implements a chat-like role system (system/assistant/user) for tool responses
 * to help hosts understand and route content appropriately.
 */

/**
 * Content role types - similar to chat message roles
 * - system: Instructions, hints, pagination (hidden from user, high priority for agent)
 * - assistant: Formatted data, summaries (shown to both agent and user)
 * - user: Human-friendly messages (primarily for user display)
 */
export type ContentRole = 'system' | 'assistant' | 'user';

/**
 * Extended annotations with role support
 * Based on MCP spec annotations with custom role metadata
 */
export interface RoleAnnotations {
  /** Target audience for this content block */
  audience?: Array<'user' | 'assistant'>;
  /** Priority (0.0 to 1.0) for ordering/importance */
  priority?: number;
  /** Role type for semantic understanding */
  role?: ContentRole;
  /** Last modification timestamp (ISO 8601) */
  lastModified?: string;
}

/**
 * Content block with role annotation
 * Extends MCP TextContent with role metadata
 */
export interface RoleContentBlock {
  type: 'text';
  text: string;
  annotations?: RoleAnnotations;
}

/**
 * Pagination information for paginated responses
 */
export interface ResponsePagination {
  currentPage: number;
  totalPages: number;
  hasMore: boolean;
  /** Items per page (optional) */
  perPage?: number;
  /** Total items across all pages (optional) */
  totalItems?: number;
}

/**
 * System content options
 * Contains instructions and metadata for the agent
 */
export interface SystemContentOptions {
  /** Primary instructions for the agent */
  instructions?: string;
  /** Actionable hints for next steps */
  hints?: string[];
  /** Pagination info (displayed in system block) */
  pagination?: ResponsePagination;
  /** Warning messages */
  warnings?: string[];
}

/**
 * Assistant content options
 * Contains formatted data for agent reasoning
 */
export interface AssistantContentOptions {
  /** Brief summary of results (required) */
  summary: string;
  /** Detailed formatted data (optional) */
  details?: string;
  /** Format hint for details rendering */
  format?: 'yaml' | 'json' | 'markdown' | 'plain';
}

/**
 * User content options
 * Contains human-friendly summary
 */
export interface UserContentOptions {
  /** Human-friendly message */
  message: string;
  /** Status emoji (✅ ❌ ⚠️ 🔍 📭 etc.) */
  emoji?: string;
}

/**
 * Options for creating role-based results
 */
export interface RoleBasedResultOptions {
  /** System content: instructions, hints, pagination info */
  system?: SystemContentOptions;

  /** Assistant content: formatted data for agent reasoning (required) */
  assistant: AssistantContentOptions;

  /** User content: human-friendly summary (optional) */
  user?: UserContentOptions;

  /** Structured data for programmatic access */
  data: unknown;

  /** Error flag - indicates tool execution error */
  isError?: boolean;
}

/**
 * Result status for consistent status reporting
 */
export type ResultStatus = 'success' | 'empty' | 'error' | 'partial';

/**
 * Status emoji mapping
 */
export const StatusEmojis = {
  success: '✅',
  empty: '📭',
  error: '❌',
  partial: '⚠️',
  searching: '🔍',
  loading: '⏳',
  info: 'ℹ️',
  file: '📄',
  folder: '📁',
  page: '📃',
  definition: '🎯',
  reference: '🔗',
  call: '📞',
} as const;

export type StatusEmojiKey = keyof typeof StatusEmojis;
