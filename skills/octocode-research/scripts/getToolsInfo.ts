/**
 * getToolsInfo.ts - Get tool information for agents
 *
 * Usage:
 *   npx tsx scripts/getToolsInfo.ts                    # List all tools (names + descriptions)
 *   npx tsx scripts/getToolsInfo.ts localSearchCode    # Get specific tool with full schema
 *   npx tsx scripts/getToolsInfo.ts --json             # Output as JSON (all tools, lightweight)
 *   npx tsx scripts/getToolsInfo.ts githubSearchCode --json  # Specific tool with full schema as JSON
 *
 * Flow:
 *   1. Use getToolsInfo() for initial discovery (names + short descriptions)
 *   2. Use getToolInfo(toolName) to get full schema BEFORE calling a tool
 *
 * Can also be imported as a module:
 *   import { getToolsInfo, getToolInfo } from './scripts/getToolsInfo.js';
 *   const info = await getToolsInfo();
 */

import { colors, BASE_URL, handleConnectionError } from './common.js';

// ============================================================================
// Types
// ============================================================================

/** Lightweight tool info returned by /tools/list */
export interface ToolSummary {
  name: string;
  description: string;
}

/** Full tool info returned by /tools/info/:toolName */
export interface ToolInfo {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  hints?: {
    hasResults: string[];
    empty: string[];
  };
}

export interface ToolsInfoResult {
  tools: ToolSummary[];
  _hint: string;
}

// ============================================================================
// API Functions
// ============================================================================

/** Fetch lightweight tool list (names + short descriptions) */
async function fetchToolsListFromAPI(): Promise<ToolSummary[]> {
  const response = await fetch(`${BASE_URL}/tools/list`);
  if (!response.ok) {
    throw new Error(`Failed to fetch tools: ${response.status}`);
  }
  const data = await response.json();
  return data.tools || [];
}

/** Fetch full tool info (description + schema + hints) */
async function fetchToolInfoFromAPI(toolName: string): Promise<ToolInfo | null> {
  const response = await fetch(`${BASE_URL}/tools/info/${toolName}`);
  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(`Failed to fetch tool info: ${response.status}`);
  }
  const data = await response.json();
  return data.data || null;
}

// ============================================================================
// Public API Functions
// ============================================================================

/**
 * Get concise list of all available tools (names + short descriptions)
 * Use this for initial discovery, then call getToolInfo() for full schema before using a tool.
 * @returns Promise with tool names and short descriptions
 */
export async function getToolsInfo(): Promise<ToolsInfoResult> {
  const tools = await fetchToolsListFromAPI();
  return {
    tools,
    _hint: 'Use getToolInfo(toolName) for full schema before calling',
  };
}

/**
 * Get FULL information about a specific tool (description + schema + hints)
 * ALWAYS call this before using a tool to understand its parameters!
 * @param toolName - Name of the tool to get info for
 * @returns Promise with full tool information or null if not found
 */
export async function getToolInfo(toolName: string): Promise<ToolInfo | null> {
  return fetchToolInfoFromAPI(toolName);
}

/**
 * List available tool names
 * @returns Promise with array of tool names
 */
export async function listToolNames(): Promise<string[]> {
  const tools = await fetchToolsListFromAPI();
  return tools.map((t) => t.name);
}

// ============================================================================
// CLI Interface
// ============================================================================

function printUsage(): void {
  console.log(`
${colors.bold}Usage:${colors.reset} npx tsx scripts/getToolsInfo.ts [tool-name] [options]

${colors.bold}Options:${colors.reset}
  --json      Output as JSON (for agent consumption)
  --help      Show this help message

${colors.bold}Examples:${colors.reset}
  npx tsx scripts/getToolsInfo.ts                        # List all tools
  npx tsx scripts/getToolsInfo.ts localSearchCode        # Get specific tool
  npx tsx scripts/getToolsInfo.ts --json                 # All tools as JSON
  npx tsx scripts/getToolsInfo.ts githubSearchCode --json # Tool with schema as JSON
`);
}

/** Format lightweight tool summary for display */
function formatToolSummary(tool: ToolSummary): string {
  return `${colors.cyan}📦 ${tool.name}${colors.reset}\n   ${colors.dim}${tool.description}${colors.reset}`;
}

/** Format full tool info with schema for display */
function formatToolFull(tool: ToolInfo): string {
  const lines: string[] = [];
  lines.push(`${colors.cyan}📦 ${tool.name}${colors.reset}`);

  // Show full description
  const firstLine = tool.description.split('\n')[0].replace(/^#+\s*/, '');
  lines.push(`   ${colors.dim}${firstLine}${colors.reset}`);

  // Show key parameters from schema
  const schema = tool.inputSchema as { properties?: Record<string, unknown> };
  if (schema.properties) {
    const queriesSchema = schema.properties.queries as {
      items?: { properties?: Record<string, { description?: string }> };
    };
    if (queriesSchema?.items?.properties) {
      const params = Object.entries(queriesSchema.items.properties)
        .filter(([key]) => !['mainResearchGoal', 'researchGoal', 'reasoning'].includes(key))
        .slice(0, 5);

      if (params.length > 0) {
        lines.push(`   ${colors.yellow}Key params:${colors.reset}`);
        for (const [key, value] of params) {
          const desc = value.description ? ` - ${value.description.slice(0, 60)}` : '';
          lines.push(`     ${colors.green}•${colors.reset} ${key}${colors.dim}${desc}${colors.reset}`);
        }
      }
    }
  }

  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Parse flags
  const flags = {
    json: args.includes('--json'),
    help: args.includes('--help'),
  };

  if (flags.help) {
    printUsage();
    process.exit(0);
  }

  // Get tool name (first non-flag argument)
  const toolName = args.find((a) => !a.startsWith('--'));

  if (toolName) {
    // Get specific tool info (FULL schema)
    const info = await getToolInfo(toolName);

    if (!info) {
      console.error(`❌ Tool not found: ${toolName}`);
      const names = await listToolNames();
      console.error(`Available tools: ${names.join(', ')}`);
      process.exit(1);
    }

    if (flags.json) {
      console.log(JSON.stringify(info, null, 2));
    } else {
      console.log();
      console.log(formatToolFull(info));
      console.log();
      console.log(`${colors.dim}Run with --json for full schema${colors.reset}`);
      console.log();
    }
  } else {
    // Get all tools info (lightweight - names + descriptions only)
    const info = await getToolsInfo();

    if (flags.json) {
      console.log(JSON.stringify(info, null, 2));
    } else {
      console.log(`\n${colors.bold}🔧 Available Tools (${info.tools.length})${colors.reset}\n`);
      for (const tool of info.tools) {
        console.log(formatToolSummary(tool));
        console.log();
      }
      console.log(`${colors.dim}Use: npx tsx scripts/getToolsInfo.ts <toolName> for full schema${colors.reset}`);
      console.log();
    }
  }
}

// Run CLI if executed directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch(handleConnectionError);
}
