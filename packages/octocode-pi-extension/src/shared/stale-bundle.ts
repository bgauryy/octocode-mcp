import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import fs from 'node:fs';
import path from 'node:path';
import { notify } from './commands.js';
import { interactive } from './interactive.js';
import { packageRoot } from './package.js';

/** The first `.ts` file under `dir` modified after `since` (ms), as a path relative to `base`; skips `node_modules`. */
function newerSource(dir: string, base: string, since: number): string | undefined {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      const found = newerSource(file, base, since);
      if (found) return found;
    } else if (entry.name.endsWith('.ts') && fs.statSync(file).mtimeMs > since) {
      return path.relative(base, file).split(path.sep).join('/');
    }
  }
  return undefined;
}

/**
 * A warning when this runs from a development checkout (a `src/` folder beside `dist/`) and a source file is newer than
 * the bundle Pi loaded (`dist/pi/current`): `/reload` only loads what `yarn build` produced, so the session would run
 * code older than the source. Undefined in an installed package, with no bundle, or when anything cannot be read.
 */
export function staleBundleWarning(root?: string): string | undefined {
  try {
    const base = root ?? packageRoot();
    const src = path.join(base, 'src');
    if (!fs.statSync(src, { throwIfNoEntry: false })?.isDirectory()) return undefined;
    const bundle = path.join(base, 'dist', 'pi', fs.readFileSync(path.join(base, 'dist', 'pi', 'current'), 'utf8').trim());
    const changed = newerSource(src, src, fs.statSync(bundle).mtimeMs);
    return changed
      ? `The Octocode bundle Pi loaded is older than the source (src/${changed} changed after the build). Run \`yarn build\` in packages/octocode-pi-extension, then /reload.`
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * At `session_start`, tells the person at a development checkout once per load of the extension (`/new` and `/resume`
 * keep it quiet; `/reload` checks again) that the bundle is stale. Subagents and runs without a UI have no one to tell.
 */
export function registerStaleBundleWarning(pi: ExtensionAPI, options: { isSubagent: boolean; root?: string }): void {
  let warned = false;
  pi.on('session_start', async (_event, ctx) => {
    if (warned || !interactive(ctx, options.isSubagent)) return;
    const text = staleBundleWarning(options.root);
    if (!text) return;
    warned = true;
    notify(ctx.ui, text, 'warning');
  });
}
