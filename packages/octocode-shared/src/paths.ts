/**
 * Centralized .octocode path management.
 */

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { HOME } from './platform/index.js';

const DEFAULT_OCTOCODE_HOME = join(HOME, '.octocode');
const DIR_MODE = 0o700;

export const OCTOCODE_HOME = process.env.OCTOCODE_HOME || DEFAULT_OCTOCODE_HOME;

export const paths = {
  home: OCTOCODE_HOME,
  config: join(OCTOCODE_HOME, '.octocoderc'),
  credentials: join(OCTOCODE_HOME, 'credentials.json'),
  key: join(OCTOCODE_HOME, '.key'),
  session: join(OCTOCODE_HOME, 'session.json'),
  repos: join(OCTOCODE_HOME, 'repos'),
  logs: join(OCTOCODE_HOME, 'logs'),
  cliConfig: join(OCTOCODE_HOME, 'config.json'),
  lspConfig: join(OCTOCODE_HOME, 'lsp-servers.json'),
} as const;

export function ensureHome(): void {
  mkdirSync(paths.home, { recursive: true, mode: DIR_MODE });
}

export function ensureRepos(): void {
  ensureHome();
  mkdirSync(paths.repos, { recursive: true, mode: DIR_MODE });
}

export function ensureLogs(): void {
  ensureHome();
  mkdirSync(paths.logs, { recursive: true, mode: DIR_MODE });
}
