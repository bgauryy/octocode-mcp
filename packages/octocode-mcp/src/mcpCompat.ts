import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types';

type ToolHandler = (
  args: unknown,
  ctx: { authInfo?: AuthInfo; sessionId?: string }
) => Promise<CallToolResult>;

interface RegisteredToolDef {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  handler: ToolHandler;
}

const serverState = new WeakMap<Server, { tools: RegisteredToolDef[] }>();

function ensureWiring(server: Server) {
  if (!serverState.has(server)) {
    serverState.set(server, { tools: [] });

    server.setRequestHandler(ListToolsRequestSchema, async () => {
      const state = serverState.get(server)!;
      const tools: Tool[] = state.tools.map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: zodToJsonSchema(
          t.inputSchema
        ) as unknown as Tool['inputSchema'],
      }));
      return { tools };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
      const state = serverState.get(server)!;
      const tool = state.tools.find(t => t.name === request.params.name);
      if (!tool) {
        return {
          content: [
            {
              type: 'text',
              text: `Unknown tool: ${request.params.name}`,
            },
          ],
          isError: true,
        } as CallToolResult;
      }
      return await tool.handler(request.params.arguments, {
        authInfo: undefined as unknown as AuthInfo,
        sessionId: (extra as { sessionId?: string } | undefined)?.sessionId,
      });
    });
  }
}

export function registerTool(
  server: Server,
  name: string,
  config: { description: string; inputSchema: z.ZodTypeAny },
  handler: ToolHandler
) {
  ensureWiring(server);
  const state = serverState.get(server)!;
  state.tools.push({
    name,
    description: config.description,
    inputSchema: config.inputSchema,
    handler,
  });
}
