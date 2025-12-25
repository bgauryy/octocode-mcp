/**
 * Tests for research_local_explorer prompt registration
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  registerLocalResearchPrompt,
  PROMPT_NAME,
} from '../../prompts/research_local_explorer.js';

describe('research_local_explorer prompt', () => {
  describe('PROMPT_NAME', () => {
    it('should export the correct prompt name', () => {
      expect(PROMPT_NAME).toBe('research_local');
    });
  });

  describe('registerLocalResearchPrompt', () => {
    let mockServer: {
      registerPrompt: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
      mockServer = {
        registerPrompt: vi.fn(),
      };
    });

    it('should register prompt with server', () => {
      registerLocalResearchPrompt(
        mockServer as unknown as Parameters<
          typeof registerLocalResearchPrompt
        >[0]
      );

      expect(mockServer.registerPrompt).toHaveBeenCalledTimes(1);
      expect(mockServer.registerPrompt).toHaveBeenCalledWith(
        PROMPT_NAME,
        expect.any(Object),
        expect.any(Function)
      );
    });

    it('should register with correct description', () => {
      registerLocalResearchPrompt(
        mockServer as unknown as Parameters<
          typeof registerLocalResearchPrompt
        >[0]
      );

      const [, config] = mockServer.registerPrompt.mock.calls[0];
      expect(config.description).toContain('local code research');
      expect(config.description).toContain('local_view_structure');
      expect(config.description).toContain('local_ripgrep');
      expect(config.description).toContain('local_find_files');
      expect(config.description).toContain('local_fetch_content');
    });

    it('should register with empty args schema', () => {
      registerLocalResearchPrompt(
        mockServer as unknown as Parameters<
          typeof registerLocalResearchPrompt
        >[0]
      );

      const [, config] = mockServer.registerPrompt.mock.calls[0];
      expect(config.argsSchema).toEqual({});
    });

    it('should return messages with system prompt', async () => {
      registerLocalResearchPrompt(
        mockServer as unknown as Parameters<
          typeof registerLocalResearchPrompt
        >[0]
      );

      const [, , handler] = mockServer.registerPrompt.mock.calls[0];
      const result = await handler();

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe('user');
      expect(result.messages[0].content.type).toBe('text');
    });

    it('should include SYSTEM PROMPT section', async () => {
      registerLocalResearchPrompt(
        mockServer as unknown as Parameters<
          typeof registerLocalResearchPrompt
        >[0]
      );

      const [, , handler] = mockServer.registerPrompt.mock.calls[0];
      const result = await handler();

      expect(result.messages[0].content.text).toContain('# SYSTEM PROMPT:');
    });

    it('should include User Query section', async () => {
      registerLocalResearchPrompt(
        mockServer as unknown as Parameters<
          typeof registerLocalResearchPrompt
        >[0]
      );

      const [, , handler] = mockServer.registerPrompt.mock.calls[0];
      const result = await handler();

      expect(result.messages[0].content.text).toContain('# User Query:');
    });

    it('should include research methodology content', async () => {
      registerLocalResearchPrompt(
        mockServer as unknown as Parameters<
          typeof registerLocalResearchPrompt
        >[0]
      );

      const [, , handler] = mockServer.registerPrompt.mock.calls[0];
      const result = await handler();

      const text = result.messages[0].content.text;

      // Check for key content from the prompt
      expect(text).toContain('Local Explorer');
    });
  });
});
