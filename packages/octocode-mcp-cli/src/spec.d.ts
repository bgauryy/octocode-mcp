import { type ZodType } from 'zod';
export type FlagKind = 'string' | 'integer' | 'number' | 'boolean' | 'enum' | 'array' | 'json';
export type ItemKind = 'string' | 'integer' | 'number' | 'boolean';
export interface Flag {
    property: string;
    name: string;
    kind: FlagKind;
    required: boolean;
    presence: boolean;
    partial: boolean;
    hasDefault: boolean;
    description?: string;
    defaultValue?: unknown;
    enumValues?: unknown[];
    itemKind?: ItemKind;
}
export type JsonSchema = Record<string, unknown>;
export interface ToolAnnotations {
    title?: string;
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
}
export interface CliCommand {
    name: string;
    description: string;
    title?: string;
    flags: readonly Flag[];
    source: 'zod' | 'mcp';
    schema?: ZodType;
    inputSchema?: JsonSchema;
    outputSchema?: JsonSchema;
    annotations?: ToolAnnotations;
    mcpName?: string;
    fidelityNotes: readonly string[];
    run: (input: Record<string, unknown>, context?: {
        signal?: AbortSignal;
    }) => Promise<unknown> | unknown;
}
export interface CliSpec {
    name: string;
    instructions: string;
    version: string;
    commands: readonly CliCommand[];
}
export interface DefineCommandInput {
    name: string;
    description: string;
    run: CliCommand['run'];
    title?: string;
    schema?: ZodType;
    inputSchema?: JsonSchema;
    outputSchema?: JsonSchema;
    annotations?: ToolAnnotations;
    source?: 'zod' | 'mcp';
    mcpName?: string;
    notes?: readonly string[];
}
export declare function commandToken(name: string): {
    token: string;
    aliased: boolean;
};
export declare function flagsFromZod(schema: ZodType): {
    flags: Flag[];
    notes: string[];
};
export declare function flagsFromJsonSchema(schema: JsonSchema): {
    flags: Flag[];
    notes: string[];
};
export declare function defineCommand(input: DefineCommandInput): CliCommand;
export declare function defineCli(input: {
    name: string;
    instructions: string;
    version?: string;
    commands: readonly CliCommand[];
}): CliSpec;
export declare function withCommands(spec: CliSpec, extra: readonly CliCommand[]): CliSpec;
export declare function shellWord(value: string): string;
export declare function flagToken(flag: Flag): string;
export declare function usagePattern(bin: string, command: string, flags: readonly Flag[]): string;
export declare function commandJsonSchema(command: CliCommand): JsonSchema;
export declare function parseCommandInput(command: CliCommand, raw: Record<string, unknown>): Record<string, unknown>;
