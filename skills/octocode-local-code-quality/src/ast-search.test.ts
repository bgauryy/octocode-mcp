import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  type AstSearchOptions,
  PRESETS,
  collectSearchFiles,
  formatTextOutput,
  parseSearchArgs,
  runSearch,
  searchFile,
} from './ast-search.js';


describe('parseSearchArgs', () => {
  it('returns defaults when no args given', () => {
    const { opts } = parseSearchArgs([]);
    expect(opts.pattern).toBeNull();
    expect(opts.kind).toBeNull();
    expect(opts.preset).toBeNull();
    expect(opts.json).toBe(false);
    expect(opts.limit).toBe(500);
    expect(opts.includeTests).toBe(false);
  });

  it('parses --pattern with separate arg', () => {
    const { opts } = parseSearchArgs(['--pattern', 'console.log($A)']);
    expect(opts.pattern).toBe('console.log($A)');
  });

  it('parses -p shorthand', () => {
    const { opts } = parseSearchArgs(['-p', 'foo($BAR)']);
    expect(opts.pattern).toBe('foo($BAR)');
  });

  it('parses --pattern= syntax', () => {
    const { opts } = parseSearchArgs(['--pattern=console.log($$$ARGS)']);
    expect(opts.pattern).toBe('console.log($$$ARGS)');
  });

  it('parses --kind with separate arg', () => {
    const { opts } = parseSearchArgs(['--kind', 'function_declaration']);
    expect(opts.kind).toBe('function_declaration');
  });

  it('parses -k shorthand', () => {
    const { opts } = parseSearchArgs(['-k', 'class_declaration']);
    expect(opts.kind).toBe('class_declaration');
  });

  it('parses --kind= syntax', () => {
    const { opts } = parseSearchArgs(['--kind=arrow_function']);
    expect(opts.kind).toBe('arrow_function');
  });

  it('parses --preset with separate arg', () => {
    const { opts } = parseSearchArgs(['--preset', 'empty-catch']);
    expect(opts.preset).toBe('empty-catch');
  });

  it('parses --preset= syntax', () => {
    const { opts } = parseSearchArgs(['--preset=console-log']);
    expect(opts.preset).toBe('console-log');
  });

  it('parses --json flag', () => {
    const { opts } = parseSearchArgs(['--json']);
    expect(opts.json).toBe(true);
  });

  it('parses --limit', () => {
    const { opts } = parseSearchArgs(['--limit', '50']);
    expect(opts.limit).toBe(50);
  });

  it('parses --include-tests', () => {
    const { opts } = parseSearchArgs(['--include-tests']);
    expect(opts.includeTests).toBe(true);
  });

  it('parses --root', () => {
    const { opts } = parseSearchArgs(['--root', '/tmp/myrepo']);
    expect(opts.root).toBe('/tmp/myrepo');
  });

  it('parses --root= syntax', () => {
    const { opts } = parseSearchArgs(['--root=/tmp/other']);
    expect(opts.root).toBe('/tmp/other');
  });

  it('parses --context / -C', () => {
    expect(parseSearchArgs(['--context', '3']).opts.context).toBe(3);
    expect(parseSearchArgs(['-C', '5']).opts.context).toBe(5);
  });

  it('parses --list-presets', () => {
    const { listPresets } = parseSearchArgs(['--list-presets']);
    expect(listPresets).toBe(true);
  });

  it('falls back to defaults for NaN limit', () => {
    const { opts } = parseSearchArgs(['--limit', 'abc']);
    expect(opts.limit).toBe(500);
  });

  it('handles multiple flags together', () => {
    const { opts } = parseSearchArgs([
      '-p', 'console.log($A)',
      '--json',
      '--limit', '10',
      '--include-tests',
    ]);
    expect(opts.pattern).toBe('console.log($A)');
    expect(opts.json).toBe(true);
    expect(opts.limit).toBe(10);
    expect(opts.includeTests).toBe(true);
  });

  it('parses --rule JSON', () => {
    const rule = '{"rule":{"kind":"catch_clause"}}';
    const { opts } = parseSearchArgs(['--rule', rule]);
    expect(opts.rule).toEqual({ rule: { kind: 'catch_clause' } });
  });
});


describe('PRESETS', () => {
  it('has expected presets defined', () => {
    expect(PRESETS['empty-catch']).toBeDefined();
    expect(PRESETS['console-log']).toBeDefined();
    expect(PRESETS['debugger']).toBeDefined();
    expect(PRESETS['any-type']).toBeDefined();
    expect(PRESETS['todo-fixme']).toBeDefined();
    expect(PRESETS['switch-no-default']).toBeDefined();
    expect(PRESETS['nested-ternary']).toBeDefined();
    expect(PRESETS['throw-string']).toBeDefined();
  });

  it('all presets have description and rule', () => {
    for (const [name, preset] of Object.entries(PRESETS)) {
      expect(preset.description, `${name} missing description`).toBeTruthy();
      expect(preset.rule, `${name} missing rule`).toBeDefined();
    }
  });
});


