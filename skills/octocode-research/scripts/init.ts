/**
 * init.ts - Initialize the octocode-research server and load system prompt
 *
 * Usage:
 *   npx tsx scripts/init.ts [--json]
 *
 * This script:
 *   1. Starts the server (if not running) - with Node.js fallback
 *   2. Loads and displays the system prompt
 */

import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { colors, log, checkServerHealth, BASE_URL, handleConnectionError } from './common.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function startServerBash(): Promise<boolean> {
  const installScript = join(__dirname, '..', 'install.sh');
  
  return new Promise((resolve) => {
    const proc = spawn('bash', [installScript, 'start'], {
      cwd: join(__dirname, '..'),
      stdio: 'inherit',
    });

    proc.on('close', (code) => resolve(code === 0));
    proc.on('error', () => resolve(false));
  });
}

async function startServerNode(): Promise<boolean> {
  log('🔄', 'Trying Node.js fallback...', colors.yellow);
  
  return new Promise((resolve) => {
    const proc = spawn('npm', ['run', 'server:start'], {
      cwd: join(__dirname, '..'),
      stdio: 'inherit',
      shell: true,
    });

    proc.on('close', (code) => resolve(code === 0));
    proc.on('error', () => resolve(false));
  });
}

async function startServer(): Promise<void> {
  log('🚀', 'Starting server...', colors.cyan);

  // Try bash first, then Node.js fallback
  const bashSuccess = await startServerBash();
  
  if (!bashSuccess) {
    log('⚠️', 'Bash startup failed, trying Node.js fallback...', colors.yellow);
    const nodeSuccess = await startServerNode();
    
    if (!nodeSuccess) {
      throw new Error('Server failed to start (both bash and node failed)');
    }
  }
}

async function waitForServer(maxAttempts = 10): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    if (await checkServerHealth()) {
      return true;
    }
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

async function loadSystemPrompt(asJson: boolean): Promise<void> {
  log('📖', 'Loading system prompt...', colors.blue);

  const response = await fetch(`${BASE_URL}/tools/system`);

  if (!response.ok) {
    throw new Error(`Failed to load system prompt: ${response.status}`);
  }

  const data = await response.json();

  if (asJson) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log();
    log('✅', 'System Prompt Loaded', colors.green);
    console.log(`${colors.dim}─────────────────────────────────────────${colors.reset}`);

    if (data.content && Array.isArray(data.content)) {
      for (const item of data.content) {
        if (item.type === 'text') {
          console.log(item.text);
        }
      }
    } else if (typeof data === 'string') {
      console.log(data);
    } else {
      console.log(JSON.stringify(data, null, 2));
    }
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');

  console.log();
  log('🔧', 'Octocode Research - Initialization', colors.bold);
  console.log(`${colors.dim}─────────────────────────────────────────${colors.reset}`);

  // Check if server is already running
  const isRunning = await checkServerHealth();

  if (isRunning) {
    log('✅', 'Server already running on port 1987', colors.green);
  } else {
    await startServer();

    log('⏳', 'Waiting for server to be ready...', colors.yellow);
    const ready = await waitForServer();

    if (!ready) {
      throw new Error('Server failed to start within timeout');
    }

    log('✅', 'Server started successfully', colors.green);
  }

  console.log();
  await loadSystemPrompt(asJson);

  console.log();
  log('🎉', 'Initialization complete! Server ready at http://localhost:1987', colors.green);
  console.log();
}

main().catch(handleConnectionError);
