import { describe, it, expect, vi } from 'vitest';
import { withSecurityValidation } from '../../../src/mcp/utils/withSecurityValidation';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';

describe('withSecurityValidation Type Safety', () => {
  it('should validate type structure after sanitization', async () => {
    // Mock handler that expects specific types
    const mockHandler = vi.fn(async (args: { name: string; count: number }) => {
      return { 
        content: [{ type: 'text', text: `${args.name}: ${args.count}` }] 
      } as CallToolResult;
    });

    const validatedHandler = withSecurityValidation(mockHandler);

    // Test with valid input
    const result = await validatedHandler({ 
      name: 'test', 
      count: 42 
    });

    expect(mockHandler).toHaveBeenCalledWith({ 
      name: 'test', 
      count: 42 
    });
  });

  it('should handle content with secrets while preserving structure', async () => {
    const mockHandler = vi.fn(async (args: { apiKey: string; data: string }) => {
      return { 
        content: [{ type: 'text', text: `Processed: ${args.data}` }] 
      } as CallToolResult;
    });

    const validatedHandler = withSecurityValidation(mockHandler);

    // Input with normal data (ContentSanitizer validates structure, not content secrets in params)
    const result = await validatedHandler({ 
      apiKey: 'sk-1234567890',
      data: 'normal data'
    });

    // The handler should be called with the input (param validation doesn't redact secrets)
    expect(mockHandler).toHaveBeenCalled();
    const calledWith = mockHandler.mock.calls[0][0];
    
    // Verify structure is preserved
    expect(calledWith).toHaveProperty('apiKey');
    expect(calledWith).toHaveProperty('data');
    expect(calledWith.data).toBe('normal data');
  });

  it('should reject invalid type structures', async () => {
    const mockHandler = vi.fn(async (args: { required: string }) => {
      return { 
        content: [{ type: 'text', text: 'Success' }] 
      } as CallToolResult;
    });

    const validatedHandler = withSecurityValidation(mockHandler);

    // Test with null input (invalid structure)
    const result = await validatedHandler(null);
    
    expect(result).toHaveProperty('isError', true);
    expect(mockHandler).not.toHaveBeenCalled();
  });

  it('should maintain type safety without unsafe casting', async () => {
    // This test verifies that our type guard provides proper type narrowing
    interface SpecificArgs {
      id: number;
      data: { nested: string };
    }

    const mockHandler = vi.fn(async (args: SpecificArgs) => {
      // TypeScript should recognize args as SpecificArgs here
      const value: number = args.id; // Type-safe access
      const nested: string = args.data.nested; // Type-safe nested access
      
      return { 
        content: [{ type: 'text', text: `${value}: ${nested}` }] 
      } as CallToolResult;
    });

    const validatedHandler = withSecurityValidation(mockHandler);

    const result = await validatedHandler({
      id: 123,
      data: { nested: 'test' }
    });

    expect(mockHandler).toHaveBeenCalledWith({
      id: 123,
      data: { nested: 'test' }
    });
  });
});