describe('searchFile', () => {
  it('finds pattern matches in TypeScript', () => {
    const source = `
function greet(name: string) {
  console.log("Hello", name);
  console.log("Done");
}
`;
    const matches = searchFile('test.ts', source, 'console.log($$$ARGS)', 'console.log($$$ARGS)', 100);
    expect(matches.length).toBe(2);
    expect(matches[0].kind).toBe('call_expression');
    expect(matches[0].lineStart).toBeGreaterThan(0);
    expect(matches[0].file).toBe('test.ts');
  });

  it('finds kind matches', () => {
    const source = `
function foo() { return 1; }
const bar = () => 2;
function baz() { return 3; }
`;
    const matches = searchFile('test.ts', source, { rule: { kind: 'function_declaration' } }, null, 100);
    expect(matches.length).toBe(2);
    expect(matches.every(m => m.kind === 'function_declaration')).toBe(true);
  });

  it('respects limit', () => {
    const source = `
console.log(1);
console.log(2);
console.log(3);
console.log(4);
console.log(5);
`;
    const matches = searchFile('test.ts', source, 'console.log($A)', 'console.log($A)', 3);
    expect(matches.length).toBe(3);
  });

  it('finds empty catch blocks with preset rule', () => {
    const source = `
try { doStuff(); } catch (e) {}
try { other(); } catch (e) { handle(e); }
try { another(); } catch (e) {
}
`;
    const preset = PRESETS['empty-catch'];
    const matches = searchFile('test.ts', source, preset, null, 100);
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches.every(m => m.kind === 'catch_clause')).toBe(true);
  });

  it('finds debugger statements', () => {
    const source = `
function debug() {
  debugger;
  return true;
}
`;
    const preset = PRESETS['debugger'];
    const matches = searchFile('test.ts', source, preset, null, 100);
    expect(matches.length).toBe(1);
    expect(matches[0].kind).toBe('debugger_statement');
  });

  it('finds any type annotations', () => {
    const source = `
function foo(a: any, b: string): any {
  const x: any = {};
  return x;
}
`;
    const preset = PRESETS['any-type'];
    const matches = searchFile('test.ts', source, preset, null, 100);
    expect(matches.length).toBe(3);
  });

  it('finds nested ternary expressions', () => {
    const source = `
const x = a ? (b ? 1 : 2) : 3;
const y = a ? 1 : 2;
`;
    const preset = PRESETS['nested-ternary'];
    const matches = searchFile('test.ts', source, preset, null, 100);
    expect(matches.length).toBe(1);
  });

  it('finds switch without default', () => {
    const source = `
switch (x) {
  case 1: break;
  case 2: break;
}
switch (y) {
  case 1: break;
  default: break;
}
`;
    const preset = PRESETS['switch-no-default'];
    const matches = searchFile('test.ts', source, preset, null, 100);
    expect(matches.length).toBe(1);
  });

  it('finds class declarations', () => {
    const source = `
class Foo {}
class Bar extends Foo {}
const fn = () => {};
`;
    const preset = PRESETS['class-declaration'];
    const matches = searchFile('test.ts', source, preset, null, 100);
    expect(matches.length).toBe(2);
  });

  it('finds throw string patterns', () => {
    const source = `
function bad() { throw "oops"; }
function good() { throw new Error("oops"); }
`;
    const preset = PRESETS['throw-string'];
    const matches = searchFile('test.ts', source, preset, null, 100);
    expect(matches.length).toBe(1);
  });

  it('finds non-null assertions', () => {
    const source = `
const x = obj!.foo;
const y = arr![0];
const z = normal.foo;
`;
    const preset = PRESETS['non-null-assertion'];
    const matches = searchFile('test.ts', source, preset, null, 100);
    expect(matches.length).toBe(2);
  });

  it('returns empty array when no matches', () => {
    const source = 'const x = 1;';
    const matches = searchFile('test.ts', source, 'console.log($A)', 'console.log($A)', 100);
    expect(matches.length).toBe(0);
  });

  it('extracts meta variables from pattern', () => {
    const source = 'console.log("hello", 42);';
    const matches = searchFile('test.ts', source, 'console.log($$$ARGS)', 'console.log($$$ARGS)', 100);
    expect(matches.length).toBe(1);
  });

  it('handles JSX files', () => {
    const source = `
function App() {
  console.log("render");
  return <div>Hello</div>;
}
`;
    const matches = searchFile('test.tsx', source, 'console.log($$$ARGS)', 'console.log($$$ARGS)', 100);
    expect(matches.length).toBe(1);
  });
});


