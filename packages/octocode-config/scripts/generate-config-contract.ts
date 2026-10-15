import Ajv2020 from 'ajv/dist/2020.js';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const contractPath = fileURLToPath(new URL('../config-contract.json', import.meta.url));
const schemaPath = fileURLToPath(
  new URL('../config-contract.schema.json', import.meta.url)
);
const outputPath = fileURLToPath(
  new URL('../src/config/contract.generated.ts', import.meta.url)
);
const documentationPath = fileURLToPath(
  new URL('../../../docs/generated/CONFIG_SETTINGS.md', import.meta.url)
);

type JsonObject = Record<string, unknown>;
type EnvBinding = {
  name: string;
  dotenv?: 'all' | 'home' | 'never';
  normalize?: 'trim' | 'lower';
  workspaceNarrowsTo?: string;
};
type Field = {
  type: 'boolean' | 'number' | 'string' | 'url' | 'path' | 'stringArray' | 'enum';
  description: string;
  notes?: string;
  env?: EnvBinding;
  default?: unknown;
  credential?: boolean;
  displayDefault?: string;
  itemFormat?: 'path';
  typeName?: string;
  enumStyle?: 'list' | 'quotedOr';
  minimum?: number;
  span?: number;
  defaultOffset?: number;
  values?: string[];
};
type Section = {
  title: string;
  typeName?: string;
  rustTypeName?: string;
  file: boolean;
  resolved: boolean;
  fields: Record<string, Field>;
};
type Contract = {
  config: {
    fileName: string;
    schemaVersion: number;
    runtimeSurfaces: string[];
  };
  environment: Record<
    string,
    {
      dotenv?: 'all' | 'home' | 'never';
      tokenPriority?: number;
      configSource?: boolean;
      documentation?: boolean;
      description?: string;
    }
  >;
  removed?: {
    settings?: Record<string, string>;
    environment?: Record<string, string>;
  };
  sections: Record<string, Section>;
};

type FlatField = Field & {
  path: string;
  section: string;
  key: string;
  file: boolean;
  resolved: boolean;
};

function asObject(value: unknown, label: string): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as JsonObject;
}

