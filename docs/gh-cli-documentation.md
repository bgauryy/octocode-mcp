# GitHub CLI (gh) Documentation

*Generated using Octocode MCP - Advanced Code Analysis Assistant*

## Overview

**GitHub CLI** (`gh`) is GitHub's official command line tool that brings pull requests, issues, and other GitHub concepts to the terminal next to where you are already working with `git` and your code.

**Repository**: https://github.com/cli/cli
**Language**: Go
**License**: MIT
**Default Branch**: trunk

## Key Features

- **Pull Requests**: Create, review, merge, and manage pull requests from the command line
- **Issues**: Create, view, and manage GitHub issues
- **Repository Operations**: Clone, fork, create repositories
- **GitHub Actions**: View workflow runs and manage workflows
- **Authentication**: Secure authentication with GitHub.com, GitHub Enterprise Cloud, and GitHub Enterprise Server 2.20+
- **Cross-Platform**: Support for macOS, Windows, and Linux

## Installation

### macOS

| Method | Install Command | Upgrade Command |
|--------|-----------------|-----------------|
| **Homebrew** | `brew install gh` | `brew upgrade gh` |
| **MacPorts** | `sudo port install gh` | `sudo port selfupdate && sudo port upgrade gh` |
| **Conda** | `conda install gh --channel conda-forge` | `conda update gh --channel conda-forge` |
| **Spack** | `spack install gh` | `spack uninstall gh && spack install gh` |
| **Webi** | `curl -sS https://webi.sh/gh \| sh` | `webi gh@stable` |
| **Flox** | `flox install gh` | `flox upgrade toplevel` |

