/**
 * Native Keychain Access
 *
 * Cross-platform secure credential storage using native OS keychains.
 * Replaces keytar with direct OS command execution for better maintainability.
 *
 * Supported platforms:
 * - macOS: Uses `security` CLI (Keychain Access)
 * - Windows: Uses PowerShell with Windows Credential Manager
 * - Linux: Uses `secret-tool` CLI (libsecret - GNOME Keyring/KDE Wallet)
 */

import { execSync, spawn } from 'node:child_process';
import { platform } from 'node:os';

const EXEC_TIMEOUT = 3000; // 3 second timeout

/**
 * Result from spawning a child process
 */
interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

/**
 * Spawns a process and returns a promise that resolves with the result.
 * Properly non-blocking async implementation.
 */
function spawnAsync(
  command: string,
  args: string[],
  options: { timeout?: number; maxBuffer?: number; shell?: boolean } = {}
): Promise<SpawnResult> {
  const {
    timeout = EXEC_TIMEOUT,
    maxBuffer = 1024 * 1024,
    shell = false,
  } = options;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'pipe',
      shell,
    });

    let stdout = '';
    let stderr = '';
    let stdoutLength = 0;
    let stderrLength = 0;
    let timedOut = false;
    let completed = false;

    const timeoutId = setTimeout(() => {
      if (!completed) {
        timedOut = true;
        child.kill('SIGTERM');
      }
    }, timeout);

    child.stdout?.on('data', (data: Buffer) => {
      const chunk = data.toString();
      if (stdoutLength + chunk.length <= maxBuffer) {
        stdout += chunk;
        stdoutLength += chunk.length;
      }
    });

    child.stderr?.on('data', (data: Buffer) => {
      const chunk = data.toString();
      if (stderrLength + chunk.length <= maxBuffer) {
        stderr += chunk;
        stderrLength += chunk.length;
      }
    });

    child.on('error', error => {
      completed = true;
      clearTimeout(timeoutId);
      reject(error);
    });

    child.on('close', exitCode => {
      completed = true;
      clearTimeout(timeoutId);

      if (timedOut) {
        reject(new Error(`Command timed out after ${timeout}ms`));
        return;
      }

      resolve({
        stdout,
        stderr,
        exitCode,
      });
    });
  });
}

/**
 * Check if native keychain is available on this platform
 */
