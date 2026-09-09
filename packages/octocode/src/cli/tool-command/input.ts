// Parses/validates raw CLI args into a tool's JSON input text and flags
// known input footguns before the tool actually runs.
import type { ParsedArgs } from '../types.js';
import { DirectToolInputError } from '@octocodeai/octocode-tools-core/schema';
import { formatToolExampleCommand } from './formatting.js';
import { TOOL_RUNTIME_FLAGS } from './flags-to-query.js';

// The shared runtime set plus `format`, which is runtime-only when paired
// with --queries (its schema-field meaning exists only on the flag path).
const TOOL_RUNTIME_OPTION_KEYS = new Set([...TOOL_RUNTIME_FLAGS, 'format']);

function getUnexpectedToolOptionKeys(args: ParsedArgs): string[] {
  return Object.keys(args.options).filter(
    key => !TOOL_RUNTIME_OPTION_KEYS.has(key)
  );
}

export function getInputText(
  toolName: string,
  args: ParsedArgs
): string | undefined {
  const unexpectedOptionKeys = getUnexpectedToolOptionKeys(args);
  if (unexpectedOptionKeys.length > 0) {
    const formattedKeys = unexpectedOptionKeys
      .map(key => `--${key}`)
      .join(', ');

    throw new DirectToolInputError(
      `Use either field flags or --queries, not both (got ${formattedKeys} with --queries). Use ${formatToolExampleCommand(toolName)}.`
    );
  }

  if (args.args.length > 1) {
    throw new DirectToolInputError(
      `Use either a positional selector with field flags or --queries, not both. Use ${formatToolExampleCommand(toolName)}.`
    );
  }

  if (typeof args.options.queries === 'string') return args.options.queries;
  return undefined;
}

function getPayloadQueries(rawPayload: unknown): unknown[] {
  if (Array.isArray(rawPayload)) return rawPayload;
  if (rawPayload && typeof rawPayload === 'object') {
    const queries = (rawPayload as { readonly queries?: unknown }).queries;
    if (Array.isArray(queries)) return queries;
    return [rawPayload];
  }
  return [];
}

export function validateRawToolFootguns(
  toolName: string,
  inputText: string
): void {
  if (toolName !== 'localSearch') return;

  let rawPayload: unknown;
  try {
    rawPayload = JSON.parse(inputText) as unknown;
  } catch {
    return;
  }

  // Catch the common array/string mismatch before schema parsing so the error
  // names the canonical localSearch field directly.
  const badIndex = getPayloadQueries(rawPayload).findIndex(query => {
    if (!query || typeof query !== 'object') return false;
    const q = query as {
      readonly searchText?: unknown;
      readonly keywords?: unknown;
    };
    return Array.isArray(q.searchText) || Array.isArray(q.keywords);
  });
  if (badIndex === -1) return;

  throw new DirectToolInputError(
    'localSearch does not accept keywords; set searchText to one string.',
    [
      'Use {"path":"/ABS/repo","searchText":"runCLI"} for localSearch.',
      `Run tools ${toolName} --scheme --brief before raw calls.`,
    ]
  );
}
