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

export const lspRoutes = Router();

// Type for structured content (flexible)
type StructuredData = Record<string, unknown>;

// GET /lsp/definition - Go to symbol definition
lspRoutes.get(
  '/definition',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const queries = parseAndValidate(
        req.query as Record<string, unknown>,
        lspDefinitionSchema
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawResult = await lspGotoDefinition({ queries } as any);
      const data = (rawResult.structuredContent || {}) as StructuredData;

      // Extract locations from result
      const locations = extractLocations(data, 'definition');

      const response = ResearchResponse.lspResult({
        symbol: queries[0]?.symbolName || 'unknown',
        locations,
        type: 'definition',
      });

      res.status(rawResult.isError ? 500 : 200).json(response);
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawResult = await lspFindReferences({ queries } as any);
      const data = (rawResult.structuredContent || {}) as StructuredData;

      // Extract locations from result
      const locations = extractLocations(data, 'references');

      const response = ResearchResponse.lspResult({
        symbol: queries[0]?.symbolName || 'unknown',
        locations,
        type: 'references',
      });

      res.status(rawResult.isError ? 500 : 200).json(response);
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawResult = await lspCallHierarchy({ queries } as any);
      const data = (rawResult.structuredContent || {}) as StructuredData;

      // Extract locations from result
      const locations = extractCallHierarchyLocations(data);
      const direction = queries[0]?.direction || 'incoming';

      const response = ResearchResponse.lspResult({
        symbol: queries[0]?.symbolName || 'unknown',
        locations,
        type: direction as 'incoming' | 'outgoing',
      });

      res.status(rawResult.isError ? 500 : 200).json(response);
    } catch (error) {
      next(error);
    }
  }
);

// Helper: Extract locations from LSP result
function extractLocations(
  data: StructuredData,
  type: 'definition' | 'references'
): Array<{ uri: string; line: number; preview?: string }> {
  // Handle definition results
  if (type === 'definition' && data.definition) {
    const def = data.definition as StructuredData;
    if (def.uri) {
      const range = (def.range || {}) as StructuredData;
      const start = (range.start || {}) as StructuredData;
      return [
        {
          uri: String(def.uri),
          line: (typeof start.line === 'number' ? start.line : 0) + 1,
          preview: typeof def.preview === 'string' ? def.preview : undefined,
        },
      ];
    }
  }

  // Handle references results
  if (type === 'references' && Array.isArray(data.references)) {
    return data.references.map((ref: StructuredData) => {
      const range = (ref.range || {}) as StructuredData;
      const start = (range.start || {}) as StructuredData;
      return {
        uri: String(ref.uri || ''),
        line: (typeof start.line === 'number' ? start.line : 0) + 1,
        preview: typeof ref.preview === 'string' ? ref.preview : undefined,
      };
    });
  }

  // Handle locations array (generic)
  if (Array.isArray(data.locations)) {
    return data.locations.map((loc: StructuredData) => ({
      uri: String(loc.uri || ''),
      line: typeof loc.line === 'number' ? loc.line : 1,
      preview: typeof loc.preview === 'string' ? loc.preview : undefined,
    }));
  }

  return [];
}

// Helper: Extract locations from call hierarchy result
function extractCallHierarchyLocations(
  data: StructuredData
): Array<{ uri: string; line: number; preview?: string }> {
  // Handle calls array
  const calls = (data.calls ||
    data.incomingCalls ||
    data.outgoingCalls ||
    []) as StructuredData[];

  if (!Array.isArray(calls)) return [];

  return calls.map((call: StructuredData) => {
    const item = (call.from || call.to || call) as StructuredData;
    const range = (item.range || {}) as StructuredData;
    const start = (range.start || {}) as StructuredData;

    return {
      uri: String(item.uri || ''),
      line:
        (typeof start.line === 'number' ? start.line : typeof item.line === 'number' ? item.line : 0) +
        1,
      preview: typeof item.name === 'string' ? item.name : undefined,
    };
  });
}
