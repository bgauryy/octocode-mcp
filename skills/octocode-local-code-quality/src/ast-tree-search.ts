#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import { isDirectRun } from './is-direct-run.js';

export interface AstTreeSearchOptions {
  input: string;
  pattern: string | null;
  kind: string | null;
  context: number;
  json: boolean;
  ignoreCase: boolean;
  limit: number;
  file: string | null;
  section: string | null;
}

export interface AstTreeContextLine {
  lineNumber: number;
  line: string;
}

export interface AstTreeMatch {
  section: string;
  file: string | null;
  lineNumber: number;
  line: string;
  context: AstTreeContextLine[];
}

export interface ResolvedAstTreeInput {
  requestedInput: string;
  inputFile: string;
  selectionMode: 'direct-file' | 'scan-dir' | 'latest-scan';
}

export interface AstTreeSearchResult {
  requestedInput: string;
  inputFile: string;
  selectionMode: ResolvedAstTreeInput['selectionMode'];
  query: string;
  limit: number;
  totalMatches: number;
  returnedMatches: number;
  truncated: boolean;
  uniqueFiles: number;
  matches: AstTreeMatch[];
}

export function printAstTreeSearchHelp(): void {
  console.log(`
ast-tree-search — Search generated ast-trees.txt output

Usage:
  node scripts/ast-tree-search.js [options]

Options:
  --input, -i <path>       Path to ast-trees.txt, a scan directory, or .octocode/scan (default: .octocode/scan)
  --pattern, -p <regex>    Regex to match against AST tree lines
  --kind, -k <kind>        Match a node kind (supports snake_case or PascalCase)
  --file <regex>           Filter matches to section file paths that match the regex
  --section <regex>        Filter matches to section headers that match the regex
  --limit <n>              Max matches to return (default: 50, 0 = all)
  --context, -C <n>        Context lines around each match (default: 0)
  --json                   Output matches as JSON
  --ignore-case            Case-insensitive pattern matching
  --help, -h               Show this message

Examples:
  node scripts/ast-tree-search.js -i .octocode/scan -k function_declaration --limit 25
  node scripts/ast-tree-search.js -i .octocode/scan/2026-03-18T23-43-21-490Z -k ClassDeclaration --file 'src/index'
  node scripts/ast-tree-search.js -i .octocode/scan -p 'IfStatement|SwitchStatement' --section 'src/'
`);
}

function parseArgValue(arg: string, argv: string[], index: number): { value: string; nextIndex: number } {
  const equalsIndex = arg.indexOf('=');
  if (equalsIndex !== -1) {
    return { value: arg.slice(equalsIndex + 1), nextIndex: index };
  }

  return { value: argv[index + 1] || '', nextIndex: index + 1 };
}

export function parseAstTreeSearchArgs(argv: string[]): { opts: AstTreeSearchOptions; showHelp: boolean } {
  const opts: AstTreeSearchOptions = {
    input: '.octocode/scan',
    pattern: null,
    kind: null,
    context: 0,
    json: false,
    ignoreCase: false,
    limit: 50,
    file: null,
    section: null,
  };

  let showHelp = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--json') {
      opts.json = true;
      continue;
    }
    if (arg === '--ignore-case') {
      opts.ignoreCase = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      showHelp = true;
      continue;
    }

    if (arg === '--input' || arg === '-i' || arg.startsWith('--input=')) {
      const parsed = parseArgValue(arg, argv, i);
      opts.input = parsed.value;
      i = parsed.nextIndex;
      continue;
    }
    if (arg === '--pattern' || arg === '-p' || arg.startsWith('--pattern=')) {
      const parsed = parseArgValue(arg, argv, i);
      opts.pattern = parsed.value;
      i = parsed.nextIndex;
      continue;
    }
    if (arg === '--kind' || arg === '-k' || arg.startsWith('--kind=')) {
      const parsed = parseArgValue(arg, argv, i);
      opts.kind = parsed.value;
      i = parsed.nextIndex;
      continue;
    }
    if (arg === '--file' || arg.startsWith('--file=')) {
      const parsed = parseArgValue(arg, argv, i);
      opts.file = parsed.value;
      i = parsed.nextIndex;
      continue;
    }
    if (arg === '--section' || arg.startsWith('--section=')) {
      const parsed = parseArgValue(arg, argv, i);
      opts.section = parsed.value;
      i = parsed.nextIndex;
      continue;
    }
    if (arg === '--limit' || arg.startsWith('--limit=')) {
      const parsed = parseArgValue(arg, argv, i);
      const parsedLimit = Number.parseInt(parsed.value, 10);
      opts.limit = Number.isFinite(parsedLimit) ? parsedLimit : 50;
      i = parsed.nextIndex;
      continue;
    }
    if (arg === '--context' || arg === '-C' || arg.startsWith('--context=')) {
      const parsed = parseArgValue(arg, argv, i);
      const parsedContext = Number.parseInt(parsed.value, 10);
      opts.context = Number.isFinite(parsedContext) ? parsedContext : 0;
      i = parsed.nextIndex;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return { opts, showHelp };
}

