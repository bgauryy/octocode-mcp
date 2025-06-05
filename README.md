# Octocode MCP

<div >
  <img src="./assets/logo.png" alt="Wix Code Search MCP Logo" width="500" height="700">

  [![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](./package.json)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](./package.json)
[![MCP](https://img.shields.io/badge/MCP-Compatible-purple.svg)](https://modelcontextprotocol.io/)
</div>

A comprehensive MCP (Model Context Protocol) server for code discovery and analysis across multiple platforms. This server provides powerful search capabilities for both internal codebase and the broader GitHub ecosystem.

## What it Does

- 🔍 **Multi-Platform Code Search**: Search across GitHub repositories, commits, issues, and pull requests
- 📁 **Content Analysis**: Fetch complete file content and analyze NPM packages
- 🔐 **Secure Access**: Integrated authentication for GitHub and NPM
- ⚡ **Optimized Performance**: Built-in caching, rate limiting, and configurable results

## Table of Contents

- [Installation & Setup](#installation--setup)
- [Authentication](#authentication)
- [Features](#features)
- [Available Tools](#available-tools)
- [Usage Examples](#usage-examples)
- [Advanced Configuration](#advanced-configuration)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

## Installation & Setup

### Prerequisites

#### Required Software
- **Node.js**: Version 21 or higher
- **GitHub CLI**: For GitHub authentication and API access
- **NPM**: For package management and analysis


#### Install GitHub CLI & Login

```bash
# macOS
brew install gh
gh auth login

# Other platforms: https://github.com/cli/cli#installation
# Open authentication in web browser and complete login flow
```

#### Verify setup
   ```bash
   # Check versions
   node --version  # Should be 21+
   gh --version
   gh auth status  # Should show authenticated
   ```

#### Configure MCP Client:

   ```json
   {
     "name": "octocode-mcp",
     "command": "npx", 
     "args": ["octocode"]
   }
   ```

### NPM Configuration
Ensure your `.npmrc` files are properly configured
```bash
# Check NPM configuration
npm config list
npm whoami  # Verify authentication for private registries
```

### GitHub and NPM Access

This tool leverages your GitHub and NPM access to perform comprehensive searches across repositories and packages. By utilizing your authenticated sessions, it ensures that searches are conducted with the appropriate permissions and access levels, providing you with accurate and relevant results. Make sure your GitHub CLI and NPM configurations are correctly set up and authenticated to fully utilize these capabilities.

## Features

### For Developers
- **Code Discovery**: Find implementations, patterns, and examples across repositories
- **Cross-Repository Investigation**: Trace code patterns, dependencies, and implementations across multiple repositories
- **Dependency Analysis**: Understand package relationships and find alternative libraries
- **Deep Dependency Insights**: Map transitive dependencies, version conflicts, and security vulnerabilities
- **Bug Investigation**: Track issues, commits, and pull requests related to specific problems
- **Advanced Bug Hunting**: Correlate bugs across repositories, find recurring patterns, and trace root causes
- **Learning & Reference**: Access community discussions, documentation, and best practices
- **Architecture Understanding**: Explore repository structures and analyze codebases
- **Historical Code Analysis**: Understand code evolution through commit history and PR reviews

### For Engineering Managers
- **Repository Status Evaluation**: Assess the current status and health of repositories
- **Technology Assessment**: Evaluate libraries, frameworks, and tools adoption
- **Cross-Team Collaboration Analysis**: Track contributions, knowledge sharing, and code reuse patterns
- **Knowledge Management**: Discover internal resources, documentation, and established patterns
- **Competitive Analysis**: Research similar projects and industry trends
- **Risk & Compliance Management**: Identify security vulnerabilities, licensing issues, and maintenance gaps
- **Strategic Planning**: Analyze technology trends, migration patterns, and adoption metrics

## Available Tools

### Code & Repository Search
- **Search GitHub Code**: Find specific implementations, functions, and patterns
- **Repository Discovery**: Locate relevant projects and libraries by keywords
- **File Content Analysis**: Fetch complete source files with dependency tracking
- **Repository Structure**: Explore project organization and architecture

### Package & Dependency Management  
- **NPM Package Analysis**: Get detailed package information and metadata
- **NPM Registry Search**: Discover packages by functionality and keywords
- **Dependency Mapping**: Understand package relationships and alternatives

### Development History & Collaboration
- **Commit History**: Track code evolution and find specific changes
- **Pull Request Analysis**: Review implementation approaches and code quality
- **Issue Tracking**: Find bugs, feature requests, and community discussions
- **User & Organization Discovery**: Identify experts and active contributors

### Community & Knowledge
- **GitHub Discussions**: Access Q&A, tutorials, and community wisdom
- **Topic Exploration**: Discover trending technologies and ecosystems
- **Documentation Access**: Find READMEs, guides, and best practices

## Advanced Configuration

### Rate Limiting & Performance
- Built-in rate limiting prevents API quota exhaustion
- Configurable result limits for optimal performance
- Intelligent caching reduces redundant requests

### Authentication Management
- Seamless GitHub CLI integration
- NPM registry authentication support
- Organization-aware access control

## Best Practices

### Search Strategy
- **Start Broad**: Begin with general terms, then narrow down
- **Use Progressive Discovery**: Combine multiple tools for comprehensive understanding
- **Leverage Organizations**: Use your team's GitHub org for internal discovery
- **Cross-Reference Sources**: Combine code, issues, and discussions for complete context

### Performance Optimization
- Use specific repository filters when possible
- Combine related searches in single sessions
- Cache frequently accessed information
- Monitor API rate limits

## Troubleshooting

### Common Issues
- **Authentication Errors**: Verify `gh auth status` and NPM login
- **No Results**: Try broader search terms or different organizations
- **Rate Limiting**: Reduce search frequency or use more specific filters
- **Private Repository Access**: Ensure proper organization membership
- **NPX cache**: To reset the npx cache, you can manually delete the cache directory. The location of the npx cache can vary based on your operating system. Typically, it is located in the `.npm/_npx` directory within your home folder. You can remove this directory using a command like `rm -rf ~/.npm/_npx` on Unix-based systems or by deleting it through File Explorer on Windows.
### Misconfigured .npmrc File

A misconfigured `.npmrc` file can lead to various issues, such as authentication errors, incorrect registry settings, or unexpected behavior during package installations. Here's how you can check and troubleshoot your `.npmrc` file:

1. **Locate the .npmrc File**:
   - The `.npmrc` file can exist in multiple locations, affecting different scopes:
     - **Project-level**: Located in the root of your project directory.
     - **User-level**: Located in your home directory (`~/.npmrc`).
     - **Global-level**: Located in the global npm configuration directory.

2. **Check for Common Issues**:
   - **Registry URL**: Ensure the registry URL is correct. For example, it should be `https://registry.yarnpkg.com/` if using Yarn.
   - **Authentication Tokens**: Verify that authentication tokens are correctly set and not expired.
   - **Proxy Settings**: If you're behind a proxy, ensure proxy settings are correctly configured.
   - **Syntax Errors**: Check for any syntax errors or invalid entries.

3. **View Current Configuration**:
   - Use the following command to view the current npm configuration, including settings from all `.npmrc` files:
     ```bash
     npm config list
     ```

4. **Edit the .npmrc File**:
   - Open the `.npmrc` file in a text editor to make necessary corrections. Ensure that sensitive information, like tokens, is not exposed in version control.

5. **Test Configuration**:
   - After making changes, test the configuration by running a simple npm command, such as:
     ```bash
     yarn install
     ```
   - Ensure that the command executes without errors.

By following these steps, you can identify and resolve issues related to a misconfigured `.npmrc` file, ensuring smooth package management operations.

### Prefered models

### Support
For issues and feature requests, please use the internal Wix support channels

## License

MIT License - See [LICENSE](./LICENSE) for details.



