/**
 * Configuration Validator
 *
 * Validates .octocoderc configuration against the schema.
 * Returns detailed errors for invalid fields.
 */

import type { OctocodeConfig, ValidationResult } from './types.js';
import { CONFIG_SCHEMA_VERSION } from './types.js';
import {
  MIN_TIMEOUT,
  MAX_TIMEOUT,
  MIN_RETRIES,
  MAX_RETRIES,
  MIN_QUERIES_PER_BATCH,
  MAX_QUERIES_PER_BATCH,
  MIN_RESULTS_PER_QUERY,
  MAX_RESULTS_PER_QUERY,
  LSP_MIN_TIMEOUT,
  LSP_MAX_TIMEOUT,
} from './defaults.js';

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validate a URL string.
 *
 * @param url - URL to validate
 * @param field - Field name for error messages
 * @returns Error message or null if valid
 */
function validateUrl(url: unknown, field: string): string | null {
  if (url === undefined || url === null) return null;

  if (typeof url !== 'string') {
    return `${field}: Must be a string`;
  }

  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return `${field}: Only http/https URLs allowed`;
    }
    return null;
  } catch {
    return `${field}: Invalid URL format`;
  }
}

/**
 * Validate a number within range.
 *
 * @param value - Value to validate
 * @param field - Field name for error messages
 * @param min - Minimum allowed value
 * @param max - Maximum allowed value
 * @returns Error message or null if valid
 */
function validateNumberRange(
  value: unknown,
  field: string,
  min: number,
  max: number
): string | null {
  if (value === undefined || value === null) return null;

  if (typeof value !== 'number' || isNaN(value)) {
    return `${field}: Must be a number`;
  }

  if (value < min || value > max) {
    return `${field}: Must be between ${min} and ${max}`;
  }

  return null;
}

/**
 * Validate a boolean.
 *
 * @param value - Value to validate
 * @param field - Field name for error messages
 * @returns Error message or null if valid
 */
function validateBoolean(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;

  if (typeof value !== 'boolean') {
    return `${field}: Must be a boolean`;
  }

  return null;
}

/**
 * Validate a string array.
 *
 * @param value - Value to validate
 * @param field - Field name for error messages
 * @returns Error message or null if valid
 */
function validateStringArray(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;

  if (!Array.isArray(value)) {
    return `${field}: Must be an array`;
  }

  for (let i = 0; i < value.length; i++) {
    if (typeof value[i] !== 'string') {
      return `${field}[${i}]: Must be a string`;
    }
  }

  return null;
}

/**
 * Validate a nullable string array.
 *
 * @param value - Value to validate
 * @param field - Field name for error messages
 * @returns Error message or null if valid
 */
function validateNullableStringArray(
  value: unknown,
  field: string
): string | null {
  if (value === undefined) return null;
  if (value === null) return null;

  return validateStringArray(value, field);
}

/**
 * Validate a string.
 *
 * @param value - Value to validate
 * @param field - Field name for error messages
 * @returns Error message or null if valid
 */
function validateString(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;

  if (typeof value !== 'string') {
    return `${field}: Must be a string`;
  }

  return null;
}

/**
 * Validate provider value.
 *
 * @param value - Value to validate
 * @param field - Field name for error messages
 * @returns Error message or null if valid
 */
function validateProvider(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;

  if (typeof value !== 'string') {
    return `${field}: Must be a string`;
  }

  if (!['github', 'gitlab'].includes(value)) {
    return `${field}: Must be "github" or "gitlab"`;
  }

  return null;
}

// ============================================================================
// SECTION VALIDATORS
// ============================================================================

function validateGitHub(github: unknown, errors: string[]): void {
  if (github === undefined || github === null) return;

  if (typeof github !== 'object' || Array.isArray(github)) {
    errors.push('github: Must be an object');
    return;
  }

  const gh = github as Record<string, unknown>;

  const apiUrlError = validateUrl(gh.apiUrl, 'github.apiUrl');
  if (apiUrlError) errors.push(apiUrlError);

  const defaultOrgError = validateString(gh.defaultOrg, 'github.defaultOrg');
  if (defaultOrgError) errors.push(defaultOrgError);
}

function validateGitLab(gitlab: unknown, errors: string[]): void {
  if (gitlab === undefined || gitlab === null) return;

  if (typeof gitlab !== 'object' || Array.isArray(gitlab)) {
    errors.push('gitlab: Must be an object');
    return;
  }

  const gl = gitlab as Record<string, unknown>;

  const hostError = validateUrl(gl.host, 'gitlab.host');
  if (hostError) errors.push(hostError);

  const defaultGroupError = validateString(
    gl.defaultGroup,
    'gitlab.defaultGroup'
  );
  if (defaultGroupError) errors.push(defaultGroupError);
}

function validateLocal(local: unknown, errors: string[]): void {
  if (local === undefined || local === null) return;

  if (typeof local !== 'object' || Array.isArray(local)) {
    errors.push('local: Must be an object');
    return;
  }

  const loc = local as Record<string, unknown>;

  const enabledError = validateBoolean(loc.enabled, 'local.enabled');
  if (enabledError) errors.push(enabledError);

  const allowedPathsError = validateStringArray(
    loc.allowedPaths,
    'local.allowedPaths'
  );
  if (allowedPathsError) errors.push(allowedPathsError);

  const excludePathsError = validateStringArray(
    loc.excludePaths,
    'local.excludePaths'
  );
  if (excludePathsError) errors.push(excludePathsError);
}

function validateTools(tools: unknown, errors: string[]): void {
  if (tools === undefined || tools === null) return;

  if (typeof tools !== 'object' || Array.isArray(tools)) {
    errors.push('tools: Must be an object');
    return;
  }

  const t = tools as Record<string, unknown>;

  const enabledError = validateNullableStringArray(t.enabled, 'tools.enabled');
  if (enabledError) errors.push(enabledError);

  const disabledError = validateNullableStringArray(
    t.disabled,
    'tools.disabled'
  );
  if (disabledError) errors.push(disabledError);
}

