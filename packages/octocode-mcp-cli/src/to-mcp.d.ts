import { type CliSpec, type JsonSchema, type ToolAnnotations } from './spec.js';
export interface McpToolDefinition {
    name: string;
    description: string;
    inputSchema: JsonSchema;
    title?: string;
    outputSchema?: JsonSchema;
    annotations?: ToolAnnotations;
}
export interface McpExport {
    instructions: string;
    tools: McpToolDefinition[];
}
export interface ToolRegistrar {
    registerTool(name: string, config: {
        description?: string;
        inputSchema?: unknown;
        title?: string;
        outputSchema?: unknown;
        annotations?: ToolAnnotations;
    }, callback: (args: Record<string, unknown>, context?: {
        signal?: AbortSignal;
        mcpReq?: {
            signal?: AbortSignal;
        };
    }) => Promise<{
        content: Array<{
            type: 'text';
            text: string;
        }>;
        structuredContent?: Record<string, unknown>;
    }>): unknown;
}
export declare function cliToMcp(spec: CliSpec): McpExport;
export declare function jsonSchemaStandard(schema: JsonSchema): {
    '~standard': Record<string, unknown>;
};
export declare function mcpServerOptions(spec: CliSpec): {
    instructions: string;
};
export declare function registerOn(server: ToolRegistrar, spec: CliSpec): void;
