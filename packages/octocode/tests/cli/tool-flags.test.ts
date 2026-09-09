import { describe, expect, it } from 'vitest';
import {
  buildQueryFromFlags,
  extractToolArgvTail,
  formatToolFlagExample,
  getToolFlagTable,
  hasToolFlagInput,
} from '../../src/cli/tool-command/flags-to-query.js';

describe('getToolFlagTable', () => {
  it('derives a flat field table for localSearch', () => {
    const table = getToolFlagTable('localSearch');
    expect(table.fields.get('searchText')?.kind).toBe('string');
    expect(table.fields.get('maxFiles')?.kind).toBe('number');
    expect(table.fields.get('wholeWord')?.kind).toBe('boolean');
    expect(table.fields.get('include')?.kind).toBe('array');
    expect(table.discriminators.size).toBe(0);
  });

  it('collects variant discriminators and object children for astSearch', () => {
    const table = getToolFlagTable('astSearch');
    expect(table.discriminators.get('tree')).toEqual({
      field: 'operation',
      value: 'tree',
    });
    expect(table.discriminators.get('cycles')).toEqual({
      field: 'analysis',
      value: 'cycles',
    });
    expect(table.discriminators.get('syntax')).toEqual({
      field: 'treeKind',
      value: 'syntax',
    });
    const size = table.fields.get('size');
    expect(size?.kind).toBe('object');
    expect(size?.children?.has('greater')).toBe(true);
  });

  it('recovers real field shapes hidden behind negated variant schemas', () => {
    // lspSearch forbids `position` on some variants ({"not":{}}); the table
    // must keep the variant where it is a real object with line/character.
    const table = getToolFlagTable('lspSearch');
    const position = table.fields.get('position');
    expect(position?.kind).toBe('object');
    expect(position?.children?.has('line')).toBe(true);
    expect(position?.children?.has('character')).toBe(true);
  });
});

describe('buildQueryFromFlags', () => {
  it('maps kebab-case flags, numbers, booleans and repeated arrays', () => {
    const query = buildQueryFromFlags('localSearch', [
      '--path',
      'src',
      '--search-text',
      'runCLI',
      '--max-files',
      '5',
      '--whole-word',
      '--include',
      '*.ts',
      '--include',
      '*.mjs',
    ]);
    expect(query).toEqual({
      path: 'src',
      searchText: 'runCLI',
      maxFiles: 5,
      wholeWord: true,
      include: ['*.ts', '*.mjs'],
    });
  });

  it('accepts camelCase flags and --flag=value syntax', () => {
    const query = buildQueryFromFlags('localSearch', [
      '--path=src',
      '--searchText=x',
      '--maxDepth=3',
    ]);
    expect(query).toEqual({ path: 'src', searchText: 'x', maxDepth: 3 });
  });

  it('selects variants positionally, including nested discriminators', () => {
    expect(
      buildQueryFromFlags('astSearch', [
        'tree',
        '--path',
        '.',
        '--max-depth',
        '2',
      ])
    ).toEqual({ operation: 'tree', path: '.', maxDepth: 2 });
    expect(
      buildQueryFromFlags('astSearch', ['topology', 'cycles', '--path', 'src'])
    ).toEqual({ operation: 'topology', analysis: 'cycles', path: 'src' });
  });

  it('maps object sub-fields via --parent-child flags', () => {
    expect(
      buildQueryFromFlags('astSearch', [
        'files',
        '--path',
        'src',
        '--size-greater',
        '8k',
      ])
    ).toEqual({ operation: 'files', path: 'src', size: { greater: '8k' } });
    expect(
      buildQueryFromFlags('lspSearch', [
        '--uri',
        'a.ts',
        '--position-line',
        '10',
        '--position-character',
        '4',
      ])
    ).toEqual({ uri: 'a.ts', position: { line: 10, character: 4 } });
  });

  it('rejects unknown flags with a did-you-mean suggestion', () => {
    expect(() =>
      buildQueryFromFlags('localSearch', ['--search-txt', 'x'])
    ).toThrow(/Unknown localSearch flag: --search-txt/);
    try {
      buildQueryFromFlags('localSearch', ['--search-txt', 'x']);
    } catch (error) {
      expect((error as { details: string[] }).details.join('\n')).toContain(
        'Did you mean --search-text?'
      );
    }
  });

  it('rejects unknown selectors, listing the valid ones', () => {
    try {
      buildQueryFromFlags('astSearch', ['banana']);
      expect.unreachable();
    } catch (error) {
      expect(String(error)).toContain('Unknown astSearch selector');
      expect((error as { details: string[] }).details.join('\n')).toContain(
        'tree'
      );
    }
  });

  it('rejects positional JSON with a pointer to --queries', () => {
    expect(() => buildQueryFromFlags('localSearch', ['{"path":"."}'])).toThrow(
      /--queries/
    );
  });

  it('rejects mixing --queries into a flag invocation', () => {
    expect(() =>
      buildQueryFromFlags('localSearch', ['--path', '.', '--queries', '{}'])
    ).toThrow(/not both/);
  });

  it('rejects non-numeric values for numeric fields', () => {
    expect(() =>
      buildQueryFromFlags('localSearch', ['--max-files', 'lots'])
    ).toThrow(/expects a number/);
  });

  it('treats --format as a schema field for tools that define one', () => {
    expect(buildQueryFromFlags('lspSearch', ['--format', 'compact'])).toEqual({
      format: 'compact',
    });
  });
});

describe('hasToolFlagInput / extractToolArgvTail', () => {
  it('ignores runtime-only flags but detects schema flags and positionals', () => {
    expect(hasToolFlagInput(['--json', '--compact'])).toBe(false);
    expect(hasToolFlagInput(['--queries', '{"a":1}', '--json'])).toBe(false);
    expect(hasToolFlagInput(['--path', 'src'])).toBe(true);
    expect(hasToolFlagInput(['tree'])).toBe(true);
  });

  it('prefers raw argv and falls back to parsed options', () => {
    expect(
      extractToolArgvTail(
        ['tools', 'astSearch', 'tree', '--path', '.'],
        'astSearch',
        { args: ['astSearch', 'tree'], options: { path: '.' } }
      )
    ).toEqual(['tree', '--path', '.']);
    expect(
      extractToolArgvTail(undefined, 'localSearch', {
        args: ['localSearch'],
        options: { path: '.', json: true },
      })
    ).toEqual(['--path=.']);
  });
});

describe('formatToolFlagExample', () => {
  it('renders a runnable example per tool', () => {
    expect(formatToolFlagExample('localSearch')).toContain('--path');
    expect(formatToolFlagExample('astSearch')).toMatch(/tools astSearch \w+/);
  });
});