function validateNetwork(network: unknown, errors: string[]): void {
  if (network === undefined || network === null) return;

  if (typeof network !== 'object' || Array.isArray(network)) {
    errors.push('network: Must be an object');
    return;
  }

  const net = network as Record<string, unknown>;

  const timeoutError = validateNumberRange(
    net.timeout,
    'network.timeout',
    MIN_TIMEOUT,
    MAX_TIMEOUT
  );
  if (timeoutError) errors.push(timeoutError);

  const retriesError = validateNumberRange(
    net.maxRetries,
    'network.maxRetries',
    MIN_RETRIES,
    MAX_RETRIES
  );
  if (retriesError) errors.push(retriesError);
}

function validateTelemetry(telemetry: unknown, errors: string[]): void {
  if (telemetry === undefined || telemetry === null) return;

  if (typeof telemetry !== 'object' || Array.isArray(telemetry)) {
    errors.push('telemetry: Must be an object');
    return;
  }

  const tel = telemetry as Record<string, unknown>;

  const enabledError = validateBoolean(tel.enabled, 'telemetry.enabled');
  if (enabledError) errors.push(enabledError);

  const loggingError = validateBoolean(tel.logging, 'telemetry.logging');
  if (loggingError) errors.push(loggingError);
}

function validateLsp(lsp: unknown, errors: string[]): void {
  if (lsp === undefined || lsp === null) return;

  if (typeof lsp !== 'object' || Array.isArray(lsp)) {
    errors.push('lsp: Must be an object');
    return;
  }

  const l = lsp as Record<string, unknown>;

  const enabledError = validateBoolean(l.enabled, 'lsp.enabled');
  if (enabledError) errors.push(enabledError);

  const timeoutError = validateNumberRange(
    l.timeout,
    'lsp.timeout',
    LSP_MIN_TIMEOUT,
    LSP_MAX_TIMEOUT
  );
  if (timeoutError) errors.push(timeoutError);

  // Validate languages object
  if (l.languages !== undefined && l.languages !== null) {
    if (typeof l.languages !== 'object' || Array.isArray(l.languages)) {
      errors.push('lsp.languages: Must be an object');
    } else {
      const langs = l.languages as Record<string, unknown>;
      for (const [lang, config] of Object.entries(langs)) {
        if (config !== null && typeof config !== 'object') {
          errors.push(`lsp.languages.${lang}: Must be an object or null`);
        } else if (config && typeof config === 'object') {
          const langConfig = config as Record<string, unknown>;
          if (
            langConfig.serverPath !== undefined &&
            langConfig.serverPath !== null
          ) {
            const pathError = validateString(
              langConfig.serverPath,
              `lsp.languages.${lang}.serverPath`
            );
            if (pathError) errors.push(pathError);
          }
        }
      }
    }
  }
}

function validateResearch(research: unknown, errors: string[]): void {
  if (research === undefined || research === null) return;

  if (typeof research !== 'object' || Array.isArray(research)) {
    errors.push('research: Must be an object');
    return;
  }

  const res = research as Record<string, unknown>;

  const providerError = validateProvider(
    res.defaultProvider,
    'research.defaultProvider'
  );
  if (providerError) errors.push(providerError);

  const batchError = validateNumberRange(
    res.maxQueriesPerBatch,
    'research.maxQueriesPerBatch',
    MIN_QUERIES_PER_BATCH,
    MAX_QUERIES_PER_BATCH
  );
  if (batchError) errors.push(batchError);

  const resultsError = validateNumberRange(
    res.maxResultsPerQuery,
    'research.maxResultsPerQuery',
    MIN_RESULTS_PER_QUERY,
    MAX_RESULTS_PER_QUERY
  );
  if (resultsError) errors.push(resultsError);
}

// ============================================================================
// MAIN VALIDATOR
// ============================================================================

/**
 * Validate a configuration object against the schema.
 *
 * @param config - Configuration object to validate
 * @returns Validation result with errors and warnings
 */
export function validateConfig(config: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check if config is an object
  if (typeof config !== 'object' || config === null || Array.isArray(config)) {
    return {
      valid: false,
      errors: ['Configuration must be a JSON object'],
      warnings: [],
    };
  }

  const cfg = config as Record<string, unknown>;

  // Validate version
  if (cfg.version !== undefined) {
    if (typeof cfg.version !== 'number' || !Number.isInteger(cfg.version)) {
      errors.push('version: Must be an integer');
    } else if (cfg.version > CONFIG_SCHEMA_VERSION) {
      warnings.push(
        `version: Config version ${cfg.version} is newer than supported version ${CONFIG_SCHEMA_VERSION}`
      );
    }
  }

  // Validate each section
  validateGitHub(cfg.github, errors);
  validateGitLab(cfg.gitlab, errors);
  validateLocal(cfg.local, errors);
  validateTools(cfg.tools, errors);
  validateNetwork(cfg.network, errors);
  validateTelemetry(cfg.telemetry, errors);
  validateLsp(cfg.lsp, errors);
  validateResearch(cfg.research, errors);

  // Check for unknown top-level keys
  const knownKeys = new Set([
    '$schema',
    'version',
    'github',
    'gitlab',
    'local',
    'tools',
    'network',
    'telemetry',
    'lsp',
    'research',
  ]);

  for (const key of Object.keys(cfg)) {
    if (!knownKeys.has(key)) {
      warnings.push(`Unknown configuration key: ${key}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    config: errors.length === 0 ? (config as OctocodeConfig) : undefined,
  };
}
