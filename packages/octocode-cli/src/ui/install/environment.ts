import { c, bold, dim } from '../../utils/colors.js';
import {
  type NodeEnvironmentStatus,
  checkNodeInPath,
  checkNpmInPath,
  checkNpmRegistry,
} from '../../features/node-check.js';
import { Spinner } from '../../utils/spinner.js';

let cachedEnvStatus: NodeEnvironmentStatus | null = null;

function printNodeStatus(installed: boolean, version: string | null): void {
  if (installed) {
    console.log(`  ${c('green', '✓')} Node.js: ${bold(version || 'unknown')}`);
  } else {
    console.log(`  ${c('red', '✗')} Node.js: ${c('red', 'Not found in PATH')}`);
  }
}

function printNpmStatus(installed: boolean, version: string | null): void {
  if (installed) {
    console.log(`  ${c('green', '✓')} npm: ${bold(version || 'unknown')}`);
  } else {
    console.log(
      `  ${c('yellow', '⚠')} npm: ${c('yellow', 'Not found in PATH')}`
    );
  }
}

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
    default:
      break;
  }
}

export async function checkAndPrintEnvironmentWithLoader(): Promise<NodeEnvironmentStatus> {
  if (cachedEnvStatus) {
    printNodeStatus(cachedEnvStatus.nodeInstalled, cachedEnvStatus.nodeVersion);
    printNpmStatus(cachedEnvStatus.npmInstalled, cachedEnvStatus.npmVersion);
    printRegistryStatus(
      cachedEnvStatus.registryStatus,
      cachedEnvStatus.registryLatency
    );
    return cachedEnvStatus;
  }

  const nodeCheck = checkNodeInPath();
  printNodeStatus(nodeCheck.installed, nodeCheck.version);

  const npmCheck = checkNpmInPath();
  printNpmStatus(npmCheck.installed, npmCheck.version);

  const registrySpinner = new Spinner('  Registry: Checking...').start();
  const registryCheck = await checkNpmRegistry();
  registrySpinner.clear();
  printRegistryStatus(registryCheck.status, registryCheck.latency);

  cachedEnvStatus = {
    nodeInstalled: nodeCheck.installed,
    nodeVersion: nodeCheck.version,
    npmInstalled: npmCheck.installed,
    npmVersion: npmCheck.version,
    registryStatus: registryCheck.status,
    registryLatency: registryCheck.latency,
    octocodePackageAvailable: true,
    octocodePackageVersion: null,
  };

  return cachedEnvStatus;
}

export function printNodeDoctorHint(): void {
  console.log(
    `  ${dim('For deeper diagnostics:')} ${c('cyan', 'npx node-doctor')}`
  );
}

export function hasEnvironmentIssues(status: NodeEnvironmentStatus): boolean {
  return (
    !status.nodeInstalled ||
    !status.npmInstalled ||
    status.registryStatus === 'slow' ||
    status.registryStatus === 'failed'
  );
}
