import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { maskSensitiveData } from './security/mask.js';
import { ContentSanitizer } from './security/contentSanitizer.js';
import { jsonToYamlString } from './utils/minifier/index.js';
import type { ToolResponse } from './types.js';

export function createResult(options: {
  data: unknown;
  instructions?: string;
  isError?: boolean;
}): CallToolResult {
  const { data, instructions, isError } = options;
  const response: ToolResponse = {
    data,
    instructions,
  };

  return {
    content: [{ type: 'text', text: createResponseFormat(response) }],
    isError: Boolean(isError),
  };
}

export function createResponseFormat(
  responseData: ToolResponse,
  keysPriority?: string[]
): string {
  const cleanedData = cleanJsonObject(responseData) as ToolResponse;
  const yamlData = jsonToYamlString(cleanedData, {
    keysPriority: keysPriority || [
      'instructions',
      'results',
      'hasResultsStatusHints',
      'emptyStatusHints',
      'errorStatusHints',
      'mainResearchGoal',
      'researchGoal',
      'reasoning',
      'status',
      'data',
    ],
  });
  const sanitizationResult = ContentSanitizer.sanitizeContent(yamlData);
  return maskSensitiveData(sanitizationResult.content);
}

function cleanJsonObject(
  obj: unknown,
  context: { inFilesObject?: boolean; depth?: number } = {}
): unknown {
  if (obj === null || obj === undefined || Number.isNaN(obj)) {
    return undefined;
  }

  const { inFilesObject = false, depth = 0 } = context;

  if (Array.isArray(obj)) {
    const cleaned = obj
      .map(item => cleanJsonObject(item, { inFilesObject, depth: depth + 1 }))
      .filter(item => item !== undefined);
    // Preserve empty arrays ONLY when deeply nested in files object (code search path results)
    // depth >= 2 means we're inside files > repo > path level
    const isCodeSearchPathMatch = inFilesObject && depth >= 2;
    return cleaned.length > 0 || isCodeSearchPathMatch ? cleaned : undefined;
  }

  if (typeof obj === 'object' && obj !== null) {
    const cleaned: Record<string, unknown> = {};
    let hasValidProperties = false;

    for (const [key, value] of Object.entries(obj)) {
      // Track when we enter a 'files' object (code search results)
      const enteringFilesObject = key === 'files' && !inFilesObject;
      const cleanedValue = cleanJsonObject(value, {
        inFilesObject: inFilesObject || enteringFilesObject,
        depth: enteringFilesObject ? 0 : depth + 1,
      });
      if (cleanedValue !== undefined) {
        cleaned[key] = cleanedValue;
        hasValidProperties = true;
      }
    }

    return hasValidProperties ? cleaned : undefined;
  }

  return obj;
}
