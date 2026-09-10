import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { discoverSkills } from '../src/tools/skill-discovery.js';
import { discoverPiHookSources } from '../src/adapters/pi-hook-discovery.js';
import { createPiModelDiscovery } from '../src/adapters/pi-model-discovery.js';

const roots: string[] = [];
afterEach(() => { vi.unstubAllEnvs(); for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

it('excludes Pi skill defaults even through host metadata, preserving bundled and explicit files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-default-sources-'));
  roots.push(root);
  const homeDir = path.join(root, 'home');
  const cwd = path.join(root, 'workspace');
  fs.mkdirSync(path.join(cwd, '.git'), { recursive: true });
  const piAgentDir = path.join(root, 'custom-pi');
  const bundledDir = path.join(root, 'bundled');
  const directories = [path.join(homeDir, '.pi', 'agent', 'skills'), path.join(cwd, '.pi', 'skills'), path.join(piAgentDir, 'skills'), path.join(root, 'explicit'), bundledDir];
  const skills = directories.map((directory, index) => {
    const name = `fixture-${index}`;
    const filePath = path.join(directory, name, 'SKILL.md');
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `---\nname: ${name}\ndescription: Fixture ${index}\n---\nInstructions.`);
    return { name, description: 'Fixture', filePath };
  });
  expect(discoverSkills(cwd, skills, homeDir, { homeDir, bundledDir, octocodeHome: path.join(homeDir, '.octocode'), env: { PI_CODING_AGENT_DIR: piAgentDir } }).map(skill => skill.name)).toEqual(['fixture-3', 'fixture-4']);
});

it('retains the default and overridden Pi model paths without discovering Pi hooks', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-model-default-'));
  roots.push(root);
  vi.stubEnv('PI_CODING_AGENT_DIR', '');
  const workspace = path.join(root, 'workspace');
  const octocodeHome = path.join(root, '.octocode');
  const defaults = createPiModelDiscovery({ workspace, octocodeHome, homeDir: root });
  expect(defaults.snapshot().nativeModelsPath).toBe(path.join(root, '.pi', 'agent', 'models.json'));
  defaults.dispose();
  const override = path.join(root, 'custom-pi');
  vi.stubEnv('PI_CODING_AGENT_DIR', override);
  const models = createPiModelDiscovery({ workspace, octocodeHome, homeDir: root });
  expect(models.snapshot().nativeModelsPath).toBe(path.join(override, 'models.json'));
  models.dispose();
  for (const directory of [path.join(root, '.pi', 'agent', 'hooks'), path.join(override, 'hooks'), path.join(workspace, '.pi', 'hooks')]) {
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'ignored.json'), '{"hooks":{"SessionStart":[{"hooks":[{"type":"command","command":"echo ignored"}]}]}}');
  }
  expect(discoverPiHookSources({ workspace, octocodeHome, userCodexDir: path.join(root, '.codex') }).sources).toEqual([]);
});
