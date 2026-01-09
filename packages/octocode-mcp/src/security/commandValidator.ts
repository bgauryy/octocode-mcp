/**
 * Command validation for security - prevents command injection attacks
 */

import {
  ALLOWED_COMMANDS,
  DANGEROUS_PATTERNS,
  PATTERN_DANGEROUS_PATTERNS,
} from './securityConstants.js';

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
