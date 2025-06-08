# npm CLI - Complete Documentation

## Overview

**npm** (Node Package Manager) is the package manager for JavaScript and the world's largest software registry. The npm CLI is the official command-line interface for interacting with the npm registry, managing dependencies, and running scripts in JavaScript projects.

- **Repository**: [npm/cli](https://github.com/npm/cli)
- **Language**: JavaScript (Node.js)
- **License**: Artistic License 2.0
- **Current Version**: 11.4.1
- **Node.js Compatibility**: ^20.17.0 || >=22.9.0

## Table of Contents

1. [Features](#features)
2. [Installation](#installation)
3. [Key Architecture](#key-architecture)
4. [Core Commands](#core-commands)
5. [Workspaces](#workspaces)
6. [Configuration](#configuration)
7. [Security](#security)
8. [Development](#development)
9. [Enterprise Features](#enterprise-features)
10. [Resources](#resources)

## Features

### Core Package Management
- **Package Installation**: Install packages locally or globally
- **Dependency Management**: Automatic dependency resolution and installation
- **Version Management**: Semantic versioning support with flexible ranges
- **Lock Files**: Deterministic builds with `package-lock.json`
- **Workspaces**: Monorepo support for managing multiple packages

### Developer Experience
- **Script Running**: Execute package.json scripts with `npm run`
- **Publishing**: Publish packages to npm registry or private registries
- **Access Control**: Manage package permissions and team access
- **Audit**: Security vulnerability scanning and automatic fixes
- **Fund**: Support open source maintainers through funding information

### Advanced Features
- **Custom Registries**: Support for private and alternative registries
- **Scoped Packages**: Organization-level package namespacing
- **Two-Factor Authentication**: Enhanced security for publishing
- **Organizations**: Team collaboration and package management
- **Enterprise**: On-premises registry solutions

## Installation

### Bundled with Node.js
npm comes pre-installed with Node.js:

```bash
# Check npm version
npm --version

# Check Node.js version
node --version
```

### Direct Installation
```bash
# Install latest npm globally
curl -qL https://www.npmjs.com/install.sh | sh

# Or using npm itself
npm install -g npm@latest
```

### Node Version Managers
npm is automatically managed with Node.js version managers:

```bash
# Using nvm
nvm install node  # Installs latest Node.js + npm

# Using fnm
fnm install latest

# Using volta
volta install node
```

## Key Architecture

### Project Structure
```
npm/cli/
├── bin/                 # Executable scripts (npm-cli.js, npx-cli.js)
├── lib/                 # Core npm implementation
├── workspaces/         # Modular npm packages
├── docs/               # Documentation source
├── test/               # Test suites
├── mock-registry/      # Testing infrastructure
├── smoke-tests/        # Integration tests
└── package.json        # Main package configuration
```

### Workspace Architecture
The npm CLI uses a monorepo structure with workspaces:

```json
{
  "workspaces": [
    "docs",
    "smoke-tests", 
    "mock-globals",
    "mock-registry",
    "workspaces/*"
  ]
}
```

### Key Dependencies
```json
{
  "@npmcli/arborist": "^9.1.1",        // Dependency tree management
  "@npmcli/config": "^10.3.0",         // Configuration system
  "@npmcli/run-script": "^9.1.0",      // Script execution
  "pacote": "^21.0.0",                 // Package fetching
  "cacache": "^19.0.1",                // Content-addressable cache
  "semver": "^7.7.2",                  // Semantic versioning
  "tar": "^6.2.1",                     // Tarball handling
  "which": "^5.0.0"                    // Binary path resolution
}
```

## Core Commands

### Package Management
```bash
# Install dependencies
npm install              # Install all dependencies
npm install package      # Install specific package
npm install -g package   # Install globally
npm install --save-dev   # Install as dev dependency

# Update packages
npm update               # Update all packages
npm update package       # Update specific package
npm outdated            # Check for outdated packages

# Remove packages
npm uninstall package    # Remove package
npm uninstall -g package # Remove global package
```

### Package Information
```bash
# View package information
npm view package         # Show package metadata
npm info package         # Alias for view
npm list                 # List installed packages
npm list -g             # List global packages
npm search keyword       # Search registry for packages
```

### Publishing & Access
```bash
# Publishing
npm publish              # Publish to registry
npm publish --dry-run    # Test publish without uploading
npm unpublish package    # Remove from registry (limited time)

# Access control
npm owner add user pkg   # Add package owner
npm owner rm user pkg    # Remove package owner
npm access public pkg    # Make package public
npm access restricted    # Make package restricted
```

### Scripts & Execution
```bash
# Run scripts
npm run script-name      # Run package.json script
npm run                  # List available scripts
npm start               # Run "start" script
npm test                # Run "test" script
npm run build           # Common build script

# npx - package execution
npx package-name         # Execute package without installing
npx create-react-app     # Run create-* packages
npx -p pkg cmd          # Install package and run command
```

### Configuration
```bash
# View configuration
npm config list          # Show all configuration
npm config get key       # Get specific config value
npm config set key value # Set configuration value
npm config delete key    # Delete configuration

# Common configurations
npm config set registry https://registry.npmjs.org/
npm config set save-exact true
npm config set init-license MIT
```

## Workspaces

### Workspace Commands
```bash
# Run commands in workspaces
npm run test -w workspace-name        # Run in specific workspace
npm run test -ws                      # Run in all workspaces
npm run test -ws --if-present         # Run if script exists

# Install dependencies
npm install -w workspace-name         # Install in specific workspace
npm install -ws                       # Install in all workspaces

# List workspaces
npm workspaces list                   # Show all workspaces
npm workspaces list --json            # JSON format
```

### Workspace Configuration
```json
{
  "workspaces": [
    "packages/*",
    "apps/*",
    "tools/build-utils"
  ]
}
```

### Cross-Workspace Dependencies
```json
{
  "dependencies": {
    "@myorg/shared-utils": "workspace:*",
    "@myorg/ui-components": "workspace:^1.0.0"
  }
}
```

## Configuration

### Configuration Files
npm reads configuration from multiple sources (in order of precedence):

1. Command line flags: `npm install --save-dev`
2. Environment variables: `NPM_CONFIG_SAVE_DEV=true`
3. `.npmrc` files (project, user, global, built-in)
4. Default values

### Common .npmrc Settings
```ini
# Registry configuration
registry=https://registry.npmjs.org/
@myorg:registry=https://private-registry.com/

# Authentication
//registry.npmjs.org/:_authToken=${NPM_TOKEN}

# Package configuration
save-exact=true
engine-strict=true
fund=false
audit=false

# Cache and storage
cache=/custom/cache/path
prefix=/custom/global/path

# Proxy settings
proxy=http://proxy.company.com:8080
https-proxy=http://proxy.company.com:8080
```

### Environment Variables
```bash
# Authentication
export NPM_TOKEN="npm_xxxxxxxxxxxxxxxxxxxx"

# Registry
export NPM_CONFIG_REGISTRY="https://registry.npmjs.org/"

# Behavioral
export NPM_CONFIG_LOGLEVEL="info"
export NPM_CONFIG_PROGRESS="false"
export CI="true"  # Automatic CI detection
```

## Security

### Audit & Vulnerabilities
```bash
# Security audit
npm audit                    # Check for vulnerabilities
npm audit --audit-level high # Only show high/critical
npm audit fix               # Automatically fix issues
npm audit fix --force       # Force fixes (potentially breaking)

# Manual review
npm audit --json            # JSON output for tooling
npm audit signatures        # Verify package signatures
```

### Publishing Security
```bash
# Two-factor authentication
npm profile enable-2fa auth-and-writes  # Enable 2FA
npm profile disable-2fa                 # Disable 2FA

# Access tokens
npm token list              # List active tokens
npm token create           # Create new token
npm token revoke <id>      # Revoke token
```

### Package Verification
```bash
# Verify package integrity
npm pack                    # Create tarball for inspection
npm publish --dry-run       # Test publish without uploading

# Check package contents
npm pack package-name       # Download and pack
tar -tf package-name-*.tgz  # Inspect contents
```

## Development

### Building from Source
```bash
# Clone repository
git clone https://github.com/npm/cli.git
cd cli

# Install dependencies
npm install

# Run tests
npm test

# Build documentation
npm run build -w docs

# Link for development
npm link
```

### Testing
```bash
# Run test suite
npm test                    # All tests
npm run test:unit          # Unit tests only
npm run test:integration   # Integration tests

# Specific test files
npm test test/lib/install.js

# Test with coverage
npm test --coverage
```

### Development Scripts
```json
{
  "scripts": {
    "test": "tap",
    "test:nocolor": "CI=true tap -Rclassic", 
    "lint": "node . run eslint",
    "lintfix": "node . run eslint -- --fix",
    "dependencies": "node scripts/bundle-and-gitignore-deps.js",
    "licenses": "npx licensee --production --errors-only"
  }
}
```

## Enterprise Features

### Private Registries
```bash
# Configure private registry
npm config set @myorg:registry https://npm.company.com/
npm config set //npm.company.com/:_authToken TOKEN

# Publishing to private registry
npm publish --registry https://npm.company.com/
```

### Organization Management
```bash
# Organization commands
npm org ls myorg                    # List organization members
npm org add user myorg              # Add user to organization
npm org rm user myorg               # Remove user from organization

# Team management
npm team create myorg:developers    # Create team
npm team add myorg:developers user  # Add user to team
npm team rm myorg:developers user   # Remove user from team
```

### Enterprise Configuration
```ini
# Enterprise registry
registry=https://npm.enterprise.com/
strict-ssl=false
ca=-----BEGIN CERTIFICATE-----
...
-----END CERTIFICATE-----

# Corporate proxy
proxy=http://corporate-proxy:8080
https-proxy=http://corporate-proxy:8080
noproxy=localhost,127.0.0.1,.company.com
```

## Resources

### Official Documentation
- **Documentation**: https://docs.npmjs.com/
- **CLI Reference**: https://docs.npmjs.com/cli/
- **Repository**: https://github.com/npm/cli
- **Registry**: https://registry.npmjs.org/

### Community & Support
- **Issues**: https://github.com/npm/cli/issues
- **RFCs**: https://github.com/npm/rfcs
- **Discussions**: https://github.com/orgs/community/discussions/categories/npm
- **Status**: https://status.npmjs.org/
- **Support**: https://www.npmjs.com/support

### Learning Resources
- **npm Workbook**: Interactive tutorials and examples
- **Package.json Guide**: Complete package.json reference
- **Semantic Versioning**: Understanding version ranges
- **Publishing Guide**: Best practices for package publishing

### Development Tools
- **Status Board**: https://npm.github.io/statusboard/
- **Event Calendar**: Community calls and releases
- **Roadmap**: https://github.com/orgs/github/projects/4247/views/1?filterQuery=npm

### Package Ecosystem
- **Registry**: Over 2 million packages
- **Downloads**: Billions of downloads per week
- **Statistics**: https://npmcharts.com/
- **Trends**: Package popularity and usage metrics

### Best Practices

#### Package.json Structure
```json
{
  "name": "@org/package-name",
  "version": "1.0.0",
  "description": "Brief package description",
  "main": "index.js",
  "exports": {
    ".": "./index.js",
    "./utils": "./lib/utils.js"
  },
  "scripts": {
    "test": "jest",
    "build": "webpack",
    "prepare": "husky install"
  },
  "dependencies": {},
  "devDependencies": {},
  "peerDependencies": {},
  "engines": {
    "node": ">=18.0.0",
    "npm": ">=8.0.0"
  },
  "files": [
    "lib/",
    "index.js",
    "README.md"
  ]
}
```

#### Security Best Practices
- Use `npm audit` regularly
- Pin dependency versions in production
- Use `.npmignore` to exclude sensitive files
- Enable 2FA for publishing
- Review dependencies before adding
- Use `npm ci` in CI/CD pipelines

#### Performance Optimization
- Use `npm ci` for faster, reliable installs
- Configure appropriate cache settings
- Use `--production` flag for production builds
- Leverage workspaces for monorepos
- Consider `pnpm` or `yarn` for alternative package managers

---

*This documentation covers npm CLI as of version 11.4.1. For the most current information, refer to the official npm documentation at docs.npmjs.com.* 