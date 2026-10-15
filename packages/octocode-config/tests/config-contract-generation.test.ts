import Ajv2020 from 'ajv/dist/2020.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CONFIG_FIELDS,
  ENV_TOKEN_VARS,
  PROTECTED_KEY_NAMES,
} from '../src/config/contract.generated.js';

const contractPath = fileURLToPath(
  new URL('../config-contract.json', import.meta.url)
);
const schemaPath = fileURLToPath(
  new URL('../config-contract.schema.json', import.meta.url)
);

function loadJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

describe('generated config contract', () => {
  it('validates the authoritative declaration with the shared meta-schema', () => {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    const schema = loadJson(schemaPath) as Record<string, unknown>;
    expect(ajv.validate(schema, loadJson(contractPath))).toBe(true);
  });

  it('generates one runtime field specification for every declared field', () => {
    const contract = loadJson(contractPath) as {
      sections: Record<string, { fields: Record<string, unknown> }>;
    };
    const declaredPaths = Object.entries(contract.sections).flatMap(
      ([section, definition]) =>
        Object.keys(definition.fields).map(field =>
          section.length === 0 ? field : `${section}.${field}`
        )
    );
    expect(CONFIG_FIELDS.map(field => field.path)).toEqual(declaredPaths);
  });

  it('declares no numeric settings and lists every removed internal limit', () => {
    expect(CONFIG_FIELDS.filter(field => (field.type as string) === 'number')).toEqual([]);
    const contract = loadJson(contractPath) as {
      removed: { settings: Record<string, string>; environment: Record<string, string> };
    };
    expect(Object.keys(contract.removed.settings)).toEqual(
      expect.arrayContaining([
        'network.timeout',
        'network.maxRetries',
        'network.maxRateLimitWait',
        'lsp.maxMemoryMb',
        'output.pagination',
        'storage.cloneCache',
        'classification.maxConcurrency',
        'classification.maxCandidates',
        'classification.maxChars',
        'classification.timeoutMs',
      ])
    );
    expect(Object.keys(contract.removed.environment)).toEqual(
      expect.arrayContaining([
        'REQUEST_TIMEOUT',
        'MAX_RETRIES',
        'OCTOCODE_MAX_RATE_LIMIT_WAIT',
        'OCTOCODE_LSP_MAX_MEMORY_MB',
        'OCTOCODE_OUTPUT_DEFAULT_CHAR_LENGTH',
        'OCTOCODE_CACHE_TTL_MS',
        'OCTOCODE_MAX_CACHE_SIZE',
        'OCTOCODE_MAX_CLONES',
        'OCTOCODE_CLASSIFICATION_CONCURRENCY',
        'OCTOCODE_CLASSIFICATION_MAX_CANDIDATES',
        'OCTOCODE_CLASSIFICATION_MAX_CHARS',
        'OCTOCODE_CLASSIFICATION_TIMEOUT_MS',
      ])
    );
    const boundNames = new Set(CONFIG_FIELDS.flatMap(field => (field.env ? [field.env.name] : [])));
    for (const name of Object.keys(contract.removed.environment)) {
      expect(boundNames.has(name), name).toBe(false);
    }
  });

  it('derives token priority and dotenv protection from one environment policy', () => {
    expect(ENV_TOKEN_VARS).toEqual(['GH_TOKEN', 'GITHUB_TOKEN']);
    expect(
      ENV_TOKEN_VARS.every(name => !new Set<string>(PROTECTED_KEY_NAMES).has(name))
    ).toBe(true);
  });
});
