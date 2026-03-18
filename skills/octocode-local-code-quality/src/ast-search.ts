#!/usr/bin/env node
/**
 * AST-aware structural code search powered by @ast-grep/napi.
 *
 * Usage:
 *   node scripts/ast-search.js --pattern 'console.log($$$ARGS)' --root ./src
 *   node scripts/ast-search.js --preset empty-catch --root ./packages
 *   node scripts/ast-search.js --kind function_declaration --root ./src --json
 */

import fs from 'node:fs';
import path from 'node:path';
import { ts as astTs, tsx as astTsx, js as astJs, html as astHtml } from '@ast-grep/napi';
import type { SgNode, SgRoot, NapiConfig } from '@ast-grep/napi';
import { ALLOWED_EXTS } from './types.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AstSearchOptions {
  root: string;
  pattern: string | null;
  kind: string | null;
  preset: string | null;
  rule: NapiConfig | null;
  json: boolean;
  limit: number;
  includeTests: boolean;
  ignoreDirs: Set<string>;
  context: number;
}

export interface AstMatch {
  file: string;
  kind: string;
  text: string;
  lineStart: number;
  lineEnd: number;
  columnStart: number;
  columnEnd: number;
  metaVariables?: Record<string, string>;
}

export interface AstSearchResult {
  query: string;
  queryType: 'pattern' | 'kind' | 'preset' | 'rule';
  totalMatches: number;
  totalFiles: number;
  matches: AstMatch[];
}

// ─── Presets ────────────────────────────────────────────────────────────────

export type PresetRule = NapiConfig & { description: string };

export const PRESETS: Record<string, PresetRule> = {
  'empty-catch': {
    rule: {
      kind: 'catch_clause',
      has: {
        kind: 'statement_block',
        regex: '^\\{\\s*\\}$',
      },
    },
    description: 'Empty catch blocks that silently swallow errors',
  },
  'console-log': {
    rule: {
      pattern: 'console.log($$$ARGS)',
    },
    description: 'console.log calls left in production code',
  },
  'console-any': {
    rule: {
      pattern: 'console.$METHOD($$$ARGS)',
    },
    description: 'Any console method call (log, warn, error, debug, etc.)',
  },
  'debugger': {
    rule: {
      kind: 'debugger_statement',
    },
    description: 'Debugger statements left in code',
  },
  'todo-fixme': {
    rule: {
      kind: 'comment',
      regex: '(?i)(TODO|FIXME|HACK|XXX|BUG)',
    },
    description: 'TODO, FIXME, HACK, XXX, BUG comments',
  },
  'any-type': {
    rule: {
      kind: 'predefined_type',
      regex: '^any$',
    },
    description: 'Explicit `any` type annotations',
  },
  'type-assertion': {
    rule: {
      kind: 'as_expression',
    },
    description: 'TypeScript type assertions (as X)',
  },
  'non-null-assertion': {
    rule: {
      kind: 'non_null_expression',
    },
    description: 'Non-null assertions (x!)',
  },
  'fat-arrow-body': {
    rule: {
      kind: 'arrow_function',
      has: {
        kind: 'statement_block',
      },
    },
    description: 'Arrow functions with statement block bodies (could be expression)',
  },
  'nested-ternary': {
    rule: {
      kind: 'ternary_expression',
      has: {
        kind: 'ternary_expression',
        stopBy: 'end',
      },
    },
    description: 'Nested ternary expressions (hard to read)',
  },
  'throw-string': {
    rule: {
      kind: 'throw_statement',
      has: {
        kind: 'string',
      },
    },
    description: 'Throwing string literals instead of Error objects',
  },
  'switch-no-default': {
    rule: {
      kind: 'switch_statement',
      not: {
        has: {
          kind: 'switch_default',
          stopBy: 'end',
        },
      },
    },
    description: 'Switch statements without a default case',
  },
  'class-declaration': {
    rule: {
      kind: 'class_declaration',
    },
    description: 'All class declarations',
  },
  'async-function': {
    rule: {
      kind: 'function_declaration',
      regex: '^async ',
    },
    description: 'Async function declarations',
  },
  'export-default': {
    rule: {
      kind: 'export_statement',
      has: {
        field: 'default',
      },
    },
    description: 'Default exports',
  },
  'import-star': {
    rule: {
      kind: 'import_statement',
      has: {
        kind: 'namespace_import',
      },
    },
    description: 'Namespace imports (import * as X)',
  },
};

