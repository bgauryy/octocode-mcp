import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { tmp } from './helpers.js';

const require = createRequire(import.meta.url);

type Factory = (pi: { value?: string }) => Promise<void>;

/** The generated entry, loaded once: Pi evaluates an extension module once per process and calls its factory again on every `/reload`. */
function loadEntry(file: string): Factory {
  return require(file) as Factory;
}

describe('the Pi entry', () => {
  it('loads the code of the latest build in the same process, inner modules included', async () => {
    const { bundlePiEntry } = (await import('../scripts/bundle-pi.mjs')) as { bundlePiEntry: (dist: string) => Promise<string> };
    const dist = tmp('octocode-dist-');
    fs.writeFileSync(path.join(dist, 'index.js'), "import { VALUE } from './inner/leaf.js';\nexport default function (pi) { pi.value = VALUE; }\n");
    fs.mkdirSync(path.join(dist, 'inner'));
    const leaf = path.join(dist, 'inner', 'leaf.js');

    fs.writeFileSync(leaf, "export const VALUE = 'first build';\n");
    const entry = await bundlePiEntry(dist);
    const factory = loadEntry(entry);
    const first: { value?: string } = {};
    await factory(first);
    expect(first.value).toBe('first build');

    // Rebuilt with a changed inner module; the same factory runs again (a /reload) and must run the new code.
    fs.writeFileSync(leaf, "export const VALUE = 'second build';\n");
    expect(await bundlePiEntry(dist)).toBe(entry);
    const second: { value?: string } = {};
    await factory(second);
    expect(second.value).toBe('second build');
    // One bundle per build: the previous one is removed.
    expect(fs.readdirSync(path.join(dist, 'pi')).filter((name) => name.endsWith('.js'))).toHaveLength(1);
  });

  // Pi's own loader in a child process: load, rebuild, clear its cache as /reload does, load again.
  const viaPi = (target: 'entry' | 'index'): string[] => {
    const dist = tmp('octocode-dist-pi-');
    fs.writeFileSync(path.join(dist, 'package.json'), '{"type":"module"}');
    fs.writeFileSync(path.join(dist, 'index.js'), "import { VALUE } from './inner/leaf.js';\nexport default function () { (globalThis.seen ??= []).push(VALUE); }\n");
    fs.mkdirSync(path.join(dist, 'inner'));
    const leaf = path.join(dist, 'inner', 'leaf.js');
    fs.writeFileSync(leaf, "export const VALUE = 'first';\n");
    const loader = pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.resolve('@earendil-works/pi-coding-agent'))), 'core', 'extensions', 'loader.js')).href;
    const bundler = pathToFileURL(path.join(import.meta.dirname, '..', 'scripts', 'bundle-pi.mjs')).href;
    const script = [
      `const { loadExtensionsCached, clearExtensionCache } = await import(${JSON.stringify(loader)});`,
      `const { bundlePiEntry } = await import(${JSON.stringify(bundler)});`,
      "const fs = await import('node:fs');",
      `const entry = await bundlePiEntry(${JSON.stringify(dist)});`,
      `const target = ${JSON.stringify(target)} === 'entry' ? entry : ${JSON.stringify(path.join(dist, 'index.js'))};`,
      `const load = async () => { const r = await loadExtensionsCached([target], ${JSON.stringify(dist)}); if (r.errors?.length) throw new Error(JSON.stringify(r.errors)); };`,
      'await load();',
      `fs.writeFileSync(${JSON.stringify(leaf)}, "export const VALUE = 'second';\\n");`,
      `await bundlePiEntry(${JSON.stringify(dist)});`,
      'clearExtensionCache();',
      'await load();',
      'console.log(JSON.stringify(globalThis.seen));',
    ].join('\n');
    const out = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' });
    expect(out.status, out.stderr).toBe(0);
    return JSON.parse(out.stdout.trim().split('\n').at(-1)!) as string[];
  };

  it("loads a rebuild on /reload through Pi's own loader", () => {
    expect(viaPi('entry')).toEqual(['first', 'second']);
  });

  it('records why it exists: Pi reloads a multi-file ES module entry with its first code (a Pi change shows here)', () => {
    expect(viaPi('index')).toEqual(['first', 'first']);
  });

  it('is what Pi loads from this package', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'package.json'), 'utf8')) as { pi: { extensions: string[] }; scripts: { build: string } };
    expect(manifest.pi.extensions).toEqual(['./dist/pi-entry.cjs']);
    expect(manifest.scripts.build).toContain('scripts/bundle-pi.mjs');
  });
});
