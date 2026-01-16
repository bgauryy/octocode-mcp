/**
 * LSP routes using route factory pattern.
 * 
 * @module routes/lsp
 */

import { Router } from 'express';
import {
  lspGotoDefinition,
  lspFindReferences,
  lspCallHierarchy,
} from '../index.js';
import {
  lspDefinitionSchema,
  lspReferencesSchema,
  lspCallsSchema,
} from '../validation/index.js';
import { ResearchResponse } from '../utils/responseBuilder.js';
import { withLspResilience } from '../utils/resilience.js';
import { createRouteHandler } from '../utils/routeFactory.js';
import {
  toLspDefinitionParams,
  toLspReferencesParams,
  toLspCallsParams,
} from '../types/toolTypes.js';
import { safeString, safeArray } from '../utils/responseFactory.js';
import { isObject, hasProperty, hasNumberProperty, hasStringProperty } from '../types/guards.js';

export const lspRoutes = Router();

// GET /lsp/definition - Go to symbol definition
lspRoutes.get(
  '/lspGotoDefinition',
  createRouteHandler({
    schema: lspDefinitionSchema,
    toParams: toLspDefinitionParams,
    toolFn: lspGotoDefinition,
    toolName: 'lspGotoDefinition',
    resilience: withLspResilience,
    transform: (parsed, queries) => {
      const { data, hints, research } = parsed;
      const locations = extractLocations(data, 'definition');

      return ResearchResponse.lspResult({
        symbol: queries[0]?.symbolName || 'unknown',
        locations,
        type: 'definition',
        mcpHints: hints,
        research,
      });
    },
  })
);

// GET /lsp/references - Find all references to a symbol
lspRoutes.get(
  '/lspFindReferences',
  createRouteHandler({
    schema: lspReferencesSchema,
    toParams: toLspReferencesParams,
    toolFn: lspFindReferences,
    toolName: 'lspFindReferences',
    resilience: withLspResilience,
    transform: (parsed, queries) => {
      const { data, hints, research } = parsed;
      const locations = extractLocations(data, 'references');

      return ResearchResponse.lspResult({
        symbol: queries[0]?.symbolName || 'unknown',
        locations,
        type: 'references',
        mcpHints: hints,
        research,
      });
    },
  })
);

// GET /lsp/calls - Get call hierarchy (incoming/outgoing)
lspRoutes.get(
  '/lspCallHierarchy',
  createRouteHandler({
    schema: lspCallsSchema,
    toParams: toLspCallsParams,
    toolFn: lspCallHierarchy,
    toolName: 'lspCallHierarchy',
    resilience: withLspResilience,
    transform: (parsed, queries) => {
      const { data, hints, research } = parsed;
      const locations = extractCallHierarchyLocations(data);
      const direction = queries[0]?.direction || 'incoming';

      return ResearchResponse.lspResult({
        symbol: queries[0]?.symbolName || 'unknown',
        locations,
        type: direction as 'incoming' | 'outgoing',
        mcpHints: hints,
        research,
      });
    },
  })
);

// Helper: Extract locations from LSP result
function extractLocations(
  data: Record<string, unknown>,
  type: 'definition' | 'references'
): Array<{ uri: string; line: number; preview?: string }> {
  // Handle definition results
  if (type === 'definition' && hasProperty(data, 'definition') && isObject(data.definition)) {
    const def = data.definition as Record<string, unknown>;
    if (typeof def.uri === 'string') {
      const range = isObject(def.range) ? def.range as Record<string, unknown> : {};
      const start = isObject(range.start) ? range.start as Record<string, unknown> : {};
      return [
        {
          uri: def.uri,
          line: (typeof start.line === 'number' ? start.line : 0) + 1,
          preview: typeof def.preview === 'string' ? def.preview : undefined,
        },
      ];
    }
  }

  // Handle references results
  if (type === 'references' && hasProperty(data, 'references')) {
    const refs = safeArray<Record<string, unknown>>(data, 'references');
    return refs.map((ref) => {
      const range = isObject(ref.range) ? ref.range : {};
      const start = isObject(range.start) ? range.start : {};
      return {
        uri: safeString(ref, 'uri'),
        line: (hasNumberProperty(start, 'line') ? start.line : 0) + 1,
        preview: hasStringProperty(ref, 'preview') ? ref.preview : undefined,
      };
    });
  }

  // Handle locations array (generic) - MCP returns range.start.line
  if (hasProperty(data, 'locations')) {
    const locs = safeArray<Record<string, unknown>>(data, 'locations');
    return locs.map((loc) => {
      const range = isObject(loc.range) ? loc.range : {};
      const start = isObject(range.start) ? range.start : {};
      return {
        uri: safeString(loc, 'uri'),
        line: (hasNumberProperty(start, 'line') ? start.line : 0) + 1,
        preview: hasStringProperty(loc, 'content') ? loc.content : undefined,
      };
    });
  }

  return [];
}

// Helper: Extract locations from call hierarchy result
function extractCallHierarchyLocations(
  data: Record<string, unknown>
): Array<{ uri: string; line: number; preview?: string }> {
  // Handle calls array
  let calls: Record<string, unknown>[] = [];
  if (hasProperty(data, 'calls') && Array.isArray(data.calls)) {
    calls = data.calls;
  } else if (hasProperty(data, 'incomingCalls') && Array.isArray(data.incomingCalls)) {
    calls = data.incomingCalls;
  } else if (hasProperty(data, 'outgoingCalls') && Array.isArray(data.outgoingCalls)) {
    calls = data.outgoingCalls;
  }

  return calls.map((call) => {
    const item = isObject(call.from) ? call.from : isObject(call.to) ? call.to : call;
    const itemObj = isObject(item) ? item : {};
    const range = isObject(itemObj.range) ? itemObj.range : {};
    const start = isObject(range.start) ? range.start : {};

    const lineFromStart = hasNumberProperty(start, 'line') ? start.line : 0;
    const lineFromItem = hasNumberProperty(itemObj, 'line') ? itemObj.line : 0;

    return {
      uri: safeString(itemObj, 'uri'),
      line: (lineFromStart || lineFromItem) + 1,
      preview: hasStringProperty(itemObj, 'name') ? itemObj.name : undefined,
    };
  });
}
