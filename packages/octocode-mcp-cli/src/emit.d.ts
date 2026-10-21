import type { CliSpec } from './spec.js';
export declare function renderTypeScript(spec: CliSpec): string;
export declare function emitTypeScript(spec: CliSpec, filePath: string): Promise<string>;
