#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const REPO_BLOB_PREFIX = 'https://github.com/bgauryy/octocode-mcp/blob/main/';
const DOC_ROOTS = [
  path.join(ROOT, 'docs'),
  ...fs
    .readdirSync(path.join(ROOT, 'packages'), { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => path.join(ROOT, 'packages', entry.name, 'docs'))
    .filter(dirPath => fs.existsSync(dirPath)),
];

function collectMarkdownFiles(rootDir) {
  const files = [];
  const queue = [rootDir];

  while (queue.length > 0) {
    const currentDir = queue.pop();
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const absolutePath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        queue.push(absolutePath);
      } else if (entry.isFile() && absolutePath.endsWith('.md')) {
        files.push(absolutePath);
      }
    }
  }

  return files.sort();
}

function readMarkdownLinks(content) {
  const links = [];
  const linkPattern = /!?\[[^\]]*]\(([^)]+)\)/g;
  let match;

  while ((match = linkPattern.exec(content)) !== null) {
    const rawTarget = match[1].trim();
    const target = rawTarget.startsWith('<') && rawTarget.endsWith('>')
      ? rawTarget.slice(1, -1)
      : rawTarget;
    links.push(target.split(/\s+/)[0]);
  }

  return links;
}

function validateDocsLinks() {
  const failures = [];

  for (const rootDir of DOC_ROOTS) {
    for (const filePath of collectMarkdownFiles(rootDir)) {
      const content = fs.readFileSync(filePath, 'utf8');
      for (const linkTarget of readMarkdownLinks(content)) {
        if (
          linkTarget.startsWith('#') ||
          linkTarget.startsWith('mailto:') ||
          linkTarget.startsWith('tel:') ||
          linkTarget.startsWith('http://')
        ) {
          continue;
        }

        if (!linkTarget.startsWith('https://')) {
          failures.push(
            `${path.relative(ROOT, filePath)} uses non-absolute link target "${linkTarget}"`
          );
          continue;
        }

        if (linkTarget.startsWith(REPO_BLOB_PREFIX)) {
          const relativeTarget = linkTarget
            .slice(REPO_BLOB_PREFIX.length)
            .split('#')[0]
            .replace(/\/$/, '');
          const absoluteTarget = path.join(ROOT, relativeTarget);
          if (!fs.existsSync(absoluteTarget)) {
            failures.push(
              `${path.relative(ROOT, filePath)} points to missing repo file "${relativeTarget}"`
            );
          }
        }
      }
    }
  }

  return failures;
}

function validateWorkflowReadme() {
  const workflowDir = path.join(ROOT, '.github', 'workflows');
  const workflowReadmePath = path.join(workflowDir, 'README.md');
  const workflowContent = fs.readFileSync(workflowReadmePath, 'utf8');
  const failures = [];
  const referencedWorkflowFiles = new Set();
  const workflowReferencePattern = /`([A-Za-z0-9._-]+\.ya?ml)`/g;
  let match;

  while ((match = workflowReferencePattern.exec(workflowContent)) !== null) {
    referencedWorkflowFiles.add(match[1]);
  }

  for (const workflowFile of referencedWorkflowFiles) {
    const absoluteWorkflowPath = path.join(workflowDir, workflowFile);
    if (!fs.existsSync(absoluteWorkflowPath)) {
      failures.push(
        `.github/workflows/README.md references missing workflow "${workflowFile}"`
      );
    }
  }

  return failures;
}

function main() {
  const failures = [
    ...validateDocsLinks(),
    ...validateWorkflowReadme(),
  ];

  if (failures.length > 0) {
    console.error('Documentation verification failed:');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log('Documentation verification passed.');
}

main();