export function validateAstTreeSearchOptions(opts: AstTreeSearchOptions): void {
  if (!opts.pattern && !opts.kind) {
    throw new Error('Must provide --pattern or --kind');
  }
  if (!Number.isFinite(opts.context) || opts.context < 0) {
    throw new Error('--context must be a non-negative integer');
  }
  if (!Number.isFinite(opts.limit) || opts.limit < 0) {
    throw new Error('--limit must be a non-negative integer');
  }
}

function toSnakeCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[-\s]+/g, '_')
    .toLowerCase();
}

function toPascalCase(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildRegex(pattern: string | null, flags: string, label: string): RegExp | null {
  if (!pattern) return null;
  try {
    return new RegExp(pattern, flags);
  } catch (error) {
    throw new Error(`Invalid ${label} regex: ${(error as Error).message}`);
  }
}

function parseSectionFile(section: string): string | null {
  const marker = ' — ';
  const index = section.indexOf(marker);
  if (index === -1) return null;
  return section.slice(index + marker.length).trim() || null;
}

export function resolveAstTreeInput(inputPath: string): ResolvedAstTreeInput {
  const requestedInput = path.resolve(inputPath);
  if (!fs.existsSync(requestedInput)) {
    throw new Error(`Input does not exist: ${requestedInput}`);
  }

  const stat = fs.statSync(requestedInput);
  if (stat.isFile()) {
    return {
      requestedInput,
      inputFile: requestedInput,
      selectionMode: 'direct-file',
    };
  }

  const directAstFile = path.join(requestedInput, 'ast-trees.txt');
  if (fs.existsSync(directAstFile) && fs.statSync(directAstFile).isFile()) {
    return {
      requestedInput,
      inputFile: directAstFile,
      selectionMode: 'scan-dir',
    };
  }

  const candidates = fs.readdirSync(requestedInput, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(requestedInput, entry.name, 'ast-trees.txt'))
    .filter((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile())
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

  if (candidates.length === 0) {
    throw new Error(`No ast-trees.txt found under: ${requestedInput}`);
  }

  return {
    requestedInput,
    inputFile: candidates[0],
    selectionMode: 'latest-scan',
  };
}

export function searchAstTree(
  resolved: ResolvedAstTreeInput,
  opts: AstTreeSearchOptions,
): AstTreeSearchResult {
  const flags = opts.ignoreCase ? 'i' : '';
  const patternRegex = buildRegex(opts.pattern, flags, 'pattern');
  const fileRegex = buildRegex(opts.file, flags, 'file');
  const sectionRegex = buildRegex(opts.section, flags, 'section');

  let kindRegex: RegExp | null = null;
  if (opts.kind) {
    const snake = toSnakeCase(opts.kind);
    const pascal = toPascalCase(snake);
    kindRegex = new RegExp(`\\b(?:${escapeRegExp(snake)}|${escapeRegExp(pascal)})\\b`, flags);
  }

  const lines = fs.readFileSync(resolved.inputFile, 'utf8').split(/\r?\n/);
  const allMatches: AstTreeMatch[] = [];
  let currentSection = '';
  let currentFile: string | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (line.startsWith('## ')) {
      currentSection = line.slice(3).trim();
      currentFile = parseSectionFile(currentSection);
    }

    if (patternRegex && !patternRegex.test(line)) continue;
    if (kindRegex && !kindRegex.test(line)) continue;
    if (sectionRegex && !sectionRegex.test(currentSection)) continue;
    if (fileRegex && !fileRegex.test(currentFile ?? '')) continue;

    const start = Math.max(0, index - opts.context);
    const end = Math.min(lines.length, index + opts.context + 1);

    allMatches.push({
      section: currentSection,
      file: currentFile,
      lineNumber: index + 1,
      line,
      context: lines.slice(start, end).map((contextLine, offset) => ({
        lineNumber: start + offset + 1,
        line: contextLine,
      })),
    });
  }

  const returnedMatches = opts.limit === 0 ? allMatches : allMatches.slice(0, opts.limit);
  const uniqueFiles = new Set(allMatches.map((match) => match.file).filter(Boolean)).size;
  const queryParts = [
    opts.kind ? `kind=${opts.kind}` : null,
    opts.pattern ? `pattern=${opts.pattern}` : null,
    opts.file ? `file=${opts.file}` : null,
    opts.section ? `section=${opts.section}` : null,
  ].filter(Boolean);

  return {
    requestedInput: resolved.requestedInput,
    inputFile: resolved.inputFile,
    selectionMode: resolved.selectionMode,
    query: queryParts.join(', '),
    limit: opts.limit,
    totalMatches: allMatches.length,
    returnedMatches: returnedMatches.length,
    truncated: returnedMatches.length < allMatches.length,
    uniqueFiles,
    matches: returnedMatches,
  };
}

export function formatAstTreeSearchOutput(result: AstTreeSearchResult, opts: AstTreeSearchOptions): string {
  const lines: string[] = [];

  lines.push(`\nAST tree search: ${result.query}`);
  lines.push(`Requested input: ${result.requestedInput}`);
  lines.push(`Selected AST file: ${result.inputFile} (${result.selectionMode})`);
  lines.push(`Matches: ${result.totalMatches} total, showing ${result.returnedMatches}${result.truncated ? ` (limit ${result.limit})` : ''}`);
  lines.push(`Matched files: ${result.uniqueFiles}\n`);

  let currentSection = '';
  for (const match of result.matches) {
    if (match.section !== currentSection) {
      currentSection = match.section;
      lines.push(`-- ${currentSection || '(no section)'} --`);
    }

    if (opts.context > 0) {
      for (const contextLine of match.context) {
        const marker = contextLine.lineNumber === match.lineNumber ? '>' : ' ';
        lines.push(` ${marker} ${String(contextLine.lineNumber).padStart(4)} | ${contextLine.line}`);
      }
      lines.push('');
      continue;
    }

    const fileLabel = match.file ? ` (${match.file})` : '';
    lines.push(`  L${match.lineNumber}${fileLabel}  ${match.line}`);
  }

  if (result.totalMatches === 0) {
    lines.push('No matches found.');
  }

  lines.push('');
  return lines.join('\n');
}

async function main(): Promise<void> {
  try {
    const { opts, showHelp } = parseAstTreeSearchArgs(process.argv.slice(2));
    if (showHelp) {
      printAstTreeSearchHelp();
      return;
    }

    validateAstTreeSearchOptions(opts);
    const resolved = resolveAstTreeInput(opts.input);
    const result = searchAstTree(resolved, opts);

    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log(formatAstTreeSearchOutput(result, opts));
  } catch (error) {
    console.error((error as Error).message);
    process.exit(1);
  }
}

if (isDirectRun(import.meta.url)) {
  void main();
}
