/**
 * Command validation for security - prevents command injection attacks
 */

import { ALLOWED_COMMANDS, DANGEROUS_PATTERNS } from './securityConstants.js';
import type { ValidationResult } from '../types.js';

/**
 * Validates that a command is allowed and safe to execute
 * Uses command-aware validation to allow legitimate patterns
 */
export function validateCommand(
  command: string,
  args: string[]
): ValidationResult {
  // Check if command is in the whitelist
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
 */
function validateCommandArgs(
  command: string,
  args: string[]
): ValidationResult {
  // Define which argument positions contain patterns (not paths/filenames)
  // Patterns can safely contain |, (), etc. as they're regex/search patterns
  const patternPositions = getPatternArgPositions(command, args);

  // Check each argument for dangerous patterns
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const isPattern = patternPositions.has(i);

    // Skip validation for pattern arguments (they can contain |, (), etc.)
    if (isPattern) {
      continue;
    }

    // Validate non-pattern arguments strictly
    for (const dangerousPattern of DANGEROUS_PATTERNS) {
      if (dangerousPattern.test(arg)) {
        return {
          isValid: false,
          error: `Dangerous pattern detected in argument: '${arg}'. This may be a command injection attempt.`,
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
      const arg = args[i];
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
        break;
      }
    }
  } else if (command === 'find') {
    // In find: patterns come after -name, -iname, -path, -regex options
    // Also (, ), -o are structural elements that can contain ()
    // Note: Using spawn() passes args directly without shell, so no backslash needed
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      const prevArg = i > 0 ? args[i - 1] : '';

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

/**
 * Escapes a string for safe use in shell commands
 * Uses single quotes and escapes any single quotes in the input
 */
export function escapeShellArg(arg: string): string {
  // Replace single quotes with '\'' (end quote, escaped quote, start quote)
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

/**
 * Validates and sanitizes an array of arguments
 */
export function sanitizeArgs(args: string[]): ValidationResult {
  const sanitized: string[] = [];

  for (const arg of args) {
    // Check for dangerous patterns
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(arg)) {
        return {
          isValid: false,
          error: `Dangerous pattern detected in argument: '${arg}'`,
        };
      }
    }
    sanitized.push(arg);
  }

  return {
    isValid: true,
  };
}
