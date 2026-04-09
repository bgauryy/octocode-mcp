/**
 * Local types for the toolMetadata module.
 */
import type { ToolNames } from '@octocodeai/octocode-core';

/**
 * Union type of all tool name values.
 */
export type ToolName = ToolNames[keyof ToolNames];
