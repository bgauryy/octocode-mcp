/**
 * The Octocode home directory on every platform: `OCTOCODE_HOME` when set,
 * else `<os.homedir()>/.octocode`.
 * python/octocode_config.py implements the same rule for Python skills.
 */
import { homedir } from 'node:os';
import path from 'node:path';

export function getOctocodeHome(env: Record<string, string | undefined> = process.env): string {
  const override = env['OCTOCODE_HOME'];
  if (override && override.trim()) return path.resolve(override.trim());
  return path.join(homedir(), '.octocode');
}
