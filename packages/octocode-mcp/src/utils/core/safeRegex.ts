/**
 * Lightweight ReDoS detection for user-supplied regex patterns.
 *
 * Detects the most common ReDoS vectors: nested quantifiers (star height > 1).
 * Patterns like (a+)+, (a*)+, (.*a)* cause exponential backtracking.
 */

/** Quantifier characters that indicate repetition */
const QUANTIFIER_CHARS = new Set(['+', '*', '?']);

/** Maximum pattern length to prevent excessive parsing time */
const MAX_PATTERN_LENGTH = 1000;

/**
 * Check if a regex pattern is likely safe from catastrophic backtracking.
 *
 * Uses a simple heuristic: track whether each group contains a quantified
 * sub-expression. If a group that contains a quantifier is itself quantified,
 * the pattern has star height > 1 and is flagged as unsafe.
 *
 * @returns `{ safe: true }` or `{ safe: false, reason: string }`
 */
export function checkRegexSafety(pattern: string): {
  safe: boolean;
  reason?: string;
} {
  if (pattern.length > MAX_PATTERN_LENGTH) {
    return { safe: false, reason: 'Pattern too long (max 1000 characters)' };
  }

  const REDOS_MSG =
    'Nested quantifiers detected (potential ReDoS). Simplify the pattern.';

  // Stack tracks whether each open group contains a quantified sub-expression.
  // When a group closes, its flag propagates to the parent group.
  const groupHasQuantifier: boolean[] = [];
  let i = 0;

  while (i < pattern.length) {
    const ch = pattern[i];

    // Skip escaped characters
    if (ch === '\\') {
      i += 2;
      continue;
    }

    // Skip character classes entirely — quantifiers inside [] are literals
    if (ch === '[') {
      i++;
      while (i < pattern.length && pattern[i] !== ']') {
        if (pattern[i] === '\\') i++;
        i++;
      }
      i++; // skip closing ]
      continue;
    }

    if (ch === '(') {
      groupHasQuantifier.push(false);
      i++;
      continue;
    }

    if (ch === ')') {
      const innerHasQuantifier = groupHasQuantifier.pop() ?? false;

      // Check if this closing group is followed by a quantifier
      const next = pattern[i + 1];
      const isQuantified =
        (next !== undefined && QUANTIFIER_CHARS.has(next)) ||
        (next === '{' && isRepetitionQuantifier(pattern, i + 1));

      if (isQuantified && innerHasQuantifier) {
        // Star height > 1: a quantified group containing a quantifier
        return { safe: false, reason: REDOS_MSG };
      }

      // Propagate: parent group now contains a quantified sub-expression
      if (isQuantified || innerHasQuantifier) {
        if (groupHasQuantifier.length > 0) {
          groupHasQuantifier[groupHasQuantifier.length - 1] = true;
        }
      }

      // Skip the quantifier and any lazy/possessive modifier
      if (isQuantified) {
        i = skipQuantifier(pattern, i + 1);
      } else {
        i++;
      }
      continue;
    }

    // Quantifier after a non-group atom (e.g. a+, \d*, .+)
    if (
      QUANTIFIER_CHARS.has(ch!) ||
      (ch === '{' && isRepetitionQuantifier(pattern, i))
    ) {
      // If we're inside a group that already has a quantifier, it's nested
      if (groupHasQuantifier.some(g => g)) {
        return { safe: false, reason: REDOS_MSG };
      }
      // Mark the innermost enclosing group as containing a quantifier
      if (groupHasQuantifier.length > 0) {
        groupHasQuantifier[groupHasQuantifier.length - 1] = true;
      }
      i = skipQuantifier(pattern, i);
      continue;
    }

    i++;
  }

  return { safe: true };
}

/** Check if pattern[pos] starts a {n,m} repetition quantifier */
function isRepetitionQuantifier(pattern: string, pos: number): boolean {
  if (pattern[pos] !== '{') return false;
  const closeBrace = pattern.indexOf('}', pos);
  if (closeBrace === -1) return false;
  return /^\{\d+,?\d*\}$/.test(pattern.slice(pos, closeBrace + 1));
}

/** Skip past a quantifier (including lazy/possessive modifier) */
function skipQuantifier(pattern: string, pos: number): number {
  const ch = pattern[pos];
  if (ch === '{') {
    pos = pattern.indexOf('}', pos) + 1;
  } else {
    pos++; // skip +, *, or ?
  }
  // Skip lazy (?) or possessive (+) modifier
  if (pos < pattern.length && (pattern[pos] === '?' || pattern[pos] === '+')) {
    pos++;
  }
  return pos;
}

/**
 * Create a RegExp from a user-supplied pattern, rejecting unsafe patterns.
 *
 * @throws Error if the pattern is invalid or has ReDoS risk
 */
export function createSafeRegExp(pattern: string, flags?: string): RegExp {
  const safety = checkRegexSafety(pattern);
  if (!safety.safe) {
    throw new Error(safety.reason);
  }
  return new RegExp(pattern, flags);
}