describe('runSearch', () => {
  let tmpDir: string;

  function writeFile(name: string, content: string): string {
    const filePath = path.join(tmpDir, name);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
    return filePath;
  }

  function defaultOpts(overrides: Partial<AstSearchOptions> = {}): AstSearchOptions {
    return {
      root: tmpDir,
      pattern: null,
      kind: null,
      preset: null,
      rule: null,
      json: false,
      limit: 500,
      includeTests: false,
      ignoreDirs: new Set(['.git', 'node_modules', 'dist']),
      context: 0,
      ...overrides,
    };
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ast-search-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('searches with pattern across files', () => {
    const f1 = writeFile('src/a.ts', 'console.log("a");\nconsole.log("b");');
    const f2 = writeFile('src/b.ts', 'console.log("c");');
    writeFile('src/c.ts', 'const x = 1;');

    const opts = defaultOpts({ pattern: 'console.log($A)' });
    const result = runSearch([f1, f2, path.join(tmpDir, 'src/c.ts')], opts, tmpDir);
    expect(result.totalMatches).toBe(3);
    expect(result.totalFiles).toBe(2);
    expect(result.queryType).toBe('pattern');
  });

  it('searches with preset', () => {
    const f1 = writeFile('x.ts', 'try { a(); } catch(e) {}\ntry { b(); } catch(e) { log(e); }');
    const opts = defaultOpts({ preset: 'empty-catch' });
    const result = runSearch([f1], opts, tmpDir);
    expect(result.totalMatches).toBeGreaterThanOrEqual(1);
    expect(result.queryType).toBe('preset');
  });

  it('searches with kind', () => {
    const f1 = writeFile('fn.ts', 'function foo() {}\nfunction bar() {}\nconst x = 1;');
    const opts = defaultOpts({ kind: 'function_declaration' });
    const result = runSearch([f1], opts, tmpDir);
    expect(result.totalMatches).toBe(2);
    expect(result.queryType).toBe('kind');
  });

  it('respects limit across files', () => {
    const f1 = writeFile('a.ts', 'console.log(1);\nconsole.log(2);\nconsole.log(3);');
    const f2 = writeFile('b.ts', 'console.log(4);\nconsole.log(5);');
    const opts = defaultOpts({ pattern: 'console.log($A)', limit: 3 });
    const result = runSearch([f1, f2], opts, tmpDir);
    expect(result.totalMatches).toBe(3);
  });

  it('throws on unknown preset', () => {
    const f1 = writeFile('x.ts', 'const x = 1;');
    const opts = defaultOpts({ preset: 'nonexistent' });
    expect(() => runSearch([f1], opts, tmpDir)).toThrow(/Unknown preset.*nonexistent/);
  });

  it('throws when no search mode provided', () => {
    const f1 = writeFile('x.ts', 'const x = 1;');
    const opts = defaultOpts();
    expect(() => runSearch([f1], opts, tmpDir)).toThrow(/Must provide/);
  });
});


describe('collectSearchFiles', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ast-search-files-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('collects .ts and .js files', () => {
    fs.writeFileSync(path.join(tmpDir, 'a.ts'), '', 'utf8');
    fs.writeFileSync(path.join(tmpDir, 'b.js'), '', 'utf8');
    fs.writeFileSync(path.join(tmpDir, 'c.txt'), '', 'utf8');
    const files = collectSearchFiles(tmpDir, { includeTests: false, ignoreDirs: new Set() });
    expect(files).toHaveLength(2);
    expect(files.some(f => f.endsWith('a.ts'))).toBe(true);
    expect(files.some(f => f.endsWith('b.js'))).toBe(true);
  });

  it('excludes test files by default', () => {
    fs.writeFileSync(path.join(tmpDir, 'foo.ts'), '', 'utf8');
    fs.writeFileSync(path.join(tmpDir, 'foo.test.ts'), '', 'utf8');
    fs.writeFileSync(path.join(tmpDir, 'foo.spec.ts'), '', 'utf8');
    const files = collectSearchFiles(tmpDir, { includeTests: false, ignoreDirs: new Set() });
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/foo\.ts$/);
  });

  it('includes test files when flag is set', () => {
    fs.writeFileSync(path.join(tmpDir, 'foo.ts'), '', 'utf8');
    fs.writeFileSync(path.join(tmpDir, 'foo.test.ts'), '', 'utf8');
    const files = collectSearchFiles(tmpDir, { includeTests: true, ignoreDirs: new Set() });
    expect(files).toHaveLength(2);
  });

  it('skips ignored directories', () => {
    fs.mkdirSync(path.join(tmpDir, 'node_modules'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'node_modules', 'lib.ts'), '', 'utf8');
    fs.writeFileSync(path.join(tmpDir, 'main.ts'), '', 'utf8');
    const files = collectSearchFiles(tmpDir, { includeTests: false, ignoreDirs: new Set(['node_modules']) });
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/main\.ts$/);
  });

  it('skips .d.ts files', () => {
    fs.writeFileSync(path.join(tmpDir, 'index.ts'), '', 'utf8');
    fs.writeFileSync(path.join(tmpDir, 'index.d.ts'), '', 'utf8');
    const files = collectSearchFiles(tmpDir, { includeTests: false, ignoreDirs: new Set() });
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/index\.ts$/);
  });
});


