import { getMetadataOrNull } from './state.js';

/**
 * Checks if a tool exists in the loaded metadata.
 */
export function isToolInMetadata(toolName: string): boolean {
  const metadata = getMetadataOrNull();
  if (!metadata) {
    return false;
  }
  const tools = metadata.tools ?? {};
  return Object.prototype.hasOwnProperty.call(tools, toolName);
}
