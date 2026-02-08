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

  const workspaceRootError = validateString(
    loc.workspaceRoot,
    'local.workspaceRoot'
  );
  if (workspaceRootError) errors.push(workspaceRootError);
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

  const enableAdditionalError = validateNullableStringArray(
    t.enableAdditional,
    'tools.enableAdditional'
  );
  if (enableAdditionalError) errors.push(enableAdditionalError);

  const disabledError = validateNullableStringArray(
    t.disabled,
    'tools.disabled'
  );
  if (disabledError) errors.push(disabledError);

  const disablePromptsError = validateBoolean(
    t.disablePrompts,
    'tools.disablePrompts'
  );
  if (disablePromptsError) errors.push(disablePromptsError);
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

  const configPathError = validateString(l.configPath, 'lsp.configPath');
  if (configPathError) errors.push(configPathError);

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
