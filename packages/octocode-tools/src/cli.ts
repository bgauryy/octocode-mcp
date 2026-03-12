import { Command } from 'commander';

// GitHub commands
import { registerSearchCode } from './commands/github/search-code.js';
import { registerGetFile } from './commands/github/get-file.js';
import { registerTree } from './commands/github/tree.js';
import { registerSearchRepos } from './commands/github/search-repos.js';
import { registerSearchPrs } from './commands/github/search-prs.js';
import { registerSearchPackages } from './commands/github/search-packages.js';

// Local commands
import { registerLocalSearch } from './commands/local/search.js';
import { registerLocalFile } from './commands/local/file.js';
import { registerLocalFind } from './commands/local/find.js';
import { registerLocalTree } from './commands/local/tree.js';

// LSP commands
import { registerLspDefinition } from './commands/lsp/definition.js';
import { registerLspReferences } from './commands/lsp/references.js';
import { registerLspCallHierarchy } from './commands/lsp/call-hierarchy.js';

declare const __APP_VERSION__: string;

export function createCli(): Command {
  const program = new Command();

  program
    .name('octocode-tools')
    .description(
      'GitHub code research and analysis CLI.\n\n' +
      'Auth: gh CLI (auto) | GITHUB_TOKEN env var\n\n' +
      'Commands are grouped by category:\n' +
      '  GitHub:  search-code, get-file, tree, search-repos, search-prs, search-packages\n' +
      '  Local:   local-search, local-file, local-find, local-tree\n' +
      '  LSP:     lsp-definition, lsp-references, lsp-call-hierarchy'
    )
    .version(typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0');

  // GitHub commands
  registerSearchCode(program);
  registerGetFile(program);
  registerTree(program);
  registerSearchRepos(program);
  registerSearchPrs(program);
  registerSearchPackages(program);

  // Local commands
  registerLocalSearch(program);
  registerLocalFile(program);
  registerLocalFind(program);
  registerLocalTree(program);

  // LSP commands
  registerLspDefinition(program);
  registerLspReferences(program);
  registerLspCallHierarchy(program);

  return program;
}
