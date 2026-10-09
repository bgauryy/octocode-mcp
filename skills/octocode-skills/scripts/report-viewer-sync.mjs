#!/usr/bin/env node
// report-viewer-sync — copy the canonical report renderer into every skill in this collection.
// Canonical: skills/octocode-skills/scripts/render-report.mjs. Each skill ships its own copy so it
// works when installed alone; skill-review.mjs reports a copy that differs from the canonical file.
// Usage:
//   node report-viewer-sync.mjs            write missing or stale copies
//   node report-viewer-sync.mjs --check    exit 1 when any copy is missing or stale
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CANONICAL = join(HERE, 'render-report.mjs');
const COLLECTION = join(HERE, '..', '..');
const check = process.argv.includes('--check');
if (process.argv.includes('--help')) {
  console.log('Usage: node report-viewer-sync.mjs [--check]\nCopies scripts/render-report.mjs from octocode-skills into every sibling skill folder.');
  process.exit(0);
}

const source = readFileSync(CANONICAL);
const stale = [];
for (const entry of readdirSync(COLLECTION, { withFileTypes: true })) {
  if (!entry.isDirectory() || !existsSync(join(COLLECTION, entry.name, 'SKILL.md'))) continue;
  const target = join(COLLECTION, entry.name, 'scripts', 'render-report.mjs');
  if (target === CANONICAL) continue;
  if (existsSync(target) && readFileSync(target).equals(source)) continue;
  stale.push(relative(COLLECTION, target));
  if (check) continue;
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, source);
  chmodSync(target, 0o755);
}
if (check) {
  for (const path of stale) console.log(`STALE ${path}`);
  console.log(stale.length ? `${stale.length} stale cop${stale.length === 1 ? 'y' : 'ies'}; run report-viewer-sync.mjs` : 'All report viewer copies match.');
  process.exit(stale.length ? 1 : 0);
}
console.log(stale.length ? `Updated ${stale.length}: ${stale.join(', ')}` : 'All report viewer copies already match.');
