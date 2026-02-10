/**
 * LSP call hierarchy implementation - core LSP protocol calls
 */

import { getHints } from '../../hints/index.js';
import { STATIC_TOOL_NAMES } from '../toolNames.js';
import { createClient } from '../../lsp/index.js';
import type {
  CallHierarchyResult,
  CallHierarchyItem,
  IncomingCall,
  OutgoingCall,
  ExactPosition,
} from '../../lsp/types.js';
import type { LSPCallHierarchyQuery } from './scheme.js';
import {
  createCallItemKey,
  enhanceCallHierarchyItem,
  enhanceIncomingCalls,
  enhanceOutgoingCalls,
  paginateResults,
} from './callHierarchyHelpers.js';

const TOOL_NAME = STATIC_TOOL_NAMES.LSP_CALL_HIERARCHY;

/**
 * Use LSP client for semantic call hierarchy
 */
export async function callHierarchyWithLSP(
  filePath: string,
  workspaceRoot: string,
  position: ExactPosition,
  query: LSPCallHierarchyQuery,
  content: string
): Promise<CallHierarchyResult | null> {
  const client = await createClient(workspaceRoot, filePath);
  if (!client) return null;

  try {
    // Prepare call hierarchy to get the item at position
    const items = await client.prepareCallHierarchy(filePath, position);

    if (!items || items.length === 0) {
      return {
        status: 'empty',
        error: 'No callable symbol found at position',
        errorType: 'symbol_not_found',
        direction: query.direction,
        depth: query.depth ?? 1,
        researchGoal: query.researchGoal,
        reasoning: query.reasoning,
        hints: [
          ...getHints(TOOL_NAME, 'empty'),
          'Language server could not identify a callable symbol',
          'Ensure the position is on a function/method name',
          'Try adjusting lineHint to the exact function declaration line',
        ],
      };
    }

    // Use the first item (usually there's only one)
    // Non-null assertion safe: we checked items.length > 0 above
    const targetItem = items[0]!;

    // Add content snippet to target item
    const enhancedTargetItem = await enhanceCallHierarchyItem(
      targetItem,
      content,
      query.contextLines ?? 2
    );

    const depth = query.depth ?? 1;
    const visited = new Set<string>();
    visited.add(createCallItemKey(targetItem)); // Mark target as visited

    // Get calls based on direction
    if (query.direction === 'incoming') {
      const contextLines = query.contextLines ?? 2;

      // Gather calls without enhancement for efficient pagination
      const allIncomingCalls = await gatherIncomingCallsRecursive(
        client,
        targetItem,
        depth,
        visited,
        0 // Gather without content enhancement
      );

      if (allIncomingCalls.length === 0) {
        return {
          status: 'empty',
          item: enhancedTargetItem,
          direction: 'incoming',
          depth,
          incomingCalls: [],
          researchGoal: query.researchGoal,
          reasoning: query.reasoning,
          hints: [
            ...getHints(TOOL_NAME, 'empty'),
            `No callers found for '${query.symbolName}' via Language Server`,
            'The function may not be called directly in the workspace',
            'Check if it is called via alias or dynamic invocation',
            'Try lspFindReferences for broader usage search',
          ],
        };
      }

      // Apply pagination first, then enhance only visible items
      const { paginatedItems, pagination } = paginateResults(
        allIncomingCalls,
        query.callsPerPage ?? 15,
        query.page ?? 1
      );

      // Lazy enhancement: only add content snippets to paginated items
      const enhancedItems =
        contextLines > 0
          ? await enhanceIncomingCalls(paginatedItems, contextLines)
          : paginatedItems;

      return {
        status: 'hasResults',
        item: enhancedTargetItem,
        direction: 'incoming',
        depth,
        incomingCalls: enhancedItems,
        pagination,
        researchGoal: query.researchGoal,
        reasoning: query.reasoning,
        hints: [
          ...getHints(TOOL_NAME, 'hasResults'),
          `Found ${allIncomingCalls.length} caller(s) via Language Server (depth ${depth})`,
          'Use lspGotoDefinition to navigate to each caller',
        ],
      };
    } else {
      const contextLines = query.contextLines ?? 2;

      // Gather calls without enhancement for efficient pagination
      const allOutgoingCalls = await gatherOutgoingCallsRecursive(
        client,
        targetItem,
        depth,
        visited,
        0 // Gather without content enhancement
      );

      if (allOutgoingCalls.length === 0) {
        return {
          status: 'empty',
          item: enhancedTargetItem,
          direction: 'outgoing',
          depth,
          outgoingCalls: [],
          researchGoal: query.researchGoal,
          reasoning: query.reasoning,
          hints: [
            ...getHints(TOOL_NAME, 'empty'),
            `No callees found in '${query.symbolName}' via Language Server`,
            'The function may only contain primitive operations',
            'Check if calls use dynamic invocation patterns',
          ],
        };
      }

      // Apply pagination first, then enhance only visible items
      const { paginatedItems, pagination } = paginateResults(
        allOutgoingCalls,
        query.callsPerPage ?? 15,
        query.page ?? 1
      );

      // Lazy enhancement: only add content snippets to paginated items
      const enhancedItems =
        contextLines > 0
          ? await enhanceOutgoingCalls(paginatedItems, contextLines)
          : paginatedItems;

      return {
        status: 'hasResults',
        item: enhancedTargetItem,
        direction: 'outgoing',
        depth,
        outgoingCalls: enhancedItems,
        pagination,
        researchGoal: query.researchGoal,
        reasoning: query.reasoning,
        hints: [
          ...getHints(TOOL_NAME, 'hasResults'),
          `Found ${allOutgoingCalls.length} callee(s) via Language Server (depth ${depth})`,
          'Use lspGotoDefinition to navigate to each callee',
        ],
      };
    }
  } finally {
    await client.stop();
  }
}

