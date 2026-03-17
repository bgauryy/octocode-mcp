import fs from 'node:fs';
import path from 'node:path';
import type { AnalysisOptions, PackageInfo, FileEntry } from './types.js';
import { ALLOWED_EXTS } from './types.js';
import { isTestFile } from './utils.js';

export function collectFiles(rootDir: string, opts: AnalysisOptions): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      if (opts.ignoreDirs.has(entry.name)) continue;
      if (entry.isSymbolicLink()) continue;

      const next = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(next);
        continue;
      }

      if (!entry.isFile()) continue;
      if (entry.name.endsWith('.d.ts')) continue;

      const ext = path.extname(entry.name);
      if (!ALLOWED_EXTS.has(ext)) continue;
      if (!opts.includeTests && isTestFile(next)) continue;

      files.push(next);
    }
  };

  walk(rootDir);
  return files;
}

export function safeRead(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

export function listWorkspacePackages(root: string, packageRoot: string): PackageInfo[] {
  if (!fs.existsSync(packageRoot) || !fs.statSync(packageRoot).isDirectory()) return [];

  const packageDirs = fs.readdirSync(packageRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));

  const packages: PackageInfo[] = [];
  for (const entry of packageDirs) {
    const dir = path.join(packageRoot, entry.name);
    const manifest = path.join(dir, 'package.json');
    if (!fs.existsSync(manifest)) continue;

    try {
      const json = JSON.parse(fs.readFileSync(manifest, 'utf8'));
      if (typeof json.name === 'string') {
        packages.push({ name: json.name, dir, folder: entry.name });
      }
    } catch {
      // Ignore invalid package manifests.
    }
  }

  return packages;
}

export function fileSummaryWithFindings(fileSummaries: FileEntry[], byFile: Map<string, string[]>): (FileEntry & { issueIds: string[] })[] {
  return fileSummaries.map((entry) => ({
    ...entry,
    issueIds: byFile.get(entry.file) || [],
  }));
}
