# GitHub CLI (gh) - Complete Documentation

## Overview

**GitHub CLI** (`gh`) is the official command-line tool for GitHub, bringing pull requests, issues, and other GitHub concepts directly to your terminal where you're already working with `git` and your code.

- **Repository**: [cli/cli](https://github.com/cli/cli)
- **Language**: Go (1.23.0+)
- **License**: MIT License
- **Current Version**: 2.x series
- **Platforms**: macOS, Windows, Linux, BSD

## Table of Contents

1. [Features](#features)
2. [Installation](#installation)
3. [Key Architecture](#key-architecture)
4. [Development Setup](#development-setup)
5. [Command Structure](#command-structure)
6. [API Integration](#api-integration)
7. [Extensions](#extensions)
8. [Security Features](#security-features)
9. [Contributing](#contributing)
10. [Resources](#resources)

## Features

### Core Functionality
- **Repository Management**: Create, clone, fork, and view repositories
- **Pull Requests**: Create, review, merge, and manage PRs from the terminal
- **Issues**: Create, view, edit, and manage GitHub issues
- **GitHub Actions**: View workflow runs, logs, and trigger actions
- **Releases**: Create and manage GitHub releases
- **Gists**: Create and manage GitHub gists
- **Authentication**: OAuth-based secure authentication with GitHub

### Advanced Features
- **GitHub Codespaces**: Create and manage cloud development environments
- **GitHub Pages**: Deploy and manage static sites
- **Organization Management**: Manage teams, repositories, and settings
- **Enterprise Support**: Works with GitHub Enterprise Cloud and Server (2.20+)
- **Extensions**: Extensible architecture for custom commands

## Installation

### Package Managers

#### macOS
```bash
# Homebrew (Recommended)
brew install gh
brew upgrade gh

# MacPorts
sudo port install gh
sudo port selfupdate && sudo port upgrade gh

# Conda
conda install gh --channel conda-forge

# Flox
flox install gh
```

#### Linux & BSD
```bash
# Debian/Ubuntu (via official repository)
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
sudo apt update
sudo apt install gh

# Homebrew on Linux
brew install gh

# Conda
conda install gh --channel conda-forge
```

#### Windows
```powershell
# WinGet
winget install --id GitHub.cli
winget upgrade --id GitHub.cli

# Scoop
scoop install gh
scoop update gh

# Chocolatey
choco install gh
choco upgrade gh
```

### Container Environments

#### GitHub Codespaces
```json
{
  "features": {
    "ghcr.io/devcontainers/features/github-cli:1": {}
  }
}
```

#### GitHub Actions
GitHub CLI comes pre-installed in all GitHub-hosted runners.

## Key Architecture

### Go Module Structure
```
github.com/cli/cli/v2
├── cmd/          # CLI command implementations
├── pkg/          # Public packages and libraries
├── internal/     # Internal packages
├── api/          # GitHub API client
├── context/      # Context management
├── git/          # Git integration
├── utils/        # Utility functions
├── test/         # Test files
└── docs/         # Documentation
```

### Key Dependencies
```go
// Core CLI framework
github.com/spf13/cobra v1.9.1

// GitHub API integration
github.com/shurcooL/githubv4 v0.0.0-20240120211514-18a1ae0e79dc

// Interactive UI components
github.com/charmbracelet/glamour v0.9.2
github.com/charmbracelet/huh v0.7.0
github.com/AlecAivazis/survey/v2 v2.3.7

// Authentication & security
github.com/cli/oauth v1.1.1
github.com/sigstore/sigstore-go v1.0.0
```

## Development Setup

### Prerequisites
- Go 1.23.0 or later
- Git
- Make (optional, but recommended)

### Building from Source
```bash
# Clone the repository
git clone https://github.com/cli/cli.git
cd cli

# Build the binary
make build

# Run tests
make test

# Install locally
make install
```

### Development Commands
```bash
# Run linting
make lint

# Run specific test
go test ./cmd/gh/...

# Build for all platforms
make cross
```

## Command Structure

### Authentication
```bash
# Login to GitHub
gh auth login

# Check authentication status
gh auth status

# Switch between accounts
gh auth switch

# Logout
gh auth logout
```

### Repository Operations
```bash
# Clone repository
gh repo clone owner/repo

# Create repository
gh repo create my-repo --public

# Fork repository
gh repo fork owner/repo

# View repository
gh repo view owner/repo
```

### Pull Requests
```bash
# Create PR
gh pr create --title "Title" --body "Description"

# List PRs
gh pr list

# View PR
gh pr view 123

# Merge PR
gh pr merge 123 --merge

# Review PR
gh pr review 123 --approve
```

### Issues
```bash
# Create issue
gh issue create --title "Bug report" --body "Description"

# List issues
gh issue list

# View issue
gh issue view 123

# Close issue
gh issue close 123
```

### GitHub Actions
```bash
# List workflow runs
gh run list

# View run details
gh run view 123456

# Download artifacts
gh run download 123456

# Trigger workflow
gh workflow run build.yml
```

## API Integration

### GraphQL API
GitHub CLI primarily uses GitHub's GraphQL API v4:

```go
// Example API call structure
type repository struct {
    Name        string
    Description string
    URL         string
    IsPrivate   bool
}

// Query execution
client := api.NewClient()
result, err := client.Query(ctx, &query, variables)
```

### REST API Fallback
For operations not available in GraphQL:

```go
// REST API client
client := api.NewRESTClient()
response, err := client.Request("GET", "repos/owner/repo", nil)
```

### Rate Limiting
- Automatically handles GitHub API rate limits
- Respects both GraphQL and REST API limits
- Intelligent retry with exponential backoff

## Extensions

### Installing Extensions
```bash
# Install from repository
gh extension install owner/gh-extension-name

# List installed extensions
gh extension list

# Upgrade extensions
gh extension upgrade --all

# Remove extension
gh extension remove extension-name
```

### Popular Extensions
- `gh-poi`: Enhanced issue management
- `gh-dash`: Dashboard for GitHub data
- `gh-copilot`: GitHub Copilot CLI integration
- `gh-deploy`: Deployment management

### Creating Extensions
Extensions can be written in any language:

```bash
#!/usr/bin/env bash
# gh-hello executable
echo "Hello from GitHub CLI extension!"
```

## Security Features

### Binary Verification
Since version 2.50.0, GitHub CLI produces Build Provenance Attestations:

```bash
# Verify binary with gh (if already installed)
gh at verify -R cli/cli gh_2.62.0_macOS_arm64.zip

# Verify with cosign
cosign verify-blob-attestation \
  --bundle cli-cli-attestation-3120304.sigstore.json \
  --new-bundle-format \
  --certificate-oidc-issuer="https://token.actions.githubusercontent.com" \
  --certificate-identity="https://github.com/cli/cli/.github/workflows/deployment.yml@refs/heads/trunk" \
  gh_2.62.0_macOS_arm64.zip
```

### Authentication Security
- OAuth-based authentication flow
- Secure credential storage using system keychain
- Support for SSH keys and personal access tokens
- Enterprise SSO compatibility

## Contributing

### Development Workflow
1. Fork the repository
2. Create a feature branch
3. Make changes with tests
4. Run linting and tests
5. Submit pull request

### Code Standards
- Go code follows standard formatting (`gofmt`)
- All public functions require documentation
- Tests required for new features
- CLI commands follow consistent patterns

### Testing
```bash
# Unit tests
make test

# Integration tests
make test-integration

# Acceptance tests
make acceptance
```

## Resources

### Official Documentation
- **Manual**: https://cli.github.com/manual/
- **Repository**: https://github.com/cli/cli
- **Releases**: https://github.com/cli/cli/releases

### Community
- **Discussions**: https://github.com/cli/cli/discussions
- **Issues**: https://github.com/cli/cli/issues
- **Contributing Guide**: https://github.com/cli/cli/blob/trunk/.github/CONTRIBUTING.md

### Comparison with Hub
GitHub CLI (`gh`) is the official successor to the community-maintained `hub` tool:
- **Architecture**: `hub` acts as a Git proxy, `gh` is a standalone tool
- **Scope**: `gh` has broader GitHub integration beyond Git operations
- **Maintenance**: `gh` is officially maintained by GitHub
- **Features**: `gh` includes modern GitHub features like Actions, Codespaces

### Enterprise Support
- GitHub Enterprise Cloud: Full support
- GitHub Enterprise Server: Requires version 2.20+
- Custom API endpoints supported
- Enterprise SSO integration

---

*This documentation covers GitHub CLI as of the latest version. For the most current information, refer to the official repository and documentation.* 