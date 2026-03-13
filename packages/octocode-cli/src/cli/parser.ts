/**
 * CLI Argument Parser
 */

import type { ParsedArgs } from './types.js';

// Options that take values
// Note: -h is reserved for --help, use -H for --hostname
const OPTIONS_WITH_VALUES = new Set([
  // Existing CLI options
  'ide',
  'method',
  'output',
  'o',
  'hostname',
  'H', // Short for --hostname (uppercase to avoid conflict with -h for help)
  'git-protocol',
  'p',
  'type', // For token command + local-search/local-find
  't', // Short for --type
  'model', // For chat command
  'resume', // For chat command
  'r', // Short for --resume

  // Research tool options
  'keywords',
  'owner',
  'repo',
  'extension',
  'filename',
  'path',
  'match',
  'limit',
  'page',
  'branch',
  'start-line',
  'end-line',
  'context-lines',
  'char-offset',
  'char-length',
  'depth',
  'entries-per-page',
  'name',
  'ecosystem',
  'query',
  'pr-number',
  'state',
  'author',
  'assignee',
  'label',
  'head',
  'base',
  'created',
  'updated',
  'sort',
  'order',
  'content-type',
  'pattern',
  'mode',
  'include',
  'exclude',
  'exclude-dir',
  'max-files',
  'files-per-page',
  'file-page',
  'iname',
  'names',
  'regex',
  'max-depth',
  'min-depth',
  'modified-within',
  'modified-before',
  'size-greater',
  'size-less',
  'sort-by',
  'extensions',
  'uri',
  'symbol',
  'line-hint',
  'order-hint',
  'refs-per-page',
  'include-pattern',
  'exclude-pattern',
  'direction',
  'calls-per-page',
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
