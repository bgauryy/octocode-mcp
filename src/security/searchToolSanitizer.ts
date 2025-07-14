import { ContentSanitizer } from './contentSanitizer';
import { createResult } from '../mcp/responses';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';

export function validateSearchToolInput(args: Record<string, any>): {
  isValid: boolean;
  sanitizedArgs: Record<string, any>;
  error?: CallToolResult;
} {
  const validation = ContentSanitizer.validateInputParameters(args);

  if (!validation.isValid) {
    return {
      isValid: false,
      sanitizedArgs: {},
      error: createResult({
        error: `Security validation failed: ${validation.warnings.join(', ')}`,
      }),
    };
  }

  return {
    isValid: true,
    sanitizedArgs: validation.sanitizedParams,
  };
}
