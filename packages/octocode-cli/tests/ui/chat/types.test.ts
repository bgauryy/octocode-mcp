/**
 * Chat Types Tests
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_THEME,
  DEFAULT_CONFIG,
  type ChatMessage,
  type ChatState,
  type ChatStats,
  type ToolCall,
} from '../../../src/ui/chat/types.js';

describe('Chat Types', () => {
  describe('DEFAULT_THEME', () => {
    it('should have all required color properties', () => {
      // Purple/magenta theme for consistency with menu
      expect(DEFAULT_THEME.userColor).toBe('magenta');
      expect(DEFAULT_THEME.assistantColor).toBe('cyan');
      expect(DEFAULT_THEME.toolColor).toBe('yellow');
      expect(DEFAULT_THEME.systemColor).toBe('blue');
      expect(DEFAULT_THEME.errorColor).toBe('red');
      expect(DEFAULT_THEME.borderColor).toBe('magenta');
      expect(DEFAULT_THEME.dimColor).toBe('gray');
    });
  });

  describe('DEFAULT_CONFIG', () => {
    it('should have sensible defaults', () => {
      expect(DEFAULT_CONFIG.verbose).toBe(true);
      expect(DEFAULT_CONFIG.showToolCalls).toBe(true);
      expect(DEFAULT_CONFIG.showTimestamps).toBe(false);
      expect(DEFAULT_CONFIG.maxHistorySize).toBe(10000); // Increased from 100 for longer sessions
      expect(DEFAULT_CONFIG.theme).toEqual(DEFAULT_THEME);
    });
  });

  describe('Type Structures', () => {
    it('should allow valid ChatMessage', () => {
      const message: ChatMessage = {
        id: 'test-1',
        role: 'user',
        content: 'Hello',
        timestamp: new Date(),
      };
      expect(message.id).toBe('test-1');
      expect(message.role).toBe('user');
    });

    it('should allow ChatMessage with optional fields', () => {
      const message: ChatMessage = {
        id: 'test-2',
        role: 'tool',
        content: 'Executing...',
        timestamp: new Date(),
        toolName: 'search',
        toolResult: 'Found 5 results',
        isStreaming: true,
        tokens: { input: 100, output: 50 },
        durationMs: 1500,
      };
      expect(message.toolName).toBe('search');
      expect(message.isStreaming).toBe(true);
      expect(message.tokens?.input).toBe(100);
      expect(message.durationMs).toBe(1500);
    });

    it('should allow valid ToolCall', () => {
      const toolCall: ToolCall = {
        id: 'tool-1',
        name: 'search',
        args: { query: 'test' },
        status: 'pending',
      };
      expect(toolCall.status).toBe('pending');
    });

    it('should allow ToolCall with all statuses', () => {
      const statuses: ToolCall['status'][] = [
        'pending',
        'running',
        'completed',
        'error',
      ];
      statuses.forEach(status => {
        const toolCall: ToolCall = {
          id: 'tool-1',
          name: 'test',
          args: {},
          status,
        };
        expect(toolCall.status).toBe(status);
      });
    });

    it('should allow ToolCall with timing info', () => {
      const toolCall: ToolCall = {
        id: 'tool-1',
        name: 'search',
        args: {},
        status: 'completed',
        startTime: Date.now() - 1000,
        duration: 1000,
        result: 'success',
      };
      expect(toolCall.duration).toBe(1000);
      expect(toolCall.result).toBe('success');
    });

    it('should allow valid ChatStats', () => {
      const stats: ChatStats = {
        totalInputTokens: 1000,
        totalOutputTokens: 500,
        totalMessages: 10,
        totalToolCalls: 5,
        sessionStartTime: Date.now(),
        lastResponseTime: 2500,
        estimatedCost: 0.05,
      };
      expect(stats.totalInputTokens).toBe(1000);
      expect(stats.totalOutputTokens).toBe(500);
      expect(stats.totalMessages).toBe(10);
    });

    it('should allow valid ChatState with stats', () => {
      const stats: ChatStats = {
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalMessages: 0,
        totalToolCalls: 0,
        sessionStartTime: Date.now(),
      };
      const state: ChatState = {
        messages: [],
        isThinking: false,
        currentToolCalls: [],
        inputHistory: ['hello', 'world'],
        historyIndex: -1,
        stats,
        currentModel: 'claude-4-sonnet',
      };
      expect(state.messages).toHaveLength(0);
      expect(state.inputHistory).toHaveLength(2);
      expect(state.stats.totalInputTokens).toBe(0);
      expect(state.currentModel).toBe('claude-4-sonnet');
    });
  });
});
