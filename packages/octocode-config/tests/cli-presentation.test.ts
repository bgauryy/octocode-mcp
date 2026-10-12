import { describe, expect, it } from 'vitest';
import {
  DIRECT_TOOL_DEFINITIONS,
  getPublicToolCatalog,
  operationSchemas,
  publishedInputSchema,
} from '@octocodeai/octocode-core/schema';
import { buildCliPresentation, toolHelpSection } from '../scripts/tool-contract/presentation.ts';

type Json = Record<string, unknown>;
const presentation = buildCliPresentation() as Json & { tools: Json[]; fingerprint: string };
const tool = (name: string): Json => presentation.tools.find(entry => entry.name === name)!;
const definition = (name: string) => DIRECT_TOOL_DEFINITIONS.find(entry => entry.name === name)!;

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

  it('names the fields the query view hides and the call that shows them', () => {
    const query = (name: string) => (tool(name).views as Json).query as Json;
    const lsp = query('lspSearch');
    const byOperation = lsp.operationFields as Record<string, string[]>;
    expect(byOperation.definition).toContain('rustContext');
    expect(byOperation.references).toEqual(expect.arrayContaining(['includeDeclaration', 'rustContext']));
    expect(lsp.select).toBe("octocode schema lspSearch --select operation=<operation> shows that operation's fields");
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
    const { $schema: _schema, ...querySchema } = getPublicToolCatalog().tools.find(entry => entry.name === 'lspSearch')!
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
