import { Router, type Request, type Response, type NextFunction } from 'express';
import {
  lspGotoDefinition,
  lspFindReferences,
  lspCallHierarchy,
} from '../index.js';
import { parseAndValidate } from '../middleware/queryParser.js';
import {
  lspDefinitionSchema,
  lspReferencesSchema,
  lspCallsSchema,
} from '../validation/index.js';
import { ResearchResponse } from '../utils/responseBuilder.js';
import { parseToolResponse } from '../utils/responseParser.js';
import { withLspResilience } from '../utils/resilience.js';
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
  '/definition',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const queries = parseAndValidate(
        req.query as Record<string, unknown>,
        lspDefinitionSchema
      );
      const rawResult = await withLspResilience(
        () => lspGotoDefinition(toLspDefinitionParams(queries)),
        'lspGotoDefinition'
      );
      const { data, isError, hints, research } = parseToolResponse(rawResult);

      // Extract locations from result
      const locations = extractLocations(data, 'definition');

      const response = ResearchResponse.lspResult({
        symbol: queries[0]?.symbolName || 'unknown',
        locations,
        type: 'definition',
        mcpHints: hints,
        research,
      });

      res.status(isError ? 500 : 200).json(response);
    } catch (error) {
      next(error);
    }
  }
);

// GET /lsp/references - Find all references to a symbol
lspRoutes.get(
  '/references',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const queries = parseAndValidate(
        req.query as Record<string, unknown>,
        lspReferencesSchema
      );
      const rawResult = await withLspResilience(
        () => lspFindReferences(toLspReferencesParams(queries)),
        'lspFindReferences'
      );
      const { data, isError, hints, research } = parseToolResponse(rawResult);

      // Extract locations from result
      const locations = extractLocations(data, 'references');

      const response = ResearchResponse.lspResult({
        symbol: queries[0]?.symbolName || 'unknown',
        locations,
        type: 'references',
        mcpHints: hints,
        research,
      });

      res.status(isError ? 500 : 200).json(response);
    } catch (error) {
      next(error);
    }
  }
);

// GET /lsp/calls - Get call hierarchy (incoming/outgoing)
lspRoutes.get(
  '/calls',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const queries = parseAndValidate(
        req.query as Record<string, unknown>,
        lspCallsSchema
      );
      const rawResult = await withLspResilience(
        () => lspCallHierarchy(toLspCallsParams(queries)),
        'lspCallHierarchy'
      );
      const { data, isError, hints, research } = parseToolResponse(rawResult);

      // Extract locations from result
      const locations = extractCallHierarchyLocations(data);
      const direction = queries[0]?.direction || 'incoming';

      const response = ResearchResponse.lspResult({
        symbol: queries[0]?.symbolName || 'unknown',
        locations,
        type: direction as 'incoming' | 'outgoing',
        mcpHints: hints,
        research,
      });

      res.status(isError ? 500 : 200).json(response);
    } catch (error) {
      next(error);
    }
  }
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
