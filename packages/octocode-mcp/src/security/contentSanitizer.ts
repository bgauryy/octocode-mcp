import { allRegexPatterns } from './regexes.js';
import type { SanitizationResult, ValidationResult } from '../types.js';

export class ContentSanitizer {
  public static sanitizeContent(content: string): SanitizationResult {
    // Detect secrets
    const secretsResult = this.detectSecrets(content);

    return {
      content: secretsResult.sanitizedContent,
      hasSecrets: secretsResult.hasSecrets,
      secretsDetected: secretsResult.secretsDetected,
      warnings: secretsResult.secretsDetected, // Alias for backward compatibility
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
          // Add each match to the set (automatically deduplicates)
          matches.forEach(_match => secretsDetectedSet.add(pattern.name));

          // Replace with redacted placeholder
          sanitizedContent = sanitizedContent.replace(
            pattern.regex,
            `[REDACTED-${pattern.name.toUpperCase()}]`
          );
        }
      }
    } catch {
      // Return original content if there's an error
      return {
        hasSecrets: false,
        secretsDetected: [],
        sanitizedContent: content,
      };
    }

    const secretsDetected = Array.from(secretsDetectedSet);

    return {
      hasSecrets: secretsDetected.length > 0,
      secretsDetected,
      sanitizedContent,
    };
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
