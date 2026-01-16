/**
 * common.ts - Shared utilities for scripts
 */

export const BASE_URL = 'http://localhost:1987';

// Terminal colors
export const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  red: '\x1b[31m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
};

export function log(emoji: string, message: string, color = colors.reset): void {
  console.log(`${color}${emoji} ${message}${colors.reset}`);
}

export function handleConnectionError(error: unknown): never {
  if (error instanceof Error && error.message.includes('ECONNREFUSED')) {
    console.error('\n❌ Server not running. Start it first:');
    console.error('   ./install.sh start');
    console.error('   # or: npm run server:start\n');
  } else {
    console.error('\n❌ Error:', error instanceof Error ? error.message : error);
  }
  process.exit(1);
}

export async function checkServerHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${BASE_URL}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
