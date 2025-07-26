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
    const secretsDetected: string[] = [];

    try {
      for (const pattern of allRegexPatterns) {
        const matches = sanitizedContent.match(pattern.regex);
        if (matches && matches.length > 0) {
          secretsDetected.push(...matches.map(_match => pattern.name));

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

    return {
      sanitizedParams,
      isValid: true, // Default to true for compatibility
      warnings: [], // Default to empty array for compatibility
    };
  }
}
