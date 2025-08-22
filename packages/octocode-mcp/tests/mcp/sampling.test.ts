import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  performSampling,
  createTextSamplingRequest,
  SamplingUtils,
  type SamplingRequest,
} from '../../src/mcp/sampling.js';

describe('Sampling', () => {
  let mockServer: McpServer;
  let mockRequest: Mock;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create a mock request function
    mockRequest = vi.fn().mockResolvedValue({
      content: {
        type: 'text',
        text: 'This is a generated response from the LLM',
      },
      stopReason: 'endTurn',
    });

    // Create a mock MCP server
    mockServer = {
      server: {
        request: mockRequest,
      },
    } as unknown as McpServer;
  });

  describe('performSampling', () => {
    it('should validate and process a valid sampling request', async () => {
      const samplingRequest: SamplingRequest = {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: 'Hello, world!',
            },
          },
        ],
        maxTokens: 1000,
        temperature: 0.7,
      };

      const result = await performSampling(mockServer, samplingRequest);

      expect(result).toHaveProperty('content');
      expect(result).toHaveProperty('stopReason', 'endTurn');
      expect(result).toHaveProperty('usage');
      expect(result.content).toBe('This is a generated response from the LLM');

      // Verify the server was called with the correct parameters
      expect(mockRequest).toHaveBeenCalledWith(
        {
          method: 'sampling/createMessage',
          params: {
            messages: samplingRequest.messages,
            maxTokens: 1000,
            temperature: 0.7,
            stopSequences: undefined,
          },
        },
        expect.any(Object) // CreateMessageResultSchema
      );
    });

    it('should handle invalid input and throw error', async () => {
      const invalidRequest = {
        messages: [
          {
            role: 'invalid-role', // Invalid role
            content: {
              type: 'text',
              text: 'Hello',
            },
          },
        ],
        maxTokens: 1000,
        temperature: 0.7,
      } as unknown as SamplingRequest;

      await expect(performSampling(mockServer, invalidRequest)).rejects.toThrow(
        'Sampling failed:'
      );
    });

    it('should handle non-text responses correctly', async () => {
      // Mock a non-text response
      mockRequest.mockResolvedValueOnce({
        content: {
          type: 'image',
          data: 'base64imagedata',
        },
        stopReason: 'endTurn',
      });

      const samplingRequest: SamplingRequest = {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: 'Generate an image',
            },
          },
        ],
        maxTokens: 1000,
        temperature: 0.7,
      };

      const result = await performSampling(mockServer, samplingRequest);

      expect(result.content).toBe('Non-text response received');
      expect(result.stopReason).toBe('endTurn');
    });

    it('should handle server request errors', async () => {
      // Mock a server error
      mockRequest.mockRejectedValueOnce(new Error('Server connection failed'));

      const samplingRequest: SamplingRequest = {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: 'Hello',
            },
          },
        ],
        maxTokens: 1000,
        temperature: 0.7,
      };

      await expect(
        performSampling(mockServer, samplingRequest)
      ).rejects.toThrow('Sampling failed: Server connection failed');
    });
  });

  describe('createTextSamplingRequest', () => {
    it('should create a valid sampling request with default options', () => {
      const text = 'Test prompt';
      const request = createTextSamplingRequest(text);

      expect(request.messages).toHaveLength(1);
      expect(request.messages[0]!.role).toBe('user');
      expect(request.messages[0]!.content.text).toBe(text);
      expect(request.maxTokens).toBe(1000);
      expect(request.temperature).toBe(0.7);
    });

    it('should create a sampling request with custom options', () => {
      const text = 'Custom prompt';
      const options = {
        maxTokens: 2000,
        temperature: 0.5,
        stopSequences: ['END'],
      };
      const request = createTextSamplingRequest(text, options);

      expect(request.maxTokens).toBe(2000);
      expect(request.temperature).toBe(0.5);
      expect(request.stopSequences).toEqual(['END']);
    });
  });

  describe('SamplingUtils', () => {
    describe('createCodeSamplingRequest', () => {
      it('should create a code generation sampling request', () => {
        const prompt = 'Create a function that adds two numbers';
        const language = 'javascript';
        const request = SamplingUtils.createCodeSamplingRequest(
          prompt,
          language
        );

        expect(request.messages[0]!.content.text).toContain(
          'Generate javascript code'
        );
        expect(request.messages[0]!.content.text).toContain(prompt);
        expect(request.maxTokens).toBe(2000);
        expect(request.temperature).toBe(0.3); // Lower temperature for code
        expect(request.stopSequences).toContain('```');
      });

      it('should use default typescript language', () => {
        const prompt = 'Create a function';
        const request = SamplingUtils.createCodeSamplingRequest(prompt);

        expect(request.messages[0]!.content.text).toContain(
          'Generate typescript code'
        );
      });
    });

    describe('createCompletionSamplingRequest', () => {
      it('should create a text completion sampling request', () => {
        const text = 'Once upon a time';
        const request = SamplingUtils.createCompletionSamplingRequest(text);

        expect(request.messages[0]!.content.text).toContain(
          'Complete the following text'
        );
        expect(request.messages[0]!.content.text).toContain(text);
      });
    });

    describe('createQASamplingRequest', () => {
      it('should create a Q&A sampling request without context', () => {
        const question = 'What is the capital of France?';
        const request = SamplingUtils.createQASamplingRequest(question);

        expect(request.messages[0]!.content.text).toBe(question);
      });

      it('should create a Q&A sampling request with context', () => {
        const question = 'What is the capital?';
        const context = 'France is a country in Europe.';
        const request = SamplingUtils.createQASamplingRequest(
          question,
          context
        );

        expect(request.messages[0]!.content.text).toContain('Context:');
        expect(request.messages[0]!.content.text).toContain(context);
        expect(request.messages[0]!.content.text).toContain('Question:');
        expect(request.messages[0]!.content.text).toContain(question);
      });
    });
  });
});
