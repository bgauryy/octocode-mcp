import { c, bold, dim } from '../utils/colors.js';

export interface StaticToolHelpSpec {
  name: string;
  description: string;
  required: string;
  optional?: string;
  autoFilled: string;
  example: string;
}

const STATIC_TOOL_HELP_SPECS: StaticToolHelpSpec[] = [
  {
    name: 'localSearchCode',
    description: `## Search code patterns [LOCAL: ripgrep] - START HERE for code questions
  <when>
  - Code questions, symbol lookups, pattern finding
  - Find functions, classes, variables, imports, constants
  - Get lineHint for LSP tools (if available)
  </when>
  <fromTool>
  - localViewStructure: After understanding layout
  - localFindFiles: After narrowing by metadata
  - self: Refine pattern | Try variants
  </fromTool>
  <toTool>
  If LSP available:
  1. This tool gives file + lineHint
  2. lspGotoDefinition(lineHint) -> locate definition
  3. lspFindReferences -> all usages
  4. lspCallHierarchy -> trace call flow
  5. localGetFileContent -> read impl (last)
  
  Without LSP:
  - localGetFileContent(matchString) for context
  </toTool>
  <gotchas>
  - lineHint is 1-indexed (first line = 1)
  - filesOnly=true for fast discovery
  - type filter (ts, js, py) faster than globs
  </gotchas>
  <examples>
  - path="/workspace/src", pattern="function handleAuth", type="ts"
  - path="/workspace", pattern="export.*UserService", perlRegex=true
  - path="/workspace", pattern="TODO", filesOnly=true
  </examples>`,
    required:
      'pattern (string), path (string), smartCase (boolean), matchContentLength (integer), filesPerPage (integer), filePageNumber (integer), matchesPerPage (integer), binaryFiles (enum(text, without-match, binary)), includeStats (boolean), sort (enum(path, modified, accessed, created)), showFileLastModified (boolean)',
    optional:
      'mode (enum(discovery, paginated, detailed)), fixedString (boolean), perlRegex (boolean), caseInsensitive (boolean), caseSensitive (boolean), wholeWord (boolean), invertMatch (boolean), type (string), include (array<string>), exclude (array<string>)',
    autoFilled: 'id, researchGoal, reasoning',
    example: `octocode-cli --tool localSearchCode '{"pattern":"pattern","path":".","smartCase":true,"matchContentLength":1,"filesPerPage":1,"filePageNumber":1,"matchesPerPage":1,"binaryFiles":"text","includeStats":true,"sort":"path","showFileLastModified":true}'`,
  },
  {
    name: 'githubSearchCode',
    description: `## Search GitHub code [EXTERNAL: GitHub API]
  <when>
  - Find code patterns | Locate files by path
  - match="file" -> content | match="path" -> file names
  - External research | Cross-repo patterns
  </when>
  <fromTool>
  - githubSearchRepositories: After finding repo
  - githubViewRepoStructure: After understanding layout
  - packageSearch: After finding package
  - self: Refine query | Switch match=file<->path
  </fromTool>
  <toTool>
  - githubGetFileContent: Read matched files (text_matches for matchString)
  - githubViewRepoStructure: Explore around matches
  - githubSearchPullRequests: Find history
  </toTool>
  <gotchas>
  - 1-2 filters safe. NEVER combine extension+filename+path
  - path is strict prefix: "pkg" finds pkg/file, NOT parent/pkg/file
  - Start lean: single filter -> verify -> add filters
  - Prefer owner+repo for precision
  - For packages: packageSearch first
  </gotchas>
  <examples>
  - owner="facebook", repo="react", match="path", keywordsToSearch=["utils"]
  - keywordsToSearch=["useState"], match="file"
  - path="src/api", extension="ts", keywordsToSearch=["export"]
  </examples>`,
    required:
      'keywordsToSearch (array<string>), limit (integer), page (integer)',
    optional:
      'owner (string), repo (string), extension (string), filename (string), path (string), match (enum(file, path)), charOffset (integer), charLength (integer)',
    autoFilled: 'id, researchGoal, reasoning, mainResearchGoal',
    example: `octocode-cli --tool githubSearchCode '{"keywordsToSearch":["keywordsToSearch"],"limit":1,"page":1}'`,
  },
  {
    name: 'packageSearch',
    description: `## Find NPM/Python packages [EXTERNAL: npm/PyPI]
  <when>
  - Look up package by name (prevents research loops)
  - Get repository URL (owner/repo) for source exploration
  - Compare alternatives | Check deprecation
  </when>
  <fromTool>
  - localSearchCode: Found import? Look up package
  - localGetFileContent: Found package.json? Look up dependencies
  - self: Compare alternatives
  </fromTool>
  <toTool>
  - githubViewRepoStructure: Explore package source
  - githubSearchCode: Search implementation
  - githubGetFileContent: Read source files
  </toTool>
  <vsGitHub>
  - packageSearch: Fast lookup by name -> repo URL
  - githubSearchRepositories: Broad discovery by keywords
  Use packageSearch first for known package names
  </vsGitHub>
  <gotchas>
  - searchLimit=1 for known name | 5 for alternatives
  - Python: Always returns 1 result (PyPI limitation)
  - NPM uses dashes, Python uses underscores
  - Check DEPRECATED warnings first
  </gotchas>
  <examples>
  - ecosystem="npm", name="express"
  - ecosystem="python", name="requests"
  - ecosystem="npm", name="lodash", searchLimit=5
  </examples>`,
    required: 'none',
    autoFilled: 'id, researchGoal, reasoning, mainResearchGoal',
    example: `octocode-cli --tool packageSearch '{}'`,
  },
];

export function findStaticToolHelp(
  toolName: string
): StaticToolHelpSpec | undefined {
  return STATIC_TOOL_HELP_SPECS.find(spec => spec.name === toolName);
}

export function showStaticToolHelp(spec: StaticToolHelpSpec): void {
  const lines = [
    '',
    `  ${c('magenta', bold(spec.name))}`,
    `  ${spec.description}`,
    '',
    `  ${bold('Required')}: ${spec.required}`,
  ];

  if (spec.optional) {
    lines.push(`  ${bold('Optional')}: ${spec.optional}`);
  }

  lines.push(`  ${dim('Auto-filled')}: ${spec.autoFilled}`);
  lines.push('');
  lines.push(`  ${bold('Example')}`);
  lines.push(`    ${c('yellow', spec.example)}`);
  lines.push('');

  process.stdout.write(`${lines.join('\n')}\n`);
}
