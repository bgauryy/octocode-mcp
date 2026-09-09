import {
  EXTENSION_SELECTORS,
  LANGUAGE_SELECTORS,
  type LanguageSelector,
} from './data.js';

function normalizeLanguageInput(raw: string): string {
  return raw.trim().replace(/^\./, '').toLowerCase();
}

function classifyLanguageSelector(
  raw: string | undefined
): LanguageSelector | undefined {
  if (!raw?.trim()) return undefined;
  const normalized = normalizeLanguageInput(raw);
  const definition =
    EXTENSION_SELECTORS[normalized] ?? LANGUAGE_SELECTORS[normalized];
  if (!definition) {
    return {
      raw,
      normalized,
      kind: 'unknown',
      canonicalLanguage: raw.trim(),
    };
  }
  return {
    raw,
    normalized,
    ...definition,
  };
}

export function toStructuralSearchIncludeGlobs(
  raw: string | undefined
): string[] | undefined {
  const selector = classifyLanguageSelector(raw);
  if (!selector) return undefined;
  const extensions = selector.extensions?.length
    ? selector.extensions
    : [selector.normalized.replace(/^[.*]+/, '')];
  const globs = extensions.filter(Boolean).map(ext => `*.${ext}`);
  return globs.length ? globs : undefined;
}