/**
 * Recursively gather incoming calls with cycle detection.
 * Returns a flattened list of all callers up to the specified depth.
 */
export async function gatherIncomingCallsRecursive(
  client: Awaited<ReturnType<typeof createClient>>,
  item: CallHierarchyItem,
  remainingDepth: number,
  visited: Set<string>,
  contextLines: number
): Promise<IncomingCall[]> {
  if (remainingDepth <= 0 || !client) return [];

  const directCalls = await client.getIncomingCalls(item);
  const enhancedCalls =
    contextLines > 0
      ? await enhanceIncomingCalls(directCalls, contextLines)
      : directCalls;

  if (remainingDepth === 1) {
    return enhancedCalls;
  }

  // For depth > 1, recursively get callers of callers
  const allCalls: IncomingCall[] = [...enhancedCalls];

  for (const call of enhancedCalls) {
    const key = createCallItemKey(call.from);
    if (visited.has(key)) continue; // Skip cycles
    visited.add(key);

    const nestedCalls = await gatherIncomingCallsRecursive(
      client,
      call.from,
      remainingDepth - 1,
      visited,
      contextLines
    );
    allCalls.push(...nestedCalls);
  }

  return allCalls;
}

/**
 * Recursively gather outgoing calls with cycle detection.
 * Returns a flattened list of all callees up to the specified depth.
 */
export async function gatherOutgoingCallsRecursive(
  client: Awaited<ReturnType<typeof createClient>>,
  item: CallHierarchyItem,
  remainingDepth: number,
  visited: Set<string>,
  contextLines: number
): Promise<OutgoingCall[]> {
  if (remainingDepth <= 0 || !client) return [];

  const directCalls = await client.getOutgoingCalls(item);
  const enhancedCalls =
    contextLines > 0
      ? await enhanceOutgoingCalls(directCalls, contextLines)
      : directCalls;

  if (remainingDepth === 1) {
    return enhancedCalls;
  }

  // For depth > 1, recursively get callees of callees
  const allCalls: OutgoingCall[] = [...enhancedCalls];

  for (const call of enhancedCalls) {
    const key = createCallItemKey(call.to);
    if (visited.has(key)) continue; // Skip cycles
    visited.add(key);

    const nestedCalls = await gatherOutgoingCallsRecursive(
      client,
      call.to,
      remainingDepth - 1,
      visited,
      contextLines
    );
    allCalls.push(...nestedCalls);
  }

  return allCalls;
}
