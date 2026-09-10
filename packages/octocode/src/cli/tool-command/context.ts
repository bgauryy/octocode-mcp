// Core owns context wording; this adapter supplies runtime availability.
import { buildCliToolContext } from '@octocodeai/octocode-core/mcp';
import { getToolAvailability } from '@octocodeai/octocode-tools-core/schema';
import { TOOL_DEFINITIONS, getToolEnableInstruction } from './registry.js';

export async function getToolsContextString(
  options: { full?: boolean; minimal?: boolean } = {}
): Promise<string> {
  return buildCliToolContext({
    ...options,
    availability: Object.fromEntries(
      TOOL_DEFINITIONS.map(({ name }) => {
        const availability = getToolAvailability(name);
        return [
          name,
          {
            enabled: availability.enabled,
            hint: getToolEnableInstruction(name) ?? availability.envVar,
          },
        ];
      })
    ),
  });
}

export async function printToolsContext(
  options: { full?: boolean; minimal?: boolean } = {}
): Promise<void> {
  console.log(await getToolsContextString(options));
}
