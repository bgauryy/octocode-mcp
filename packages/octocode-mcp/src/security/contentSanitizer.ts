import { allRegexPatterns } from './regexes';

interface SanitizationResult {
  content: string;
  hasSecrets: boolean;
  secretsDetected: string[];
  warnings: string[]; // Alias for secretsDetected for compatibility
  hasPromptInjection?: boolean;
  isMalicious?: boolean;
}

interface ValidationResult {
  sanitizedParams: Record<string, unknown>;
  isValid: boolean;
  hasSecrets: boolean; // Add flag to track if secrets were detected
  warnings: string[];
}

export class ContentSanitizer {
  public static sanitizeContent(content: string): SanitizationResult {
    // Detect secrets
    const secretsResult = this.detectSecrets(content);

    return {
      content: secretsResult.sanitizedContent,
      hasSecrets: secretsResult.hasSecrets,
      secretsDetected: secretsResult.secretsDetected,
      warnings: secretsResult.secretsDetected, // Alias for backward compatibility
      hasPromptInjection: false, // Default value for compatibility
      isMalicious: false, // Default value for compatibility
    };
  }

  private static detectSecrets(content: string): {
    hasSecrets: boolean;
    secretsDetected: string[];
    sanitizedContent: string;
  } {
    let sanitizedContent = content;
    const secretsDetectedSet = new Set<string>();

    try {
      for (const pattern of allRegexPatterns) {
        const matches = sanitizedContent.match(pattern.regex);
        if (matches && matches.length > 0) {
          // Check if this is a false positive by looking at context
          // Use current sanitizedContent for consistent detection
          const isFalsePositive = this.isFalsePositiveMatch(
            sanitizedContent,
            pattern,
            matches
          );

          if (!isFalsePositive) {
            // Add each match to the set (automatically deduplicates)
            matches.forEach(_match => secretsDetectedSet.add(pattern.name));

            // Replace ALL matches with redacted placeholder (using replaceAll for global replacement)
            sanitizedContent = sanitizedContent.replaceAll(
              pattern.regex,
              `[REDACTED-${pattern.name.toUpperCase()}]`
            );
          }
        }
      }
    } catch (error) {
      // If sanitization fails, apply basic redaction to prevent content leakage
      // Don't return original content - apply emergency sanitization
      const emergencySanitized = this.emergencySanitization(content);
      return {
        hasSecrets: true, // Assume secrets present if sanitization failed
        secretsDetected: ['SANITIZATION_ERROR'],
        sanitizedContent: emergencySanitized,
      };
    }

    const secretsDetected = Array.from(secretsDetectedSet);

    return {
      hasSecrets: secretsDetected.length > 0,
      secretsDetected,
      sanitizedContent,
    };
  }

  private static isFalsePositiveMatch(
    content: string,
    pattern: { name: string; regex: RegExp },
    _matches: RegExpMatchArray
  ): boolean {
    // Skip email detection in JSON error responses
    if (pattern.name === 'emailAddress') {
      // Check if this is in a JSON error message context
      if (
        content.includes('"error"') ||
        content.includes('"message"') ||
        content.includes('OAuth')
      ) {
        return true;
      }
    }

    // Skip other patterns that commonly cause false positives in error messages
    const falsePositivePatterns = [
      'credentialsInUrl', // Often matches legitimate error message URLs
      'jwtToken', // Can match random base64-like strings in errors
      'sessionIds', // Can match random IDs in error messages
    ];

    if (falsePositivePatterns.includes(pattern.name)) {
      // Check if we're in an error message context
      if (
        content.includes('"error"') ||
        content.includes('"message"') ||
        content.includes('failed') ||
        content.includes('OAuth') ||
        content.includes('Rate limit') ||
        content.includes('timeout')
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Emergency sanitization when normal sanitization fails
   * Applies basic patterns to prevent obvious secret leakage
   */
  private static emergencySanitization(content: string): string {
    try {
      let sanitized = content;

      // Basic patterns for common secrets (simplified, non-regex approach)
      const emergencyPatterns = [
        // GitHub tokens
        {
          pattern: /\bgh[porus]_[a-zA-Z0-9_]{36,255}\b/g,
          replacement: '[REDACTED-GITHUB-TOKEN]',
        },
        // API keys (generic)
        {
          pattern: /\b[a-zA-Z0-9]{32,}\b/g,
          replacement: '[REDACTED-POTENTIAL-KEY]',
        },
        // Email addresses
        {
          pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
          replacement: '[REDACTED-EMAIL]',
        },
        // URLs with credentials
        {
          pattern: /\b[a-zA-Z]{3,10}:\/\/[^\s'"]+:[^\s'"]+@[^\s'"]+\b/g,
          replacement: '[REDACTED-URL-WITH-CREDS]',
        },
      ];

      for (const { pattern, replacement } of emergencyPatterns) {
        sanitized = sanitized.replaceAll(pattern, replacement);
      }

      return sanitized;
    } catch {
      // If even emergency sanitization fails, return heavily redacted content
      return '[CONTENT-REDACTED-DUE-TO-SANITIZATION-ERROR]';
    }
  }

  public static validateInputParameters(
    params: Record<string, unknown>
  ): ValidationResult {
    // First, validate the basic structure and types
    if (!params || typeof params !== 'object') {
      return {
        sanitizedParams: {},
        isValid: false,
        hasSecrets: false,
        warnings: ['Invalid parameters: must be an object'],
      };
    }

    const sanitizedParams: Record<string, unknown> = {};
    const warnings = new Set<string>();
    let hasSecrets = false;
    let hasValidationErrors = false;

    for (const [key, value] of Object.entries(params)) {
      // Validate parameter key
      if (typeof key !== 'string' || key.trim() === '') {
        hasValidationErrors = true;
        warnings.add(`Invalid parameter key: ${key}`);
        continue;
      }

      // Check for potentially dangerous parameter names
      const dangerousKeys = ['__proto__', 'constructor', 'prototype'];
      if (dangerousKeys.includes(key)) {
        hasValidationErrors = true;
        warnings.add(`Dangerous parameter key blocked: ${key}`);
        continue;
      }

      if (typeof value === 'string') {
        // Check for excessively long strings (potential DoS)
        if (value.length > 10000) {
          warnings.add(
            `Parameter ${key} exceeds maximum length (10,000 characters)`
          );
          sanitizedParams[key] = value.substring(0, 10000);
        } else {
          sanitizedParams[key] = value;
        }
      } else if (Array.isArray(value)) {
        // Validate arrays
        if (value.length > 100) {
          warnings.add(
            `Parameter ${key} array exceeds maximum length (100 items)`
          );
          sanitizedParams[key] = value.slice(0, 100);
        } else {
          sanitizedParams[key] = value;
        }
      } else if (value !== null && typeof value === 'object') {
        // Recursively validate nested objects
        const nestedValidation = this.validateInputParameters(
          value as Record<string, unknown>
        );
        if (!nestedValidation.isValid) {
          hasValidationErrors = true;
          warnings.add(
            `Invalid nested object in parameter ${key}: ${nestedValidation.warnings.join(', ')}`
          );
          continue;
        }
        sanitizedParams[key] = nestedValidation.sanitizedParams;
        hasSecrets = hasSecrets || nestedValidation.hasSecrets;
      } else {
        // For other types (number, boolean, null, undefined), pass through
        sanitizedParams[key] = value;
      }
    }

    return {
      sanitizedParams,
      isValid: !hasValidationErrors, // Now actually validates
      hasSecrets: hasSecrets,
      warnings: Array.from(warnings),
    };
  }
}
