import { ContentSanitizer } from '@octocodeai/octocode-engine/contentSanitizer';
import { contextUtils } from '../contextUtils.js';
import { countLines } from '../core/lines.js';

export function selectMatchingBytes(
  content: string,
  pattern: string,
  contextBytes: number,
  isRegex: boolean,
  caseSensitive: boolean,
  filePath?: string
) {
  // Scan before cutting through tokens; scanning a fragment can miss a secret.
  const sanitized = ContentSanitizer.sanitizeContent(content, filePath);
  const securityLimited = sanitized.secretsDetected.includes(
    'content-size-exceeded'
  );
  const result = contextUtils.extractMatchingLines(sanitized.content, pattern, {
    contextBytes,
    isRegex,
    caseSensitive,
  });
  const bytes = Buffer.from(sanitized.content);
  const ranges = result.byteRanges;
  if (!ranges)
    throw new Error(
      'The native engine does not support byte context; rebuild or update octocode-engine.'
    );
  const chunks = ranges.map(range =>
    bytes.subarray(range.start, range.end).toString('utf8')
  );
  const anchorsPreserved =
    countLines(content) === countLines(sanitized.content);
  return {
    content: securityLimited ? '' : chunks.join('\n'),
    matchCount: result.matchCount,
    matchingLines: anchorsPreserved ? result.matchingLines : [],
    matchRanges: anchorsPreserved ? result.matchRanges : [],
    sourceLines: anchorsPreserved
      ? chunks.flatMap((chunk, index) =>
          chunk
            .split('\n')
            .map((_, line) => result.matchRanges[index]!.start + line)
        )
      : undefined,
    securityLimited,
    warnings: [
      ...sanitized.warnings,
      ...(!anchorsPreserved
        ? [
            'Source line anchors omitted because redaction changed the line layout.',
          ]
        : []),
    ],
  };
}
