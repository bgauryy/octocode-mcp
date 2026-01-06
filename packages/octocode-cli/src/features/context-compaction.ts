/**
 * Context Compaction
 *
 * Handles automatic context compaction when conversations approach token limits.
 * Implements a summarization strategy to preserve conversation meaning while
 * reducing token usage.
 *
 * Based on: claude-agent-sdk-architecture.md:619-699
 */

import type { Message } from 'ai';

/**
 * Compact boundary marker to indicate where compaction occurred
 */
export interface CompactBoundary {
  /** Timestamp when compaction occurred */
  timestamp: number;
  /** Number of messages that were compacted */
  compactedCount: number;
  /** Estimated tokens saved */
  tokensSaved: number;
  /** Summary of compacted content */
  summary: string;
}

/**
 * Options for context compaction
 */
export interface CompactionOptions {
  /** Maximum tokens before triggering compaction */
  maxTokens: number;
  /** Number of recent messages to always preserve (never compact) */
  preserveRecentMessages: number;
  /** Minimum tokens threshold to consider compaction */
  summarizeThreshold: number;
  /** Model ID to use for summarization (optional) */
  summarizeModel?: string;
  /** Custom summarization function (optional) */
  customSummarizer?: (messages: Message[]) => Promise<string>;
}

/**
 * Result of context compaction
 */
export interface CompactionResult {
  /** Compacted message list */
  compacted: Message[];
  /** Boundary marker (if compaction occurred) */
  boundary?: CompactBoundary;
  /** Whether compaction was performed */
  didCompact: boolean;
  /** Stats about the compaction */
  stats: {
    originalCount: number;
    newCount: number;
    estimatedTokensBefore: number;
    estimatedTokensAfter: number;
  };
}

/**
 * Hook event fired before compaction
 */
export interface PreCompactHookEvent {
  type: 'PreCompact';
  messagesCount: number;
  estimatedTokens: number;
  threshold: number;
}

/**
 * Default compaction options
 */
export const DEFAULT_COMPACTION_OPTIONS: CompactionOptions = {
  maxTokens: 100000, // 100k tokens default threshold
  preserveRecentMessages: 10, // Always keep last 10 messages
  summarizeThreshold: 50000, // Start considering compaction at 50k
};

/**
 * Rough token estimation based on character count
 * Claude uses ~4 characters per token on average
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Estimate total tokens for a list of messages
 */
export function estimateMessagesTokens(messages: Message[]): number {
  return messages.reduce((total, msg) => {
    const content =
      typeof msg.content === 'string'
        ? msg.content
        : JSON.stringify(msg.content);
    return total + estimateTokens(content) + estimateTokens(msg.role);
  }, 0);
}

/**
 * Create a summary message from compacted content
 */
function createSummaryMessage(
  summary: string,
  boundary: CompactBoundary
): Message {
  return {
    id: `compact_${boundary.timestamp}`,
    role: 'assistant',
    content: `[Context Summary - ${boundary.compactedCount} messages compacted at ${new Date(boundary.timestamp).toISOString()}]\n\n${summary}\n\n---\n[Conversation continues below]`,
  };
}

/**
 * Check if message content contains tool invocations (AI SDK format)
 * AI SDK uses content array with tool-call/tool-result parts
 */
function hasToolContent(message: Message): boolean {
  if (!Array.isArray(message.content)) return false;
  return message.content.some(
    part =>
      typeof part === 'object' &&
      part !== null &&
      'type' in part &&
      ((part as { type: string }).type === 'tool-call' ||
        (part as { type: string }).type === 'tool-result')
  );
}

/**
 * Extract tool names from message content (AI SDK format)
 */
function extractToolNames(message: Message): string[] {
  if (!Array.isArray(message.content)) return [];
  return message.content
    .filter(
      part =>
        typeof part === 'object' &&
        part !== null &&
        'type' in part &&
        (part as { type: string }).type === 'tool-call'
    )
    .map(part => (part as { toolName?: string }).toolName || 'unknown-tool');
}

/**
 * Default summarization strategy - extracts key points from messages
 */
async function defaultSummarize(messages: Message[]): Promise<string> {
  // Group by message type for organized summary
  const userMessages = messages.filter(m => m.role === 'user');
  const assistantMessages = messages.filter(m => m.role === 'assistant');
  // Find messages with tool content (AI SDK stores tool calls in content array)
  const messagesWithTools = messages.filter(m => hasToolContent(m));

  const sections: string[] = [];

  // Summarize user requests
  if (userMessages.length > 0) {
    const requests = userMessages
      .slice(0, 5)
      .map(m => {
        const content =
          typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
        return `- ${content.slice(0, 100)}${content.length > 100 ? '...' : ''}`;
      })
      .join('\n');
    sections.push(`**User Requests:**\n${requests}`);
    if (userMessages.length > 5) {
      sections.push(`... and ${userMessages.length - 5} more user messages`);
    }
  }

  // Summarize tool calls
  if (messagesWithTools.length > 0) {
    const allToolNames = messagesWithTools.flatMap(m => extractToolNames(m));
    const uniqueTools = [...new Set(allToolNames)];
    if (uniqueTools.length > 0) {
      sections.push(
        `**Tools Used:** ${uniqueTools.join(', ')} (${allToolNames.length} calls total)`
      );
    }
  }

  // Summarize key findings from assistant messages
  if (assistantMessages.length > 0) {
    const keyContent = assistantMessages
      .slice(-3)
      .map(m => {
        const content =
          typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
        return content.slice(0, 200);
      })
      .join('\n...\n');
    sections.push(`**Recent Context:**\n${keyContent}`);
  }

  return sections.join('\n\n');
}

