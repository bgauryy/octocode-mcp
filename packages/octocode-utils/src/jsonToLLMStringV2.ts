/**
 * jsonToLLMStringV2 - JSON-first formatter optimized for LLMs
 *
 * Description:
 * - Normalizes input to JSON-serializable data only via JSON.parse(JSON.stringify())
 * - Produces a compact, structure-preserving representation that is easier for LLMs to parse than raw JSON
 * - Uses a header line and indentation to convey hierarchy without braces
 * - Focuses purely on enumerable, JSON-compatible properties
 *
 * Key behaviors:
 * - Normalization: JSON.parse(JSON.stringify(data)) removes functions, symbols, non-enumerable properties
 * - Header: "#content converted from json" at the root
 * - Indentation: 4 spaces per depth
 * - Keys: preserved as-is (no semantic relabeling)
 * - Arrays: homogeneous primitive arrays are rendered as {Type}Array; mixed/object arrays as Array with object:/array: prefixes
 * - Empty shapes: uses "EmptyArray" and "EmptyObject"
 * - Falsy fields: when ignoreFalsy is true (default), null properties are omitted
 * - Circular detection: detects true cycles in normalized data
 * - Special objects: Date→ISO string, URL→string, Map/Set/RegExp→{}, functions/symbols→removed
 * - Unlimited output: no truncation or elision
 */
export type SortKeysOption = 'none' | 'asc';
export type SortEntriesOption = 'none' | 'asc';

/**
 * Options for jsonToLLMStringV2.
 *
 * Note: Input is normalized via JSON.parse(JSON.stringify()) before processing.
 * maxLength and maxArrayItems are ignored (no truncation, full output always).
 */
export interface JsonToLLMStringV2Options {
  /** When true, null/undefined object properties are omitted. Default: true */
  ignoreFalsy?: boolean;
  /** Maximum structural depth to traverse. Default: 10 */
  maxDepth?: number;
  /** Ignored in V2 (kept for compatibility). No truncation is performed. */
  maxLength?: number;
  /** Ignored in V2 (kept for compatibility). No elision is performed. */
  maxArrayItems?: number;
  /** Optional stable key ordering for objects and class instances. */
  sortKeys?: SortKeysOption;
  /** Optional deterministic ordering for Map/Set entries. Default: 'none' */
  sortEntries?: SortEntriesOption;
  /** Global hard budget for final output characters. Default: Infinity */
  maxChars?: number;
  /** Hard cap for base64 string length in Bytes(...). Default: Infinity */
  maxBinaryChars?: number;
  /** Hard cap for Error message/stack text length. Default: Infinity */
  maxErrorChars?: number;
}

/**
 * Default options used by jsonToLLMStringV2.
 * - ignoreFalsy: true
 * - maxDepth: 10
 * - maxLength: Infinity (ignored)
 * - maxArrayItems: Infinity (ignored)
 * - sortKeys: 'none'
 */
export const JSON_TO_LLM_V2_DEFAULT_OPTIONS: Readonly<
  Required<
    Pick<
      JsonToLLMStringV2Options,
      | 'ignoreFalsy'
      | 'maxDepth'
      | 'maxLength'
      | 'maxArrayItems'
      | 'sortKeys'
      | 'sortEntries'
      | 'maxChars'
      | 'maxBinaryChars'
      | 'maxErrorChars'
    >
  >
