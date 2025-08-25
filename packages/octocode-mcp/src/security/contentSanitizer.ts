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

// Security patterns for INPUT SANITIZATION - CLI injection detection in user parameters
// These patterns are used to validate user inputs, NOT to sanitize output content
const CLI_INJECTION_PATTERNS = [
  // Command chaining characters in user inputs
  /[;&|`$(){}]/g,
  // Path traversal patterns in user inputs
  /\.\.[/\\]/g,
  // Common dangerous commands in user inputs
  /\b(rm|del|format|curl|wget|eval|exec|system)\s/gi,
];

export class ContentSanitizer {
  /**
   * Sanitizes OUTPUT CONTENT (not user input parameters)
   * This method handles content sanitization for API responses and output,
   * while validateInputParameters() handles user input validation
   */
  public static sanitizeContent(content: string): SanitizationResult {
    // Detect secrets in output content
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

  /**
   * Detects and redacts secrets in OUTPUT CONTENT (not user input)
   * Uses regex patterns from regexes.ts to find API keys, tokens, etc. in content
   */
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

          // Replace with redacted placeholder in output content
          sanitizedContent = sanitizedContent.replace(
            pattern.regex,
            `[REDACTED-${pattern.name.toUpperCase()}]`
          );
        }
      }
    } catch (error) {
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

  /**
   * Detects CLI injection patterns in USER INPUT parameters
   * Used for input validation, not content sanitization
   */
  private static detectCliInjection(value: string): boolean {
    return CLI_INJECTION_PATTERNS.some(pattern => pattern.test(value));
  }

  /**
   * Sanitizes dangerous CLI characters from USER INPUT parameters
   * Used for input sanitization, not content sanitization
   */
  private static sanitizeCliCharacters(value: string): string {
    // Remove dangerous CLI characters from user inputs
    return value.replace(/[;&|`$(){}]/g, '');
  }

  /**
   * Validates and sanitizes USER INPUT parameters (not content output)
   * This method handles input validation and sanitization for tool parameters,
   * while sanitizeContent() handles output content sanitization
   */
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
          // Check each string element in the array for malicious content
          const sanitizedArray = value.map(item => {
            if (typeof item === 'string') {
              // Check for CLI injection
              if (this.detectCliInjection(item)) {
                hasValidationErrors = true;
                warnings.add(
                  `Potentially malicious content in parameter '${key}' array element`
                );
              }
              // Always sanitize CLI characters even if malicious
              return this.sanitizeCliCharacters(item);
            }
            // Non-string items pass through unchanged
            return item;
          });
          sanitizedParams[key] = sanitizedArray;
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