describe('parseSearchArgs --rule error handling', () => {
  it('throws user-friendly error for invalid JSON', () => {
    expect(() => parseSearchArgs(['--rule', 'not-json'])).toThrow(/Invalid --rule JSON/);
  });

  it('includes the bad input in the error message', () => {
    expect(() => parseSearchArgs(['--rule', '{broken'])).toThrow(/\{broken/);
  });

  it('handles missing --rule value gracefully', () => {
    expect(() => parseSearchArgs(['--rule'])).toThrow(/Invalid --rule JSON/);
  });
});


describe('meta-variable extraction', () => {
  it('extracts single $VAR without duplicating variadic $$$VAR', () => {
    const source = 'console.log("hello");';
    const matches = searchFile('test.ts', source, 'console.$METHOD($$$ARGS)', 'console.$METHOD($$$ARGS)', 100);
    expect(matches.length).toBe(1);
    const vars = matches[0].metaVariables!;
    expect(vars['$METHOD']).toBe('log');
    expect(vars['$$$ARGS']).toBe('"hello"');
    expect(Object.keys(vars)).toHaveLength(2);
  });

  it('does not produce spurious single-var entries for variadic names', () => {
    const source = 'fn(1, 2, 3);';
    const matches = searchFile('test.ts', source, 'fn($$$ITEMS)', 'fn($$$ITEMS)', 100);
    expect(matches.length).toBe(1);
    const vars = matches[0].metaVariables!;
    expect(vars['$$$ITEMS']).toBeDefined();
    expect(vars['$ITEMS']).toBeUndefined();
  });

  it('handles pattern with both single and variadic meta-vars', () => {
    const source = 'import { foo, bar } from "lodash";';
    const matches = searchFile('test.ts', source, 'import { $$$NAMES } from $MOD', 'import { $$$NAMES } from $MOD', 100);
    expect(matches.length).toBe(1);
    const vars = matches[0].metaVariables!;
    expect(vars['$MOD']).toBe('"lodash"');
    expect(vars['$$$NAMES']).toBeDefined();
  });
});


describe('formatTextOutput with context', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ast-ctx-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function defaultOpts(overrides: Partial<AstSearchOptions> = {}): AstSearchOptions {
    return {
      root: tmpDir,
      pattern: null,
      kind: null,
      preset: null,
      rule: null,
      json: false,
      limit: 500,
      includeTests: false,
      ignoreDirs: new Set(['.git', 'node_modules', 'dist']),
      context: 0,
      ...overrides,
    };
  }

  it('shows context lines around matches when context > 0', () => {
    const source = 'line1\nline2\nconsole.log("hit");\nline4\nline5\n';
    const filePath = path.join(tmpDir, 'ctx.ts');
    fs.writeFileSync(filePath, source, 'utf8');

    const opts = defaultOpts({ pattern: 'console.log($$$A)', context: 1 });
    const result = runSearch([filePath], opts, tmpDir);

    expect(result._sourceByFile).toBeDefined();
    expect(result._sourceByFile!.size).toBe(1);

    const output = formatTextOutput(result, opts, tmpDir);
    expect(output).toContain('line2');
    expect(output).toContain('console.log("hit")');
    expect(output).toContain('line4');
    expect(output).toContain('>');
  });

  it('does not include _sourceByFile when context is 0', () => {
    const source = 'console.log("x");\n';
    const filePath = path.join(tmpDir, 'noctx.ts');
    fs.writeFileSync(filePath, source, 'utf8');

    const opts = defaultOpts({ pattern: 'console.log($$$A)', context: 0 });
    const result = runSearch([filePath], opts, tmpDir);
    expect(result._sourceByFile).toBeUndefined();
  });

  it('clamps context at file boundaries', () => {
    const source = 'console.log("first line");\nline2\n';
    const filePath = path.join(tmpDir, 'edge.ts');
    fs.writeFileSync(filePath, source, 'utf8');

    const opts = defaultOpts({ pattern: 'console.log($$$A)', context: 5 });
    const result = runSearch([filePath], opts, tmpDir);
    const output = formatTextOutput(result, opts, tmpDir);
    expect(output).toContain('console.log("first line")');
    expect(output).toContain('line2');
    expect(output).not.toContain('undefined');
  });
});
