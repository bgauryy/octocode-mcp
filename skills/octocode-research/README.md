# Octocode Research Skill

Code research and discovery for local and remote codebases using Octocode tools.

## Installation

```bash
npm install octocode-research
```

## Direct Function Calls

All 13 tools are available as library functions. Import and call directly:

### Local Tools (no auth required)

```typescript
import { localSearchCode, localViewStructure, localFindFiles, localGetFileContent } from 'octocode-research';

// Search code patterns
const search = await localSearchCode({
  queries: [{ pattern: 'export function', path: './src' }]
});

// View directory structure
const structure = await localViewStructure({
  queries: [{ path: '/project', depth: 2 }]
});

// Find files by name/metadata
const files = await localFindFiles({
  queries: [{ path: './src', name: '*.ts', type: 'f' }]
});

// Read file content
const content = await localGetFileContent({
  queries: [{ path: './src/index.ts', matchString: 'export', matchStringContextLines: 10 }]
});
```

### LSP Tools (semantic code analysis)

```typescript
import { lspGotoDefinition, lspFindReferences, lspCallHierarchy } from 'octocode-research';

// Go to definition (lineHint required from search!)
const def = await lspGotoDefinition({
  queries: [{ uri: './src/index.ts', symbolName: 'myFunction', lineHint: 10 }]
});

// Find all references
const refs = await lspFindReferences({
  queries: [{ uri: './src/types.ts', symbolName: 'UserConfig', lineHint: 5 }]
});

// Trace call hierarchy
const calls = await lspCallHierarchy({
  queries: [{ uri: './src/service.ts', symbolName: 'processRequest', lineHint: 42, direction: 'incoming' }]
});
```

### GitHub Tools (requires token initialization)

```typescript
import { initialize, githubSearchCode, githubSearchRepositories, githubViewRepoStructure, githubGetFileContent, githubSearchPullRequests } from 'octocode-research';

await initialize(); // Required first!

// Search code across GitHub
const code = await githubSearchCode({
  queries: [{
    mainResearchGoal: 'Research', researchGoal: 'Find hooks', reasoning: 'Learning',
    keywordsToSearch: ['useState'], owner: 'facebook', repo: 'react',
  }]
});

// Search repositories
const repos = await githubSearchRepositories({
  queries: [{
    mainResearchGoal: 'Research', researchGoal: 'Find CLIs', reasoning: 'Discovery',
    topicsToSearch: ['typescript', 'cli'], stars: '>1000',
  }]
});

// View repository structure
const struct = await githubViewRepoStructure({
  queries: [{
    mainResearchGoal: 'Explore', researchGoal: 'View packages', reasoning: 'Navigation',
    owner: 'facebook', repo: 'react', branch: 'main', path: 'packages',
  }]
});

// Read file from GitHub
const file = await githubGetFileContent({
  queries: [{
    mainResearchGoal: 'Read', researchGoal: 'Get README', reasoning: 'Documentation',
    owner: 'facebook', repo: 'react', path: 'README.md', fullContent: true,
  }]
});

// Search pull requests
const prs = await githubSearchPullRequests({
  queries: [{
    mainResearchGoal: 'History', researchGoal: 'Find hooks PRs', reasoning: 'Archaeology',
    owner: 'facebook', repo: 'react', query: 'hooks', state: 'closed', merged: true,
  }]
});
```

### Package Tools

```typescript
import { packageSearch } from 'octocode-research';

// Search npm packages
const npm = await packageSearch({
  queries: [{
    mainResearchGoal: 'Find package', researchGoal: 'Get express', reasoning: 'Source',
    name: 'express', ecosystem: 'npm',
  }]
});

// Search Python packages
const pypi = await packageSearch({
  queries: [{
    mainResearchGoal: 'Find package', researchGoal: 'Get requests', reasoning: 'Source',
    name: 'requests', ecosystem: 'python',
  }]
});
```

## Available Tools

| Category | Tool | Purpose |
|----------|------|---------|
| **Local** | `localSearchCode` | Search code patterns in local directories |
| | `localViewStructure` | View directory tree structure |
| | `localFindFiles` | Find files by name, type, or metadata |
| | `localGetFileContent` | Read file content with targeting |
| **LSP** | `lspGotoDefinition` | Jump to symbol definition |
| | `lspFindReferences` | Find all references to a symbol |
| | `lspCallHierarchy` | Trace function call relationships |
| **GitHub** | `githubSearchCode` | Search code across GitHub repositories |
| | `githubSearchRepositories` | Find GitHub repositories |
| | `githubViewRepoStructure` | Explore repository directory structure |
| | `githubGetFileContent` | Read file content from GitHub |
| | `githubSearchPullRequests` | Search and analyze pull requests |
| **Package** | `packageSearch` | Search npm and PyPI packages |

## Documentation

See [SKILL.md](./SKILL.md) for complete tool documentation and research workflows.

## License

PolyForm-Small-Business-1.0.0
