import { allRegexPatterns } from './regexes';

export interface SanitizationResult {
  content: string;
  hasSecrets: boolean;
  secretsDetected: string[];
  hasPromptInjection: boolean;
  isMalicious: boolean;
  warnings: string[];
}

export class ContentSanitizer {
  private static readonly PROMPT_INJECTION_PATTERNS = [
    // Direct injection attempts
    /ignore\s+(?:previous|above|all)\s+(?:instructions?|prompts?|rules?)/gi,
    /forget\s+(?:previous|above|all)\s+(?:instructions?|prompts?|rules?)/gi,
    /disregard\s+(?:previous|above|all)\s+(?:instructions?|prompts?|rules?)/gi,

    // Role manipulation
    /you\s+are\s+now\s+(?:a|an)\s+(?:assistant|ai|bot|system|admin|developer|expert)/gi,
    /act\s+as\s+(?:a|an)\s+(?:assistant|ai|bot|system|admin|developer|expert)/gi,
    /pretend\s+to\s+be\s+(?:a|an)\s+(?:assistant|ai|bot|system|admin|developer|expert)/gi,

    // System prompt manipulation
    /system\s*[:=]\s*['"]/gi,
    /new\s+system\s+prompt/gi,
    /override\s+system\s+(?:prompt|instructions?)/gi,

    // Command injection attempts
    /\$\{[^}]*\}/g,
    /`[^`]*`/g,
    /\$\([^)]*\)/g,

    // Jailbreak attempts
    /jailbreak/gi,
    /dan\s+mode/gi,
    /developer\s+mode/gi,
    /unrestricted/gi,

    // Encoding attempts
    /base64|hex|url(?:en|de)code/gi,

    // Tool manipulation
    /execute\s+(?:command|script|code)/gi,
    /run\s+(?:command|script|code)/gi,
    /eval\s*\(/gi,
    /new\s+Function\s*\(/gi,
  ];

  private static readonly MALICIOUS_PATTERNS = [
    // Malware indicators
    /(?:eval|exec|system|shell_exec|passthru|proc_open)\s*\(/gi,
    /(?:cmd|powershell|bash|sh)\s+(?:-c|\/c)/gi,
    /(?:rm\s+-rf|del\s+\/[sq]|format\s+c:)/gi,

    // Cryptocurrency miners
    /(?:coinhive|cryptoloot|minergate|webminer)/gi,
    /(?:xmrig|cpuminer|cgminer)/gi,

    // Phishing/social engineering
    /(?:phishing|scam|fraud|steal|credentials|password)/gi,
    /(?:keylogger|backdoor|trojan|malware|virus)/gi,

    // Reverse shells
    /(?:nc\s+-l|netcat|reverse\s+shell|bind\s+shell)/gi,
    /(?:meterpreter|metasploit|payload)/gi,

    // Suspicious URLs
    /(?:bit\.ly|tinyurl|t\.co|short\.link)\/[a-zA-Z0-9]+/gi,
    /(?:pastebin|hastebin|ghostbin)\.com\/[a-zA-Z0-9]+/gi,
  ];

  private static readonly MAX_CONTENT_LENGTH = 1024 * 1024; // 1MB
  private static readonly MAX_LINE_LENGTH = 10000;
  private static readonly SUSPICIOUS_REPETITION_THRESHOLD = 100;

  public static sanitizeContent(content: string): SanitizationResult {
    const result: SanitizationResult = {
      content: content,
      hasSecrets: false,
      secretsDetected: [],
      hasPromptInjection: false,
      isMalicious: false,
      warnings: [],
    };

    // Check content length
    if (content.length > this.MAX_CONTENT_LENGTH) {
      result.warnings.push(
        `Content exceeds maximum length (${content.length} > ${this.MAX_CONTENT_LENGTH})`
      );
      result.content =
        content.substring(0, this.MAX_CONTENT_LENGTH) +
        '\n[TRUNCATED - Content too long]';
    }

    // Check for extremely long lines
    const lines = result.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].length > this.MAX_LINE_LENGTH) {
        result.warnings.push(
          `Line ${i + 1} exceeds maximum length (${lines[i].length} > ${this.MAX_LINE_LENGTH})`
        );
        lines[i] = lines[i].substring(0, this.MAX_LINE_LENGTH) + '[TRUNCATED]';
      }
    }
    result.content = lines.join('\n');

    // Check for suspicious repetition
    const repeatedChar = this.findRepeatedCharacter(result.content);
    if (repeatedChar) {
      result.warnings.push(
        `Suspicious character repetition detected: '${repeatedChar.char}' repeated ${repeatedChar.count} times`
      );
      result.isMalicious = true;
    }

    // Detect secrets
    const secretsResult = this.detectSecrets(result.content);
    result.hasSecrets = secretsResult.hasSecrets;
    result.secretsDetected = secretsResult.secretsDetected;
    result.content = secretsResult.sanitizedContent;

    // Check for prompt injection
    result.hasPromptInjection = this.detectPromptInjection(result.content);
    if (result.hasPromptInjection) {
      result.warnings.push('Potential prompt injection detected');
    }

    // Check for malicious patterns
    result.isMalicious =
      result.isMalicious || this.detectMaliciousContent(result.content);
    if (
      result.isMalicious &&
      !result.warnings.some(w => w.includes('malicious'))
    ) {
      result.warnings.push('Potentially malicious content detected');
    }

    return result;
  }

  private static detectSecrets(content: string): {
    hasSecrets: boolean;
    secretsDetected: string[];
    sanitizedContent: string;
  } {
    let sanitizedContent = content;
    const secretsDetected: string[] = [];

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

    return {
      hasSecrets: secretsDetected.length > 0,
      secretsDetected,
      sanitizedContent,
    };
  }

  private static detectPromptInjection(content: string): boolean {
    return this.PROMPT_INJECTION_PATTERNS.some(pattern =>
      pattern.test(content)
    );
  }

  private static detectMaliciousContent(content: string): boolean {
    return this.MALICIOUS_PATTERNS.some(pattern => pattern.test(content));
  }

  private static findRepeatedCharacter(
    content: string
  ): { char: string; count: number } | null {
    const charCounts = new Map<string, number>();

    for (const char of content) {
      if (char.match(/[a-zA-Z0-9]/)) {
        // Only count alphanumeric characters
        charCounts.set(char, (charCounts.get(char) || 0) + 1);
      }
    }

    for (const [char, count] of charCounts) {
      if (count > this.SUSPICIOUS_REPETITION_THRESHOLD) {
        return { char, count };
      }
    }

    return null;
  }

  public static validateInputParameters(params: Record<string, any>): {
    isValid: boolean;
    sanitizedParams: Record<string, any>;
    warnings: string[];
  } {
    const sanitizedParams: Record<string, any> = {};
    const warnings: string[] = [];
    let isValid = true;

    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string') {
        // Check for prompt injection in parameters
        if (this.detectPromptInjection(value)) {
          warnings.push(`Potential prompt injection in parameter '${key}'`);
          isValid = false;
        }

        // Check for malicious patterns in parameters
        if (this.detectMaliciousContent(value)) {
          warnings.push(`Potentially malicious content in parameter '${key}'`);
          isValid = false;
        }

        // Sanitize parameter value
        const sanitized = this.sanitizeParameter(value);
        sanitizedParams[key] = sanitized;
      } else if (Array.isArray(value)) {
        // Handle arrays - sanitize each string element while preserving array structure
        const sanitizedArray: any[] = [];
        for (const item of value) {
          if (typeof item === 'string') {
            // Check for prompt injection in array elements
            if (this.detectPromptInjection(item)) {
              warnings.push(
                `Potential prompt injection in parameter '${key}' array element`
              );
              isValid = false;
            }

            // Check for malicious patterns in array elements
            if (this.detectMaliciousContent(item)) {
              warnings.push(
                `Potentially malicious content in parameter '${key}' array element`
              );
              isValid = false;
            }

            // Sanitize array element
            sanitizedArray.push(this.sanitizeParameter(item));
          } else {
            // Non-string array elements pass through
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
      isValid,
      sanitizedParams,
      warnings,
    };
  }

  private static sanitizeParameter(value: string): string {
    // Only remove characters that are known to be dangerous for command injection
    // Keep comparison operators like >, <, quotes for search queries, etc.
    let sanitized = value.replace(/[;|`$(){}[\]\\]/g, '');

    // Limit length
    if (sanitized.length > 1000) {
      sanitized = sanitized.substring(0, 1000);
    }

    return sanitized;
  }
}
