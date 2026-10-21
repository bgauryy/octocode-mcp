import { type CliSpec } from './spec.js';
export interface CliIo {
    stdout: (text: string) => void;
    stderr: (text: string) => void;
}
declare const CLI_VIEW: unique symbol;
export interface CliView {
    text: string;
    json: unknown;
    readonly [CLI_VIEW]: true;
}
export declare function cliView(text: string, json: unknown): CliView;
export declare function isCliView(value: unknown): value is CliView;
/** Full text of MCP content blocks. Plain text stays text. Every other block is its JSON. */
export declare function contentText(content: readonly unknown[]): string;
export declare function runCli(spec: CliSpec, argv: readonly string[], io?: CliIo): Promise<number>;
export {};