/**
 * Fire pre-compact hook (if hook system is available)
 */
async function firePreCompactHook(
  event: PreCompactHookEvent,
  onPreCompact?: (event: PreCompactHookEvent) => Promise<boolean>
): Promise<boolean> {
  if (onPreCompact) {
    return await onPreCompact(event);
  }
  // Default: allow compaction
  return true;
}

/**
 * Perform context compaction on a list of messages
 *
 * @param messages - Full message history
 * @param options - Compaction configuration
 * @param onPreCompact - Optional hook called before compaction
 * @returns Compaction result with compacted messages and metadata
 */
export async function compactContext(
  messages: Message[],
  options: Partial<CompactionOptions> = {},
  onPreCompact?: (event: PreCompactHookEvent) => Promise<boolean>
): Promise<CompactionResult> {
  const opts = { ...DEFAULT_COMPACTION_OPTIONS, ...options };
  const estimatedTokens = estimateMessagesTokens(messages);

  // Result template
  const baseResult: CompactionResult = {
    compacted: messages,
    didCompact: false,
    stats: {
      originalCount: messages.length,
      newCount: messages.length,
      estimatedTokensBefore: estimatedTokens,
      estimatedTokensAfter: estimatedTokens,
    },
  };

  // Check if compaction is needed
  if (estimatedTokens < opts.summarizeThreshold) {
    return baseResult;
  }

  // Not enough messages to compact
  if (messages.length <= opts.preserveRecentMessages + 2) {
    return baseResult;
  }

  // Fire PreCompact hook
  const shouldCompact = await firePreCompactHook(
    {
      type: 'PreCompact',
      messagesCount: messages.length,
      estimatedTokens,
      threshold: opts.maxTokens,
    },
    onPreCompact
  );

  if (!shouldCompact) {
    return baseResult;
  }

  // Split messages: preserve recent, compact older
  const recentMessages = messages.slice(-opts.preserveRecentMessages);
  const oldMessages = messages.slice(
    0,
    messages.length - opts.preserveRecentMessages
  );

  // Generate summary of old messages
  const summarizer = opts.customSummarizer || defaultSummarize;
  const summary = await summarizer(oldMessages);

  // Create boundary marker
  const boundary: CompactBoundary = {
    timestamp: Date.now(),
    compactedCount: oldMessages.length,
    tokensSaved:
      estimateMessagesTokens(oldMessages) - estimateTokens(summary) - 50, // 50 for overhead
    summary,
  };

  // Create summary message
  const summaryMessage = createSummaryMessage(summary, boundary);

  // Combine summary + recent messages
  const compacted = [summaryMessage, ...recentMessages];
  const newTokens = estimateMessagesTokens(compacted);

  return {
    compacted,
    boundary,
    didCompact: true,
    stats: {
      originalCount: messages.length,
      newCount: compacted.length,
      estimatedTokensBefore: estimatedTokens,
      estimatedTokensAfter: newTokens,
    },
  };
}

/**
 * Check if compaction should be triggered
 *
 * @param messages - Current message list
 * @param options - Compaction options
 * @returns Whether compaction should be performed
 */
export function shouldCompact(
  messages: Message[],
  options: Partial<CompactionOptions> = {}
): boolean {
  const opts = { ...DEFAULT_COMPACTION_OPTIONS, ...options };
  const estimatedTokens = estimateMessagesTokens(messages);

  // Check token threshold
  if (estimatedTokens < opts.summarizeThreshold) {
    return false;
  }

  // Check if we have enough messages to compact
  if (messages.length <= opts.preserveRecentMessages + 2) {
    return false;
  }

  return true;
}

/**
 * Get compaction status for display
 */
export function getCompactionStatus(
  messages: Message[],
  options: Partial<CompactionOptions> = {}
): {
  tokens: number;
  threshold: number;
  percentUsed: number;
  needsCompaction: boolean;
} {
  const opts = { ...DEFAULT_COMPACTION_OPTIONS, ...options };
  const tokens = estimateMessagesTokens(messages);
  const percentUsed = Math.round((tokens / opts.maxTokens) * 100);

  return {
    tokens,
    threshold: opts.maxTokens,
    percentUsed,
    needsCompaction: shouldCompact(messages, options),
  };
}

export default compactContext;
