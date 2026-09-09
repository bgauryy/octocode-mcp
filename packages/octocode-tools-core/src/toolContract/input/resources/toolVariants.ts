export interface ToolSchemaVariant {
  name: string;
  when: string;
  requires: string[];
  fields?: string[];
  excludes?: string[];
  example: Record<string, unknown>;
}

const variants: Record<string, ToolSchemaVariant[]> = {
  ghSearch: [
    {
      name: 'code',
      when: 'Search code contents or file paths',
      requires: ['operation'],
      excludes: ['branch'],
      fields: [
        'keywords',
        'owner',
        'repo',
        'extension',
        'filename',
        'path',
        'language',
        'match',
        'pageSize',
        'page',
        'concise',
      ],
      example: {
        operation: 'code',
        keywords: ['toolSchemas'],
        owner: 'bgauryy',
        repo: 'octocode',
      },
    },
    {
      name: 'repositories',
      when: 'Discover repositories',
      requires: ['operation'],
      fields: [
        'keywords',
        'topics',
        'language',
        'owner',
        'stars',
        'forks',
        'goodFirstIssues',
        'updated',
        'created',
        'size',
        'match',
        'sort',
        'pageSize',
        'page',
        'archived',
        'visibility',
        'license',
        'concise',
      ],
      example: { operation: 'repositories', keywords: ['octocode'] },
    },
    {
      name: 'tree',
      when: 'Browse a known repository tree',
      requires: ['operation', 'owner', 'repo'],
      fields: [
        'owner',
        'repo',
        'branch',
        'path',
        'maxDepth',
        'page',
        'pageSize',
        'include',
      ],
      example: {
        operation: 'tree',
        owner: 'bgauryy',
        repo: 'octocode',
        path: 'packages',
        maxDepth: 2,
      },
    },
  ],
  localSearch: [
    {
      name: 'lexical',
      when: 'Search lexical text or regular expressions',
      requires: ['path', 'searchText'],
      example: { path: '.', searchText: 'toolSchemas' },
    },
  ],
  astSearch: [
    {
      name: 'match',
      when: 'Match AST structure',
      requires: ['operation', 'path', 'langType'],
      example: {
        operation: 'match',
        path: '.',
        pattern: 'console.log($A)',
        langType: 'typescript',
      },
    },
    {
      name: 'files',
      when: 'Discover paths by name or metadata',
      requires: ['operation', 'path'],
      example: { operation: 'files', path: '.', names: ['*.ts'] },
    },
    {
      name: 'tree',
      when: 'Browse a directory tree',
      requires: ['operation', 'path'],
      example: { operation: 'tree', path: '.', maxDepth: 5 },
    },
    {
      name: 'symbols',
      when: 'Extract symbols from source files',
      requires: ['operation', 'path'],
      example: { path: '.', operation: 'symbols' },
    },
    {
      name: 'topology',
      when: 'Analyze file dependencies and reachability',
      requires: ['path', 'operation'],
      example: {
        path: '.',
        operation: 'topology',
        analysis: 'dependencies',
        file: 'src/index.ts',
      },
    },
  ],
  lspSearch: [
    {
      name: 'anchored',
      when: 'Query a named symbol near a source line',
      requires: ['uri', 'operation', 'symbolName', 'lineHint'],
      example: {
        uri: 'src/index.ts',
        operation: 'definition',
        symbolName: 'main',
        lineHint: 1,
      },
    },
    {
      name: 'position',
      when: 'Query a symbol at an exact source position',
      requires: ['uri', 'operation', 'position'],
      example: {
        uri: 'src/index.ts',
        operation: 'definition',
        position: { line: 0, character: 0 },
      },
    },
    {
      name: 'document',
      when: 'Query a whole document',
      requires: ['uri', 'operation'],
      example: { uri: 'src/index.ts', operation: 'documentSymbols' },
    },
    {
      name: 'workspace',
      when: 'Search symbols across the workspace',
      requires: ['workspaceRoot', 'operation', 'symbolName'],
      example: {
        workspaceRoot: '.',
        operation: 'workspaceSymbol',
        symbolName: 'Schema',
      },
    },
  ],
};

export function getToolSchemaVariants(name: string): ToolSchemaVariant[] {
  return variants[name] ?? [];
}
