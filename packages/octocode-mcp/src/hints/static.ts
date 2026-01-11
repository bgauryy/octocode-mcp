/**
 * Static hints from toolMetadata (content.json)
 * Wraps the existing getToolHintsSync and getDynamicHints functions
 * @module hints/static
 */

import {
  getToolHintsSync,
  getDynamicHints as getStaticDynamicHints,
} from '../tools/toolMetadata.js';
import type { HintStatus } from './types.js';

/**
 * Get static hints from the metadata system
 * These are loaded from content.json via the toolMetadata module
 *
 * @param toolName - The tool name (e.g., 'githubSearchCode')
 * @param status - The result status
 * @returns Array of static hint strings
 */
export function getStaticHints(
  toolName: string,
  status: HintStatus
): readonly string[] {
  // Static hints only support hasResults and empty, not error
  if (status === 'error') {
    return [];
  }
  return getToolHintsSync(toolName, status);
}

/**
 * Get dynamic hints from the metadata system
 * These are contextual hints stored in content.json (e.g., topicsHasResults, keywordsEmpty)
 *
 * @param toolName - The tool name
 * @param hintType - The dynamic hint type (e.g., 'topicsHasResults')
 * @returns Array of dynamic hint strings
 */
export function getMetadataDynamicHints(
  toolName: string,
  hintType: string
): readonly string[] {
  return getStaticDynamicHints(toolName, hintType);
}
