export {
  commandToken,
  defineCli,
  defineCommand,
  parseCommandInput,
  withCommands,
} from './spec.js';
export type {
  CliCommand,
  CliSpec,
  DefineCommandInput,
  Flag,
  FlagKind,
  ItemKind,
  JsonSchema,
  ToolAnnotations,
} from './spec.js';
export { commandHelp } from './help.js';
export { cliView, runCli } from './run.js';
export type { CliIo, CliView } from './run.js';
export {
  cliFromMcp,
  connectClient,
  connectStdio,
  connectStreamableHttp,
  createStdioTransport,
} from './from-mcp.js';
export type { McpClientLike, McpContentBlock, McpToolInfo, McpToolResult } from './from-mcp.js';
export { cliToMcp, mcpServerOptions, registerOn } from './to-mcp.js';
export type { McpExport, McpToolDefinition, ToolRegistrar } from './to-mcp.js';
export { emitTypeScript } from './emit.js';
