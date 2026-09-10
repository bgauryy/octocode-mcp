import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runNpm } from './npm.cjs';
import { platforms } from '../platforms.cjs';
import { validateBinary } from './binary.cjs';
import './metadata.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const targetIndex = process.argv.indexOf('--target');
const target = targetIndex === -1 ? undefined : process.argv[targetIndex + 1];
const selected = target ? platforms.filter(value => value.id === target) : platforms;
if (selected.length === 0 || (targetIndex !== -1 && !target)) throw new Error(`Unsupported target: ${target}`);
function packedFiles(directory) {
  const output = runNpm(['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: directory });
  return JSON.parse(output)[0].files.map(value => value.path);
}
const npmDirs = readdirSync(join(root, 'npm'), { withFileTypes: true }).filter(value => value.isDirectory()).map(value => value.name).sort();
if (JSON.stringify(npmDirs) !== JSON.stringify(platforms.map(value => value.id).sort())) throw new Error('Unexpected or missing native platform package directory');
for (const platform of selected) {
  const directory = join(root, 'npm', platform.id);
  const binaries = readdirSync(directory).filter(value => value.endsWith('.node'));
  if (binaries.length !== 1 || binaries[0] !== platform.binary) throw new Error(`Expected exactly ${platform.binary} in ${directory}`);
  const size = validateBinary(join(directory, platform.binary), platform);
  const files = packedFiles(directory).filter(value => value.endsWith('.node'));
  if (files.length !== 1 || files[0] !== platform.binary) throw new Error(`Tarball must contain exactly ${platform.binary}`);
  console.log(`${platform.id}: verified ${size} bytes and packed native artifact`);
}
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
if (pkg.scripts.install || pkg.scripts.postinstall) throw new Error('Published installs must not compile Rust');
const rootFiles = packedFiles(root);
for (const file of rootFiles) {
  if (/\.node$|^src\/|^scripts\/|^Cargo\.|^build\.rs$/.test(file)) throw new Error(`Source/build artifact unexpectedly published in loader: ${file}`);
}
for (const required of ['index.cjs', 'index.js', 'index.d.ts', 'platforms.cjs']) if (!rootFiles.includes(required)) throw new Error(`Missing loader artifact ${required}`);
console.log('Root loader tarball contains no native binaries or source-build fallback');
