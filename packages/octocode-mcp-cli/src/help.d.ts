import { type CliCommand, type CliSpec, type Flag, type JsonSchema, type ToolAnnotations } from './spec.js';
export declare function stripAnsi(text: string): string;
export interface CommandHelpJson {
    name: string;
    description: string;
    usage: string;
    flags: readonly Flag[];
    schema: JsonSchema;
    inputSchema: JsonSchema;
    title?: string;
    outputSchema?: JsonSchema;
    annotations?: ToolAnnotations;
}
export interface RootHelpJson {
    instructions: string;
    commands: Array<{
        name: string;
        description: string;
        title?: string;
    }>;
}
export declare function commandHelp(spec: CliSpec, command: CliCommand): string;
export declare function commandHelpJson(spec: CliSpec, command: CliCommand): CommandHelpJson;
export declare function defaultOutput(spec: CliSpec): string;
export declare function rootHelp(spec: CliSpec): string;
export declare function rootHelpJson(spec: CliSpec): RootHelpJson;
