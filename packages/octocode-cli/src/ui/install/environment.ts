/**
 * Environment Check Display Components
 */

import { c, bold, dim } from '../../utils/colors.js';
import type { NodeEnvironmentStatus } from '../../features/node-check.js';
import type { OctocodeAuthStatus } from '../../types/index.js';

/**
 * Print Node.js environment status
 */
export function printNodeEnvironmentStatus(
  status: NodeEnvironmentStatus
): void {
  // Node.js check
  if (status.nodeInstalled) {
    console.log(
      `  ${c('green', '✓')} Node.js: ${bold(status.nodeVersion || 'unknown')}`
    );
  } else {
    console.log(`  ${c('red', '✗')} Node.js: ${c('red', 'Not found in PATH')}`);
  }

  // npm check
  if (status.npmInstalled) {
    console.log(
      `  ${c('green', '✓')} npm: ${bold(status.npmVersion || 'unknown')}`
    );
  } else {
    console.log(
      `  ${c('yellow', '⚠')} npm: ${c('yellow', 'Not found in PATH')}`
    );
  }

  // Registry check
  printRegistryStatus(status.registryStatus, status.registryLatency);

  // Octocode package check
  printOctocodePackageStatus(
    status.octocodePackageAvailable,
    status.octocodePackageVersion
  );
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
