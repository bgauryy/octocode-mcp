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

        if (config.sortKeys) {
          return a.localeCompare(b);
        }

        return 0;
      };
    }

    if (config.sortKeys) {
      return (a: string, b: string) => a.localeCompare(b);
    }

    return false;
  };

  try {
    return dump(jsonObject, {
      forceQuotes: true,
      quotingType: '"',
      lineWidth: -1,
      noRefs: true,
      sortKeys: createSortFunction(),
      indent: 2,
      noCompatMode: true,
      flowLevel: -1,
      skipInvalid: false,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    //eslint-disable-next-line no-console
    console.warn(
      `YAML conversion failed (${errorMessage}), falling back to JSON`
    );

    try {
      return JSON.stringify(jsonObject, null, 2);
    } catch (jsonError) {
      return `# YAML conversion failed: ${errorMessage}\n# JSON conversion also failed: ${jsonError instanceof Error ? jsonError.message : 'Unknown error'}\n# Object: [Unconvertible]`;
    }
  }
}
