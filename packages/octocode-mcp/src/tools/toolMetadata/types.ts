/**
 * Local types for the toolMetadata module.
 */
import { ToolNames } from '../../types/metadata.js';

/**
 * Union type of all tool name values.
 */
export type ToolName = ToolNames[keyof ToolNames];

/**
 * Map of tool name keys to values.
 */
export type ToolNamesMap = Record<string, ToolName>;
