/**
 * call.ts - Make API calls to the octocode-research server
 *
 * Usage:
 *   npx tsx scripts/call.ts <endpoint> [params...]
 *
 * Examples:
 *   npx tsx scripts/call.ts /health
 *   npx tsx scripts/call.ts /tools/system
 *   npx tsx scripts/call.ts /localViewStructure path=. depth=2
 *   npx tsx scripts/call.ts /githubSearchCode 'queries=[{"keywordsToSearch":["useState"],"owner":"facebook","repo":"react"}]'
 *
 * Research params (auto-added if not specified):
 *   mainResearchGoal=<goal>
 *   researchGoal=<goal>
 *   reasoning=<why>
 */

import { colors, log, BASE_URL, handleConnectionError } from './common.js';

function parseParams(args: string[]): Record<string, string> {
  const params: Record<string, string> = {};

  for (const arg of args) {
    const eqIndex = arg.indexOf('=');
    if (eqIndex > 0) {
      const key = arg.slice(0, eqIndex);
      const value = arg.slice(eqIndex + 1);
      params[key] = value;
    }
  }

  return params;
}

function buildUrl(endpoint: string, params: Record<string, string>): string {
  const url = new URL(endpoint.startsWith('/') ? endpoint : `/${endpoint}`, BASE_URL);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

function formatResponse(data: unknown): string {
  if (typeof data === 'string') {
    return data;
  }

  // Handle MCP-style content responses
  if (data && typeof data === 'object' && 'content' in data) {
    const content = (data as { content: unknown[] }).content;
    if (Array.isArray(content)) {
      const textParts: string[] = [];
      for (const item of content) {
        if (item && typeof item === 'object' && 'type' in item && item.type === 'text' && 'text' in item) {
          textParts.push(item.text as string);
        }
      }
      if (textParts.length > 0) {
        return textParts.join('\n\n');
      }
    }
  }

  return JSON.stringify(data, null, 2);
}

function printUsage(): void {
  console.log(`
${colors.bold}Usage:${colors.reset}
  npx tsx scripts/call.ts <endpoint> [params...]

${colors.bold}Examples:${colors.reset}
  ${colors.dim}# Discovery endpoints${colors.reset}
  npx tsx scripts/call.ts /health
  npx tsx scripts/call.ts /tools/system
  npx tsx scripts/call.ts /tools/list
  npx tsx scripts/call.ts /prompts/list

  ${colors.dim}# Local research${colors.reset}
  npx tsx scripts/call.ts /localViewStructure path=. depth=2
  npx tsx scripts/call.ts /localSearchCode pattern=useState path=src

  ${colors.dim}# GitHub research${colors.reset}
  npx tsx scripts/call.ts /githubViewRepoStructure owner=facebook repo=react depth=2

${colors.bold}Options:${colors.reset}
  --json    Output raw JSON
  --quiet   Suppress headers, output only response
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const quiet = args.includes('--quiet');
  const filteredArgs = args.filter(a => !a.startsWith('--'));

  const endpoint = filteredArgs[0];

  if (!endpoint || args.includes('--help')) {
    printUsage();
    process.exit(endpoint ? 0 : 1);
  }

  const params = parseParams(filteredArgs.slice(1));
  const url = buildUrl(endpoint, params);

  if (!quiet) {
    console.log();
    log('🌐', `GET ${endpoint}`, colors.cyan);
    if (Object.keys(params).length > 0) {
      console.log(`${colors.dim}   Params: ${JSON.stringify(params)}${colors.reset}`);
    }
    console.log(`${colors.dim}─────────────────────────────────────────${colors.reset}`);
  }

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok) {
    if (!quiet) {
      log('❌', `Error ${response.status}`, colors.red);
    }
    console.log(formatResponse(data));
    process.exit(1);
  }

  if (asJson) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log(formatResponse(data));
  }

  if (!quiet) {
    console.log();
  }
}

main().catch(handleConnectionError);