function toPascal(value: string): string {
  return value
    .split('.')
    .flatMap(part => part.split(/(?=[A-Z])/))
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function pathFor(section: string, key: string): string {
  return section.length === 0 ? key : `${section}.${key}`;
}

function flattenFields(contract: Contract): FlatField[] {
  return Object.entries(contract.sections).flatMap(([sectionPath, section]) =>
    Object.entries(section.fields).map(([key, field]) => ({
      ...field,
      path: pathFor(sectionPath, key),
      section: sectionPath,
      key,
      file: section.file,
      resolved: section.resolved && field.credential !== true,
    }))
  );
}

function setPath(root: JsonObject, path: string, value: unknown): void {
  const parts = path.split('.');
  let current = root;
  for (const part of parts.slice(0, -1)) {
    const existing = current[part];
    if (typeof existing === 'object' && existing !== null && !Array.isArray(existing)) {
      current = existing as JsonObject;
    } else {
      const child: JsonObject = {};
      current[part] = child;
      current = child;
    }
  }
  current[parts.at(-1)!] = value;
}

function ownDefault(field: FlatField): unknown {
  switch (field.type) {
    case 'number': {
      if (field.default === null) return null;
      const minimum = field.minimum!;
      const maximum = minimum + field.span!;
      return minimum + Math.min(field.defaultOffset!, maximum - minimum);
    }
    case 'enum':
      return field.values![0];
    default:
      return structuredClone(field.default);
  }
}

function buildDefaults(fields: FlatField[]): JsonObject {
  const result: JsonObject = {};
  for (const field of fields.filter(field => field.resolved)) {
    setPath(result, field.path, ownDefault(field));
  }
  return result;
}

function directChildren(sectionPath: string, sections: Record<string, Section>): string[] {
  const prefix = sectionPath.length === 0 ? '' : `${sectionPath}.`;
  return Object.keys(sections).filter(candidate => {
    if (candidate === '' || !candidate.startsWith(prefix) || candidate === sectionPath) {
      return false;
    }
    return !candidate.slice(prefix.length).includes('.');
  });
}

function sectionInterfaceName(sectionPath: string, sections: Record<string, Section>): string {
  return `Required${sections[sectionPath]?.typeName ?? toPascal(sectionPath)}Config`;
}

function enumType(field: Field): string {
  if (field.typeName) return field.typeName;
  return field.values!.map(value => JSON.stringify(value)).join(' | ');
}

function resolvedFieldType(field: Field): string {
  switch (field.type) {
    case 'number':
      return field.default === null ? 'number | null' : 'number';
    case 'boolean':
      return 'boolean';
    case 'stringArray':
      return field.default === null ? 'string[] | null' : 'string[]';
    case 'enum':
      return enumType(field);
    case 'string':
    case 'url':
    case 'path':
      return field.default === null ? 'string | undefined' : 'string';
  }
}

function renderInterfaces(contract: Contract): string {
  const sections = contract.sections;
  const enumAliases = new Map<string, string>();
  for (const section of Object.values(sections)) {
    for (const field of Object.values(section.fields)) {
      if (field.type === 'enum' && field.typeName) {
        enumAliases.set(field.typeName, field.values!.map(value => JSON.stringify(value)).join(' | '));
      }
    }
  }

  const root = sections['']!;
  const requiredInterfaces = Object.entries(sections)
    .filter(([path, section]) => path !== '' && section.resolved)
    .map(([sectionPath, section]) => {
      const members = Object.entries(section.fields)
        .filter(([, field]) => !field.credential)
        .map(([key, field]) => `  ${key}: ${resolvedFieldType(field)};`);
      for (const child of directChildren(sectionPath, sections).filter(path => sections[path]!.resolved)) {
        const key = child.slice(sectionPath.length + 1);
        members.push(`  ${key}: ${sectionInterfaceName(child, sections)};`);
      }
      return `export interface ${sectionInterfaceName(sectionPath, sections)} {\n${members.join('\n')}\n}`;
    })
    .join('\n\n');

  const resolvedRootMembers = [
    ...Object.entries(root.fields)
      .filter(([, field]) => !field.credential)
      .map(([key, field]) => `  ${key}: ${resolvedFieldType(field)};`),
    ...directChildren('', sections)
      .filter(path => sections[path]!.resolved)
      .map(path => `  ${path}: ${sectionInterfaceName(path, sections)};`),
  ];

  return `${[...enumAliases].map(([name, type]) => `export type ${name} = ${type};`).join('\n')}

${requiredInterfaces}

export interface ResolvedConfigData {
${resolvedRootMembers.join('\n')}
}`;
}

function renderTsValue(
  value: unknown,
  path: string,
  fieldByPath: Map<string, FlatField>
): string {
  if (value === null) {
    const field = fieldByPath.get(path);
    if (field && ['string', 'url', 'path'].includes(field.type)) return 'undefined';
    return 'null';
  }
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value !== 'object') return JSON.stringify(value);
  const entries = Object.entries(value as JsonObject).map(
    ([key, child]) => `${JSON.stringify(key)}: ${renderTsValue(child, path ? `${path}.${key}` : key, fieldByPath)}`
  );
  return `{ ${entries.join(', ')} }`;
}

function orderedEnvironment(fields: FlatField[], contract: Contract) {
  const fieldBindings = fields.flatMap(field =>
    field.env ? [{ field: field.path, ...field.env }] : []
  );
  const protectedNames: string[] = [];
  const homeTrusted: string[] = [];
  const workspaceNarrowOnly: Record<string, string> = {};
  for (const [name, definition] of Object.entries(contract.environment)) {
    if ((definition.dotenv ?? 'all') !== 'all') protectedNames.push(name);
    if (definition.dotenv === 'home') homeTrusted.push(name);
  }
  for (const binding of fieldBindings) {
    if ((binding.dotenv ?? 'all') !== 'all') protectedNames.push(binding.name);
    if (binding.dotenv === 'home') homeTrusted.push(binding.name);
    if (binding.workspaceNarrowsTo) workspaceNarrowOnly[binding.name] = binding.workspaceNarrowsTo;
  }
  const tokenNames = Object.entries(contract.environment)
    .filter(([, definition]) => definition.tokenPriority !== undefined)
    .sort(([, left], [, right]) => left.tokenPriority! - right.tokenPriority!)
    .map(([name]) => name);
  return {
    fieldBindings,
    protectedNames: [...new Set(protectedNames)],
    homeTrusted: [...new Set(homeTrusted)],
    tokenNames,
    workspaceNarrowOnly,
  };
}

