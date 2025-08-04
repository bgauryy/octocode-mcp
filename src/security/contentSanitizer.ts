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
  sanitizedParams: Record<string, any>;
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
          // Add each match to the set (automatically deduplicates)
          matches.forEach(_match => secretsDetectedSet.add(pattern.name));

          // Replace with redacted placeholder
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

  public static validateInputParameters(
    params: Record<string, any>
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

    const sanitizedParams: Record<string, any> = {};
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
        if (value.length > 1000000) {
          // 1MB limit
          hasValidationErrors = true;
          warnings.add(`Parameter ${key} exceeds maximum length`);
          continue;
        }

        // Sanitize secrets from parameter value
        const sanitized = this.detectSecrets(value);
        sanitizedParams[key] = sanitized.sanitizedContent;

        if (sanitized.hasSecrets) {
          hasSecrets = true;
          warnings.add(
            `Sensitive data detected and sanitized in parameter: ${key}`
          );
        }
      } else if (Array.isArray(value)) {
        // Check for excessively large arrays
        if (value.length > 10000) {
          hasValidationErrors = true;
          warnings.add(`Parameter ${key} array exceeds maximum length`);
          continue;
        }

        // Handle arrays - sanitize each string element while preserving array structure
        const sanitizedArray: any[] = [];
        for (let i = 0; i < value.length; i++) {
          const item = value[i];
          if (typeof item === 'string') {
            // Check string length in arrays too
            if (item.length > 100000) {
              // 100KB limit for array items
              hasValidationErrors = true;
              warnings.add(`Parameter ${key}[${i}] exceeds maximum length`);
              continue;
            }

            // Sanitize secrets from array element
            const sanitized = this.detectSecrets(item);
            sanitizedArray.push(sanitized.sanitizedContent);

            if (sanitized.hasSecrets) {
              hasSecrets = true;
              warnings.add(
                `Sensitive data detected and sanitized in parameter: ${key}[${i}]`
              );
            }
          } else if (typeof item === 'object' && item !== null) {
            // Handle nested objects - preserve structure for tool parameters
            try {
              const jsonString = JSON.stringify(item);
              if (jsonString.length > 10000) {
                // 10KB limit for array objects
                warnings.add(
                  `Complex object in array ${key}[${i}] - size limited`
                );
                sanitizedArray.push({
                  _truncated: true,
                  _originalSize: jsonString.length,
                });
              } else {
                // Keep the object intact for proper tool parameter handling
                sanitizedArray.push(item);
              }
            } catch (error) {
              warnings.add(
                `Non-serializable object in array ${key}[${i}] - simplified`
              );
              sanitizedArray.push({ _error: 'non-serializable' });
            }
          } else {
            // Non-string, non-object array elements pass through unchanged
            sanitizedArray.push(item);
          }
        }
        sanitizedParams[key] = sanitizedArray;
      } else if (typeof value === 'object' && value !== null) {
        // Handle nested objects with depth limit
        try {
          const jsonString = JSON.stringify(value);
          if (jsonString.length > 50000) {
            // 50KB limit for objects
            hasValidationErrors = true;
            warnings.add(`Parameter ${key} object exceeds maximum size`);
            continue;
          }
          sanitizedParams[key] = value;
        } catch (error) {
          hasValidationErrors = true;
          warnings.add(`Parameter ${key} contains non-serializable object`);
          continue;
        }
      } else {
        // Primitive values (number, boolean, null) pass through unchanged
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
