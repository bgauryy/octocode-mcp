/**
 * Schema helper factory — creates typed proxies for accessing tool schema descriptions.
 * @internal Used by domain-specific schema helper modules.
 */
import { getMetadataOrNull } from './state.js';

/**
 * Creates a nested proxy for accessing tool schema descriptions.
 * Structure: TOOL.category.field -> description string
 */
export function createSchemaHelper(toolName: string) {
  return new Proxy(
    {},
    {
      get(_target, _category: string) {
        return new Proxy(
          {},
          {
            get(_target2, field: string): string {
              const metadata = getMetadataOrNull();
              if (!metadata) return '';
              const schema = metadata.tools[toolName]?.schema ?? {};
              return schema[field] ?? '';
            },
          }
        );
      },
    }
  );
}
