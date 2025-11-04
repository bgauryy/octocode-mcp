import { dump } from 'js-yaml';

export interface YamlConversionConfig {
  sortKeys?: boolean;
  keysPriority?: string[];
}

export function jsonToYamlString(
  jsonObject: unknown,
  config?: YamlConversionConfig
): string {
  const createSortFunction = () => {
    if (!config?.sortKeys && !config?.keysPriority) {
      return false;
    }

    if (config.keysPriority && config.keysPriority.length > 0) {
      return (a: string, b: string) => {
        const aPriority = config.keysPriority!.indexOf(a);
        const bPriority = config.keysPriority!.indexOf(b);

        if (aPriority !== -1 && bPriority !== -1) {
          return aPriority - bPriority;
        }

        if (aPriority !== -1 && bPriority === -1) {
          return -1;
        }

        if (aPriority === -1 && bPriority !== -1) {
          return 1;
        }

        return a.localeCompare(b);
      };
    }

    if (config.sortKeys) {
      return (a: string, b: string) => a.localeCompare(b);
    }

    return false;
  };

  try {
    return dump(jsonObject, {
      // Force quotes on all non-key strings for consistency
      forceQuotes: true,

      // Use double quotes to match JSON convention
      quotingType: '"',

      // No line wrapping for cleaner, more predictable output
      lineWidth: -1,

      // Don't convert duplicate objects into references for cleaner output
      noRefs: true,

      // Apply configured sorting function
      sortKeys: createSortFunction(),

      // Use 2-space indentation (YAML standard)
      indent: 2,

      // Don't try to be compatible with older YAML versions
      noCompatMode: true,

      // Use flow style sparingly (only when beneficial)
      flowLevel: -1,

      // Don't skip invalid values, let them be handled explicitly
      skipInvalid: false,
    });
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
      return JSON.stringify(jsonObject, null, 2);
    } catch (jsonError) {
      // If JSON.stringify also fails (e.g., circular references), return a safe string
      return `# YAML conversion failed: ${errorMessage}\n# JSON conversion also failed: ${jsonError instanceof Error ? jsonError.message : 'Unknown error'}\n# Object: [Unconvertible]`;
    }
  }
}
