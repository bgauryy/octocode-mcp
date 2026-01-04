#!/usr/bin/env npx ts-node
/**
 * API Key Discovery Script
 *
 * Discovers API keys from various installed AI clients:
 * - Environment variables
 * - OS Keychain (Claude Code, etc.)
 * - Config files
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';

const HOME = homedir();
const IS_MAC = platform() === 'darwin';
const IS_WINDOWS = platform() === 'win32';
const IS_LINUX = platform() === 'linux';

// ANSI colors
const c = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
};

interface DiscoveryResult {
  source: string;
  provider: string;
  found: boolean;
  keyPreview?: string; // First/last few chars only
  location: string;
}

const results: DiscoveryResult[] = [];

function maskKey(key: string): string {
  if (key.length <= 12) return '****';
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

function log(icon: string, message: string): void {
  console.log(`  ${icon} ${message}`);
}

// ============================================
// 1. Environment Variables
// ============================================
function checkEnvironmentVariables(): void {
  console.log(`\n${c.bold}📋 Environment Variables${c.reset}`);

  const envVars = [
    { name: 'ANTHROPIC_API_KEY', provider: 'anthropic' },
    { name: 'CLAUDE_API_KEY', provider: 'anthropic' },
    { name: 'OPENAI_API_KEY', provider: 'openai' },
    { name: 'GOOGLE_API_KEY', provider: 'google' },
    { name: 'GEMINI_API_KEY', provider: 'google' },
    { name: 'MISTRAL_API_KEY', provider: 'mistral' },
    { name: 'GROQ_API_KEY', provider: 'groq' },
  ];

  for (const { name, provider } of envVars) {
    const value = process.env[name];
    if (value) {
      log(
        c.green + '✓' + c.reset,
        `${c.cyan}${name}${c.reset} = ${maskKey(value)}`
      );
      results.push({
        source: 'environment',
        provider,
        found: true,
        keyPreview: maskKey(value),
        location: `$${name}`,
      });
    } else {
      log(c.dim + '○' + c.reset, `${c.dim}${name} not set${c.reset}`);
    }
  }
}

// ============================================
// 2. OS Keychain (macOS)
// ============================================
interface ClaudeCodeCredentials {
  claudeAiOauth?: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    scopes: string[];
    subscriptionType?: string;
    rateLimitTier?: string;
  };
}

function checkClaudeCodeCredentials(): ClaudeCodeCredentials | null {
  if (!IS_MAC) return null;

  try {
    const result = execSync(
      `security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null`,
      { encoding: 'utf-8', timeout: 5000 }
    ).trim();

    if (result) {
      return JSON.parse(result) as ClaudeCodeCredentials;
    }
  } catch {
    return null;
  }
  return null;
}

function checkMacKeychain(): void {
  if (!IS_MAC) return;

  console.log(`\n${c.bold}🔐 macOS Keychain${c.reset}`);

  // First check Claude Code credentials (the main one!)
  const claudeCodeCreds = checkClaudeCodeCredentials();
  if (claudeCodeCreds?.claudeAiOauth) {
    const oauth = claudeCodeCreds.claudeAiOauth;
    const isExpired = oauth.expiresAt < Date.now();
    const expiresIn = Math.round((oauth.expiresAt - Date.now()) / 1000 / 60);

    log(
      c.green + '✓' + c.reset,
      `${c.cyan}Claude Code-credentials${c.reset} (OAuth Token)`
    );
    log('  ', `Token: ${maskKey(oauth.accessToken)}`);
    log(
      '  ',
      `Type: ${oauth.subscriptionType || 'unknown'} (${oauth.rateLimitTier || 'default'})`
    );
    log(
      '  ',
      isExpired
        ? `${c.red}EXPIRED${c.reset}`
        : `${c.green}Valid${c.reset} (expires in ${expiresIn} min)`
    );
    log('  ', `Scopes: ${oauth.scopes.join(', ')}`);

    results.push({
      source: 'keychain-oauth',
      provider: 'anthropic',
      found: true,
      keyPreview: maskKey(oauth.accessToken),
      location: 'Keychain: Claude Code-credentials',
    });
  }

  // Check Claude Desktop safe storage
  try {
    const result = execSync(
      `security find-generic-password -s "Claude Safe Storage" -w 2>/dev/null`,
      { encoding: 'utf-8', timeout: 5000 }
    ).trim();

    if (result) {
      log(
        c.green + '✓' + c.reset,
        `${c.cyan}Claude Safe Storage${c.reset} (Claude Desktop)`
      );
      log('  ', `Key: ${maskKey(result)}`);
      results.push({
        source: 'keychain',
        provider: 'anthropic',
        found: true,
        keyPreview: maskKey(result),
        location: 'Keychain: Claude Safe Storage',
      });
    }
  } catch {
    log(
      c.dim + '○' + c.reset,
      `${c.dim}Claude Safe Storage not found${c.reset}`
    );
  }

  // Check other services
  const keychainServices = [
    {
      service: 'anthropic-api-key',
      provider: 'anthropic',
      description: 'Anthropic API',
    },
    {
      service: 'openai-api-key',
      provider: 'openai',
      description: 'OpenAI API',
    },
    {
      service: 'octocode-cli',
      provider: 'anthropic',
      description: 'Octocode CLI',
    },
  ];

  for (const { service, provider, description } of keychainServices) {
    try {
      // Try to find any password for this service
      const result = execSync(
        `security find-generic-password -s "${service}" -w 2>/dev/null`,
        { encoding: 'utf-8', timeout: 5000 }
      ).trim();

      if (result) {
        log(
          c.green + '✓' + c.reset,
          `${c.cyan}${service}${c.reset} (${description}) = ${maskKey(result)}`
        );
        results.push({
          source: 'keychain',
          provider,
          found: true,
          keyPreview: maskKey(result),
          location: `Keychain: ${service}`,
        });
      }
    } catch {
      // Try listing all accounts for this service
      try {
        const listResult = execSync(
          `security find-generic-password -s "${service}" 2>&1 | grep "acct" || true`,
          { encoding: 'utf-8', timeout: 5000 }
        ).trim();

        if (listResult && listResult.includes('acct')) {
          log(
            c.yellow + '?' + c.reset,
            `${c.cyan}${service}${c.reset} (${description}) - found but can't read`
          );
        } else {
          log(c.dim + '○' + c.reset, `${c.dim}${service} not found${c.reset}`);
        }
      } catch {
        log(c.dim + '○' + c.reset, `${c.dim}${service} not found${c.reset}`);
      }
    }
  }
}

// ============================================
// 3. Windows Credential Manager
// ============================================
function checkWindowsCredentials(): void {
  if (!IS_WINDOWS) return;

  console.log(`\n${c.bold}🔐 Windows Credential Manager${c.reset}`);

  const targets = [
    { target: 'Claude Code', provider: 'anthropic' },
    { target: 'claude-code', provider: 'anthropic' },
  ];

  for (const { target, provider } of targets) {
    try {
      // Use cmdkey to list credentials
      const result = execSync(`cmdkey /list:${target} 2>nul`, {
        encoding: 'utf-8',
        timeout: 5000,
      });

      if (result && result.includes(target)) {
        log(
          c.green + '✓' + c.reset,
          `${c.cyan}${target}${c.reset} found in Credential Manager`
        );
        results.push({
          source: 'credential-manager',
          provider,
          found: true,
          location: `Credential Manager: ${target}`,
        });
      }
    } catch {
      log(c.dim + '○' + c.reset, `${c.dim}${target} not found${c.reset}`);
    }
  }
}

// ============================================
// 4. Config Files
// ============================================
function checkConfigFiles(): void {
  console.log(`\n${c.bold}📁 Config Files${c.reset}`);

  const appSupport = IS_MAC
    ? join(HOME, 'Library', 'Application Support')
    : IS_WINDOWS
      ? process.env.APPDATA || join(HOME, 'AppData', 'Roaming')
      : process.env.XDG_CONFIG_HOME || join(HOME, '.config');

  const configPaths = [
    {
      path: join(HOME, '.claude.json'),
      name: 'Claude Code config',
      provider: 'anthropic',
    },
    {
      path: join(appSupport, 'Claude', 'claude_desktop_config.json'),
      name: 'Claude Desktop config',
      provider: 'anthropic',
    },
    {
      path: join(HOME, '.cursor', 'mcp.json'),
      name: 'Cursor MCP config',
      provider: 'cursor',
    },
    {
      path: join(HOME, '.continue', 'config.json'),
      name: 'Continue config',
      provider: 'various',
    },
    {
      path: join(HOME, '.openai'),
      name: 'OpenAI config dir',
      provider: 'openai',
    },
  ];

  for (const { path: configPath, name, provider } of configPaths) {
    if (existsSync(configPath)) {
      log(c.green + '✓' + c.reset, `${c.cyan}${name}${c.reset}`);
      log('  ', `${c.dim}${configPath}${c.reset}`);

      // Try to read and check for API keys
      try {
        const content = readFileSync(configPath, 'utf-8');
        const hasApiKey = /api[_-]?key|apiKey|ANTHROPIC|OPENAI/i.test(content);
        if (hasApiKey) {
          log('  ', `${c.yellow}Contains API key references${c.reset}`);
        }
      } catch {
        // Can't read file
      }

      results.push({
        source: 'config-file',
        provider,
        found: true,
        location: configPath,
      });
    } else {
      log(c.dim + '○' + c.reset, `${c.dim}${name} not found${c.reset}`);
    }
  }
}

// ============================================
// 5. VS Code Extension Storage (Cline, etc.)
// ============================================
function checkVSCodeExtensions(): void {
  console.log(`\n${c.bold}🧩 VS Code Extensions${c.reset}`);

  const vsCodeGlobalStorage = IS_MAC
    ? join(
        HOME,
        'Library',
        'Application Support',
        'Code',
        'User',
        'globalStorage'
      )
    : IS_WINDOWS
      ? join(process.env.APPDATA || '', 'Code', 'User', 'globalStorage')
      : join(HOME, '.config', 'Code', 'User', 'globalStorage');

  const extensions = [
    { id: 'saoudrizwan.claude-dev', name: 'Cline', provider: 'anthropic' },
    {
      id: 'rooveterinaryinc.roo-cline',
      name: 'Roo-Cline',
      provider: 'anthropic',
    },
    { id: 'continue.continue', name: 'Continue', provider: 'various' },
    {
      id: 'anthropic.claude-vscode',
      name: 'Claude VS Code',
      provider: 'anthropic',
    },
  ];

  for (const { id, name, provider } of extensions) {
    const extPath = join(vsCodeGlobalStorage, id);
    if (existsSync(extPath)) {
      log(c.green + '✓' + c.reset, `${c.cyan}${name}${c.reset} (${id})`);
      log('  ', `${c.dim}${extPath}${c.reset}`);

      // Check for settings file
      const settingsPath = join(extPath, 'settings', 'cline_mcp_settings.json');
      if (existsSync(settingsPath)) {
        log('  ', `${c.yellow}Has MCP settings${c.reset}`);
      }

      results.push({
        source: 'vscode-extension',
        provider,
        found: true,
        location: extPath,
      });
    } else {
      log(c.dim + '○' + c.reset, `${c.dim}${name} not installed${c.reset}`);
    }
  }

  // Check for encrypted secrets database
  const secretsDb = join(vsCodeGlobalStorage, 'state.vscdb');
  if (existsSync(secretsDb)) {
    log(
      c.yellow + '!' + c.reset,
      `VS Code secrets database exists (encrypted)`
    );
    log('  ', `${c.dim}${secretsDb}${c.reset}`);
    log('  ', `${c.dim}Keys are encrypted with OS keychain${c.reset}`);
  }
}

// ============================================
// 6. Check using keytar (Node.js)
// ============================================
async function checkWithKeytar(): Promise<void> {
  console.log(`\n${c.bold}🔑 Keytar (Node.js)${c.reset}`);

  try {
    const keytar = await import('keytar');

    const services = [
      'Claude Code',
      'claude-code',
      'octocode-cli',
      'anthropic',
    ];

    for (const service of services) {
      try {
        const credentials = await keytar.findCredentials(service);
        if (credentials.length > 0) {
          for (const cred of credentials) {
            log(
              c.green + '✓' + c.reset,
              `${c.cyan}${service}${c.reset} / ${cred.account}`
            );
            log('  ', `Key: ${maskKey(cred.password)}`);
            results.push({
              source: 'keytar',
              provider: 'anthropic',
              found: true,
              keyPreview: maskKey(cred.password),
              location: `${service}/${cred.account}`,
            });
          }
        } else {
          log(
            c.dim + '○' + c.reset,
            `${c.dim}${service} - no credentials${c.reset}`
          );
        }
      } catch (err) {
        log(
          c.dim + '○' + c.reset,
          `${c.dim}${service} - error reading${c.reset}`
        );
      }
    }
  } catch (err) {
    log(c.red + '✗' + c.reset, `Keytar not available: ${err}`);
  }
}

// ============================================
// Main
// ============================================
async function main(): Promise<void> {
  console.log(
    `\n${c.bold}${c.cyan}╔════════════════════════════════════════════════════════════╗${c.reset}`
  );
  console.log(
    `${c.bold}${c.cyan}║${c.reset}          ${c.bold}API Key Discovery Script${c.reset}                         ${c.cyan}║${c.reset}`
  );
  console.log(
    `${c.bold}${c.cyan}║${c.reset}          Detecting keys from installed AI clients           ${c.cyan}║${c.reset}`
  );
  console.log(
    `${c.bold}${c.cyan}╚════════════════════════════════════════════════════════════╝${c.reset}`
  );

  console.log(
    `\n${c.dim}Platform: ${IS_MAC ? 'macOS' : IS_WINDOWS ? 'Windows' : 'Linux'}${c.reset}`
  );
  console.log(`${c.dim}Home: ${HOME}${c.reset}`);

  // Run all checks
  checkEnvironmentVariables();

  if (IS_MAC) {
    checkMacKeychain();
  } else if (IS_WINDOWS) {
    checkWindowsCredentials();
  }

  checkConfigFiles();
  checkVSCodeExtensions();
  await checkWithKeytar();

  // Summary
  console.log(
    `\n${c.bold}═══════════════════════════════════════════════════════════════${c.reset}`
  );
  console.log(`${c.bold}📊 Summary${c.reset}`);
  console.log(
    `${c.bold}═══════════════════════════════════════════════════════════════${c.reset}\n`
  );

  const foundResults = results.filter(r => r.found && r.keyPreview);
  const configsFound = results.filter(r => r.found && !r.keyPreview);

  if (foundResults.length > 0) {
    console.log(
      `  ${c.green}✓${c.reset} Found ${c.bold}${foundResults.length}${c.reset} API key(s):\n`
    );
    for (const r of foundResults) {
      console.log(
        `    • ${c.cyan}${r.provider}${c.reset} from ${r.source}: ${r.keyPreview}`
      );
    }
  } else {
    console.log(
      `  ${c.yellow}⚠${c.reset} No API keys found in accessible locations\n`
    );
  }

  if (configsFound.length > 0) {
    console.log(
      `\n  ${c.cyan}ℹ${c.reset} Found ${configsFound.length} config file(s) that may contain keys`
    );
  }

  console.log(
    `\n${c.dim}─────────────────────────────────────────────────────────────────${c.reset}`
  );
  console.log(
    `${c.dim}To use with Claude Agent SDK, ensure ANTHROPIC_API_KEY is set or${c.reset}`
  );
  console.log(
    `${c.dim}install Claude Code: npm install -g @anthropic-ai/claude-code${c.reset}`
  );
  console.log();
}

main().catch(console.error);
