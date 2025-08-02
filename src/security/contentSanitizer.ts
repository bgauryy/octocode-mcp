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
    const sanitizedParams: Record<string, any> = {};

    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string') {
        // Sanitize secrets from parameter value
        const sanitized = this.detectSecrets(value);
        sanitizedParams[key] = sanitized.sanitizedContent;
      } else if (Array.isArray(value)) {
        // Handle arrays - sanitize each string element while preserving array structure
        const sanitizedArray: any[] = [];
        for (const item of value) {
          if (typeof item === 'string') {
            // Sanitize secrets from array element
            const sanitized = this.detectSecrets(item);
            sanitizedArray.push(sanitized.sanitizedContent);
          } else {
            // Non-string array elements pass through unchanged
            sanitizedArray.push(item);
          }
        }
        sanitizedParams[key] = sanitizedArray;
      } else {
        // Non-string, non-array values pass through unchanged
        sanitizedParams[key] = value;
      }
    }

    // Check if any secrets were detected during sanitization
    const warnings = new Set<string>();
    let hasSecrets = false;

    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string') {
        const secretsResult = this.detectSecrets(value);
        if (secretsResult.hasSecrets) {
          hasSecrets = true;
          warnings.add(
            `Sensitive data detected and sanitized in parameter: ${key}`
          );
        }
      } else if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          if (typeof value[i] === 'string') {
            const secretsResult = this.detectSecrets(value[i]);
            if (secretsResult.hasSecrets) {
              hasSecrets = true;
              warnings.add(
                `Sensitive data detected and sanitized in parameter: ${key}[${i}]`
              );
            }
          }
        }
      }
    }

    return {
      sanitizedParams,
      isValid: true, // Always valid after sanitization
      hasSecrets: hasSecrets, // Track if secrets were detected for logging
      warnings: Array.from(warnings),
    };
  }
}
