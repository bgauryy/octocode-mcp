import { allRegexPatterns } from './regexes.js';
import type { SensitiveDataPattern } from '../types.js';

interface Match {
  start: number;
  end: number;
  accuracy: 'high' | 'medium';
}

let combinedRegex: RegExp | null = null;
let patternMap: SensitiveDataPattern[] = [];

export function maskSensitiveData(text: string): string {
  if (!text) return text;

  const regex = getCombinedRegex();
  const matches: Match[] = [];
  let match;

  while ((match = regex.exec(text)) !== null) {
    for (let i = 0; i < patternMap.length; i++) {
      if (match.groups?.[`p${i}`]) {
        matches.push({
          start: match.index,
          end: match.index + match[0].length,
          accuracy: patternMap[i]?.matchAccuracy || 'medium',
        });
        break;
      }
    }

    // Prevent infinite loop on zero-length matches
    if (match[0].length === 0) {
      regex.lastIndex++;
    }
  }

  if (matches.length === 0) return text;

  matches.sort((a, b) => a.start - b.start);

  const nonOverlapping: Match[] = [];
  let lastEnd = -1;

  for (const match of matches) {
    if (match.start >= lastEnd) {
      nonOverlapping.push(match);
      lastEnd = match.end;
    }
  }

  let result = text;
  for (let i = nonOverlapping.length - 1; i >= 0; i--) {
    const match = nonOverlapping[i];
    if (match) {
      const originalText = text.slice(match.start, match.end);
      const maskedText = maskEveryTwoChars(originalText);

      result =
        result.slice(0, match.start) + maskedText + result.slice(match.end);
    }
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

function createCombinedRegex(patterns: SensitiveDataPattern[]): RegExp {
  const regexSources = patterns.map((pattern, index) => {
    const source = pattern.regex.source;
    return `(?<p${index}>${source})`;
  });

  return new RegExp(regexSources.join('|'), 'gi');
}
