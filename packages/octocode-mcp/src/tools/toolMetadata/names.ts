import { CompleteMetadata, ToolNames } from '../../types/metadata.js';
import { STATIC_TOOL_NAMES } from '../toolNames.js';
import { getMetadataOrNull } from './state.js';

type ToolNamesValue = ToolNames[keyof ToolNames];
type ToolNamesMap = Record<string, ToolNamesValue>;

/**
 * Proxy for accessing tool names.
 * Falls back to STATIC_TOOL_NAMES when metadata is not loaded.
 */
export const TOOL_NAMES = new Proxy({} as CompleteMetadata['toolNames'], {
  get(_target, prop: string) {
    const metadata = getMetadataOrNull();
    if (metadata) {
      const value = (metadata.toolNames as unknown as ToolNamesMap)[prop];
      if (value !== undefined) {
        return value;
      }
    }
    return STATIC_TOOL_NAMES[prop as keyof typeof STATIC_TOOL_NAMES];
  },
  ownKeys() {
    const metadata = getMetadataOrNull();
    return metadata
      ? Object.keys(metadata.toolNames)
      : Object.keys(STATIC_TOOL_NAMES);
  },
  getOwnPropertyDescriptor(_target, prop) {
    const metadata = getMetadataOrNull();
    if (metadata) {
      if (prop in metadata.toolNames) {
        return {
          enumerable: true,
          configurable: true,
          value: (metadata.toolNames as unknown as ToolNamesMap)[
            prop as string
          ],
        };
      }
      return undefined;
    }
    if (prop in STATIC_TOOL_NAMES) {
      return {
        enumerable: true,
        configurable: true,
        value: STATIC_TOOL_NAMES[prop as keyof typeof STATIC_TOOL_NAMES],
      };
    }
    return undefined;
  },
}) as CompleteMetadata['toolNames'];
