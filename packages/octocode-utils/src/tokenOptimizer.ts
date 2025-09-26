import { dump } from 'js-yaml';

const DEFAULT_CONFIG: Required<
  Omit<tokenOptimizerConfig, 'keysPriority' | 'noArrayIndent' | 'condenseFlow'>
> = {
  sortKeys: false,
  forceQuotes: true,
  quotingType: '"',
  lineWidth: -1,
  noRefs: true,
  indent: 2,
  noCompatMode: true,
  flowLevel: -1,
  skipInvalid: false,
  removeRedundant: true,
};

export interface tokenOptimizerConfig {
  /** If true, sort keys when dumping YAML. If a function, use the function to sort the keys */
  sortKeys?: boolean | ((a: string, b: string) => number);

  /** Priority order for keys (custom extension for priority-based sorting) */
  keysPriority?: string[];

  /** Indentation width to use (in spaces) */
  indent?: number;

  /** When true, will not add an indentation level to array elements */
  noArrayIndent?: boolean;

  /** Do not throw on invalid types and skip pairs and single values with such types */
  skipInvalid?: boolean;

  /** Specifies level of nesting, when to switch from block to flow style for collections. -1 means block style everywhere */
  flowLevel?: number;

  /** Set max line width. -1 for no line wrapping */
  lineWidth?: number;

  /** If true, don't convert duplicate objects into references */
  noRefs?: boolean;

  /** If true don't try to be compatible with older yaml versions */
  noCompatMode?: boolean;

  /** If true flow sequences will be condensed, omitting the space between key: value or a, b */
  condenseFlow?: boolean;

  /** Strings will be quoted using this quoting style */
  quotingType?: "'" | '"';

  /** If true, all non-key strings will be quoted even if they normally don't need to */
  forceQuotes?: boolean;

  /** If true, remove empty objects, empty arrays, empty strings, null, undefined, and NaN values (preserves booleans and numbers) */
  removeRedundant?: boolean;
}

export function tokenOptimizer(
  jsonObject: unknown,
  config?: tokenOptimizerConfig
): string {
  // Apply removeRedundant cleaning if enabled
  let processedObject = jsonObject;
  if (config?.removeRedundant) {
    processedObject = removeRedundantValues(jsonObject);
    // If the entire object becomes empty/undefined after cleaning, return empty YAML
    if (processedObject === undefined) {
      return '';
    }
  }

  // Create sorting function based on configuration
  const createSortFunction = () => {
    // No sorting if neither sortKeys nor keysPriority is specified
    if (!config?.sortKeys && !config?.keysPriority) {
      return false;
    }

    // If keysPriority is provided, use priority-based sorting
    if (config.keysPriority && config.keysPriority.length > 0) {
      return (a: string, b: string) => {
        const aPriority = config.keysPriority!.indexOf(a);
        const bPriority = config.keysPriority!.indexOf(b);

        // If both keys are in priority list, sort by their position
        if (aPriority !== -1 && bPriority !== -1) {
          return aPriority - bPriority;
        }

        // If only 'a' is in priority list, it comes first
        if (aPriority !== -1 && bPriority === -1) {
          return -1;
        }

        // If only 'b' is in priority list, it comes first
        if (aPriority === -1 && bPriority !== -1) {
          return 1;
        }

        // If neither is in priority list, sort alphabetically
        return a.localeCompare(b);
      };
    }

    // If only sortKeys is true, use alphabetical sorting
    if (config.sortKeys) {
      return (a: string, b: string) => a.localeCompare(b);
    }

    return false;
  };

  const mergedConfig = {
    ...DEFAULT_CONFIG,
    ...config,
    sortKeys: createSortFunction(),
  };

  try {
    return dump(processedObject, mergedConfig);
  } catch (error) {
    // If YAML conversion fails, fallback to JSON.stringify for safety
    // This ensures the function always returns a valid string representation
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    //eslint-disable-next-line no-console
    console.warn(
      `YAML conversion failed (${errorMessage}), falling back to JSON`
    );

    try {
      return JSON.stringify(processedObject, null, 2);
    } catch (jsonError) {
      // If JSON.stringify also fails (e.g., circular references), return a safe string
      return `# YAML conversion failed: ${errorMessage}\n# JSON conversion also failed: ${jsonError instanceof Error ? jsonError.message : 'Unknown error'}\n# Object: [Unconvertible]`;
    }
  }
}

function removeRedundantValues(obj: unknown): unknown {
  if (obj === null || obj === undefined || Number.isNaN(obj)) {
    return undefined; // Will be filtered out
  }

  if (typeof obj === 'boolean' || typeof obj === 'number') {
    return obj; // Preserve all booleans and numbers
  }

  if (typeof obj === 'string') {
    // Remove empty strings, preserve non-empty strings
    return obj === '' ? undefined : obj;
  }

  if (Array.isArray(obj)) {
    const cleaned = obj
      .map(item => removeRedundantValues(item))
      .filter(item => item !== undefined);

    // Return undefined if array becomes empty after cleaning
    return cleaned.length === 0 ? undefined : cleaned;
  }

  if (typeof obj === 'object' && obj !== null) {
    const cleaned: Record<string, unknown> = {};
    let hasValidProperties = false;

    for (const [key, value] of Object.entries(obj)) {
      const cleanedValue = removeRedundantValues(value);
      if (cleanedValue !== undefined) {
        cleaned[key] = cleanedValue;
        hasValidProperties = true;
      }
    }

    // Return undefined if object becomes empty after cleaning
    return hasValidProperties ? cleaned : undefined;
  }

  return obj; // For any other types, return as-is
}
