import type { ParsedArgs } from './types.js';

// These options consume the next argv token. `-h` is --help; use `-H` for --hostname.
const OPTIONS_WITH_VALUES = new Set([
  'ide',
  'method',
  'm',
  'output',
  'o',
  'hostname',
  'H',
  'git-protocol',
  'p',
  'type',
  't',
  'skill',
  'k',
  'targets',
  'mode',
  'model',
  'resume',
  'r',
  'id',
  'client',
  'c',
  'search',
  'category',
  'env',
  'config',
]);

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
      const [key, value] = arg.slice(2).split('=');
      if (value !== undefined) {
        result.options[key] = value;
      } else if (
        OPTIONS_WITH_VALUES.has(key) &&
        i + 1 < argv.length &&
        !argv[i + 1].startsWith('-')
      ) {
        result.options[key] = argv[i + 1];
        i++;
      } else {
        result.options[key] = true;
      }
    } else if (arg.startsWith('-') && arg.length > 1) {
      const flags = arg.slice(1);
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
      result.command = arg;
    } else {
      result.args.push(arg);
    }

    i++;
  }

  return result;
}

export function hasHelpFlag(args: ParsedArgs): boolean {
  return Boolean(args.options['help'] || args.options['h']);
}

export function hasVersionFlag(args: ParsedArgs): boolean {
  return Boolean(args.options['version'] || args.options['v']);
}
