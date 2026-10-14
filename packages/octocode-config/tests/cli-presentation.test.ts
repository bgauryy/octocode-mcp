import { describe, expect, it } from 'vitest';
import {
  DIRECT_TOOL_DEFINITIONS,
  CLASIFY_SCOUT_TOOL_NAMES,
  getDirectToolDefinitionsWithAddons,
  getPublicToolCatalogWithAddons,
  getPublicToolCatalog,
  operationSchemas,
  publishedInputSchema,
} from '@octocodeai/octocode-core/schema';
import { buildCliPresentation, toolHelpSection } from '../scripts/tool-contract/presentation.ts';

type Json = Record<string, unknown>;
const presentation = buildCliPresentation() as Json & { tools: Json[]; fingerprint: string };
const tool = (name: string): Json => presentation.tools.find(entry => entry.name === name)!;
const definition = (name: string) => getDirectToolDefinitionsWithAddons().find(entry => entry.name === name)!;

describe('CLI presentation embedded by the native binary', () => {
  it('describes every catalog tool under the enforcement fingerprint', () => {
    expect(presentation.fingerprint).toBe(getPublicToolCatalog().fingerprint);
    expect(presentation.tools.map(entry => entry.name)).toEqual(DIRECT_TOOL_DEFINITIONS.map(entry => entry.name));
  });

  it('serves the row MCP lists as the query view', () => {
    const views = tool('lspSearch').views as Json;
    expect((views.query as Json).querySchema).toEqual(
      publishedInputSchema(definition('lspSearch').inputSchema, 'row')
    );
    expect((views.full as Json).usage).toEqual([`octocode lspSearch '{"queries":[ … ]}'`]);
  });

  it('emits the core value-only clasify projection for a surface without delegated tools', () => {
    const valueOnly = tool('clasify').valueOnly as Json;
    const views = valueOnly.views as Json;
    const catalog = getPublicToolCatalogWithAddons({ availableTools: [] });
    const expected = catalog.tools.find(entry => entry.name === 'clasify')!.querySchema as Json;
    const { $schema: _schema, ...canonical } = expected;
    expect((views.query as Json).querySchema).toEqual(
      publishedInputSchema(getDirectToolDefinitionsWithAddons({ availableTools: [] }).find(entry => entry.name === 'clasify')!.inputSchema, 'row')
    );
    expect((views.full as Json).querySchema).toEqual(canonical);
    expect(JSON.stringify(views)).not.toMatch(/"tool":\{"type":"string","enum"/);
    expect(tool('clasify').help).not.toContain('"tool":"localFetch"');
    expect(presentation.clasifyContextTools).toEqual([...CLASIFY_SCOUT_TOOL_NAMES]);
  });

  it('lists the continuation fields the query view hides, one line each', () => {
    const fields = (name: string) => ((tool(name).views as Json).query as Json).continuationFields as Record<string, string>;
    expect(Object.keys(fields('localSearch')).sort()).toEqual(['extras', 'includeHidden', 'matchPage', 'page', 'snapshot']);
    expect(Object.keys(fields('localFetch')).sort()).toEqual(['extras', 'offset', 'snapshot']);
    for (const entry of presentation.tools) {
      const query = (entry.views as Json).query as Json;
      const shown = Object.keys(((query.querySchema as Json).properties ?? {}) as Json);
      for (const [field, line] of Object.entries(fields(String(entry.name)))) {
        expect(shown, `${entry.name}.${field} is hidden from the row`).not.toContain(field);
        expect(line, `${entry.name}.${field}`).not.toMatch(/\n/);
        expect(line.length, `${entry.name}.${field}`).toBeLessThanOrEqual(160);
      }
    }
  });

  it('generates optional ranking fields only in the enabled read-tool presentation', () => {
    const supported = ['localFetch', 'localSearch', 'ghGetFileContent', 'ghSearchCode'];
    const branches = (schema: Json): Json[] =>
      ((schema.oneOf ?? schema.anyOf) as Json[] | undefined) ?? [schema];
    const hasField = (schema: Json, field: string): boolean =>
      Object.hasOwn((schema.properties ?? {}) as Json, field);
    for (const name of CLASIFY_SCOUT_TOOL_NAMES) {
      const plain = tool(name);
      expect(JSON.stringify({ ...plain, ranking: undefined })).not.toMatch(/"goals"|"ranking"/);
      const ranked = plain.ranking as Json | undefined;
      if (!supported.includes(name)) {
        expect(ranked, `${name} has no ranking projection`).toBeUndefined();
        continue;
      }
      expect(ranked, `${name} has a ranking projection`).toBeDefined();
      for (const view of ['query', 'full']) {
        const schema = ((ranked!.views as Json)[view] as Json).querySchema as Json;
        for (const branch of branches(schema)) {
          const operation = ((branch.properties ?? {}) as Json).operation as Json | undefined;
          expect(hasField(branch, 'goals'), `${name} ${view} ${String(operation?.const ?? 'query')} goals`).toBe(true);
          expect(hasField(branch, 'ranking'), `${name} ${view} ${String(operation?.const ?? 'query')} ranking`).toBe(view === 'full');
          expect((branch.required ?? []) as string[]).not.toContain('goals');
        }
      }
      expect(((ranked!.views as Json).query as Json).continuationFields).toHaveProperty('ranking');
    }
    expect(presentation.tools.filter(entry => entry.ranking).map(entry => entry.name).sort()).toEqual([...supported].sort());
    const history = tool('ghSearchHistory');
    const selections = history.selections as Record<string, Json>;
    for (const operation of ['pullRequest', 'issue', 'commit']) {
      const selection = selections[`operation=${operation}`];
      expect(selection, operation).toBeDefined();
      const schema = selection!.querySchema as Json;
      expect(hasField(schema, 'goals'), operation).toBe(false);
      expect(hasField(schema, 'ranking'), operation).toBe(false);
    }
  });

  it('names the fields the query view hides and the call that shows them', () => {
    const query = (name: string) => (tool(name).views as Json).query as Json;
    const lsp = query('lspSearch');
    const byOperation = lsp.operationFields as Record<string, string[]>;
    expect(byOperation.definition).toContain('rustContext');
    expect(byOperation.references).toEqual(expect.arrayContaining(['includeDeclaration', 'rustContext']));
    expect(lsp.select).toBe("octocode schema lspSearch --view query --select operation=<operation> shows that operation's fields");
    for (const entry of presentation.tools) {
      const view = query(String(entry.name));
      const shown = new Set([
        ...Object.keys(((view.querySchema as Json).properties ?? {}) as Json),
        ...Object.keys(view.continuationFields as Json),
      ]);
      const named = [
        ...Object.values((view.operationFields ?? {}) as Record<string, string[]>).flat(),
        ...((view.moreFields ?? []) as string[]),
      ];
      for (const field of named) expect(shown.has(field), `${entry.name}.${field}`).toBe(false);
      // Every accepted field is reachable from the query view: shown, a
      // continuation field, or named here.
      const selections = Object.values(entry.selections as Record<string, Json>);
      const accepted = selections.length
        ? selections.flatMap(selection => Object.keys(((selection.querySchema as Json).properties ?? {}) as Json))
        : Object.keys((((entry.views as Json).full as Json).querySchema as Json).properties ?? {});
      for (const field of accepted.filter(field => field !== 'mainGoal' && field !== 'reasoning'))
        expect(shown.has(field) || named.includes(field), `${entry.name}.${field} is undiscoverable`).toBe(true);
    }
  });

  it('pre-renders one selection per operation, keyed operation=VALUE', () => {
    for (const entry of presentation.tools) {
      const operations = Object.keys(operationSchemas(definition(String(entry.name)).inputSchema));
      expect(Object.keys(entry.selections as Json).sort(), String(entry.name)).toEqual(
        operations.map(operation => `operation=${operation}`).sort()
      );
      expect(entry.variantNames).toEqual(operations);
    }
    const symbols = (tool('astSearch').selections as Json)['operation=symbols'] as Json;
    expect(((symbols.querySchema as Json).properties as Json).symbolName).toBeDefined();
  });

  it('precomputes the catalog field list from the published row of each form', () => {
    for (const entry of presentation.tools) expect(String(entry.fields), String(entry.name)).toMatch(/^\S.*\]$/);
    // One form: the published fields, required first, truncated.
    expect(tool('ghStructure').fields).toBe('[owner*, repo*, include?, materialize?, maxDepth?, operation?, path?, ref?]');
    expect(tool('localSearch').fields).toMatch(/^\[matchString\*, path\*, .*…\]$/);
    // Several forms: each labelled by its variant name, the discriminator left to the label.
    expect(tool('astSearch').fields).toContain('match:rule[path*, rule*, ');
    expect(tool('astTopology').fields).toMatch(/^deadCode\[/);
    expect(tool('lspSearch').fields).toMatch(/^anchored\[line\*, path\*, symbolName\*, workspaceRoot\?\] \| document\[/);
    expect(tool('ghGetHistoryItem').fields).not.toContain('operation');
  });

  it('serves the canonical row from the enforcement contract, not a second emission', () => {
    const full = (tool('lspSearch').views as Json).full as Json;
    const { $schema: _schema, ...querySchema } = getPublicToolCatalogWithAddons().tools.find(entry => entry.name === 'lspSearch')!
      .querySchema as Json;
    expect(full.querySchema).toEqual(querySchema);
    expect(full.querySchema).not.toHaveProperty('$schema');
  });

  it('gives every tool a help section with its required fields', () => {
    for (const entry of presentation.tools) {
      const help = String(entry.help);
      expect(help, String(entry.name)).toMatch(/\nRequired/);
      expect(help.endsWith(`All fields: octocode schema ${String(entry.name)}`), String(entry.name)).toBe(true);
    }
    expect(tool('localSearch').help).toMatch(/Required: .*path/);
    expect(tool('localSearch').help).toContain("Example:\n  octocode localSearch '");
  });
});

describe('toolHelpSection', () => {
  it('lists required fields per operation for a tool with operations', () => {
    const help = toolHelpSection('ghGetHistoryItem');
    expect(help).toContain('Required fields, by operation:');
    expect(help).toMatch(/pullRequest\s+.*number/);
    expect(help).toMatch(/compare\s+.*base, head/);
  });
});
