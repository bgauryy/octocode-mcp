import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { z } from 'zod';
import { createResult } from '../responses';
import { ContentSanitizer } from '../../security/contentSanitizer';

/**
 * UNIFIED SMART VALIDATION SYSTEM
 *
 * Combines Zod schema validation + intelligent security sanitization
 * No backward compatibility - this is internal use only!
 */

/**
 * Intelligence levels for validation
 */
type ValidationIntelligence = 'smart' | 'strict' | 'minimal';

/**
 * Smart parameter analysis - detects what kind of content this is
 */
function analyzeParameterIntent(
  key: string,
  value: unknown
): {
  isSearchContent: boolean;
  isCommandLike: boolean;
  isStructural: boolean;
  riskLevel: 'low' | 'medium' | 'high';
} {
  const keyLower = key.toLowerCase();

  // Search/query/documentation content - should almost never be sanitized
  const searchIndicators = [
    'query',
    'search',
    'term',
    'text',
    'content',
    'description',
    'documentation',
    'readme',
    'comment',
    'message',
    'title',
    'body',
    'snippet',
    'example',
    'code',
    'help',
    'info',
    'note',
    'summary',
    'detail',
    'explain',
  ];

  // Command-like parameters - need sanitization
  const commandIndicators = [
    'command',
    'cmd',
    'exec',
    'shell',
    'script',
    'system',
    'bash',
    'sh',
    'run',
    'execute',
    'process',
  ];

  // Structural parameters - never sanitize content
  const structuralIndicators = [
    'owner',
    'repo',
    'path',
    'file',
    'branch',
    'tag',
    'id',
    'limit',
    'offset',
    'sort',
    'order',
    'type',
    'format',
  ];

  const isSearchContent = searchIndicators.some(ind => keyLower.includes(ind));
  const isCommandLike = commandIndicators.some(ind => keyLower.includes(ind));
  const isStructural = structuralIndicators.some(ind => keyLower.includes(ind));

  // Determine risk level with smarter detection
  let riskLevel: 'low' | 'medium' | 'high' = 'low';
  if (isCommandLike && typeof value === 'string') {
    // Look for actual command injection patterns, not just presence of dangerous commands
    const hasCommandInjection =
      /;\s*(rm|del|format|shutdown|kill|sudo|su)\s/i.test(value) || // ; rm
      /\|\s*(rm|del|format|shutdown|kill|sudo|su)\s/i.test(value) || // | sudo
      /&&\s*(rm|del|format|shutdown|kill|sudo|su)\s/i.test(value) || // && kill
      /`.*(?:rm|del|sudo|kill).*`/i.test(value) || // `rm files`
      /\$\(.*(?:rm|del|sudo|kill).*\)/i.test(value); // $(rm files)

    // More nuanced risk assessment
    if (hasCommandInjection) {
      riskLevel = 'high';
    } else if (/[;&|`$(){}]/.test(value)) {
      // Has shell metacharacters but no dangerous commands
      riskLevel = 'medium';
    } else {
      // Command parameter but looks safe
      riskLevel = 'low';
    }
  } else if (isSearchContent || isStructural) {
    riskLevel = 'low'; // Almost never sanitize search/structural content
  }

  return { isSearchContent, isCommandLike, isStructural, riskLevel };
}

/**
 * Smart sanitization that understands context
 */
function smartSanitize(params: Record<string, unknown>): {
  sanitized: Record<string, unknown>;
  warnings: string[];
  decisions: Array<{ key: string; action: string; reason: string }>;
} {
  const sanitized = { ...params };
  const warnings: string[] = [];
  const decisions: Array<{ key: string; action: string; reason: string }> = [];

  for (const [key, value] of Object.entries(sanitized)) {
    if (typeof value !== 'string') continue;

    const analysis = analyzeParameterIntent(key, value);

    // Smart override: If parameter name suggests command but content looks like documentation
    const looksLikeDocumentation =
      typeof value === 'string' &&
      value.length > 50 && // Longer text is likely documentation
      (value.includes('how to') ||
        value.includes('example') ||
        value.includes('documentation') ||
        value.includes('description') ||
        /^(The|This|Here|When|Use)/.test(value.trim())); // Starts like documentation

    if (
      analysis.isSearchContent ||
      analysis.isStructural ||
      looksLikeDocumentation
    ) {
      // NEVER sanitize search queries, structural parameters, or documentation-like content
      const contentType = analysis.isSearchContent
        ? 'search'
        : analysis.isStructural
          ? 'structural'
          : 'documentation';
      decisions.push({
        key,
        action: 'allowed',
        reason: `Detected ${contentType} content`,
      });
      continue;
    }

    if (analysis.isCommandLike && analysis.riskLevel === 'high') {
      // Only sanitize actual dangerous command injection - be very precise
      const originalValue = value;
      let cleaned = value;

      // More precise replacements that preserve legitimate commands
      const injectionPatterns = [
        // Command chaining with dangerous commands
        {
          pattern: /;\s*(rm|del|format|shutdown|kill|sudo|su)\s+/gi,
          replacement: '; [BLOCKED] ',
        },
        {
          pattern: /\|\s*(rm|del|format|shutdown|kill|sudo|su)\s+/gi,
          replacement: '| [BLOCKED] ',
        },
        {
          pattern: /&&\s*(rm|del|format|shutdown|kill|sudo|su)\s+/gi,
          replacement: '&& [BLOCKED] ',
        },

        // Command substitution with dangerous commands
        {
          pattern: /`[^`]*(?:rm|del|sudo|kill)[^`]*`/gi,
          replacement: '[BLOCKED_SUBSTITUTION]',
        },
        {
          pattern: /\$\([^)]*(?:rm|del|sudo|kill)[^)]*\)/gi,
          replacement: '[BLOCKED_SUBSTITUTION]',
        },

        // Standalone dangerous commands at string boundaries
        {
          pattern: /^(rm|del|format|shutdown|kill|sudo|su)\s+/gi,
          replacement: '[BLOCKED] ',
        },
        {
          pattern: /\s(rm|del|format|shutdown|kill|sudo|su)\s*$/gi,
          replacement: ' [BLOCKED]',
        },
      ];

      for (const { pattern, replacement } of injectionPatterns) {
        cleaned = cleaned.replace(pattern, replacement);
      }

      if (cleaned !== originalValue) {
        sanitized[key] = cleaned;
        warnings.push(`Sanitized command injection in ${key}`);
        decisions.push({
          key,
          action: 'sanitized',
          reason: 'Command parameter with dangerous injection patterns',
        });
      } else {
        decisions.push({
          key,
          action: 'allowed',
          reason: 'Command parameter but no dangerous patterns detected',
        });
      }
    } else {
      // Everything else passes through
      decisions.push({
        key,
        action: 'allowed',
        reason: `Low risk (${analysis.riskLevel}) or non-command parameter`,
      });
    }
  }

  return { sanitized, warnings, decisions };
}

/**
 * UNIFIED SMART VALIDATION
 *
 * This replaces ALL validation patterns with one intelligent system
 */
export function withSmartValidation<T extends z.ZodTypeAny>(
  schema: T,
  handler: (args: z.infer<T>) => Promise<CallToolResult>,
  intelligence: ValidationIntelligence = 'smart'
): (args: unknown) => Promise<CallToolResult> {
  return async (args: unknown): Promise<CallToolResult> => {
    try {
      // Step 1: Zod Schema Validation (always required)
      const parseResult = schema.safeParse(args);
      if (!parseResult.success) {
        const errors = parseResult.error.errors
          .map(e => `${e.path.join('.')}: ${e.message}`)
          .slice(0, 3) // Limit error verbosity
          .join('; ');

        return createResult({
          error: `Invalid parameters: ${errors}`,
          isError: true,
        });
      }

      const validatedParams = parseResult.data;
      let finalParams = validatedParams;
      let warnings: string[] = [];

      // Step 2: Smart Security Analysis
      if (intelligence === 'smart') {
        const smartResult = smartSanitize(
          validatedParams as Record<string, unknown>
        );
        finalParams = smartResult.sanitized as z.infer<T>;
        warnings = smartResult.warnings;

        // Log smart decisions in development
        if (
          process.env.NODE_ENV !== 'production' &&
          smartResult.decisions.length > 0
        ) {
          const importantDecisions = smartResult.decisions.filter(
            d => d.action === 'sanitized' || d.action === 'blocked'
          );
          if (importantDecisions.length > 0) {
            // eslint-disable-next-line no-console
            console.log('Smart validation decisions:', importantDecisions);
          }
        }
      } else if (intelligence === 'strict') {
        // Use existing ContentSanitizer for maximum security
        const validation = ContentSanitizer.validateInputParameters(
          validatedParams as Record<string, unknown>
        );
        if (!validation.isValid) {
          return createResult({
            error: `Security validation failed: ${validation.warnings.join('; ')}`,
            isError: true,
          });
        }
        finalParams = validation.sanitizedParams as z.infer<T>;
        warnings = validation.warnings;
      }
      // 'minimal' intelligence just uses Zod validation, no sanitization

      // Log warnings for monitoring
      if (warnings.length > 0) {
        // eslint-disable-next-line no-console
        console.warn('Security sanitization applied:', warnings);
      }

      // Step 3: Call handler with validated and sanitized parameters
      return await handler(finalParams);
    } catch (error) {
      return createResult({
        error: `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        isError: true,
      });
    }
  };
}

/**
 * SIMPLIFIED API - automatically detects schema from handler type
 * Use this for most cases
 */
export function withValidation<T extends Record<string, unknown>>(
  handler: (args: T) => Promise<CallToolResult>,
  intelligence: ValidationIntelligence = 'smart'
): (args: unknown) => Promise<CallToolResult> {
  // Create a permissive schema that accepts any object structure
  // This maintains backward compatibility while adding smart sanitization
  const anyObjectSchema = z.record(z.unknown());

  return withSmartValidation(
    anyObjectSchema,
    handler as (args: Record<string, unknown>) => Promise<CallToolResult>,
    intelligence
  );
}

// Export the smart one as the default
export const withSecurityValidation = withValidation;
export const withBasicSecurityValidation = withValidation;
