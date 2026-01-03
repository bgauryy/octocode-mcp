/**
 * CLI Argument Parser
 */

import type { ParsedArgs } from './types.js';

// Options that take values
const OPTIONS_WITH_VALUES = new Set([
  'ide',
  'method',
  'output',
  'o',
  'hostname',
  'h',
  'git-protocol',
  'p',
]);

/**
 * Parse command line arguments
 */
export function parseArgs(argv: string[] = process.argv.slice(2)): ParsedArgs {
  const result: ParsedArgs = {
    command: null,
    args: [],
    options: {},
  };

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];

    if (arg.startsWith('--')) {
      // Long option
      const [key, value] = arg.slice(2).split('=');
      if (value !== undefined) {
        result.options[key] = value;
      } else if (
        OPTIONS_WITH_VALUES.has(key) &&
        i + 1 < argv.length &&
        !argv[i + 1].startsWith('-')
      ) {
        // Option takes a value, look ahead
        result.options[key] = argv[i + 1];
        i++;
      } else {
        result.options[key] = true;
      }
    } else if (arg.startsWith('-') && arg.length > 1) {
      // Short option(s)
      const flags = arg.slice(1);
      // Check if last flag takes a value
      const lastFlag = flags[flags.length - 1];
      if (
        flags.length === 1 &&
        OPTIONS_WITH_VALUES.has(lastFlag) &&
        i + 1 < argv.length &&
        !argv[i + 1].startsWith('-')
      ) {
        result.options[lastFlag] = argv[i + 1];
        i++;
      } else {
        for (const flag of flags) {
          result.options[flag] = true;
        }
      }
    } else if (!result.command) {
      // First non-option is the command
      result.command = arg;
    } else {
      // Everything else is a positional argument
      result.args.push(arg);
    }

    i++;
  }

  return result;
}

/**
 * Check if help flag is present
 */
export function hasHelpFlag(args: ParsedArgs): boolean {
  return Boolean(args.options['help'] || args.options['h']);
}

/**
 * Check if version flag is present
 */
export function hasVersionFlag(args: ParsedArgs): boolean {
  return Boolean(args.options['version'] || args.options['v']);
}
