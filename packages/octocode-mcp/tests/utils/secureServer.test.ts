import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  sanitizeCallToolResult,
  withOutputSanitization,
} from '../../src/utils/secureServer.js';

describe('secureServer', () => {
  describe('sanitizeCallToolResult', () => {
    it('should redact secrets in content[] text items', () => {
      const result: CallToolResult = {
        content: [
          {
            type: 'text',
            text: 'token: ghp_abc123xyz456789012345678901234567890',
          },
        ],
      };
      const sanitized = sanitizeCallToolResult(result);
      expect(sanitized.content[0]).toHaveProperty('type', 'text');
      const text = (sanitized.content[0] as { type: 'text'; text: string })
        .text;
      expect(text).not.toContain('ghp_abc123xyz456789012345678901234567890');
      expect(text).toContain('[REDACTED-');
    });

    it('should pass through text items without secrets unchanged', () => {
      const result: CallToolResult = {
        content: [{ type: 'text', text: 'hello world' }],
      };
      const sanitized = sanitizeCallToolResult(result);
      expect(sanitized.content[0]).toEqual({
        type: 'text',
        text: 'hello world',
      });
    });

    it('should pass through non-text content items unchanged', () => {
      const imageItem = {
        type: 'image' as const,
        data: 'base64data',
        mimeType: 'image/png',
      };
      const result: CallToolResult = { content: [imageItem] };
      const sanitized = sanitizeCallToolResult(result);
      expect(sanitized.content[0]).toBe(imageItem);
    });

    it('should deep-walk and redact secrets in structuredContent', () => {
      const result: CallToolResult = {
        content: [],
        structuredContent: {
          data: {
            nested: 'token: ghp_abc123xyz456789012345678901234567890',
          },
          safe: 'no secrets here',
        },
      };
      const sanitized = sanitizeCallToolResult(result);
      const nested = (sanitized.structuredContent as Record<string, unknown>)
        .data as Record<string, unknown>;
      expect(nested.nested).not.toContain(
        'ghp_abc123xyz456789012345678901234567890'
      );
    });

    it('should sanitize structuredContent arrays', () => {
      const result: CallToolResult = {
        content: [],
        structuredContent: {
          items: ['safe', 'ghp_abc123xyz456789012345678901234567890'],
        },
      };
      const sanitized = sanitizeCallToolResult(result);
      const items = (sanitized.structuredContent as Record<string, unknown>)
        .items as string[];
      expect(items[0]).toBe('safe');
      expect(items[1]).not.toContain(
        'ghp_abc123xyz456789012345678901234567890'
      );
    });

    it('should preserve isError flag', () => {
      const result: CallToolResult = {
        content: [{ type: 'text', text: 'error occurred' }],
        isError: true,
      };
      const sanitized = sanitizeCallToolResult(result);
      expect(sanitized.isError).toBe(true);
    });

    it('should handle empty content array', () => {
      const result: CallToolResult = { content: [] };
      const sanitized = sanitizeCallToolResult(result);
      expect(sanitized.content).toEqual([]);
    });

    it('should handle result with no structuredContent', () => {
      const result: CallToolResult = {
        content: [{ type: 'text', text: 'ok' }],
      };
      const sanitized = sanitizeCallToolResult(result);
      expect(sanitized.structuredContent).toBeUndefined();
    });

    it('should handle multiple content items with mixed types', () => {
      const result: CallToolResult = {
        content: [
          { type: 'text', text: 'ghp_abc123xyz456789012345678901234567890' },
          {
            type: 'image' as const,
            data: 'base64',
            mimeType: 'image/png',
          },
          { type: 'text', text: 'clean text' },
        ],
      };
      const sanitized = sanitizeCallToolResult(result);
      expect(
        (sanitized.content[0] as { type: 'text'; text: string }).text
      ).not.toContain('ghp_abc123');
      expect(sanitized.content[1]).toHaveProperty('type', 'image');
      expect(
        (sanitized.content[2] as { type: 'text'; text: string }).text
      ).toBe('clean text');
    });

    it('should sanitize both content and structuredContent simultaneously', () => {
      const result: CallToolResult = {
        content: [
          {
            type: 'text',
            text: 'key=ghp_abc123xyz456789012345678901234567890',
          },
        ],
        structuredContent: {
          token: 'ghp_def456abc7890123456789012345678901ab',
        },
      };
      const sanitized = sanitizeCallToolResult(result);
      expect(
        (sanitized.content[0] as { type: 'text'; text: string }).text
      ).not.toContain('ghp_abc123');
      expect(
        (sanitized.structuredContent as Record<string, unknown>).token
      ).not.toContain('ghp_def456');
    });
  });

  describe('withOutputSanitization', () => {
    let server: McpServer;
    let capturedCb: (...args: unknown[]) => Promise<CallToolResult>;
    let proxy: McpServer;

    beforeEach(() => {
      server = {
        registerTool: vi.fn((_name: string, _config: unknown, cb: unknown) => {
          capturedCb = cb as typeof capturedCb;
          return {} as never;
        }),
      } as unknown as McpServer;
      proxy = withOutputSanitization(server);
    });

    it('should return a proxy, not the original server', () => {
      expect(proxy).not.toBe(server);
    });

    it('should delegate to the original registerTool', () => {
      const handler = vi.fn();
      proxy.registerTool('testTool', {} as never, handler as never);
      expect(server.registerTool).toHaveBeenCalledOnce();
    });

    it('should not replace registerTool on the original server', () => {
      const originalFn = server.registerTool;
      withOutputSanitization(server);
      expect(server.registerTool).toBe(originalFn);
    });

    it('should sanitize the callback return value', async () => {
      const rawHandler = vi.fn().mockResolvedValue({
        content: [
          {
            type: 'text',
            text: 'secret: ghp_abc123xyz456789012345678901234567890',
          },
        ],
      } satisfies CallToolResult);

      proxy.registerTool('myTool', {} as never, rawHandler as never);
      const result = await capturedCb({ query: 'test' });
      expect(
        (result.content[0] as { type: 'text'; text: string }).text
      ).not.toContain('ghp_abc123');
      expect(rawHandler).toHaveBeenCalledOnce();
    });

    it('should sanitize structuredContent from the callback', async () => {
      const rawHandler = vi.fn().mockResolvedValue({
        content: [],
        structuredContent: {
          key: 'ghp_abc123xyz456789012345678901234567890',
        },
      } satisfies CallToolResult);

      proxy.registerTool('myTool', {} as never, rawHandler as never);
      const result = await capturedCb({});
      expect(
        (result.structuredContent as Record<string, unknown>).key
      ).not.toContain('ghp_abc123');
    });

    it('should forward all arguments to the original callback', async () => {
      const rawHandler = vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'ok' }],
      } satisfies CallToolResult);

      proxy.registerTool('myTool', {} as never, rawHandler as never);
      const args = { query: 'test' };
      const extra = { authInfo: { sub: 'user' }, sessionId: 'sid-1' };
      await capturedCb(args, extra);
      expect(rawHandler).toHaveBeenCalledWith(args, extra);
    });

    it('should pass through clean results without modification', async () => {
      const cleanResult: CallToolResult = {
        content: [{ type: 'text', text: 'hello' }],
        isError: false,
      };
      const rawHandler = vi.fn().mockResolvedValue(cleanResult);

      proxy.registerTool('myTool', {} as never, rawHandler as never);
      const result = await capturedCb({});
      expect(result.content).toEqual(cleanResult.content);
      expect(result.isError).toBe(false);
    });

    it('should preserve tool name and config passed to registerTool', () => {
      const config = { description: 'My tool', inputSchema: {} };
      proxy.registerTool('myTool', config as never, (() => {}) as never);

      expect(server.registerTool).toHaveBeenCalledWith(
        'myTool',
        config,
        expect.any(Function)
      );
    });

    it('should proxy other properties transparently', () => {
      const serverWithExtra = {
        ...server,
        someOtherProp: 42,
      } as unknown as McpServer;
      const p = withOutputSanitization(serverWithExtra);
      expect((p as unknown as { someOtherProp: number }).someOtherProp).toBe(
        42
      );
    });
  });
});
