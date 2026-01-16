/**
 * getToolsInfo.ts - Async script to get information about available tools
 * 
 * Usage:
 *   npx tsx scripts/getToolsInfo.ts [tool-name] [--schema] [--hints]
 * 
 * Examples:
 *   npx tsx scripts/getToolsInfo.ts                    # List all tools
 *   npx tsx scripts/getToolsInfo.ts localSearchCode    # Get specific tool info
 *   npx tsx scripts/getToolsInfo.ts --schema           # Include schema for all
 *   npx tsx scripts/getToolsInfo.ts githubSearchCode --hints  # Include hints
 * 
 * Can also be imported as a module:
 *   import { getToolsInfo, getToolInfo } from './scripts/getToolsInfo.js';
 *   const info = await getToolsInfo();
 */

import { loadToolContent, initialize } from 'octocode-mcp/public';
import type { CompleteMetadata } from 'octocode-mcp/public';

// ============================================================================
// Types
// ============================================================================

export interface ToolSummary {
  name: string;
  description: string;
}

export interface ToolDetail extends ToolSummary {
  schema?: Record<string, string>;
  hints?: {
    hasResults: readonly string[];
    empty: readonly string[];
  };
}

export interface ToolsInfoResult {
  totalTools: number;
  toolNames: string[];
  tools: ToolSummary[] | ToolDetail[];
  baseHints?: {
    hasResults: readonly string[];
    empty: readonly string[];
  };
  genericErrorHints?: readonly string[];
}

export interface GetToolsInfoOptions {
  includeSchema?: boolean;
  includeHints?: boolean;
  toolName?: string;
}

// ============================================================================
// Public API Functions
// ============================================================================

/**
 * Get information about all available tools
 * @param options - Options for what information to include
 * @returns Promise with tool information
 */
export async function getToolsInfo(options: GetToolsInfoOptions = {}): Promise<ToolsInfoResult> {
  await initialize();
  const content = await loadToolContent();
  
  const { includeSchema = false, includeHints = false } = options;
  
  const toolNames = Object.keys(content.tools);
  const tools = toolNames.map(name => {
    const tool = content.tools[name];
    const result: ToolDetail = {
      name: tool.name,
      description: tool.description,
    };
    
    if (includeSchema) {
      result.schema = tool.schema;
    }
    
    if (includeHints) {
      result.hints = {
        hasResults: tool.hints.hasResults,
        empty: tool.hints.empty,
      };
    }
    
    return result;
  });
  
  const result: ToolsInfoResult = {
    totalTools: toolNames.length,
    toolNames,
    tools,
  };
  
  if (includeHints) {
    result.baseHints = content.baseHints;
    result.genericErrorHints = content.genericErrorHints;
  }
  
  return result;
}

/**
 * Get information about a specific tool
 * @param toolName - Name of the tool to get info for
 * @param options - Options for what information to include
 * @returns Promise with tool information or null if not found
 */
export async function getToolInfo(
  toolName: string,
  options: Omit<GetToolsInfoOptions, 'toolName'> = {}
): Promise<ToolDetail | null> {
  await initialize();
  const content = await loadToolContent();
  
  const tool = content.tools[toolName];
  if (!tool) {
    return null;
  }
  
  const { includeSchema = true, includeHints = true } = options;
  
  const result: ToolDetail = {
    name: tool.name,
    description: tool.description,
  };
  
  if (includeSchema) {
    result.schema = tool.schema;
  }
  
  if (includeHints) {
    result.hints = {
      hasResults: tool.hints.hasResults,
      empty: tool.hints.empty,
      };
  }
  
  return result;
}

/**
 * Get the raw complete metadata (for advanced use cases)
 * @returns Promise with complete metadata
 */
export async function getRawMetadata(): Promise<CompleteMetadata> {
  await initialize();
  return loadToolContent();
}

/**
 * List available tool names
 * @returns Promise with array of tool names
 */
export async function listToolNames(): Promise<string[]> {
  await initialize();
  const content = await loadToolContent();
  return Object.keys(content.tools);
}

// ============================================================================
// CLI Interface
// ============================================================================

function printUsage(): void {
  console.log(`
Usage: npx tsx scripts/getToolsInfo.ts [tool-name] [options]

Options:
  --schema    Include schema information for tools
  --hints     Include hints for tools
  --json      Output as JSON (default is human-readable)
  --help      Show this help message

Examples:
  npx tsx scripts/getToolsInfo.ts                        # List all tools
  npx tsx scripts/getToolsInfo.ts localSearchCode        # Get specific tool
  npx tsx scripts/getToolsInfo.ts --schema               # All tools with schema
  npx tsx scripts/getToolsInfo.ts githubSearchCode --hints --json
`);
}

function formatToolInfo(tool: ToolDetail, includeSchema: boolean, includeHints: boolean): string {
  const lines: string[] = [];
  lines.push(`📦 ${tool.name}`);
  lines.push(`   ${tool.description}`);
  
  if (includeSchema && tool.schema) {
    lines.push('   Schema:');
    for (const [key, value] of Object.entries(tool.schema)) {
      const truncated = value.length > 100 ? value.slice(0, 100) + '...' : value;
      lines.push(`     • ${key}: ${truncated}`);
    }
  }
  
  if (includeHints && tool.hints) {
    if (tool.hints.hasResults.length > 0) {
      lines.push('   Hints (hasResults):');
      tool.hints.hasResults.slice(0, 3).forEach(h => lines.push(`     ✓ ${h}`));
    }
    if (tool.hints.empty.length > 0) {
      lines.push('   Hints (empty):');
      tool.hints.empty.slice(0, 3).forEach(h => lines.push(`     ⚠ ${h}`));
    }
  }
  
  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  // Parse flags
  const flags = {
    schema: args.includes('--schema'),
    hints: args.includes('--hints'),
    json: args.includes('--json'),
    help: args.includes('--help'),
  };
  
  if (flags.help) {
    printUsage();
    process.exit(0);
  }
  
  // Get tool name (first non-flag argument)
  const toolName = args.find(a => !a.startsWith('--'));
  
  try {
    if (toolName) {
      // Get specific tool info
      const info = await getToolInfo(toolName, {
        includeSchema: flags.schema || true,  // Default to true for specific tool
        includeHints: flags.hints || true,
      });
      
      if (!info) {
        console.error(`❌ Tool not found: ${toolName}`);
        const names = await listToolNames();
        console.error(`Available tools: ${names.join(', ')}`);
        process.exit(1);
      }
      
      if (flags.json) {
        console.log(JSON.stringify(info, null, 2));
      } else {
        console.log(formatToolInfo(info, true, true));
      }
    } else {
      // Get all tools info
      const info = await getToolsInfo({
        includeSchema: flags.schema,
        includeHints: flags.hints,
      });
      
      if (flags.json) {
        console.log(JSON.stringify(info, null, 2));
      } else {
        console.log(`\n🔧 Available Tools (${info.totalTools}):\n`);
        for (const tool of info.tools) {
          console.log(formatToolInfo(tool as ToolDetail, flags.schema, flags.hints));
          console.log();
        }
      }
    }
  } catch (error) {
    console.error('❌ Error loading tool info:', error);
    process.exit(1);
  }
}

// Run CLI if executed directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main();
}
