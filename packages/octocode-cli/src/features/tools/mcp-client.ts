import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { tool, jsonSchema, type CoreTool, type ToolExecutionOptions } from 'ai';
import { OCTOCODE_NPX } from '../../configs/octocode.js';

/**
 * JSON Schema type (subset used by MCP tools)
 */
type JSONSchemaDefinition = {
  type?: string;
  properties?: Record<string, JSONSchemaDefinition>;
  required?: string[];
  items?: JSONSchemaDefinition;
  description?: string;
  enum?: unknown[];
  default?: unknown;
  [key: string]: unknown;
};

/**
 * Manages the connection to the Octocode MCP server
 */
export class OctocodeMCPClient {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;

  /**
   * Connect to the local Octocode MCP server
   */
  async connect(): Promise<void> {
    if (this.client) return;

    this.transport = new StdioClientTransport({
      command: OCTOCODE_NPX.command,
      args: OCTOCODE_NPX.args ?? [],
    });

    this.client = new Client(
      {
        name: 'octocode-cli',
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    );

    await this.client.connect(this.transport);
  }

  /**
   * Disconnect from the server
   */
  async disconnect(): Promise<void> {
    if (this.transport) {
      await this.transport.close();
      this.transport = null;
    }
    this.client = null;
  }

  /**
   * Get all available tools from the MCP server adapted for Vercel AI SDK
   */
  async getTools(): Promise<Record<string, CoreTool>> {
    if (!this.client) {
      await this.connect();
    }

    if (!this.client) {
      throw new Error('Failed to connect to MCP server');
    }

    const result = await this.client.listTools();
    const tools: Record<string, CoreTool> = {};

    for (const mcpTool of result.tools) {
      // Use jsonSchema to pass the MCP tool's schema directly to the AI SDK
      // This gives the model proper parameter information for better tool calls
      const inputSchema = mcpTool.inputSchema as JSONSchemaDefinition;

      tools[mcpTool.name] = tool({
        description: mcpTool.description || '',
        // Use the MCP tool's JSON schema directly - the model will see proper parameters
        parameters: jsonSchema(inputSchema),
        execute: async (args: unknown, _options: ToolExecutionOptions) => {
          if (!this.client) {
            throw new Error('MCP client disconnected');
          }
          const response = await this.client.callTool({
            name: mcpTool.name,
            arguments: args as Record<string, unknown>,
          });

          // Format output for the model
          if (response.content && Array.isArray(response.content)) {
            return response.content
              .map(c => (c.type === 'text' ? c.text : ''))
              .join('\n');
          }

          return JSON.stringify(response);
        },
      });
    }

    return tools;
  }
}

/**
 * Singleton instance
 */
export const octocodeClient = new OctocodeMCPClient();