// ─── File Collection ────────────────────────────────────────────────────────

function isTestFile(filePath: string): boolean {
  const base = path.basename(filePath);
  return /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/.test(base)
    || base.startsWith('test_')
    || filePath.includes('__tests__');
}

export function collectSearchFiles(root: string, opts: Pick<AstSearchOptions, 'includeTests' | 'ignoreDirs'>): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (opts.ignoreDirs.has(entry.name)) continue;
      if (entry.isSymbolicLink()) continue;
      const next = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(next); continue; }
      if (!entry.isFile()) continue;
      if (entry.name.endsWith('.d.ts')) continue;
      const ext = path.extname(entry.name);
      if (!ALLOWED_EXTS.has(ext)) continue;
      if (!opts.includeTests && isTestFile(next)) continue;
      files.push(next);
    }
  };
  walk(root);
  return files;
}

// ─── Parser Selection ───────────────────────────────────────────────────────

type AstParser = { parse(src: string): SgRoot };

function parserForExt(ext: string): AstParser {
  switch (ext) {
    case '.tsx':
      return astTsx;
    case '.jsx':
      return astJs;
    case '.js':
    case '.mjs':
    case '.cjs':
      return astJs;
    case '.ts':
    default:
      return astTs;
  }
}

// ─── Core Search ────────────────────────────────────────────────────────────

function extractMetaVars(node: SgNode, pattern: string): Record<string, string> {
  const vars: Record<string, string> = {};
  const metaVarPattern = /\$([A-Z_][A-Z0-9_]*)/g;
  let match: RegExpExecArray | null;
  while ((match = metaVarPattern.exec(pattern)) !== null) {
    const name = match[1];
    if (name.startsWith('$')) {
      const multiMatch = node.getMultipleMatches(name.slice(1));
      if (multiMatch.length > 0) {
        vars[`$$$${name.slice(1)}`] = multiMatch.map(n => n.text()).join(', ');
      }
    } else {
      const matchNode = node.getMatch(name);
      if (matchNode) vars[`$${name}`] = matchNode.text();
    }
  }
  const triplePattern = /\$\$\$([A-Z_][A-Z0-9_]*)/g;
  while ((match = triplePattern.exec(pattern)) !== null) {
    const name = match[1];
    const multiMatch = node.getMultipleMatches(name);
    if (multiMatch.length > 0) {
      vars[`$$$${name}`] = multiMatch.map(n => n.text()).join(', ');
    }
  }
  return vars;
}

function nodeToMatch(node: SgNode, file: string, pattern: string | null): AstMatch {
  const range = node.range();
  const result: AstMatch = {
    file,
    kind: String(node.kind()),
    text: node.text(),
    lineStart: range.start.line + 1,
    lineEnd: range.end.line + 1,
    columnStart: range.start.column,
    columnEnd: range.end.column,
  };
  if (pattern) {
    const vars = extractMetaVars(node, pattern);
    if (Object.keys(vars).length > 0) result.metaVariables = vars;
  }
  return result;
}

export function searchFile(
  filePath: string,
  source: string,
  matcher: string | number | NapiConfig,
  patternStr: string | null,
  limit: number,
): AstMatch[] {
  const ext = path.extname(filePath);
  const parser = parserForExt(ext);
  let nodes: SgNode[];
  try {
    const root = parser.parse(source).root();
    nodes = root.findAll(matcher);
  } catch {
    return [];
  }
  const matches: AstMatch[] = [];
  for (const node of nodes) {
    if (matches.length >= limit) break;
    matches.push(nodeToMatch(node, filePath, patternStr));
  }
  return matches;
}

