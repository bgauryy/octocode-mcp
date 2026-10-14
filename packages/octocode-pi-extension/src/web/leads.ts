import { OCTOCODE_TOOL_PREFIX } from '../shared/octocode-tools.js';

/** The Octocode research tools that can work on a saved page, when this session has them. */
type SavedPageTools = { clasify: boolean; localSearch: boolean; localFetch: boolean };

/** Which of the tools that read a saved page are active; `clasify` is listed only when its classification provider is set up. */
export function savedPageTools(active: readonly string[]): SavedPageTools {
  const has = (name: string) => active.includes(`${OCTOCODE_TOOL_PREFIX}${name}`);
  return { clasify: has('clasify'), localSearch: has('localSearch'), localFetch: has('localFetch') };
}

/**
 * How to reach the rest of a saved page, naming the tools this session has: `clasify` to locate a target in
 * it, `localSearch` for literal text, `localFetch` for line ranges. Without any, the generic wording stands.
 */
export function savedPageLead(tools: SavedPageTools): string {
  const reads = [
    tools.clasify && `locate a described target with ${OCTOCODE_TOOL_PREFIX}clasify (resource {tool:"localFetch", query:{path:<this file>, fullContent:true}}, a locate question; a hit in a table of contents is not the section, read the hit)`,
    tools.localSearch && `search literal text with ${OCTOCODE_TOOL_PREFIX}localSearch (headings: regex "^#{1,3} ")`,
    tools.localFetch && `read line ranges with ${OCTOCODE_TOOL_PREFIX}localFetch`,
  ].filter(Boolean);
  return reads.length > 0 ? reads.join('; ') : 'search it or read it by line range';
}