export function isKeychainAvailable(): boolean {
  const os = platform();

  if (os === 'darwin') {
    // Check if security command is available
    try {
      execSync('which security', { timeout: 1000, stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  if (os === 'win32') {
    // Check if PowerShell is available (should always be on modern Windows)
    try {
      execSync('where powershell', { timeout: 1000, stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  if (os === 'linux') {
    // Check if secret-tool is available (part of libsecret)
    try {
      execSync('which secret-tool', { timeout: 1000, stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Store a password in the system keychain
 * @param service - Service name (app identifier)
 * @param account - Account identifier (e.g., hostname)
 * @param password - Password/data to store
 */
export async function setPassword(
  service: string,
  account: string,
  password: string
): Promise<void> {
  const os = platform();

  if (os === 'darwin') {
    await setPasswordMacOS(service, account, password);
    return;
  }

  if (os === 'win32') {
    await setPasswordWindows(service, account, password);
    return;
  }

  if (os === 'linux') {
    await setPasswordLinux(service, account, password);
    return;
  }

  throw new Error(`Keychain not supported on ${os}`);
}

/**
 * Get a password from the system keychain
 * @param service - Service name (app identifier)
 * @param account - Account identifier (e.g., hostname)
 * @returns Password/data or null if not found
 */
export async function getPassword(
  service: string,
  account: string
): Promise<string | null> {
  const os = platform();

  if (os === 'darwin') {
    return getPasswordMacOS(service, account);
  }

  if (os === 'win32') {
    return getPasswordWindows(service, account);
  }

  if (os === 'linux') {
    return getPasswordLinux(service, account);
  }

  return null;
}

/**
 * Delete a password from the system keychain
 * @param service - Service name (app identifier)
 * @param account - Account identifier (e.g., hostname)
 * @returns true if deleted, false if not found
 */
export async function deletePassword(
  service: string,
  account: string
): Promise<boolean> {
  const os = platform();

  if (os === 'darwin') {
    return deletePasswordMacOS(service, account);
  }

  if (os === 'win32') {
    return deletePasswordWindows(service, account);
  }

  if (os === 'linux') {
    return deletePasswordLinux(service, account);
  }

  return false;
}

/**
 * Find all credentials for a service
 * @param service - Service name (app identifier)
 * @returns Array of {account, password} objects
 */
export async function findCredentials(
  service: string
): Promise<{ account: string; password: string }[]> {
  const os = platform();

  if (os === 'darwin') {
    return findCredentialsMacOS(service);
  }

  if (os === 'win32') {
    return findCredentialsWindows(service);
  }

  if (os === 'linux') {
    return findCredentialsLinux(service);
  }

  return [];
}

// ============================================================================
// macOS Implementation using `security` CLI
// ============================================================================

async function setPasswordMacOS(
  service: string,
  account: string,
  password: string
): Promise<void> {
  // First try to delete existing entry (ignore errors if not found)
  try {
    await deletePasswordMacOS(service, account);
  } catch {
    // Ignore - entry may not exist
  }

  // Add new entry
  // Using -U to update if exists (shouldn't happen after delete, but safe)
  const result = await spawnAsync('security', [
    'add-generic-password',
    '-s',
    service,
    '-a',
    account,
    '-w',
    password,
    '-U',
  ]);

  if (result.exitCode !== 0) {
    throw new Error(
      `Failed to store password: ${result.stderr || 'Unknown error'}`
    );
  }
}

async function getPasswordMacOS(
  service: string,
  account: string
): Promise<string | null> {
  try {
    const result = await spawnAsync('security', [
      'find-generic-password',
      '-s',
      service,
      '-a',
      account,
      '-w',
    ]);

    if (result.exitCode !== 0) {
      // Password not found (exit code 44) or other error
      return null;
    }

    // Remove trailing newline
    return result.stdout.trim() || null;
  } catch {
    // Timeout or other execution error
    return null;
  }
}

async function deletePasswordMacOS(
  service: string,
  account: string
): Promise<boolean> {
  try {
    const result = await spawnAsync('security', [
      'delete-generic-password',
      '-s',
      service,
      '-a',
      account,
    ]);

    // Exit code 0 = deleted, 44 = not found
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

async function findCredentialsMacOS(
  service: string
): Promise<{ account: string; password: string }[]> {
  try {
    // Use `security dump-keychain` and parse output
    // This dumps all items, so we filter by service
    const result = await spawnAsync('security', ['dump-keychain'], {
      timeout: EXEC_TIMEOUT * 2, // May take longer for large keychains
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large keychains
    });

    if (result.exitCode !== 0) {
      return [];
    }

    const output = result.stdout;
    const credentials: { account: string; password: string }[] = [];

    // Parse the dump-keychain output
    // Format is series of "keychain:" blocks with "attributes:" containing "svce" and "acct"
    const blocks = output.split('keychain:');

    for (const block of blocks) {
      // Check if this is a generic password for our service
      if (!block.includes('"genp"')) continue; // genp = generic password

      // Extract service name
      const serviceMatch = block.match(/"svce"<blob>="([^"]+)"/);
      if (!serviceMatch || serviceMatch[1] !== service) continue;

      // Extract account name
      const accountMatch = block.match(/"acct"<blob>="([^"]+)"/);
      if (!accountMatch) continue;

      const account = accountMatch[1];

      // Get the actual password value
      try {
        const password = await getPasswordMacOS(service, account);
        if (password) {
          credentials.push({ account, password });
        }
      } catch {
        // Skip entries we can't read
      }
    }

    return credentials;
  } catch {
    return [];
  }
}

// ============================================================================
// Windows Implementation using PowerShell + Windows Credential Manager
// ============================================================================

/**
 * Build a Windows credential target name from service and account
 */
function buildWindowsTarget(service: string, account: string): string {
  return `${service}:${account}`;
}

/**
 * Escape a string for safe use in PowerShell single-quoted strings
 */
function escapePowerShell(str: string): string {
  // Escape single quotes by doubling them, then wrap in single quotes
  return `'${str.replace(/'/g, "''")}'`;
}

async function setPasswordWindows(
  service: string,
  account: string,
  password: string
): Promise<void> {
  const target = buildWindowsTarget(service, account);

  // Use cmdkey directly - it's simpler and more reliable
  // cmdkey arguments don't need shell escaping when passed as array
  const result = await spawnAsync(
    'cmdkey',
    [`/generic:${target}`, `/user:${account}`, `/pass:${password}`],
    { shell: false }
  );

  if (result.exitCode !== 0) {
    throw new Error(
      `Failed to store password: ${result.stderr || 'Unknown error'}`
    );
  }
}

async function getPasswordWindows(
  service: string,
  account: string
): Promise<string | null> {
  try {
    const target = buildWindowsTarget(service, account);

    // Use PowerShell with correct P/Invoke marshaling for Windows Credential Manager
    // The CREDENTIAL struct must use IntPtr for string fields to work correctly
    const script = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'

$code = @'
using System;
using System.Runtime.InteropServices;
using System.Text;

public class CredentialManager {
    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool CredRead(string target, int type, int flags, out IntPtr credential);

    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern bool CredFree(IntPtr credential);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct CREDENTIAL {
        public uint Flags;
        public uint Type;
        public IntPtr TargetName;
        public IntPtr Comment;
        public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
        public uint CredentialBlobSize;
        public IntPtr CredentialBlob;
        public uint Persist;
        public uint AttributeCount;
        public IntPtr Attributes;
        public IntPtr TargetAlias;
        public IntPtr UserName;
    }

    public static string GetPassword(string target) {
        IntPtr credPtr;
        if (!CredRead(target, 1, 0, out credPtr)) {
            return null;
        }
        try {
            CREDENTIAL cred = (CREDENTIAL)Marshal.PtrToStructure(credPtr, typeof(CREDENTIAL));
            if (cred.CredentialBlobSize > 0 && cred.CredentialBlob != IntPtr.Zero) {
                return Marshal.PtrToStringUni(cred.CredentialBlob, (int)(cred.CredentialBlobSize / 2));
            }
            return null;
        } finally {
            CredFree(credPtr);
        }
    }
}
'@

try {
    Add-Type -TypeDefinition $code -Language CSharp -ErrorAction Stop
} catch {
    if ($_.Exception.Message -notlike '*already exists*') { throw }
}

$result = [CredentialManager]::GetPassword(${escapePowerShell(target)})
if ($null -eq $result) {
    exit 1
}
Write-Output $result
`;

    const result = await spawnAsync(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { shell: false }
    );

    if (result.exitCode !== 0) {
      return null;
    }

    return result.stdout.trim() || null;
  } catch {
    return null;
  }
}

async function deletePasswordWindows(
  service: string,
  account: string
): Promise<boolean> {
  try {
    const target = buildWindowsTarget(service, account);

    const result = await spawnAsync('cmdkey', ['/delete:' + target], {
      shell: false,
    });

    return result.exitCode === 0;
  } catch {
    return false;
  }
}

async function findCredentialsWindows(
  service: string
): Promise<{ account: string; password: string }[]> {
  try {
    // List all credentials and filter by service prefix
    const result = await spawnAsync('cmdkey', ['/list'], { shell: false });

    if (result.exitCode !== 0) {
      return [];
    }

    const credentials: { account: string; password: string }[] = [];
    const output = result.stdout;

    // Parse cmdkey output to find matching targets
    // Format: "Target: service:account"
    const targetRegex = new RegExp(
      `Target:\\s*${escapeRegExp(service)}:([^\\r\\n]+)`,
      'gi'
    );
    let match;

    while ((match = targetRegex.exec(output)) !== null) {
      const account = match[1].trim();
      try {
        const password = await getPasswordWindows(service, account);
        if (password) {
          credentials.push({ account, password });
        }
      } catch {
        // Skip entries we can't read
      }
    }

    return credentials;
  } catch {
    return [];
  }
}

// ============================================================================
// Linux Implementation using `secret-tool` CLI (libsecret)
// ============================================================================

async function setPasswordLinux(
  service: string,
  account: string,
  password: string
): Promise<void> {
  // secret-tool reads password from stdin, so we need to spawn with stdin support
  const child = spawn(
    'secret-tool',
    [
      'store',
      '--label',
      `${service} - ${account}`,
      'service',
      service,
      'account',
      account,
    ],
    { stdio: ['pipe', 'pipe', 'pipe'] }
  );

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('secret-tool timed out'));
    }, EXEC_TIMEOUT);

    child.on('error', err => {
      clearTimeout(timeout);
      reject(err);
    });

    child.on('close', code => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Failed to store password: exit code ${code}`));
      }
    });

    // Write password to stdin and close
    child.stdin?.write(password);
    child.stdin?.end();
  });
}

async function getPasswordLinux(
  service: string,
  account: string
): Promise<string | null> {
  try {
    const result = await spawnAsync('secret-tool', [
      'lookup',
      'service',
      service,
      'account',
      account,
    ]);

    if (result.exitCode !== 0) {
      return null;
    }

    // secret-tool outputs password without trailing newline
    return result.stdout || null;
  } catch {
    return null;
  }
}

async function deletePasswordLinux(
  service: string,
  account: string
): Promise<boolean> {
  try {
    const result = await spawnAsync('secret-tool', [
      'clear',
      'service',
      service,
      'account',
      account,
    ]);

    // secret-tool clear returns 0 even if nothing was deleted
    // Check if it existed first
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

async function findCredentialsLinux(
  service: string
): Promise<{ account: string; password: string }[]> {
  try {
    // secret-tool search returns matching entries
    const result = await spawnAsync(
      'secret-tool',
      ['search', '--all', 'service', service],
      {
        timeout: EXEC_TIMEOUT * 2,
        maxBuffer: 10 * 1024 * 1024,
      }
    );

    if (result.exitCode !== 0) {
      return [];
    }

    const credentials: { account: string; password: string }[] = [];
    const output = result.stdout;

    // Parse secret-tool search output
    // Format includes "attribute.account = value" lines
    const accountRegex = /attribute\.account\s*=\s*(.+)/gi;
    const accounts = new Set<string>();

    let match;
    while ((match = accountRegex.exec(output)) !== null) {
      accounts.add(match[1].trim());
    }

    // Get password for each account
    for (const account of accounts) {
      try {
        const password = await getPasswordLinux(service, account);
        if (password) {
          credentials.push({ account, password });
        }
      } catch {
        // Skip entries we can't read
      }
    }

    return credentials;
  } catch {
    return [];
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Escape a string for use in a regular expression
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
