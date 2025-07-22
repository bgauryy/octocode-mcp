import { allRegexPatterns } from '../../../security/regexes';

interface SensitiveDataPattern {
  name: string;
  description: string;
  regex: RegExp;
  fileContext?: RegExp;
  matchAccuracy?: 'high' | 'medium';
}

interface Match {
  start: number;
  end: number;
  accuracy: 'high' | 'medium';
}

// Cache the combined regex
let combinedRegex: RegExp | null = null;
let patternMap: SensitiveDataPattern[] = [];

export function sanitize(text: string): string {
  if (!text) return text;

  const regex = getCombinedRegex();
  const matches: Match[] = [];

  // Single pass to find all matches with safety limits
  let match;
  let iterationCount = 0;
  const maxIterations = 10000; // Prevent infinite loops
  const startTime = Date.now();
  const maxExecutionTime = 5000; // 5 seconds max

  while ((match = regex.exec(text)) !== null) {
    // Safety checks to prevent infinite loops and excessive execution time
    iterationCount++;
    if (iterationCount > maxIterations) {
      // TODO: log
      break;
    }

    if (Date.now() - startTime > maxExecutionTime) {
      // TODO: log
      break;
    }

    // Find which named capture group matched
    for (let i = 0; i < patternMap.length; i++) {
      if (match.groups?.[`p${i}`]) {
        matches.push({
          start: match.index,
          end: match.index + match[0].length,
          accuracy: patternMap[i].matchAccuracy || 'medium',
        });
        break;
      }
    }

    // Prevent infinite loop on zero-length matches
    if (match[0].length === 0) {
      regex.lastIndex++;
      // Additional safety: if we're not advancing, break
      if (regex.lastIndex >= text.length) {
        break;
      }
    }
  }

  if (matches.length === 0) return text;

  // Sort matches by start position
  matches.sort((a, b) => a.start - b.start);

  // Remove overlapping matches (keep first one)
  const nonOverlapping: Match[] = [];
  let lastEnd = -1;

  for (const match of matches) {
    if (match.start >= lastEnd) {
      nonOverlapping.push(match);
      lastEnd = match.end;
    }
  }

  // Apply replacements in reverse order to maintain positions
  let result = text;
  for (let i = nonOverlapping.length - 1; i >= 0; i--) {
    const match = nonOverlapping[i];
    const originalText = text.slice(match.start, match.end);
    const maskedText = maskEveryTwoChars(originalText);

    result =
      result.slice(0, match.start) + maskedText + result.slice(match.end);
  }

  return result;
}

function getCombinedRegex(): RegExp {
  if (!combinedRegex) {
    combinedRegex = createCombinedRegex(allRegexPatterns);
    patternMap = allRegexPatterns;
  }
  return combinedRegex;
}

function maskEveryTwoChars(text: string): string {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    if (i % 2 === 0) {
      result += '*';
    } else {
      result += text[i];
    }
  }
  return result;
}

// Compile all patterns into a single regex for better performance with safety checks
function createCombinedRegex(patterns: SensitiveDataPattern[]): RegExp {
  if (!patterns || patterns.length === 0) {
    throw new Error('No regex patterns provided for compilation');
  }

  const regexSources: string[] = [];

  for (let index = 0; index < patterns.length; index++) {
    const pattern = patterns[index];

    // Validate the pattern exists and has a regex
    if (!pattern || !pattern.regex) {
      // TODO: log
      continue;
    }

    try {
      // Validate the regex source - check for potentially dangerous patterns
      const source = pattern.regex.source;

      // Basic validation - reject empty sources or sources that are too complex
      if (!source || source.length === 0) {
        // TODO: log
        continue;
      }

      if (source.length > 1000) {
        // TODO: log
        continue;
      }

      // Test that the regex can be compiled safely
      new RegExp(source);

      // Wrap in named capture group
      regexSources.push(`(?<p${regexSources.length}>${source})`);
    } catch (error) {
      // TODO: log
      continue;
    }
  }

  if (regexSources.length === 0) {
    throw new Error('No valid regex patterns available after validation');
  }

  try {
    return new RegExp(regexSources.join('|'), 'gi');
  } catch (error) {
    throw new Error(
      `Failed to create combined regex: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
