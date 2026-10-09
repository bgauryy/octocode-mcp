import { describe, expect, it } from 'vitest';
import {
  CLASIFY_SCOUT_TOOL_NAMES,
  getPublicToolCatalogWithAddons,
  isBetaTool,
  projectSchemaSelection,
  type SchemaJsonObject,
} from '@octocodeai/octocode-core/schema';
import {
  buildCliPresentation,
  selectionKey,
  toolHelpSection,
} from '../scripts/tool-contract/presentation.ts';

type Json = Record<string, unknown>;
const presentation = buildCliPresentation() as Json & { tools: Json[]; fingerprint: string };
const tool = (name: string): Json => presentation.tools.find(entry => entry.name === name)!;

describe('CLI presentation embedded by the native binary', () => {
  it('describes every catalog tool under the enforcement fingerprint', () => {
    const catalog = getPublicToolCatalogWithAddons();
    expect(presentation.fingerprint).toBe(catalog.fingerprint);
    expect(presentation.tools.map(entry => entry.name)).toEqual(catalog.tools.map(entry => entry.name));
    expect(presentation.clasifyContextTools).toEqual([...CLASIFY_SCOUT_TOOL_NAMES]);
  });

  it('renders the same views core projects, without availability addons', () => {
    const lspSearch = getPublicToolCatalogWithAddons().tools.find(entry => entry.name === 'lspSearch') as SchemaJsonObject;
    const views = tool('lspSearch').views as Json;
    expect(views.query).toEqual(projectSchemaSelection(lspSearch, 'query', undefined));
    expect(views.variants).toEqual(projectSchemaSelection(lspSearch, 'variants', undefined));
    expect((views.full as Json).usage).toEqual(expect.arrayContaining([`octocode lspSearch '{"queries":[ … ]}'`]));
  });

  it('pre-renders every selection core accepts, keyed by its canonical FIELD=VALUE', () => {
    const astSearch = getPublicToolCatalogWithAddons().tools.find(entry => entry.name === 'astSearch') as SchemaJsonObject;
    const selections = tool('astSearch').selections as Json;
    for (const key of ['operation=symbols', 'operation=match(pattern)', 'variant=symbols']) {
      expect(selections[key], key).toEqual(projectSchemaSelection(astSearch, 'query', key));
    }
    expect(selections['operation=nope']).toBeUndefined();
    expect(selectionKey('operation', 'match')).toBe('operation=match');
    expect(selectionKey('limit', 5)).toBe('limit=5');
  });

  it('keeps each clasify handoff apart so the binary adds it only when clasify is enabled', () => {
    const withClasify = getPublicToolCatalogWithAddons({
      availableTools: presentation.tools.map(entry => String(entry.name)),
    });
    for (const entry of presentation.tools) {
      const full = withClasify.tools.find(candidate => candidate.name === entry.name)!.description;
      const base = (entry.views as Json | undefined)?.query as Json | undefined;
      if (entry.handoff === undefined) continue;
      expect(full).toBe(`${String(base?.description)} ${String(entry.handoff)}`);
    }
    expect(tool('localSearch').handoff).toEqual(expect.stringContaining('clasify'));
    expect(tool('ghSearchRepo').handoff).toBeUndefined();
  });

  it('renders clasify for the default CLI tool set and for beta tools enabled', () => {
    const renderings = tool('clasify').renderings as Json[];
    expect(renderings.map(entry => entry.contextTools)).toEqual([
      CLASIFY_SCOUT_TOOL_NAMES.filter(name => !isBetaTool(name)),
      [...CLASIFY_SCOUT_TOOL_NAMES],
    ]);
    expect(tool('clasify').views).toBeUndefined();
  });

  it('gives every tool a help section with its required fields and a runnable example', () => {
    for (const entry of presentation.tools) {
      const help = String(entry.help);
      expect(help, String(entry.name)).toMatch(/\nRequired/);
      expect(help).toContain(`All fields: octocode schema ${String(entry.name)} --view query`);
    }
    expect(tool('localSearch').help).toContain('Required: path, matchString');
    expect(tool('localSearch').help).toContain("Example:\n  octocode localSearch '");
  });
});

describe('toolHelpSection', () => {
  it('lists required fields per variant and prints a long example one field per line', () => {
    const help = toolHelpSection(
      {
        name: 'demo',
        variants: [
          { name: 'a', requires: ['path'], when: 'Read one file', example: { path: '/ABS/repo/src/a.ts', note: 'x'.repeat(120) } },
          { name: 'bb', requires: ['path', 'operation'] },
        ],
      },
      []
    );
    expect(help).toContain('Required fields, by variant:\n  a   path             Read one file\n  bb  path, operation');
    // Catalog examples root at /ABS/repo/; help shows them relative.
    expect(help).toContain(`octocode demo '{\n    "path": "src/a.ts",`);
  });

  it('derives required fields from usage forms when a tool has no variants', () => {
    expect(toolHelpSection({ name: 'x' }, ['octocode x <owner> <repo>'])).toContain('Required: owner, repo');
    expect(toolHelpSection({ name: 'x' }, ['octocode x <owner>', 'octocode x <keywords>'])).toContain(
      'Required (one form):\n  owner\n  keywords'
    );
    expect(toolHelpSection({ name: 'x' }, [])).toContain('Required: none; every field is optional.');
  });
});
