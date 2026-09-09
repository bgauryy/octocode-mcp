import { TOOL_RESEARCH_INSTRUCTIONS } from './instructions.js';
import { baseSchemaDescriptions, toolNames } from './input/resources/global.js';
import { DIRECT_TOOL_DISCOVERY_DEFINITIONS } from '../tools/directToolCatalog/toolCatalogDefinitions.js';

/** Canonical routing instructions and executable catalog, consumed by every adapter. */
export const localCompleteMetadata = {
  systemPrompt: TOOL_RESEARCH_INSTRUCTIONS,
  toolNames,
  baseSchema: baseSchemaDescriptions,
  tools: Object.fromEntries(
    DIRECT_TOOL_DISCOVERY_DEFINITIONS.map(definition => [
      definition.name,
      { description: definition.description },
    ])
  ),
};