> **Note**: Mac OS installer `.pkg` files are currently unsigned. Efforts are prioritized in [cli/cli#9139](https://github.com/cli/cli/issues/9139) to support signing them.

### Windows

| Method | Install Command | Upgrade Command |
|--------|-----------------|-----------------|
| **WinGet** | `winget install --id GitHub.cli` | `winget upgrade --id GitHub.cli` |
| **Scoop** | `scoop install gh` | `scoop update gh` |
| **Chocolatey** | `choco install gh` | `choco upgrade gh` |

> **Note**: The Windows installer modifies your PATH. When using Windows Terminal, you will need to **open a new window** for the changes to take effect.

### Linux & BSD

`gh` is available via:
- Debian and RPM repositories (see [Linux installation guide](https://github.com/cli/cli/blob/trunk/docs/install_linux.md))
- Community-maintained repositories in various Linux distros
- OS-agnostic package managers (Homebrew, Conda, Spack, Webi)
- Precompiled binaries from [releases page](https://github.com/cli/cli/releases/latest)

### Development Environments

#### GitHub Codespaces
Add to your devcontainer file:
```json
"features": {
  "ghcr.io/devcontainers/features/github-cli:1": {}
}
```

#### GitHub Actions
GitHub CLI comes pre-installed in all GitHub-Hosted Runners.

## Project Structure

```
cli/cli/
├── cmd/           # Command definitions and CLI entry points
├── internal/      # Internal packages and core logic
├── pkg/           # Public packages
├── api/           # GitHub API client and utilities
├── context/       # Context management
├── git/           # Git operations and utilities
├── docs/          # Documentation files
├── test/          # Test files
├── acceptance/    # Acceptance tests
├── build/         # Build scripts and configurations
├── script/        # Development scripts
└── utils/         # Utility functions
```

## Architecture

### Core Components

1. **Command System**: Built using Cobra CLI framework
2. **API Client**: Custom GitHub API client with authentication
3. **Git Integration**: Direct integration with Git operations
4. **Configuration**: User preferences and authentication management
5. **Output Formatting**: Support for multiple output formats (table, JSON, etc.)

### Key Directories

- **`cmd/`**: Contains all CLI command definitions
- **`internal/`**: Core business logic and internal packages
- **`pkg/`**: Reusable packages that could be imported by other projects
- **`api/`**: GitHub API interaction layer
- **`git/`**: Git repository operations

## Documentation Files

The repository includes comprehensive documentation:

- **README.md**: Main project documentation with installation and usage
- **docs/project-layout.md**: Detailed project structure explanation
- **docs/source.md**: Building from source instructions
- **docs/gh-vs-hub.md**: Comparison with the legacy `hub` tool
- **docs/multiple-accounts.md**: Managing multiple GitHub accounts
- **docs/install_linux.md**: Linux installation details
- **docs/working-with-us.md**: Contributing guidelines for GitHub employees
- **docs/releasing.md**: Release process documentation
- **docs/codespaces.md**: GitHub Codespaces integration

## Security

### Binary Verification

Since version 2.50.0, `gh` produces [Build Provenance Attestation](https://github.blog/changelog/2024-06-25-artifact-attestations-is-generally-available/), enabling cryptographically verifiable paper-trail back to the origin.

**Option 1: Using existing `gh` installation:**
```shell
gh at verify -R cli/cli gh_2.62.0_macOS_arm64.zip
```

**Option 2: Using Sigstore cosign:**
```shell
cosign verify-blob-attestation --bundle cli-cli-attestation-3120304.sigstore.json \
    --new-bundle-format \
    --certificate-oidc-issuer="https://token.actions.githubusercontent.com" \
    --certificate-identity="https://github.com/cli/cli/.github/workflows/deployment.yml@refs/heads/trunk" \
    gh_2.62.0_macOS_arm64.zip
```

## Development

### Building from Source

Requirements:
- Go 1.19 or higher
- Git

Build steps are detailed in [docs/source.md](https://github.com/cli/cli/blob/trunk/docs/source.md).

### Release Process

The project follows a comprehensive release process documented in:
- **docs/releasing.md**: Overview of the release process
- **docs/release-process-deep-dive.md**: Detailed technical release procedures

## GitHub CLI vs Hub

GitHub CLI is the successor to the community `hub` tool:

- **`hub`**: Behaves as a proxy to `git`, wrapping git commands
- **`gh`**: Standalone tool with its own command structure
- **Design Philosophy**: `gh` provides a fundamentally different approach to GitHub CLI interaction

Detailed comparison available in [docs/gh-vs-hub.md](https://github.com/cli/cli/blob/trunk/docs/gh-vs-hub.md).

## Contributing

1. **Feedback & Issues**: Use the [contributing page](https://github.com/cli/cli/blob/trunk/.github/CONTRIBUTING.md)
2. **Bug Reports**: Submit via GitHub Issues
3. **Feature Requests**: Follow the contribution guidelines
4. **Pull Requests**: See contributing documentation for submission process

### For GitHub Employees

Internal contributors should check [docs/working-with-us.md](https://github.com/cli/cli/blob/trunk/docs/working-with-us.md) for internal contribution processes.

## Resources

- **Official Documentation**: https://cli.github.com/manual/
- **Repository**: https://github.com/cli/cli
- **Releases**: https://github.com/cli/cli/releases/latest
- **Issues**: https://github.com/cli/cli/issues
- **Discussions**: GitHub Discussions on the repository

## Usage Examples

```bash
# Clone a repository
gh repo clone owner/repo

# Create a pull request
gh pr create --title "My PR" --body "Description"

# View pull requests
gh pr list

# Create an issue
gh issue create --title "Bug report" --body "Description"

# View repository issues
gh issue list

# Fork a repository
gh repo fork owner/repo

# View workflow runs
gh run list
```

## Configuration

GitHub CLI stores configuration in:
- **Authentication**: Secure token storage
- **Preferences**: User-defined defaults and preferences
- **Multiple Accounts**: Support for multiple GitHub accounts

See [docs/multiple-accounts.md](https://github.com/cli/cli/blob/trunk/docs/multiple-accounts.md) for advanced account management.

---

*This documentation was generated using Octocode MCP tools by analyzing the GitHub CLI repository structure, documentation, and codebase.* 