# Getting Started with @octocode/mcp

## Installation

Install via npm:

```bash
npm install @octocode/mcp
```

## Configuration

### GitHub Token Setup

@octocode/mcp requires a GitHub personal access token to interact with the GitHub API.

1. Create a GitHub personal access token at https://github.com/settings/tokens
2. Grant the following permissions:
   - `repo` (for private repositories)
   - `public_repo` (for public repositories)
   - `read:user` (for user information)

3. Set the token as an environment variable:

```bash
export GITHUB_TOKEN="your_token_here"
```

Or create a `.env` file:

```
GITHUB_TOKEN=your_token_here
```

### MCP Client Configuration

For Claude Desktop, add to your config file (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "octocode": {
      "command": "npx",
      "args": ["@octocode/mcp"],
      "env": {
        "GITHUB_TOKEN": "your_token_here"
      }
    }
  }
}
```

## Basic Usage

Once configured, you can use the MCP tools through your AI assistant:

### Search for Repositories

```
Search GitHub for TypeScript MCP servers
```

### Fetch File Contents

```
Get the contents of README.md from octocode/mcp repository
```

### View Repository Structure

```
Show me the directory structure of the src folder in octocode/mcp
```

### Search Code

```
Find all TypeScript files that import '@modelcontextprotocol/sdk'
```

### Search Pull Requests

```
Find open pull requests in the octocode/mcp repository
```

## Next Steps

- [Tools Reference](tools-reference.md) - Learn about available tools
- [API Reference](api-reference.md) - Detailed API documentation
- [Usage Examples](usage-examples.md) - Common use cases