function render(contract: Contract): string {
  const fields = flattenFields(contract);
  const defaults = buildDefaults(fields);
  const fieldByPath = new Map(fields.map(field => [field.path, field]));
  const environment = orderedEnvironment(fields, contract);
  const metadata = fields.map(field => ({
    path: field.path,
    section: field.section,
    key: field.key,
    type: field.type,
    file: field.file,
    resolved: field.resolved,
    credential: field.credential ?? false,
    description: field.description,
    notes: field.notes,
    env: field.env,
    defaultValue: ownDefault(field),
    minimum: field.minimum,
    maximum: field.minimum !== undefined ? field.minimum + field.span! : undefined,
    values: field.values,
    enumStyle: field.enumStyle,
    itemFormat: field.itemFormat,
  }));

  return `// @generated by scripts/generate-config-contract.ts from config-contract.json.
// Do not edit; run \`yarn workspace @octocodeai/config generate:config-contract\`.

${renderInterfaces(contract)}

export type ConfigFieldKind = 'boolean' | 'number' | 'string' | 'url' | 'path' | 'stringArray' | 'enum';
export interface ConfigEnvBinding {
  name: string;
  dotenv?: 'all' | 'home' | 'never';
  normalize?: 'trim' | 'lower';
  workspaceNarrowsTo?: string;
}
export interface ConfigFieldSpec {
  path: string;
  section: string;
  key: string;
  type: ConfigFieldKind;
  file: boolean;
  resolved: boolean;
  credential: boolean;
  description: string;
  notes?: string;
  /** The one variable that sets this field, if any. */
  env?: ConfigEnvBinding;
  defaultValue: unknown;
  minimum?: number;
  maximum?: number;
  values?: readonly string[];
  enumStyle?: 'list' | 'quotedOr';
  itemFormat?: 'path';
}

export const CONFIG_FIELDS: readonly ConfigFieldSpec[] = ${JSON.stringify(metadata, null, 2)};
export const RUNTIME_SURFACES = ${JSON.stringify(contract.config.runtimeSurfaces)} as const;
export type RuntimeSurface = (typeof RUNTIME_SURFACES)[number];
export const ENV_TOKEN_VARS = ${JSON.stringify(environment.tokenNames)} as const;
export const PROTECTED_KEY_NAMES = ${JSON.stringify(environment.protectedNames)} as const;
export const HOME_TRUSTED_ENV_KEYS = ${JSON.stringify(environment.homeTrusted)} as const;
/** Home-trusted switches a workspace may set only to this narrowing value. */
export const WORKSPACE_NARROW_ONLY_ENV: Readonly<Record<string, string>> = ${JSON.stringify(environment.workspaceNarrowOnly)};
export const DEFAULT_CONFIG_VALUE: ResolvedConfigData = ${renderTsValue(defaults, '', fieldByPath)};
`;
}

async function loadContract(): Promise<Contract> {
  const [contractSource, schemaSource] = await Promise.all([
    readFile(contractPath, 'utf8'),
    readFile(schemaPath, 'utf8'),
  ]);
  const contract = JSON.parse(contractSource) as unknown;
  const schema = asObject(JSON.parse(schemaSource) as unknown, 'config contract schema');
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  if (!validate(contract)) {
    throw new Error(`Invalid config contract:\n${ajv.errorsText(validate.errors, { separator: '\n' })}`);
  }
  asObject(contract, 'config contract');
  return contract as Contract;
}

function markdownDefault(field: FlatField): string {
  if (field.displayDefault) return field.displayDefault;
  const value = ownDefault(field);
  return value === null ? 'unset' : `\`${JSON.stringify(value)}\``;
}

function markdownType(field: FlatField): string {
  if (field.type === 'number') {
    return `integer (${field.minimum}–${field.minimum! + field.span!})`;
  }
  if (field.type === 'enum') return field.values!.map(value => `\`${value}\``).join(' or ');
  if (field.type === 'stringArray') return 'string array';
  return field.type;
}