export function runSearch(files: string[], opts: AstSearchOptions, root: string): AstSearchResult {
  let matcher: string | NapiConfig;
  let queryLabel: string;
  let queryType: AstSearchResult['queryType'];
  let patternStr: string | null = null;

  if (opts.preset) {
    const preset = PRESETS[opts.preset];
    if (!preset) {
      const available = Object.keys(PRESETS).join(', ');
      throw new Error(`Unknown preset: "${opts.preset}". Available: ${available}`);
    }
    matcher = preset;
    queryLabel = `preset:${opts.preset} — ${preset.description}`;
    queryType = 'preset';
  } else if (opts.rule) {
    matcher = opts.rule;
    queryLabel = `rule:${JSON.stringify(opts.rule)}`;
    queryType = 'rule';
  } else if (opts.kind) {
    matcher = { rule: { kind: opts.kind } } as NapiConfig;
    queryLabel = `kind:${opts.kind}`;
    queryType = 'kind';
  } else if (opts.pattern) {
    matcher = opts.pattern;
    patternStr = opts.pattern;
    queryLabel = `pattern:${opts.pattern}`;
    queryType = 'pattern';
  } else {
    throw new Error('Must provide --pattern, --kind, --preset, or --rule');
  }

  const allMatches: AstMatch[] = [];
  const filesWithMatches = new Set<string>();

  for (const filePath of files) {
    if (allMatches.length >= opts.limit) break;
    let source: string;
    try {
      source = fs.readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }
    const relFile = path.relative(root, filePath);
    const remaining = opts.limit - allMatches.length;
    const fileMatches = searchFile(relFile, source, matcher, patternStr, remaining);
    if (fileMatches.length > 0) {
      filesWithMatches.add(relFile);
      allMatches.push(...fileMatches);
    }
  }

  return {
    query: queryLabel,
    queryType,
    totalMatches: allMatches.length,
    totalFiles: filesWithMatches.size,
    matches: allMatches,
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export interface ParsedSearchArgs {
  opts: AstSearchOptions;
  listPresets: boolean;
}

export function parseSearchArgs(argv: string[]): ParsedSearchArgs {
  const opts: AstSearchOptions = {
    root: process.cwd(),
    pattern: null,
    kind: null,
    preset: null,
    rule: null,
    json: false,
    limit: 500,
    includeTests: false,
    ignoreDirs: new Set([
      '.git', '.next', '.yarn', '.cache', '.octocode',
      'node_modules', 'dist', 'coverage', 'out',
    ]),
    context: 0,
  };
  let listPresets = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--pattern' || arg === '-p') { opts.pattern = argv[++i]; continue; }
    if (arg.startsWith('--pattern=')) { opts.pattern = arg.slice('--pattern='.length); continue; }
    if (arg === '--kind' || arg === '-k') { opts.kind = argv[++i]; continue; }
    if (arg.startsWith('--kind=')) { opts.kind = arg.slice('--kind='.length); continue; }
    if (arg === '--preset') { opts.preset = argv[++i]; continue; }
    if (arg.startsWith('--preset=')) { opts.preset = arg.slice('--preset='.length); continue; }
    if (arg === '--rule') { opts.rule = JSON.parse(argv[++i]) as NapiConfig; continue; }
    if (arg === '--root') { opts.root = path.resolve(argv[++i]); continue; }
    if (arg.startsWith('--root=')) { opts.root = path.resolve(arg.slice('--root='.length)); continue; }
    if (arg === '--json') { opts.json = true; continue; }
    if (arg === '--limit') { opts.limit = parseInt(argv[++i], 10); continue; }
    if (arg === '--include-tests') { opts.includeTests = true; continue; }
    if (arg === '--context' || arg === '-C') { opts.context = parseInt(argv[++i], 10); continue; }
    if (arg === '--list-presets') { listPresets = true; continue; }
    if (arg === '--help' || arg === '-h') { printSearchHelp(); process.exit(0); }
  }

  if (Number.isNaN(opts.limit)) opts.limit = 500;
  if (Number.isNaN(opts.context)) opts.context = 0;

  return { opts, listPresets };
}

export function printSearchHelp(): void {
  console.log(`
ast-search — Structural code search powered by ast-grep

Usage:
  node scripts/ast-search.js [options]

Search modes (pick one):
  --pattern, -p <code>     Match code structurally (e.g. 'console.log($$$ARGS)')
  --kind, -k <kind>        Match AST node kind (e.g. 'function_declaration')
  --preset <name>          Use a built-in search preset (e.g. 'empty-catch')
  --rule <json>            Raw ast-grep rule object as JSON

Options:
  --root <path>            Search root directory (default: cwd)
  --json                   Output as JSON
  --limit N                Max matches (default: 500)
  --include-tests          Include test files
  --context, -C N          Lines of context around matches (text output only)
  --list-presets           Show available presets and exit
  --help, -h               Show this message

Pattern wildcards:
  $NAME                    Match any single AST node
  $$$NAME                  Match zero or more nodes (variadic)

Examples:
  node scripts/ast-search.js -p 'console.log($$$ARGS)' --root ./src
  node scripts/ast-search.js --preset empty-catch --root ./packages
  node scripts/ast-search.js -k function_declaration --json --limit 20
  node scripts/ast-search.js --preset todo-fixme --include-tests
  node scripts/ast-search.js -p 'if ($COND) { return $VAL }' --root ./src
  node scripts/ast-search.js --rule '{"rule":{"kind":"catch_clause"}}' --root ./src

Presets:
${Object.entries(PRESETS).map(([name, p]) => `  ${name.padEnd(22)} ${p.description}`).join('\n')}
`);
}

function formatTextOutput(result: AstSearchResult, opts: AstSearchOptions, root: string): string {
  const lines: string[] = [];
  lines.push(`\n🔍 ${result.query}`);
  lines.push(`   ${result.totalMatches} matches across ${result.totalFiles} files\n`);

  let currentFile = '';
  for (const m of result.matches) {
    if (m.file !== currentFile) {
      currentFile = m.file;
      lines.push(`\n── ${currentFile} ──`);
    }

    const truncatedText = m.text.length > 200
      ? m.text.slice(0, 200) + '…'
      : m.text;
    const singleLine = truncatedText.replace(/\n/g, '↵').replace(/\s+/g, ' ');
    lines.push(`  L${m.lineStart}:${m.columnStart}  [${m.kind}]  ${singleLine}`);

    if (m.metaVariables && Object.keys(m.metaVariables).length > 0) {
      for (const [k, v] of Object.entries(m.metaVariables)) {
        const truncV = v.length > 80 ? v.slice(0, 80) + '…' : v;
        lines.push(`    ${k} = ${truncV}`);
      }
    }
  }

  lines.push('');
  return lines.join('\n');
}

async function main(): Promise<void> {
  const { opts, listPresets } = parseSearchArgs(process.argv.slice(2));

  if (listPresets) {
    if (opts.json) {
      console.log(JSON.stringify(PRESETS, null, 2));
    } else {
      console.log('\nAvailable presets:\n');
      for (const [name, preset] of Object.entries(PRESETS)) {
        console.log(`  ${name.padEnd(22)} ${preset.description}`);
      }
      console.log('');
    }
    return;
  }

  if (!opts.pattern && !opts.kind && !opts.preset && !opts.rule) {
    console.error('Error: Must provide --pattern, --kind, --preset, or --rule');
    console.error('Run with --help for usage information.');
    process.exit(1);
  }

  const files = collectSearchFiles(opts.root, opts);

  if (files.length === 0) {
    console.error(`No files found in ${opts.root}`);
    process.exit(1);
  }

  const result = runSearch(files, opts, opts.root);

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatTextOutput(result, opts, opts.root));
  }
}

const isDirectRun = process.argv[1] && (
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))
  || import.meta.url.endsWith('/scripts/ast-search.js')
);

if (isDirectRun) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
