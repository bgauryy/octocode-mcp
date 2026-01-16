/**
 * MCP Protocol Types for /tools/list and /prompts/list endpoints
 * Based on: https://modelcontextprotocol.io/docs/concepts/tools
 */

// JSON Schema type for tool input schemas
export interface JsonSchema {
  $schema?: string;
  type: 'object';
  properties: Record<string, JsonSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface JsonSchemaProperty {
  type: string;
  description?: string;
  items?: JsonSchemaProperty;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  minItems?: number;
  maxItems?: number;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  enum?: (string | number | boolean)[];
  default?: unknown;
}

/**
 * MCP Tool representation for /tools/list
 */
interface McpTool {
  name: string;
  description: string;
  inputSchema: JsonSchema;
}

/**
 * MCP Prompt argument for /prompts/list
 */
export interface McpPromptArgument {
  name: string;
  description: string;
  required?: boolean;
}

/**
 * MCP Prompt representation for /prompts/list
 */
export interface McpPrompt {
  name: string;
  description: string;
  arguments?: McpPromptArgument[];
}

/**
 * Response metadata
 */
export interface ListResponseMeta {
  totalCount: number;
  version: string;
}

/**
 * Response type for GET /tools/list
 */
interface ListToolsResponse {
  tools: McpTool[];
  _meta?: ListResponseMeta;
}

/**
 * Response type for GET /prompts/list
 */
export interface ListPromptsResponse {
  prompts: McpPrompt[];
  _meta?: ListResponseMeta;
}

/**
 * Transform description-based schema to JSON Schema format
 * This is a fallback transformer when full JSON schemas are not available
 */
export function transformToJsonSchema(
  schemaDescriptions: Record<string, string>,
  toolName: string
): JsonSchema {
  const properties: Record<string, JsonSchemaProperty> = {};
  
  // Create properties from descriptions
  for (const [key, description] of Object.entries(schemaDescriptions)) {
    properties[key] = {
      type: 'string', // Default type - could be enhanced with type inference
      description,
    };
  }

  // Wrap in queries array structure (standard MCP bulk query pattern)
  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    properties: {
      queries: {
        type: 'array',
        description: `Research queries for ${toolName} (1-3 queries per call for optimal resource management). Review schema before use for optimal results`,
        items: {
          type: 'object',
          properties,
          required: ['mainResearchGoal', 'researchGoal', 'reasoning'],
        },
        minItems: 1,
        maxItems: 3,
      },
    },
    required: ['queries'],
  };
}
