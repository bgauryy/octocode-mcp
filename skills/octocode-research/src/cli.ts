#!/usr/bin/env node
import { exit } from 'process';

// Use global fetch (Node 18+) or dynamic import for compatibility
const fetch = global.fetch;

// Simple color codes for Agent/Human readability
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

const PORT = 1987;
const BASE_URL = `http://localhost:${PORT}`;

interface CliArgs {
  endpoint: string;
  params: Record<string, string>;
  options: {
    json: boolean;
    quiet: boolean;
    help: boolean;
  };
}

function parseArgs(args: string[]): CliArgs {
  const result: CliArgs = {
    endpoint: '',
    params: {},
    options: {
      json: false,
      quiet: false,
      help: false,
    },
  };

  const cleanArgs = args.slice(2); // Skip node and script path

  for (const arg of cleanArgs) {
    if (arg.startsWith('--')) {
      const opt = arg.slice(2);
      if (opt === 'json') result.options.json = true;
      if (opt === 'quiet') result.options.quiet = true;
      if (opt === 'help') result.options.help = true;
      continue;
    }

    if (arg.includes('=')) {
      const [key, value] = arg.split('=');
      if (key && value) {
        result.params[key] = value;
      }
      continue;
    }

    if (!result.endpoint && !arg.startsWith('-')) {
      result.endpoint = arg;
    }
  }

  // Normalize endpoint
  if (result.endpoint && !result.endpoint.startsWith('/')) {
    result.endpoint = '/' + result.endpoint;
  }

  return result;
}

function printUsage() {
  console.log(`
${colors.bold}Octocode Research CLI${colors.reset}

${colors.bold}Usage:${colors.reset}
  ./cli <command> [params...] [options]

${colors.bold}Commands:${colors.reset}
  ${colors.cyan}tools${colors.reset}           List available tools
  ${colors.cyan}prompts${colors.reset}         List available prompts
  ${colors.cyan}system${colors.reset}          Get system prompt
  ${colors.cyan}health${colors.reset}          Server health check
  ${colors.cyan}search${colors.reset}          Code search (localSearchCode)
  ${colors.cyan}read${colors.reset}            Read file (localGetFileContent)

${colors.bold}Examples:${colors.reset}
  ./cli tools
  ./cli search pattern="auth" path="src"
  ./cli read path="src/server.ts"
  ./cli /githubSearchCode owner="facebook" repo="react" keywords="hook"

${colors.bold}Options:${colors.reset}
  --json    Output raw JSON (preferred for Agents)
  --quiet   Suppress headers
`);
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.options.help || !args.endpoint) {
    printUsage();
    exit(0);
  }

  // Shortcut aliases
  const aliases: Record<string, string> = {
    '/tools': '/tools/list',
    '/prompts': '/prompts/list',
    '/system': '/tools/system',
    '/search': '/localSearchCode',
    '/read': '/localGetFileContent',
    '/find': '/localFindFiles',
    '/structure': '/localViewStructure'
  };

  const finalEndpoint = aliases[args.endpoint] || args.endpoint;

  const url = new URL(finalEndpoint, BASE_URL);
  for (const [key, val] of Object.entries(args.params)) {
    url.searchParams.set(key, val);
  }

  try {
    if (!args.options.quiet) {
      console.error(`${colors.dim}connecting to ${url.toString()}...${colors.reset}`);
    }

    const res = await fetch(url.toString());
    
    if (!res.ok) {
      console.error(`${colors.red}Error ${res.status}: ${res.statusText}${colors.reset}`);
      const text = await res.text();
      try {
        console.error(JSON.stringify(JSON.parse(text), null, 2));
      } catch {
        console.error(text);
      }
      exit(1);
    }

    const data = await res.json();

    if (args.options.json) {
      console.log(JSON.stringify(data, null, 2));
    } else {
      // Human-friendly output logic could go here
      // For now, default to JSON as it's most precise
      console.log(JSON.stringify(data, null, 2));
    }

  } catch (err) {
    console.error(`${colors.red}Failed to connect to server at ${BASE_URL}${colors.reset}`);
    console.error(`Ensure server is running: ${colors.bold}npm run server:start${colors.reset}`);
    if (err instanceof Error) {
      console.error(`${colors.dim}${err.message}${colors.reset}`);
    }
    exit(1);
  }
}

main();
