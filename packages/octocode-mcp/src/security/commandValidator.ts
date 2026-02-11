/**
 * Command validation for security - prevents command injection attacks
 */

import {
  ALLOWED_COMMANDS,
  DANGEROUS_PATTERNS,
  PATTERN_DANGEROUS_PATTERNS,
} from './securityConstants.js';

const RG_ALLOWED_FLAGS = new Set([
  '-F',
  '-P',
  '-s',
  '-i',
  '-S',
  '--no-unicode',
  '-w',
  '-v',
  '-a',
  '--binary',
  '-L',
  '-n',
  '--column',
  '-l',
  '--files-without-match',
  '--count-matches',
  '-c',
  '--no-ignore',
  '--hidden',
  '-U',
  '--multiline-dotall',
  '--json',
  '--stats',
  '--no-mmap',
  '--no-messages',
  '-x',
  '--passthru',
  '--debug',
]);

const RG_ALLOWED_FLAGS_WITH_VALUES = new Set([
  '-g',
  '--glob',
  '--include',
  '--exclude',
  '--exclude-dir',
  '-A',
  '-B',
  '-C',
  '-m',
  '-t',
  '--type',
  '-T',
  '--type-not',
  '-j',
  '--threads',
  '--sort',
  '--sortr',
  '--max-filesize',
  '-E',
  '--encoding',
  '--color',
]);

const FIND_DISALLOWED_OPERATORS = new Set([
  '-delete',
  '-exec',
  '-execdir',
  '-ok',
  '-okdir',
  '-printf',
  '-fprintf',
  '-fprint',
  '-fprint0',
  '-fls',
  '-ls',
]);

const FIND_ALLOWED_TOKENS = new Set([
  '-O3',
  '-empty',
  '-executable',
  '-readable',
  '-writable',
  '-prune',
  '-print0',
  '(',
  ')',
  '-o',
]);

const FIND_ALLOWED_TOKENS_WITH_VALUES = new Set([
  '-maxdepth',
  '-mindepth',
  '-type',
  '-name',
  '-iname',
  '-path',
  '-regex',
  '-regextype',
  '-size',
  '-mtime',
  '-mmin',
  '-atime',
  '-amin',
  '-perm',
]);

/**
 * Result of command validation
 */
interface CommandValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Validates that a command is allowed and safe to execute
 * Uses command-aware validation to allow legitimate patterns
 */
export function validateCommand(
  command: string,
  args: string[]
): CommandValidationResult {
  if (
    !ALLOWED_COMMANDS.includes(command as (typeof ALLOWED_COMMANDS)[number])
  ) {
    return {
      isValid: false,
      error: `Command '${command}' is not allowed. Allowed commands: ${ALLOWED_COMMANDS.join(', ')}`,
    };
  }

  // Command-aware validation
  return validateCommandArgs(command, args);
}

/**
 * Validates arguments based on command context
 * Uses position-aware validation - certain args are search patterns, others are paths
 *
 * Pattern arguments (regex, globs) get more permissive validation that allows
 * legitimate regex metacharacters but still blocks shell injection vectors.
 */
function validateCommandArgs(
  command: string,
  args: string[]
): CommandValidationResult {
  if (command === 'rg') {
    const disallowedFlag = findDisallowedRgFlag(args);
    if (disallowedFlag) {
      return {
        isValid: false,
        error: `rg option '${disallowedFlag}' is not allowed.`,
      };
    }
  } else if (command === 'find') {
    const invalidFindArg = findInvalidFindArg(args);
    if (invalidFindArg) {
      return {
        isValid: false,
        error: `find operator '${invalidFindArg}' is not allowed.`,
      };
    }
  }

  // Define which argument positions contain patterns (not paths/filenames)
  // Patterns can safely contain |, (), etc. as they're regex/search patterns
  const patternPositions = getPatternArgPositions(command, args);

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    const isPattern = patternPositions.has(i);

    // Use appropriate validation set based on argument type
    // Pattern args get more permissive checks but still block shell injection
    const dangerousPatterns = isPattern
      ? PATTERN_DANGEROUS_PATTERNS
      : DANGEROUS_PATTERNS;

    for (const dangerousPattern of dangerousPatterns) {
      if (dangerousPattern.test(arg)) {
        const argType = isPattern ? 'search pattern' : 'argument';
        return {
          isValid: false,
          error: `Dangerous pattern detected in ${argType}: '${arg}'. This may be a command injection attempt.`,
        };
      }
    }
  }

  return { isValid: true };
}

