import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, type StdioServerParameters } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport, type StreamableHTTPClientTransportOptions } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { type CliSpec, type JsonSchema, type ToolAnnotations } from './spec.js';
export interface McpContentBlock {
    type: string;
    text?: string;
    data?: string;
    mimeType?: string;
    uri?: string;
    name?: string;
    description?: string;
    annotations?: {
        audience?: string[];
        priority?: number;
        lastModified?: string;
    };
    _meta?: Record<string, unknown>;
    resource?: {
        uri?: string;
        mimeType?: string;
        text?: string;
        blob?: string;
        _meta?: Record<string, unknown>;
    };
}
export interface McpToolInfo {
    name: string;
    description?: string;
    title?: string;
    inputSchema?: JsonSchema;
    outputSchema?: JsonSchema;
    annotations?: ToolAnnotations;
}
export interface McpToolResult {
    isError?: boolean;
    structuredContent?: Record<string, unknown>;
    content?: ReadonlyArray<McpContentBlock>;
    _meta?: Record<string, unknown>;
    toolResult?: unknown;
}
export interface McpClientLike {
    getInstructions(): string | undefined;
    getServerVersion(): {
        name?: string;
        version?: string;
    } | undefined;
    listTools(params?: {
        cursor?: string;
    }): Promise<{
        tools: readonly McpToolInfo[];
        nextCursor?: string;
    }>;
    callTool(params: {
        name: string;
        arguments?: Record<string, unknown>;
    }): Promise<McpToolResult>;
}
export declare function cliFromMcp(client: Client | McpClientLike): Promise<CliSpec>;
export declare function createStdioTransport(parameters: StdioServerParameters): StdioClientTransport;
export declare function createStreamableHttpTransport(url: string | URL, options?: StreamableHTTPClientTransportOptions): StreamableHTTPClientTransport;
export declare function connectClient(transport: Parameters<Client['connect']>[0]): Promise<Client>;
export declare function connectStdio(parameters: StdioServerParameters, connect?: (transport: StdioClientTransport) => Promise<Client>): Promise<Client>;
export declare function connectStreamableHttp(url: string | URL, options?: StreamableHTTPClientTransportOptions, connect?: (transport: StreamableHTTPClientTransport) => Promise<Client>): Promise<Client>;