> = Object.freeze({
  ignoreFalsy: true,
  maxDepth: 10,
  maxLength: Number.POSITIVE_INFINITY,
  maxArrayItems: Number.POSITIVE_INFINITY,
  sortKeys: 'none',
  sortEntries: 'none',
  maxChars: Number.POSITIVE_INFINITY,
  maxBinaryChars: Number.POSITIVE_INFINITY,
  maxErrorChars: Number.POSITIVE_INFINITY,
});
export function jsonToLLMStringV2(
  data: unknown,
  options?: JsonToLLMStringV2Options
): string {
  try {
    // Normalize data to only enumerable, JSON-serializable properties
    // This removes functions, symbols, non-enumerable props, and normalizes special objects
    let normalizedData: unknown;
    try {
      normalizedData = JSON.parse(JSON.stringify(data));
    } catch (error) {
      if (error instanceof Error) {
        // Handle circular references
        if (error.message.includes('circular')) {
          return '#content converted from json\n[Error: Circular structure detected - cannot serialize to JSON]';
        }
        // Handle unsupported types like BigInt, undefined
        if (
          error.message.includes('BigInt') ||
          error.message.includes('undefined')
        ) {
          return `#content converted from json\n[Error: Cannot serialize ${typeof data} to JSON]`;
        }
      }
      // For any other JSON serialization error, return error message with proper format
      return `#content converted from json\n[Error: JSON serialization failed - ${error instanceof Error ? error.message : 'Unknown error'}]`;
    }

    // Limitations removed: force unlimited length and items regardless of options
    const cfg = {
      ignoreFalsy:
        options?.ignoreFalsy ?? JSON_TO_LLM_V2_DEFAULT_OPTIONS.ignoreFalsy,
      maxDepth: options?.maxDepth ?? JSON_TO_LLM_V2_DEFAULT_OPTIONS.maxDepth,
      maxLength: JSON_TO_LLM_V2_DEFAULT_OPTIONS.maxLength,
      maxArrayItems: JSON_TO_LLM_V2_DEFAULT_OPTIONS.maxArrayItems,
      sortKeys: (options?.sortKeys ??
        JSON_TO_LLM_V2_DEFAULT_OPTIONS.sortKeys) as SortKeysOption,
      sortEntries: (options?.sortEntries ??
        JSON_TO_LLM_V2_DEFAULT_OPTIONS.sortEntries) as SortEntriesOption,
      maxChars: options?.maxChars ?? JSON_TO_LLM_V2_DEFAULT_OPTIONS.maxChars,
      maxBinaryChars:
        options?.maxBinaryChars ??
        JSON_TO_LLM_V2_DEFAULT_OPTIONS.maxBinaryChars,
      maxErrorChars:
        options?.maxErrorChars ?? JSON_TO_LLM_V2_DEFAULT_OPTIONS.maxErrorChars,
    } as const;

    const indentUnit = ' '.repeat(4);
    // Track current traversal path for proper cycle detection (not shared references)
    const currentPath = new Set<unknown>();

    const isPrimitive = (value: unknown): boolean => {
      return (
        value === null ||
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean' ||
        typeof value === 'bigint'
      );
    };

    const escapeString = (value: string): string => {
      let out = '';
      for (let i = 0; i < value.length; i++) {
        const ch = value[i] as string;
        switch (ch) {
          case '\\':
            out += '\\\\';
            continue;
          case '"':
            out += '\\"';
            continue;
          case '\n':
            out += '\\n';
            continue;
          case '\r':
            out += '\\r';
            continue;
          case '\t':
            out += '\\t';
            continue;
          case '\b':
            out += '\\b';
            continue;
          case '\f':
            out += '\\f';
            continue;
          case '\v':
            out += '\\v';
            continue;
          case '\0':
            out += '\\0';
            continue;
          default: {
            const code = ch.charCodeAt(0);
            if (code < 0x20 || code === 0x7f) {
              out += `\\x${code.toString(16).padStart(2, '0')}`;
            } else {
              out += ch;
            }
          }
        }
      }
      return out;
    };

    const formatString = (value: string): string => {
      return '"' + escapeString(value) + '"';
    };

    const formatPrimitive = (value: unknown): string => {
      if (value === null) return 'null';
      if (typeof value === 'string') return formatString(value);
      if (typeof value === 'number') {
        if (Number.isNaN(value)) return 'NaN';
        if (!Number.isFinite(value))
          return value > 0 ? 'Infinity' : '-Infinity';
        if (Object.is(value, -0)) return '-0';
        return String(value);
      }
      if (typeof value === 'boolean') return value ? 'true' : 'false';
      if (typeof value === 'bigint') return String(value) + 'n';
      return String(value);
    };

    const determinePrimitiveArrayType = (
      items: unknown[]
    ):
      | 'StringArray'
      | 'NumberArray'
      | 'BooleanArray'
      | 'BigIntArray'
      | 'Array' => {
      // Consider only primitive types when deciding homogeneity; null behavior depends on ignoreFalsy
      const types = new Set<string>();
      for (const item of items) {
        if (item === null) {
          // When ignoreFalsy is false, presence of null breaks typed homogeneity
          if (!cfg.ignoreFalsy) return 'Array';
          continue;
        }
        const t = typeof item;
        if (t === 'string') types.add('string');
        else if (t === 'number') types.add('number');
        else if (t === 'boolean') types.add('boolean');
        else if (t === 'bigint') types.add('bigint');
        else return 'Array'; // non-primitive present -> generic Array
        if (types.size > 1) return 'Array';
      }
      const only = types.values().next().value as string | undefined;
      if (!only) return 'Array';
      if (only === 'string') return 'StringArray';
      if (only === 'number') return 'NumberArray';
      if (only === 'boolean') return 'BooleanArray';
      if (only === 'bigint') return 'BigIntArray';
      return 'Array';
    };

    const formatArrayInlineValues = (items: unknown[]): string => {
      return items
        .map(item => {
          // Apply ignoreFalsy consistency for arrays as well
          if (item === null && cfg.ignoreFalsy) return undefined;
          // Only handle primitives inline (after JSON normalization, no special objects)
          if (isPrimitive(item)) return formatPrimitive(item);
          // Non-primitive will be handled structurally elsewhere (object:/array:)
          return undefined;
        })
        .filter((s): s is string => typeof s === 'string')
        .join(', ');
    };

    const formatValue = (
      value: unknown,
      depth: number,
      _context: 'root' | 'objectProperty' | 'arrayItem'
    ): string => {
      if (depth > cfg.maxDepth) return '[Max depth reached]';

      // Handle circular references (though less likely after JSON normalization)
      if (typeof value === 'object' && value !== null) {
        if (currentPath.has(value)) return '[Circular reference]';
        currentPath.add(value);
        try {
          // Arrays
          if (Array.isArray(value)) {
            const indent = indentUnit.repeat(depth);
            if (value.length === 0) {
              return 'EmptyArray';
            }

            // Decide if we can render inline as typed primitive array
            const arrayType = determinePrimitiveArrayType(value);
            const inlineValues = formatArrayInlineValues(value);

            if (arrayType !== 'Array' && inlineValues.length > 0) {
              return `${arrayType}: ${inlineValues}`;
            }

            // Generic/mixed arrays or arrays containing objects/arrays
            const parts: string[] = [];
            parts.push('Array:');

            for (let i = 0; i < value.length; i++) {
              const item = value[i];
              if (Array.isArray(item)) {
                const rendered = formatValue(item, depth + 1, 'arrayItem');
                parts.push(`${indent}${indentUnit}array:`);
                parts.push(
                  `${indent}${indentUnit}${indentUnit}${rendered.replace(
                    /\n/g,
                    `\n${indent}${indentUnit}${indentUnit}`
                  )}`
                );
              } else if (item && typeof item === 'object') {
                const rendered = formatValue(item, depth + 1, 'arrayItem');
                parts.push(`${indent}${indentUnit}object:`);
                parts.push(
                  `${indent}${indentUnit}${rendered.replace(
                    /\n/g,
                    `\n${indent}${indentUnit}`
                  )}`
                );
              } else {
                // primitive (including null)
                if (item === null && cfg.ignoreFalsy) {
                  // skip when ignoreFalsy is enabled
                } else {
                  const rendered = formatPrimitive(item);
                  parts.push(`${indent}${indentUnit}${rendered}`);
                }
              }
            }

            // If nothing was rendered (e.g., all values skipped), treat as empty array
            if (parts.length === 1) {
              return 'EmptyArray';
            }
            return parts.join('\n');
          }

          // Plain objects (after JSON normalization, all objects are plain)
          if (value && typeof value === 'object') {
            const obj = value as Record<string, unknown>;
            const keys = Object.keys(obj);
            // Filter out falsy fields if configured
            const effectiveKeys = keys.filter(k => {
              const val = obj[k];
              if (cfg.ignoreFalsy && val === null) return false;
              return true;
            });

            if (effectiveKeys.length === 0) {
              return 'EmptyObject';
            }

            if (cfg.sortKeys === 'asc')
              effectiveKeys.sort((a, b) => a.localeCompare(b));

            const indent = indentUnit.repeat(depth);
            const lines: string[] = [];
            for (const key of effectiveKeys) {
              const val = obj[key];
              const rendered = formatValue(val, depth + 1, 'objectProperty');
              if (rendered === '') continue;
              if (rendered.includes('\n')) {
                lines.push(`${indent}${key}:`);
                lines.push(
                  `${indent}${indentUnit}${rendered.replace(/\n/g, `\n${indent}${indentUnit}`)}`
                );
              } else {
                lines.push(`${indent}${key}: ${rendered}`);
              }
            }
            return lines.join('\n');
          }
        } finally {
          // Always cleanup currentPath for objects/arrays regardless of branch returns or errors
          currentPath.delete(value);
        }
      }

      // Primitives (null, string, number, boolean)
      if (isPrimitive(value)) {
        return formatPrimitive(value);
      }

      // Fallback
      return String(value);
    };

    const body = formatValue(normalizedData, 0, 'root');
    const full = `#content converted from json\n${body}`;
    if (Number.isFinite(cfg.maxChars) && full.length > cfg.maxChars) {
      const footer = `\n[Output truncated at ${cfg.maxChars} chars]`;
      const sliceLen = Math.max(0, cfg.maxChars - footer.length);
      return full.substring(0, sliceLen) + footer;
    }
    return full;
  } catch (fatalError) {
    // GUARANTEE: Even if everything else fails, always return the required format
    const errorMsg =
      fatalError instanceof Error ? fatalError.message : 'Unknown fatal error';
    return `#content converted from json\n[Fatal Error: ${errorMsg}]`;
  }
}