function renderDocumentation(contract: Contract): string {
  const fields = flattenFields(contract);
  const example: JsonObject = { $schema: `https://octocode.ai/schemas/config-v${contract.config.schemaVersion}.json` };
  for (const field of fields.filter(field => field.file)) {
    const value = ownDefault(field);
    setPath(example, field.path, structuredClone(value));
  }
  const rows = fields.map(field => {
    const environment = field.env ? `\`${field.env.name}\`` : '—';
    const filePath = field.file ? `\`${field.path}\`` : '—';
    const protection = field.env?.dotenv === 'never'
      ? `${field.env.name}: shell/MCP only`
      : field.env?.dotenv === 'home'
        ? `${field.env.name}: shell or trusted home .env`
        : '';
    const notes = [field.description, field.notes, protection, field.credential ? 'Credential-only; excluded from ResolvedConfig.' : '']
      .filter(Boolean)
      .join(' ')
      .replace(/\|/g, '\\|');
    return `| ${filePath} | ${environment} | ${markdownDefault(field)} | ${markdownType(field)} | ${notes} |`;
  });
  const tokens = Object.entries(contract.environment)
    .filter(([, definition]) => definition.tokenPriority !== undefined)
    .sort(([, left], [, right]) => left.tokenPriority! - right.tokenPriority!)
    .map(([name, definition]) => `| \`${name}\` | ${definition.tokenPriority! + 1} | ${definition.description ?? ''} |`);
  const additionalEnvironment = Object.entries(contract.environment)
    .filter(([, definition]) =>
      (definition.configSource || definition.documentation) &&
      definition.tokenPriority === undefined
    )
    .map(([name, definition]) => `| \`${name}\` | ${definition.description ?? ''} |`);
  const environment = orderedEnvironment(fields, contract);
  const homeOnly = environment.homeTrusted.map(name => {
    const narrows = environment.workspaceNarrowOnly[name];
    return `| \`${name}\` | ${narrows === undefined ? '—' : `\`${narrows}\``} |`;
  });
  const removed = [
    ...Object.entries(contract.removed?.settings ?? {}).map(
      ([name, reason]) => `| \`${name}\` | \`.octocoderc\` | ${reason} |`
    ),
    ...Object.entries(contract.removed?.environment ?? {}).map(
      ([name, reason]) => `| \`${name}\` | environment | ${reason} |`
    ),
  ];

  return `<!-- Generated by packages/octocode-config/scripts/generate-config-contract.ts. Do not edit. -->
# Octocode configuration settings

This reference is generated from [\`packages/octocode-config/config-contract.json\`](../../packages/octocode-config/config-contract.json), the authoritative declaration used by both TypeScript and Rust.

## Complete \`.octocoderc\` example

\`null\` means “use the next source or the generated default” for every setting, lists included. JSON comments and trailing commas are accepted by the loader even though this generated example is strict JSON.

\`\`\`json
${JSON.stringify(example, null, 2)}
\`\`\`

## Settings

Environment values take precedence over \`.octocoderc\`. Each setting has at most one environment variable.

| \`.octocoderc\` path | Environment | Default | Type / constraint | Description |
|---|---|---|---|---|
${rows.join('\n')}

## GitHub token priority

Tokens first choose the highest-priority source: process environment → workspace \`.octocode/.env\` → global Octocode \`.env\`. CLI and MCP load both files. Missing or blank file values fall back; the token priority below breaks ties only within the winning source, so a workspace token overrides a global one of higher priority. Explicitly blank process \`OCTOCODE_CLASSIFICATION_API\` disables classification. See [configuration precedence](../CONFIGURATION.md#how-settings-override-each-other).

| Environment variable | Priority | Description |
|---|---:|---|
${tokens.join('\n')}

## Additional configuration environment

| Environment variable | Description |
|---|---|
${additionalEnvironment.join('\n')}

## Home-only environment variables

A workspace \`.octocode/.env\` cannot set these; the value is skipped and listed under \`skippedProtected\` in \`octocode config --json\`, and the setting bound to one is ignored in a workspace \`.octocoderc\` with a \`workspace_config_protected\` warning. A workspace may still set the narrowing value shown.

| Environment variable | Workspace may set only |
|---|---|
${homeOnly.join('\n')}

## Removed settings

A removed name is reported once as a \`removed_setting\` warning and otherwise ignored.

| Name | Where | What to do |
|---|---|---|
${removed.join('\n')}
`;
}

export async function generateConfigContract(): Promise<{
  source: string;
  documentation: string;
}> {
  const contract = await loadContract();
  return { source: render(contract), documentation: renderDocumentation(contract) };
}

async function main(): Promise<void> {
  const generated = await generateConfigContract();
  if (process.argv.includes('--check')) {
    const [currentSource, currentDocumentation] = await Promise.all([
      readFile(outputPath, 'utf8').catch(() => ''),
      readFile(documentationPath, 'utf8').catch(() => ''),
    ]);
    if (
      currentSource !== generated.source ||
      currentDocumentation !== generated.documentation
    ) {
      throw new Error(
        'Generated config contract is stale. Run: yarn workspace @octocodeai/config generate:config-contract'
      );
    }
    return;
  }
  await Promise.all([
    writeFile(outputPath, generated.source),
    writeFile(documentationPath, generated.documentation),
  ]);
}

await main();
