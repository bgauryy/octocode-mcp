import { completeMetadata } from '@octocodeai/octocode-core';
import { getMetadataOrNull } from './state.js';

export function isToolInMetadata(toolName: string): boolean {
  const metadata = getMetadataOrNull() ?? completeMetadata;
  return Object.prototype.hasOwnProperty.call(metadata.tools, toolName);
}
