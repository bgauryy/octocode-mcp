# NPM CLI Documentation

*Generated using Octocode MCP - Advanced Code Analysis Assistant*

## Overview

**NPM CLI** is the package manager for JavaScript and the command-line interface for the npm registry. It's the official tool for managing JavaScript packages, dependencies, and project lifecycle operations.

**Repository**: https://github.com/npm/cli
**Language**: JavaScript (Node.js)
**License**: Artistic License 2.0
**Default Branch**: latest

## Key Features

- **Package Management**: Install, update, and remove JavaScript packages
- **Dependency Resolution**: Advanced dependency management and resolution
- **Registry Interaction**: Direct integration with the npm registry
- **Workspace Management**: Support for monorepos and workspaces
- **Script Execution**: Run package scripts and lifecycle hooks
- **Version Management**: Semantic versioning and release management
- **Security**: Built-in security audit and vulnerability scanning

## Installation

### Bundled with Node.js

NPM comes bundled with Node.js by default. Most third-party distributions include npm.

**Official Downloads**: https://nodejs.org/en/download

### Direct Installation

```bash
curl -qL https://www.npmjs.com/install.sh | sh
```

### Node Version Managers

For managing multiple versions of Node.js and npm, consider using a [node version manager](https://github.com/search?q=node+version+manager+archived%3Afalse&type=repositories&ref=advsearch).

### Requirements

- Currently supported version of Node.js
- See [Node.js releases](https://nodejs.org/en/about/previous-releases) for compatibility

## Project Structure

```
npm/cli/
├── bin/               # CLI entry points
├── lib/               # Core library code
├── workspaces/        # Workspace packages
├── docs/              # Documentation
├── test/              # Test suites
├── scripts/           # Development and build scripts
├── smoke-tests/       # Smoke testing
├── mock-registry/     # Mock registry for testing
├── mock-globals/      # Global mocks for testing
├── tap-snapshots/     # Test snapshots
├── package.json       # Main package configuration
├── package-lock.json  # Dependency lock file
├── CHANGELOG.md       # Version history
├── CONTRIBUTING.md    # Contribution guidelines
├── DEPENDENCIES.md    # Dependency documentation
└── SECURITY.md        # Security policy
```

## Architecture

### Core Components

1. **Command System**: Modular command architecture
2. **Registry Client**: HTTP client for npm registry communication
3. **Dependency Resolver**: Advanced algorithm for dependency resolution
4. **Package Installer**: File system operations for package installation
5. **Workspace Manager**: Monorepo and workspace support
6. **Audit System**: Security vulnerability scanning
7. **Configuration**: User and project-level configuration management

### Key Directories

- **`lib/`**: Core npm functionality and command implementations
- **`bin/`**: Executable entry points for the CLI
- **`workspaces/`**: Related packages in the npm ecosystem
- **`test/`**: Comprehensive test suite
- **`docs/`**: Documentation and help files

## Configuration

NPM uses multiple configuration sources:
- **Project-level**: `.npmrc` in project root
- **User-level**: `~/.npmrc` in user home directory
- **Global**: System-wide configuration
- **Environment Variables**: `NPM_*` prefixed variables

## Basic Usage

```bash
# Basic npm command structure
npm <command>

# Install dependencies
npm install

# Install a package
npm install package-name

# Install globally
npm install -g package-name

# Update packages
npm update

# Run scripts
npm run script-name

# Publish package
npm publish

# Search packages
npm search keyword
```

## Key Commands

### Package Installation
- `npm install` - Install dependencies from package.json
- `npm install <package>` - Install specific package
- `npm install <package>@<version>` - Install specific version
- `npm install -g <package>` - Install globally
- `npm install --save-dev <package>` - Install as dev dependency

### Package Information
- `npm list` - List installed packages
- `npm outdated` - Check for outdated packages
- `npm view <package>` - View package information
- `npm search <term>` - Search npm registry

### Project Management
- `npm init` - Initialize new package
- `npm run <script>` - Run package script
- `npm test` - Run test script
- `npm start` - Run start script
- `npm version <level>` - Bump version

### Publishing
- `npm publish` - Publish package to registry
- `npm unpublish` - Remove package from registry
- `npm deprecate` - Deprecate package version

### Security
- `npm audit` - Run security audit
- `npm audit fix` - Automatically fix vulnerabilities

## Workspace Support

NPM supports workspaces for monorepo management:

```json
{
  "workspaces": [
    "packages/*",
    "apps/*"
  ]
}
```

Commands with workspace support:
- `npm install --workspace=<workspace-name>`
- `npm run test --workspaces`
- `npm publish --workspaces`

## Documentation Files

The repository includes extensive documentation:

- **README.md**: Main project overview and links
- **CONTRIBUTING.md**: Contribution guidelines and development setup
- **CHANGELOG.md**: Detailed version history and changes
- **DEPENDENCIES.md**: Comprehensive dependency documentation
- **SECURITY.md**: Security policy and vulnerability reporting
- **CODE_OF_CONDUCT.md**: Community code of conduct

## Development

### Building from Source

Requirements:
- Node.js (current supported version)
- Git

```bash
git clone https://github.com/npm/cli.git
cd cli
npm install
npm run test
```

### Testing

NPM includes comprehensive testing:
- **Unit Tests**: Located in `test/` directory
- **Smoke Tests**: Located in `smoke-tests/` directory
- **Mock Registry**: For testing registry interactions
- **Tap Snapshots**: Test result snapshots

### Release Process

NPM uses automated release management:
- **release-please**: Automated release and changelog generation
- **Semantic Versioning**: Follows semver for version management
- **CI/CD**: Automated testing and publishing

## Configuration Options

### Registry Configuration
```bash
npm config set registry https://registry.npmjs.org/
npm config set @scope:registry https://npm.pkg.github.com/
```

### Authentication
```bash
npm login
npm logout
npm whoami
```

### Package Installation Behavior
```bash
npm config set save-exact true
npm config set package-lock false
npm config set audit false
```

## Security Features

### Audit System
- **Vulnerability Scanning**: Automatic scanning of dependencies
- **Fix Suggestions**: Automated fixes for known vulnerabilities
- **Security Advisories**: Integration with npm security database

### Package Verification
- **Integrity Checking**: Subresource integrity for packages
- **Signature Verification**: Package signature validation
- **Lock Files**: Deterministic dependency resolution

## Resources

### Official Resources
- **Documentation**: https://docs.npmjs.com/
- **Registry**: https://www.npmjs.com/
- **Bug Tracker**: https://github.com/npm/cli/issues
- **Roadmap**: https://github.com/orgs/github/projects/4247/views/1?filterQuery=npm
- **Service Status**: https://status.npmjs.org/

### Community
- **Discussions**: https://github.com/orgs/community/discussions/categories/npm
- **RFCs**: https://github.com/npm/rfcs
- **Events Calendar**: Community events and meetings
- **Support**: https://www.npmjs.com/support

## Registry Information

### Default Registry
- **URL**: https://registry.npmjs.org
- **Terms**: https://npmjs.com/policies/terms
- **Third-party registries**: Can be configured as alternatives

### Registry Operations
- **Publishing**: Package publication to registry
- **Downloading**: Package retrieval and caching
- **Metadata**: Package information and statistics
- **Search**: Package discovery and search

## FAQ

### Branding
- **Correct Usage**: "npm" (lowercase, not capitalized unless in title case)
- **Not an Acronym**: npm is not "Node Package Manager"
- **Recursive Definition**: "npm is not an acronym"
- **Historical Context**: Evolved from "pm" (pkgmakeinst)

### Common Issues
- **Permission Errors**: Use npx or configure npm prefix
- **Network Issues**: Configure proxy and registry settings
- **Version Conflicts**: Use npm ls to diagnose dependency issues
- **Cache Problems**: Clear cache with npm cache clean

## Acknowledgments

- **Registry**: Configured to use npm Public Registry by default
- **Terms**: Usage subject to Terms of Use at npmjs.com/policies/terms
- **Third-party Registries**: Can configure alternative compatible registries
- **Community**: Built and maintained by the npm community

---

*This documentation was generated using Octocode MCP tools by analyzing the NPM CLI repository structure, documentation, and codebase.* 