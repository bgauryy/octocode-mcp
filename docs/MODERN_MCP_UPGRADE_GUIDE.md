# Modern MCP Server Upgrade Guide

## Overview

This guide shows how to upgrade your existing MCP server from the legacy `server.tool()` pattern to the modern `server.registerTool()` approach with rich annotations and advanced features.

## Key Benefits of Modern Approach

### 1. **Rich Annotations**
- **Priority-based results**: Control which content gets attention first
- **Audience targeting**: Direct content to users vs assistants
- **Categorization**: Organize content by type (error, success, metadata, etc.)
- **Custom metadata**: Add structured data for better processing

### 2. **Enhanced User Experience**
- **Context-aware responses**: Different priorities based on content relevance
- **Intelligent formatting**: Code snippets, suggestions, and metadata
- **Progressive disclosure**: High-priority content first, details later

### 3. **Better Tool Integration**
- **Structured responses**: Consistent format across all tools
- **Error handling**: Rich error context with severity levels
- **Performance tracking**: Built-in timing and metadata

## Migration Pattern

### Before (Legacy Pattern)
```typescript
export function registerOldTool(server: McpServer) {
  server.tool(
    TOOL_NAME,
    DESCRIPTION,
    { /* zod schema */ },
    {
      title: TOOL_NAME,
      description: DESCRIPTION,
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args) => {
      // Simple result
      return createResult(data, false);
    }
  );
}
```

### After (Modern Pattern)
```typescript
export function registerModernTool(server: McpServer) {
  server.registerTool(
    TOOL_NAME,
    {
      title: "Human-Readable Tool Name",
      description: DESCRIPTION,
      inputSchema: { /* zod schema object */ }
    },
    async (args) => {
      try {
        const result = await performOperation(args);
        
        return {
          content: [
            {
              type: "text",
              text: "Primary result",
              annotations: {
                priority: 0.9,
                audience: ["user"],
                category: "result"
              }
            },
            {
              type: "text", 
              text: "Technical details",
              annotations: {
                priority: 0.3,
                audience: ["assistant"],
                category: "metadata"
              }
            }
          ]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error: ${error.message}`,
            annotations: {
              priority: 1.0,
              audience: ["user", "assistant"],
              category: "error",
              severity: "high"
            }
          }]
        };
      }
    }
  );
}
```

## Annotation Categories & Best Practices

### Priority Levels (0.0 - 1.0)
- **1.0**: Critical errors, urgent warnings
- **0.9**: Primary results, important summaries
- **0.7**: Secondary results, relevant details
- **0.5**: Additional context, suggestions
- **0.3**: Tips, minor details
- **0.1**: Debug info, verbose metadata

### Audience Targeting
- **["user"]**: Information for end users
- **["assistant"]**: Technical details for AI processing
- **["user", "assistant"]**: Important for both

### Category Types
- **"result"**: Primary operation results
- **"error"**: Error messages and failures
- **"warning"**: Non-critical issues
- **"summary"**: Overview information
- **"metadata"**: Technical details
- **"suggestion"**: Helpful tips
- **"code_snippet"**: Code examples
- **"performance"**: Timing and metrics

## Real-World Examples

### 1. Enhanced GitHub Search
```typescript
// High-priority summary
{
  type: "text",
  text: `Found ${count} results for "${query}"`,
  annotations: {
    priority: 0.9,
    audience: ["user"],
    category: "summary",
    searchQuery: query,
    resultCount: count
  }
}

// Code snippet for assistant analysis
{
  type: "text",
  text: "```typescript\nfunction example() {}\n```",
  annotations: {
    priority: 0.6,
    audience: ["assistant"],
    category: "code_snippet",
    language: "typescript"
  }
}

// Low-priority suggestion
{
  type: "text", 
  text: "💡 Try using OR operators for broader results",
  annotations: {
    priority: 0.3,
    audience: ["user"],
    category: "suggestion",
    actionable: true
  }
}
```

### 2. Error Handling with Context
```typescript
// Critical error
{
  type: "text",
  text: "Authentication failed - GitHub CLI not configured",
  annotations: {
    priority: 1.0,
    audience: ["user", "assistant"],
    category: "error",
    severity: "critical",
    actionable: true,
    solution: "Run 'gh auth login' to authenticate"
  }
}

// Technical error details
{
  type: "text",
  text: `Command failed: ${command}\nExit code: ${exitCode}`,
  annotations: {
    priority: 0.4,
    audience: ["assistant"],
    category: "error",
    technical: true,
    command: command,
    exitCode: exitCode
  }
}
```

### 3. Performance Metadata
```typescript
{
  type: "text",
  text: `Operation completed in ${duration}ms`,
  annotations: {
    priority: 0.2,
    audience: ["assistant"],
    category: "performance",
    metrics: {
      duration: duration,
      itemsProcessed: count,
      cacheHit: wasCache
    }
  }
}
```

## Step-by-Step Migration

### Step 1: Update Individual Tools
1. Change `server.tool()` to `server.registerTool()`
2. Move schema from parameter to `inputSchema` property
3. Update return format to use `content` array
4. Add appropriate annotations

### Step 2: Add Enhanced Features
1. **Progress tracking** for long operations
2. **Context-aware priorities** based on content
3. **Rich error handling** with actionable suggestions
4. **Performance metadata** for optimization

### Step 3: Update Server Registration
```typescript
// Add to your main server file
import { registerEnhancedGitHubSearchTool } from './mcp/tools/enhanced_github_search.js';

function registerAllTools(server: McpServer) {
  // ... existing tools
  registerEnhancedGitHubSearchTool(server);
}
```

## Advanced Features to Consider

### 1. Progress Notifications
```typescript
// For long-running operations
server.notification("progress", {
  progressToken: "search-123",
  progress: 0.5,
  message: "Processing repositories..."
});
```

### 2. Resource Management
```typescript
server.registerResource(
  "search-results",
  new ResourceTemplate("search://results/{query}"),
  { title: "Search Results", description: "Cached search results" },
  async (uri) => {
    // Return cached search results
  }
);
```

### 3. Prompt Templates
```typescript
server.registerPrompt(
  "code-analysis",
  {
    title: "Code Analysis Prompt",
    description: "Template for analyzing code snippets"
  },
  async (args) => ({
    messages: [{
      role: "system",
      content: "Analyze this code for patterns and best practices..."
    }]
  })
);
```

## Testing Modern Tools

### Example Test Structure
```typescript
describe('Enhanced Tool', () => {
  it('should return annotated results', async () => {
    const result = await toolHandler({ query: "test" });
    
    expect(result.content).toHaveLength(3);
    expect(result.content[0].annotations.priority).toBe(0.9);
    expect(result.content[0].annotations.category).toBe("summary");
    expect(result.content[1].annotations.audience).toContain("assistant");
  });
  
  it('should handle errors with rich context', async () => {
    const result = await toolHandler({ invalid: "input" });
    
    expect(result.content[0].annotations.category).toBe("error");
    expect(result.content[0].annotations.severity).toBe("high");
    expect(result.content[0].annotations.priority).toBe(1.0);
  });
});
```

## Next Steps

1. **Start with one tool**: Pick your most-used tool and migrate it first
2. **Test thoroughly**: Ensure annotations work as expected
3. **Gather feedback**: See how the enhanced experience feels
4. **Migrate gradually**: Convert remaining tools one by one
5. **Add advanced features**: Progress tracking, resources, prompts

The modern MCP approach provides a much richer, more intelligent user experience while maintaining backward compatibility with your existing functionality. 