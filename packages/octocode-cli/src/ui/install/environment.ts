/**
 * Environment Check Display Components
 */

import { c, bold, dim } from '../../utils/colors.js';
import {
  type NodeEnvironmentStatus,
  checkNodeInPath,
  checkNpmInPath,
  checkNpmRegistry,
  checkOctocodePackageAsync,
} from '../../features/node-check.js';
import type { OctocodeAuthStatus } from '../../types/index.js';
import { Spinner } from '../../utils/spinner.js';

// Cache for environment check results (only check once per session)
let cachedEnvStatus: NodeEnvironmentStatus | null = null;

/**
 * Print Node.js environment status
 */
function printNodeEnvironmentStatus(status: NodeEnvironmentStatus): void {
  // Node.js check
  printNodeStatus(status.nodeInstalled, status.nodeVersion);

  // npm check
  printNpmStatus(status.npmInstalled, status.npmVersion);

  // Registry check
  printRegistryStatus(status.registryStatus, status.registryLatency);

  // Octocode package check
  printOctocodePackageStatus(
    status.octocodePackageAvailable,
    status.octocodePackageVersion
  );
}

/**
 * Print Node.js status
 */
function printNodeStatus(installed: boolean, version: string | null): void {
  if (installed) {
    console.log(`  ${c('green', '✓')} Node.js: ${bold(version || 'unknown')}`);
  } else {
    console.log(`  ${c('red', '✗')} Node.js: ${c('red', 'Not found in PATH')}`);
  }
}

/**
 * Print npm status
 */
function printNpmStatus(installed: boolean, version: string | null): void {
  if (installed) {
    console.log(`  ${c('green', '✓')} npm: ${bold(version || 'unknown')}`);
  } else {
    console.log(
      `  ${c('yellow', '⚠')} npm: ${c('yellow', 'Not found in PATH')}`
    );
  }
}

/**
 * Print npm registry status
 */
function printRegistryStatus(
  status: 'ok' | 'slow' | 'failed',
  latency: number | null
): void {
  const latencyStr = latency !== null ? `(${latency}ms)` : '';

  switch (status) {
    case 'ok':
      console.log(
        `  ${c('green', '✓')} Registry: ${c('green', 'OK')} ${dim(latencyStr)}`
      );
      break;
    case 'slow':
      console.log(
        `  ${c('yellow', '⚠')} Registry: ${c('yellow', 'Slow')} ${dim(latencyStr)}`
      );
      break;
    case 'failed':
      console.log(
        `  ${c('red', '✗')} Registry: ${c('red', 'Unreachable')} ${latency !== null ? dim(latencyStr) : ''}`
      );
      break;
  }
}

/**
 * Print octocode-mcp package availability status
 */
function printOctocodePackageStatus(
  available: boolean,
  version: string | null
): void {
  if (available) {
    console.log(
      `  ${c('green', '✓')} octocode-mcp: ${c('green', 'Available')} ${dim(`(v${version})`)}`
    );
  } else {
    console.log(
      `  ${c('red', '✗')} octocode-mcp: ${c('red', 'Not found in registry')}`
    );
  }
}

/**
 * Check and print environment status with loader for slow operations
 * Results are cached to avoid repeated network calls that can slow down menus
 */
export async function checkAndPrintEnvironmentWithLoader(): Promise<NodeEnvironmentStatus> {
  // Return cached result if available (only check once per session)
  if (cachedEnvStatus) {
    printNodeStatus(cachedEnvStatus.nodeInstalled, cachedEnvStatus.nodeVersion);
    printNpmStatus(cachedEnvStatus.npmInstalled, cachedEnvStatus.npmVersion);
    printRegistryStatus(
      cachedEnvStatus.registryStatus,
      cachedEnvStatus.registryLatency
    );
    printOctocodePackageStatus(
      cachedEnvStatus.octocodePackageAvailable,
      cachedEnvStatus.octocodePackageVersion
    );
    return cachedEnvStatus;
  }

  // 1. Check Node.js (Sync - fast local check)
  const nodeCheck = checkNodeInPath();
  printNodeStatus(nodeCheck.installed, nodeCheck.version);

  // 2. Check npm (Sync - fast local check)
  const npmCheck = checkNpmInPath();
  printNpmStatus(npmCheck.installed, npmCheck.version);

  // 3. Check Registry (Async - network call with 4s timeout)
  const registrySpinner = new Spinner('  Registry: Checking...').start();
  const registryCheck = await checkNpmRegistry();
  registrySpinner.clear();
  printRegistryStatus(registryCheck.status, registryCheck.latency);

  // 4. Check Octocode Package (Async - network call with 4s timeout)
  const octocodeSpinner = new Spinner('  octocode-mcp: Checking...').start();
  const octocodeCheck = await checkOctocodePackageAsync();
  octocodeSpinner.clear();
  printOctocodePackageStatus(octocodeCheck.available, octocodeCheck.version);

  // Cache the result
  cachedEnvStatus = {
    nodeInstalled: nodeCheck.installed,
    nodeVersion: nodeCheck.version,
    npmInstalled: npmCheck.installed,
    npmVersion: npmCheck.version,
    registryStatus: registryCheck.status,
    registryLatency: registryCheck.latency,
    octocodePackageAvailable: octocodeCheck.available,
    octocodePackageVersion: octocodeCheck.version,
  };

  return cachedEnvStatus;
}

/**
 * Print GitHub authentication status
 */
export function printAuthStatus(status: OctocodeAuthStatus): void {
  if (status.authenticated) {
    const source =
      status.tokenSource === 'gh-cli'
        ? 'gh CLI'
        : status.tokenSource === 'octocode'
          ? 'Octocode'
          : 'env';
    console.log(
      `  ${c('green', '✓')} Auth: ${c('cyan', '@' + (status.username || 'unknown'))} ${dim(`(${source})`)}`
    );
  } else {
    console.log(`  ${c('yellow', '○')} Auth: ${c('dim', 'Not signed in')}`);
  }
}

/**
 * Print node-doctor hint for deeper diagnostics
 */
export function printNodeDoctorHint(): void {
  console.log(
    `  ${dim('For deeper diagnostics:')} ${c('cyan', 'npx node-doctor')}`
  );
}

/**
 * Check if environment has issues that warrant showing node-doctor hint
 */
export function hasEnvironmentIssues(status: NodeEnvironmentStatus): boolean {
  return (
    !status.nodeInstalled ||
    !status.npmInstalled ||
    status.registryStatus === 'slow' ||
    status.registryStatus === 'failed' ||
    !status.octocodePackageAvailable
  );
}
