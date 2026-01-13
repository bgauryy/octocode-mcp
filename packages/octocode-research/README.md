# Octocode Research Skill

Code research and discovery for local and remote codebases using Octocode tools.

## Installation

```bash
npm install octocode-research
```

## Scripts

All 13 Octocode tools are available as CLI scripts. Run from the skill directory:

```bash
cd packages/octocode-research
```

### Local Tools (no auth required)

```bash
# Search code patterns
npx tsx scripts/search-local.ts <pattern> [path]
npx tsx scripts/search-local.ts "export function" ./src

# View directory structure
npx tsx scripts/view-structure.ts [path] [depth]
npx tsx scripts/view-structure.ts /project 2

# Find files by name/metadata
npx tsx scripts/find-files.ts <path> [name-pattern]
npx tsx scripts/find-files.ts ./src "*.ts"

# Read file content
npx tsx scripts/get-file.ts <file-path> [match-string]
npx tsx scripts/get-file.ts ./src/index.ts "export"
```

### LSP Tools (semantic code analysis)

```bash
# Go to definition
npx tsx scripts/goto-definition.ts <file-path> <symbol-name> <line-hint>
npx tsx scripts/goto-definition.ts ./src/index.ts myFunction 10

# Find all references
npx tsx scripts/find-references.ts <file-path> <symbol-name> <line-hint>
npx tsx scripts/find-references.ts ./src/types.ts UserConfig 5

# Trace call hierarchy
npx tsx scripts/call-hierarchy.ts <file-path> <function-name> <line-hint> [incoming|outgoing]
npx tsx scripts/call-hierarchy.ts ./src/service.ts processRequest 42 incoming
```

### GitHub Tools (requires GITHUB_TOKEN)

```bash
export GITHUB_TOKEN=your_token

# Search code across GitHub
npx tsx scripts/github-search-code.ts <keywords> [owner/repo]
npx tsx scripts/github-search-code.ts "useState" facebook/react

# Search repositories
npx tsx scripts/github-search-repos.ts <keywords> [--topics]
npx tsx scripts/github-search-repos.ts "typescript cli" --topics

# View repository structure
npx tsx scripts/github-view-repo.ts <owner/repo> [path] [branch]
npx tsx scripts/github-view-repo.ts facebook/react packages main

# Read file from GitHub
npx tsx scripts/github-get-file.ts <owner/repo> <file-path> [match-string]
npx tsx scripts/github-get-file.ts facebook/react README.md

# Search pull requests
npx tsx scripts/github-search-prs.ts <owner/repo> [query] [--merged]
npx tsx scripts/github-search-prs.ts facebook/react "hooks" --merged
```

### Package Tools

```bash
# Search npm/PyPI packages
npx tsx scripts/package-search.ts <package-name> [npm|python]
npx tsx scripts/package-search.ts express
npx tsx scripts/package-search.ts requests python
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

## Programmatic Usage

```typescript
import {
  localSearchCode,
  githubSearchCode,
  lspGotoDefinition,
  packageSearch
} from 'octocode-research';

// Search local code
const localResult = await localSearchCode({
  queries: [{
    pattern: 'authenticate',
    path: '/project/src',
  }]
});

// Search GitHub
const githubResult = await githubSearchCode({
  queries: [{
    keywordsToSearch: ['useState'],
    owner: 'facebook',
    repo: 'react',
  }]
});

// Go to definition
const defResult = await lspGotoDefinition({
  queries: [{
    uri: 'file:///project/src/index.ts',
    symbolName: 'myFunction',
    lineHint: 10,
  }]
});
```

## Documentation

See [SKILL.md](./SKILL.md) for complete tool documentation and research workflows.

## License

PolyForm-Small-Business-1.0.0
