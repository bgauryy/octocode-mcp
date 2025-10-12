import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  registerSampling,
  performSampling,
  createTextSamplingRequest,
  SamplingUtils,
  ResearchSampling,
  type SamplingRequest,
} from '../src/sampling.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TOOL_NAMES } from '../src/constants.js';

describe('Sampling Module', () => {
  describe('registerSampling', () => {
    it('should register sampling without errors', () => {
      const mockServer = {
        capabilities: { sampling: {} },
      } as unknown as McpServer;

      expect(() => registerSampling(mockServer)).not.toThrow();
    });
  });

  describe('performSampling', () => {
    let mockServer: McpServer;

    beforeEach(() => {
      mockServer = {
        server: {
          request: vi.fn(),
        },
      } as unknown as McpServer;
    });

    it('should successfully perform sampling with valid request', async () => {
      const mockResponse = {
        content: {
          type: 'text',
          text: 'Generated response',
        },
        stopReason: 'endTurn',
      };

      vi.mocked(mockServer.server.request).mockResolvedValue(mockResponse);

      const samplingRequest: SamplingRequest = {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: 'Test prompt',
            },
          },
        ],
        maxTokens: 1000,
        temperature: 0.7,
      };

      const result = await performSampling(mockServer, samplingRequest);

      expect(result).toEqual({
        content: 'Generated response',
        stopReason: 'endTurn',
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
        },
      });

      expect(mockServer.server.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'sampling/createMessage',
          params: {
            messages: samplingRequest.messages,
            maxTokens: 1000,
            temperature: 0.7,
            stopSequences: undefined,
          },
        }),
        expect.anything()
      );
    });

    it('should handle non-text response', async () => {
      const mockResponse = {
        content: {
          type: 'image',
          data: 'base64data',
        },
        stopReason: 'endTurn',
      };

      vi.mocked(mockServer.server.request).mockResolvedValue(mockResponse);

      const samplingRequest: SamplingRequest = {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: 'Test',
            },
          },
        ],
        maxTokens: 1000,
        temperature: 0.7,
      };

      const result = await performSampling(mockServer, samplingRequest);

      expect(result.content).toBe('Non-text response received');
    });

    it('should include stopSequences in request when provided', async () => {
      const mockResponse = {
        content: { type: 'text', text: 'Response' },
        stopReason: 'stopSequence',
      };

      vi.mocked(mockServer.server.request).mockResolvedValue(mockResponse);

      const samplingRequest: SamplingRequest = {
        messages: [
          {
            role: 'user',
            content: { type: 'text', text: 'Test' },
          },
        ],
        maxTokens: 1000,
        temperature: 0.7,
        stopSequences: ['```', '---'],
      };

      await performSampling(mockServer, samplingRequest);

      expect(mockServer.server.request).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            stopSequences: ['```', '---'],
          }),
        }),
        expect.anything()
      );
    });

    it('should handle sampling errors', async () => {
      vi.mocked(mockServer.server.request).mockRejectedValue(
        new Error('Network error')
      );

      const samplingRequest: SamplingRequest = {
        messages: [
          {
            role: 'user',
            content: { type: 'text', text: 'Test' },
          },
        ],
        maxTokens: 1000,
        temperature: 0.7,
      };

      await expect(
        performSampling(mockServer, samplingRequest)
      ).rejects.toThrow('Sampling failed: Network error');
    });

    it('should handle validation errors', async () => {
      const invalidRequest = {
        messages: [],
        maxTokens: -100, // Invalid
      } as unknown as SamplingRequest;

      await expect(performSampling(mockServer, invalidRequest)).rejects.toThrow(
        'Sampling failed:'
      );
    });
  });

  describe('createTextSamplingRequest', () => {
    it('should create basic sampling request with defaults', () => {
      const result = createTextSamplingRequest('Test prompt');

      expect(result).toEqual({
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: 'Test prompt',
            },
          },
        ],
        maxTokens: 1000,
        temperature: 0.7,
        stopSequences: undefined,
      });
    });

    it('should create sampling request with custom options', () => {
      const result = createTextSamplingRequest('Test prompt', {
        maxTokens: 2000,
        temperature: 0.3,
        stopSequences: ['STOP', 'END'],
      });

      expect(result).toEqual({
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: 'Test prompt',
            },
          },
        ],
        maxTokens: 2000,
        temperature: 0.3,
        stopSequences: ['STOP', 'END'],
      });
    });

    it('should handle empty prompt', () => {
      const result = createTextSamplingRequest('');

      expect(result.messages[0]?.content.text).toBe('');
    });
  });

  describe('SamplingUtils', () => {
    describe('createCodeSamplingRequest', () => {
      it('should create code generation request with defaults', () => {
        const result = SamplingUtils.createCodeSamplingRequest(
          'Sort an array',
          'typescript'
        );

        expect(result.messages[0]?.content.text).toContain('typescript');
        expect(result.messages[0]?.content.text).toContain('Sort an array');
        expect(result.maxTokens).toBe(2000);
        expect(result.temperature).toBe(0.3);
        expect(result.stopSequences).toEqual(['```']);
      });

      it('should use default language when not provided', () => {
        const result =
          SamplingUtils.createCodeSamplingRequest('Create a function');

        expect(result.messages[0]?.content.text).toContain('typescript');
      });

      it('should support custom options', () => {
        const result = SamplingUtils.createCodeSamplingRequest(
          'Create API endpoint',
          'python',
          { maxTokens: 3000, temperature: 0.5 }
        );

        expect(result.messages[0]?.content.text).toContain('python');
        expect(result.maxTokens).toBe(3000);
        expect(result.temperature).toBe(0.5);
      });
    });

    describe('createCompletionSamplingRequest', () => {
      it('should create completion request', () => {
        const result =
          SamplingUtils.createCompletionSamplingRequest('Once upon a time');

        expect(result.messages[0]?.content.text).toContain(
          'Complete the following'
        );
        expect(result.messages[0]?.content.text).toContain('Once upon a time');
      });

      it('should support custom options', () => {
        const result = SamplingUtils.createCompletionSamplingRequest('Test', {
          maxTokens: 500,
          temperature: 0.9,
        });

        expect(result.maxTokens).toBe(500);
        expect(result.temperature).toBe(0.9);
      });
    });

    describe('createQASamplingRequest', () => {
      it('should create QA request without context', () => {
        const result = SamplingUtils.createQASamplingRequest('What is MCP?');

        expect(result.messages[0]?.content.text).toBe('What is MCP?');
      });

      it('should create QA request with context', () => {
        const result = SamplingUtils.createQASamplingRequest(
          'What is the main benefit?',
          'MCP provides a standard protocol for AI tools'
        );

        expect(result.messages[0]?.content.text).toContain('Context:');
        expect(result.messages[0]?.content.text).toContain(
          'MCP provides a standard protocol'
        );
        expect(result.messages[0]?.content.text).toContain('Question:');
        expect(result.messages[0]?.content.text).toContain(
          'What is the main benefit?'
        );
      });

      it('should support custom options', () => {
        const result = SamplingUtils.createQASamplingRequest(
          'What is this?',
          'Context here',
          { maxTokens: 800, temperature: 0.4 }
        );

        expect(result.maxTokens).toBe(800);
        expect(result.temperature).toBe(0.4);
      });
    });

    describe('createResearchSamplingRequest', () => {
      it('should create research sampling request', async () => {
        const result = await SamplingUtils.createResearchSamplingRequest(
          'session-123',
          TOOL_NAMES.GITHUB_SEARCH_CODE,
          'Find authentication code',
          { query: 'auth' }
        );

        expect(result.messages[0]?.content.text).toContain(
          'Find authentication code'
        );
        expect(result.messages[0]?.content.text).toContain('session-123');
        expect(result.messages[0]?.content.text).toContain('githubSearchCode');
        expect(result.messages[0]?.content.text).toContain(
          'Research Enhancement'
        );
        expect(result.maxTokens).toBe(2000);
        expect(result.temperature).toBe(0.7);
      });

      it('should support custom options', async () => {
        const result = await SamplingUtils.createResearchSamplingRequest(
          'session-456',
          TOOL_NAMES.GITHUB_FETCH_CONTENT,
          'Get file content',
          {},
          { maxTokens: 1500, temperature: 0.5 }
        );

        expect(result.maxTokens).toBe(1500);
        expect(result.temperature).toBe(0.5);
      });
    });

    describe('createSynthesisSamplingRequest', () => {
      it('should create synthesis request with discoveries', () => {
        const discoveries = [
          'Found authentication in auth.ts',
          'Uses JWT tokens',
          'Implements rate limiting',
        ];

        const result =
          SamplingUtils.createSynthesisSamplingRequest(discoveries);

        expect(result.messages[0]?.content.text).toContain(
          'Research Synthesis'
        );
        expect(result.messages[0]?.content.text).toContain(
          '1. Found authentication in auth.ts'
        );
        expect(result.messages[0]?.content.text).toContain(
          '2. Uses JWT tokens'
        );
        expect(result.messages[0]?.content.text).toContain(
          '3. Implements rate limiting'
        );
        expect(result.maxTokens).toBe(3000);
        expect(result.temperature).toBe(0.6);
      });

      it('should handle empty discoveries', () => {
        const result = SamplingUtils.createSynthesisSamplingRequest([]);

        expect(result.messages[0]?.content.text).toContain(
          'Research Synthesis'
        );
      });

      it('should support custom options', () => {
        const result = SamplingUtils.createSynthesisSamplingRequest(
          ['Discovery 1'],
          { maxTokens: 2500, temperature: 0.8 }
        );

        expect(result.maxTokens).toBe(2500);
        expect(result.temperature).toBe(0.8);
      });
    });
  });

  describe('ResearchSampling', () => {
    describe('injectToolContext', () => {
      it('should return null (not implemented)', async () => {
        const result = await ResearchSampling.injectToolContext(
          'session-123',
          TOOL_NAMES.GITHUB_SEARCH_CODE,
          { query: 'test' },
          ['hint1', 'hint2']
        );

        expect(result).toBeNull();
      });
    });

    describe('updateSession', () => {
      it('should not throw when called', () => {
        expect(() =>
          ResearchSampling.updateSession(
            'session-123',
            TOOL_NAMES.GITHUB_SEARCH_CODE,
            { query: 'test' },
            {
              success: true,
              resultCount: 5,
              hints: ['hint1'],
              executionTime: 123,
            }
          )
        ).not.toThrow();
      });

      it('should handle error results', () => {
        expect(() =>
          ResearchSampling.updateSession(
            'session-456',
            TOOL_NAMES.GITHUB_FETCH_CONTENT,
            { path: 'test.ts' },
            {
              success: false,
              resultCount: 0,
              hints: [],
              error: 'File not found',
              executionTime: 50,
            }
          )
        ).not.toThrow();
      });
    });

    describe('getSessionInsights', () => {
      it('should return null (not implemented)', () => {
        const result = ResearchSampling.getSessionInsights('session-123');

        expect(result).toBeNull();
      });

      it('should handle different session IDs', () => {
        const result1 = ResearchSampling.getSessionInsights('session-1');
        const result2 = ResearchSampling.getSessionInsights('session-2');

        expect(result1).toBeNull();
        expect(result2).toBeNull();
      });
    });
  });

  describe('Edge Cases and Validation', () => {
    it('should handle very long prompts', () => {
      const longPrompt = 'a'.repeat(10000);
      const result = createTextSamplingRequest(longPrompt);

      expect(result.messages[0]?.content.text).toBe(longPrompt);
    });

    it('should handle special characters in prompts', () => {
      const specialPrompt = '```\n<xml>\n"quotes"\n\'apostrophes\'';
      const result = createTextSamplingRequest(specialPrompt);

      expect(result.messages[0]?.content.text).toBe(specialPrompt);
    });

    it('should handle boundary values for maxTokens', () => {
      const result1 = createTextSamplingRequest('Test', { maxTokens: 1 });
      const result2 = createTextSamplingRequest('Test', { maxTokens: 100000 });

      expect(result1.maxTokens).toBe(1);
      expect(result2.maxTokens).toBe(100000);
    });

    it('should handle boundary values for temperature', () => {
      const result1 = createTextSamplingRequest('Test', { temperature: 0 });
      const result2 = createTextSamplingRequest('Test', { temperature: 2 });

      expect(result1.temperature).toBe(0);
      expect(result2.temperature).toBe(2);
    });

    it('should handle multiple stop sequences', () => {
      const stopSeqs = ['```', '---', 'END', 'STOP', '###'];
      const result = createTextSamplingRequest('Test', {
        stopSequences: stopSeqs,
      });

      expect(result.stopSequences).toEqual(stopSeqs);
    });

    it('should handle empty stop sequences array', () => {
      const result = createTextSamplingRequest('Test', { stopSequences: [] });

      expect(result.stopSequences).toEqual([]);
    });
  });
});