/**
 * Identifies which argument positions contain search patterns vs paths
 * Patterns can safely contain regex metacharacters like |, (), etc.
 */
function getPatternArgPositions(command: string, args: string[]): Set<number> {
  const patternPositions = new Set<number>();

  if (command === 'rg') {
    // In ripgrep: pattern comes after flags, typically the first non-flag arg
    let foundPattern = false;
    for (let i = 0; i < args.length; i++) {
      const arg = args[i]!;
      if (arg === '--') {
        const nextArgIndex = i + 1;
        if (nextArgIndex < args.length) {
          patternPositions.add(nextArgIndex);
        }
        break;
      }
      // Skip flags and their values
      if (arg.startsWith('-')) {
        // Flags whose values are glob patterns (can contain {}, *, etc.)
        if (
          ['-g', '--glob', '--include', '--exclude', '--exclude-dir'].includes(
            arg
          )
        ) {
          i++; // Move to the value
          patternPositions.add(i); // Mark glob pattern as safe
          continue;
        }

        // Other flags with values (ripgrep)
        if (
          [
            '-A',
            '-B',
            '-C',
            '-m',
            '-t',
            '--type',
            '-T',
            '--type-not',
            '-j',
            '--threads',
            '--sort',
            '--sortr',
            '--max-filesize',
            '-E',
            '--encoding',
            '--color',
          ].includes(arg)
        ) {
          i++; // Skip the value
        }
        continue;
      }
      // First non-flag arg is the pattern
      if (!foundPattern) {
        patternPositions.add(i);
        foundPattern = true;
        // Continue loop to validate remaining args (path comes after pattern)
      }
    }
  } else if (command === 'grep') {
    // In grep: pattern comes after -- separator or as first non-flag arg
    // Also handle --include/--exclude patterns which can contain globs
    for (let i = 0; i < args.length; i++) {
      const arg = args[i]!;
      if (arg === '--') {
        // After --, next arg is the pattern
        if (i + 1 < args.length) {
          patternPositions.add(i + 1);
        }
        break;
      }
      // --include=*.ext and --exclude=dir patterns are safe
      if (arg.startsWith('--include=') || arg.startsWith('--exclude=')) {
        patternPositions.add(i);
      }
    }
  } else if (command === 'find') {
    // In find: patterns come after -name, -iname, -path, -regex options
    // Also (, ), -o are structural elements that can contain ()
    // Note: Using spawn() passes args directly without shell, so no backslash needed
    for (let i = 0; i < args.length; i++) {
      const arg = args[i]!;
      const prevArg = i > 0 ? args[i - 1]! : '';

      // Arguments that are search patterns
      if (
        ['-name', '-iname', '-path', '-regex', '-size', '-perm'].includes(
          prevArg
        )
      ) {
        patternPositions.add(i);
      }

      // Structural elements for grouping (unescaped because spawn passes them directly)
      if (arg === '(' || arg === ')' || arg === '-o') {
        patternPositions.add(i);
      }
    }
  }

  return patternPositions;
}

function findDisallowedRgFlag(args: string[]): string | null {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--') {
      return null;
    }

    if (!arg.startsWith('-')) {
      return null;
    }

    if (arg.startsWith('--pre') || arg.startsWith('--pre-glob')) {
      return arg;
    }

    if (RG_ALLOWED_FLAGS_WITH_VALUES.has(arg)) {
      i++;
      continue;
    }

    if (RG_ALLOWED_FLAGS.has(arg)) {
      continue;
    }

    // Allow short flag bundles like -rnH; builder uses split flags,
    // but users may provide equivalent forms.
    if (/^-[a-zA-Z]{2,}$/.test(arg)) {
      continue;
    }

    return arg;
  }

  return null;
}

function findInvalidFindArg(args: string[]): string | null {
  let afterPathArgs = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--') {
      continue;
    }

    // find grammar is effectively: find <path...> <expr...>
    // First non-flag token is treated as path; expression starts at first flag.
    if (!afterPathArgs && !arg.startsWith('-') && arg !== '(' && arg !== ')') {
      continue;
    }
    afterPathArgs = true;

    if (FIND_DISALLOWED_OPERATORS.has(arg)) {
      return arg;
    }

    if (FIND_ALLOWED_TOKENS_WITH_VALUES.has(arg)) {
      i++;
      continue;
    }

    if (FIND_ALLOWED_TOKENS.has(arg)) {
      continue;
    }

    // Non-flag values are acceptable expression operands (e.g., path/pattern values)
    if (!arg.startsWith('-')) {
      continue;
    }

    return arg;
  }

  return null;
}
