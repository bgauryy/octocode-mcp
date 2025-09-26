import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { withSecurityValidation } from '../security/withSecurityValidation.js';
import { createResult } from '../responses.js';
import { TOOL_NAMES } from '../constants.js';

export const OctocodeTestSchema = z.object({
  message: z.string().min(1, 'Message is required'),
});

export type OctocodeTestInput = z.infer<typeof OctocodeTestSchema>;

const OCTOCODE_TEST_DESCRIPTION = `Test tool for development

GOAL:
Simple test tool for development and debugging purposes.

FEATURES:
- Basic message parameter input
- Simple dummy response generation
- Tool registration testing

HINTS:
- Use for testing tool registration and basic functionality
- Provide message to test parameter validation
- Not intended for production use`;

export function registerOctocodeTestTool(server: McpServer) {
  return server.registerTool(
    TOOL_NAMES.OCTOCODE_TEST,
    {
      description: OCTOCODE_TEST_DESCRIPTION,
      inputSchema: OctocodeTestSchema.shape,
      annotations: {
        title: 'Octocode Test Tool',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    withSecurityValidation(
      async (args: OctocodeTestInput): Promise<CallToolResult> => {
        const response = `Test tool received: "${args.message}"`;

        return createResult({
          data: { message: args.message, response },
          hints: ['Test tool executed successfully'],
        });
      }
    )
  );
}
