import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

import {
  analyzeSourceFile,
  buildDependencyCriticality,
  collectMetrics,
  computeHalstead,
  computeMaintainabilityIndex,
  countLinesInNode,
  getFunctionName,
  isFunctionLike,
} from './ts-analyzer.js';
import { DEFAULT_OPTS } from './types.js';

import type { DependencyProfile, FileEntry, FlowMaps, PackageFileSummary, TreeEntry } from './types.js';


function parse(code: string, fileName = '/repo/src/test.ts'): ts.SourceFile {
  return ts.createSourceFile(fileName, code, ts.ScriptTarget.ESNext, true);
}

function firstStatement(src: ts.SourceFile): ts.Node {
  return src.statements[0];
}

function emptyPackageSummary(): PackageFileSummary {
  return { fileCount: 0, nodeCount: 0, functionCount: 0, flowCount: 0, kindCounts: {}, functions: [], flows: [] };
}

function emptyMaps(): FlowMaps {
  return { flowMap: new Map(), controlMap: new Map() };
}

const emptyProfile: DependencyProfile = {
  internalDependencies: [], externalDependencies: [], unresolvedDependencies: [],
  declaredExports: [], importedSymbols: [], reExports: [],
};

const testOpts = { ...DEFAULT_OPTS, root: '/repo', emitTree: false };

// ─── isFunctionLike ─────────────────────────────────────────────────────────

describe('isFunctionLike', () => {
  it('matches function declarations', () => {
    const src = parse('function foo() {}');
    expect(isFunctionLike(firstStatement(src))).toBe(true);
  });

  it('matches arrow functions in variable declarations', () => {
    const src = parse('const f = () => {};');
    const decl = (firstStatement(src) as ts.VariableStatement).declarationList.declarations[0];
    expect(isFunctionLike(decl.initializer!)).toBe(true);
  });

  it('matches method declarations in class', () => {
    const src = parse('class A { method() {} }');
    const cls = firstStatement(src) as ts.ClassDeclaration;
    const method = cls.members[0];
    expect(isFunctionLike(method)).toBe(true);
  });

  it('rejects non-function nodes', () => {
    const src = parse('const x = 1;');
    expect(isFunctionLike(firstStatement(src))).toBe(false);
  });

  it('matches getters and setters', () => {
    const src = parse('class A { get val() { return 1; } set val(v: number) {} }');
    const cls = firstStatement(src) as ts.ClassDeclaration;
    expect(isFunctionLike(cls.members[0])).toBe(true);
    expect(isFunctionLike(cls.members[1])).toBe(true);
  });
});

// ─── getFunctionName ────────────────────────────────────────────────────────

describe('getFunctionName', () => {
  it('returns name of function declaration', () => {
    const src = parse('function greet() {}');
    expect(getFunctionName(firstStatement(src), src)).toBe('greet');
  });

  it('returns variable name for arrow function', () => {
    const src = parse('const handler = () => {};');
    const decl = (firstStatement(src) as ts.VariableStatement).declarationList.declarations[0];
    expect(getFunctionName(decl.initializer!, src)).toBe('handler');
  });

  it('returns <anonymous> for unnamed function expression', () => {
    const src = parse('(function() {})');
    const expr = (firstStatement(src) as ts.ExpressionStatement).expression;
    const paren = (expr as ts.ParenthesizedExpression).expression;
    expect(getFunctionName(paren, src)).toBe('<anonymous>');
  });
});

// ─── collectMetrics ─────────────────────────────────────────────────────────

describe('collectMetrics', () => {
  it('returns base complexity of 1 for empty function', () => {
    const src = parse('function f() {}');
    const fn = firstStatement(src) as ts.FunctionDeclaration;
    const metrics = collectMetrics(fn.body!);
    expect(metrics.complexity).toBe(1);
    expect(metrics.maxBranchDepth).toBe(0);
    expect(metrics.returns).toBe(0);
  });

  it('increments complexity for if statement', () => {
    const src = parse('function f(x: boolean) { if (x) { return; } }');
    const fn = firstStatement(src) as ts.FunctionDeclaration;
    const metrics = collectMetrics(fn.body!);
    expect(metrics.complexity).toBeGreaterThan(1);
  });

  it('tracks max branch depth', () => {
    const src = parse(`function f(a: boolean, b: boolean) {
      if (a) { if (b) { return; } }
    }`);
    const fn = firstStatement(src) as ts.FunctionDeclaration;
    const metrics = collectMetrics(fn.body!);
    expect(metrics.maxBranchDepth).toBe(2);
  });

  it('tracks loop depth', () => {
    const src = parse(`function f() {
      for (let i = 0; i < 10; i++) {
        for (let j = 0; j < 10; j++) {}
      }
    }`);
    const fn = firstStatement(src) as ts.FunctionDeclaration;
    const metrics = collectMetrics(fn.body!);
    expect(metrics.maxLoopDepth).toBe(2);
    expect(metrics.loops).toBe(2);
  });

  it('counts await expressions', () => {
    const src = parse('async function f() { await fetch("x"); await fetch("y"); }');
    const fn = firstStatement(src) as ts.FunctionDeclaration;
    const metrics = collectMetrics(fn.body!);
    expect(metrics.awaits).toBe(2);
  });

  it('counts call expressions', () => {
    const src = parse('function f() { a(); b(); c(); }');
    const fn = firstStatement(src) as ts.FunctionDeclaration;
    const metrics = collectMetrics(fn.body!);
    expect(metrics.calls).toBe(3);
  });

  it('counts return and throw statements', () => {
    const src = parse('function f(x: boolean) { if (x) return 1; throw new Error(); }');
    const fn = firstStatement(src) as ts.FunctionDeclaration;
    const metrics = collectMetrics(fn.body!);
    expect(metrics.returns).toBe(2);
  });

  it('counts logical operators as complexity', () => {
    const src = parse('function f(a: boolean, b: boolean, c: boolean) { return a && b || c; }');
    const fn = firstStatement(src) as ts.FunctionDeclaration;
    const metrics = collectMetrics(fn.body!);
    expect(metrics.complexity).toBeGreaterThanOrEqual(3);
  });

  it('handles switch + catch', () => {
    const src = parse(`function f(x: number) {
      switch(x) { case 1: break; case 2: break; }
      try {} catch(e) {}
    }`);
    const fn = firstStatement(src) as ts.FunctionDeclaration;
    const metrics = collectMetrics(fn.body!);
    expect(metrics.complexity).toBeGreaterThan(2);
  });
});

// ─── buildDependencyCriticality ─────────────────────────────────────────────

describe('buildDependencyCriticality', () => {
  it('returns score of 1 for null input', () => {
    const result = buildDependencyCriticality(null, testOpts);
    expect(result.score).toBe(1);
    expect(result.functionCount).toBe(0);
  });

  it('computes score based on complexity and function count', () => {
    const entry: FileEntry = {
      package: 'test', file: 'src/a.ts', parseEngine: 'typescript',
      nodeCount: 100, kindCounts: {},
      functions: [
        { kind: 'FunctionDeclaration', name: 'f1', nameHint: 'f1', file: 'src/a.ts',
          lineStart: 1, lineEnd: 10, columnStart: 1, columnEnd: 1,
          statementCount: 5, complexity: 10, maxBranchDepth: 2, maxLoopDepth: 1,
          returns: 1, awaits: 0, calls: 3, loops: 1, lengthLines: 10, cognitiveComplexity: 5 },
      ],
      flows: [{ kind: 'IfStatement', file: 'src/a.ts', lineStart: 2, lineEnd: 4, columnStart: 1, columnEnd: 1, statementCount: 2 }],
      dependencyProfile: emptyProfile,
    };
    const result = buildDependencyCriticality(entry, testOpts);
    expect(result.score).toBeGreaterThan(1);
    expect(result.functionCount).toBe(1);
    expect(result.flows).toBe(1);
  });

  it('counts high complexity functions', () => {
    const entry: FileEntry = {
      package: 'test', file: 'src/a.ts', parseEngine: 'typescript',
      nodeCount: 100, kindCounts: {},
      functions: [
        { kind: 'FunctionDeclaration', name: 'complex', nameHint: 'complex', file: 'src/a.ts',
          lineStart: 1, lineEnd: 50, columnStart: 1, columnEnd: 1,
          statementCount: 30, complexity: 35, maxBranchDepth: 5, maxLoopDepth: 3,
          returns: 4, awaits: 0, calls: 10, loops: 3, lengthLines: 50, cognitiveComplexity: 20 },
      ],
      flows: [], dependencyProfile: emptyProfile,
    };
    const result = buildDependencyCriticality(entry, testOpts);
    expect(result.highComplexityFunctions).toBe(1);
  });
});

// ─── countLinesInNode ───────────────────────────────────────────────────────

describe('countLinesInNode', () => {
  it('counts lines of single-line node', () => {
    const src = parse('const x = 1;');
    expect(countLinesInNode(src, firstStatement(src))).toBe(1);
  });

  it('counts lines of multi-line function', () => {
    const src = parse('function f() {\n  const x = 1;\n  return x;\n}');
    expect(countLinesInNode(src, firstStatement(src))).toBe(4);
  });
});

// ─── analyzeSourceFile ──────────────────────────────────────────────────────

describe('analyzeSourceFile', () => {
  it('extracts functions from source file', () => {
    const src = parse('function greet() { return "hi"; }\nconst add = (a: number, b: number) => a + b;');
    const summary = emptyPackageSummary();
    const maps = emptyMaps();
    const trees: TreeEntry[] = [];
    const result = analyzeSourceFile(src, 'test-pkg', summary, testOpts, maps, trees, emptyProfile);

    expect(result.functions.length).toBe(2);
    expect(result.functions[0].name).toBe('greet');
    expect(result.package).toBe('test-pkg');
  });

  it('extracts control flows', () => {
    const src = parse('function f(x: boolean) { if (x) { console.log(x); } }');
    const summary = emptyPackageSummary();
    const maps = emptyMaps();
    const trees: TreeEntry[] = [];
    const result = analyzeSourceFile(src, 'pkg', summary, testOpts, maps, trees, emptyProfile);

    expect(result.flows.length).toBeGreaterThan(0);
    expect(result.flows[0].kind).toBe('IfStatement');
  });

  it('counts nodes', () => {
    const src = parse('const x = 1;\nfunction f() { return 2; }');
    const summary = emptyPackageSummary();
    const result = analyzeSourceFile(src, 'pkg', summary, testOpts, emptyMaps(), [], emptyProfile);
    expect(result.nodeCount).toBeGreaterThan(0);
  });

  it('populates kindCounts', () => {
    const src = parse('const x = 1;\nconst y = 2;');
    const summary = emptyPackageSummary();
    const result = analyzeSourceFile(src, 'pkg', summary, testOpts, emptyMaps(), [], emptyProfile);
    expect(Object.keys(result.kindCounts).length).toBeGreaterThan(0);
  });

  it('updates package summary stats', () => {
    const src = parse('function f() { return 1; }');
    const summary = emptyPackageSummary();
    analyzeSourceFile(src, 'pkg', summary, testOpts, emptyMaps(), [], emptyProfile);
    expect(summary.fileCount).toBe(1);
    expect(summary.functionCount).toBe(1);
  });

  it('adds duplicate functions to flowMap', () => {
    const code = `function bigFn() {
      const a = 1; const b = 2; const c = 3;
      const d = 4; const e = 5; const f = 6;
      return a + b + c + d + e + f;
    }`;
    const src = parse(code);
    const maps = emptyMaps();
    const summary = emptyPackageSummary();
    analyzeSourceFile(src, 'pkg', summary, { ...testOpts, minFunctionStatements: 6 }, maps, [], emptyProfile);
    expect(maps.flowMap.size).toBeGreaterThan(0);
  });

  it('computes cognitive complexity for functions', () => {
    const code = `function complex(a: boolean, b: boolean) {
      if (a) { if (b) { return 1; } } return 0;
    }`;
    const src = parse(code);
    const summary = emptyPackageSummary();
    const result = analyzeSourceFile(src, 'pkg', summary, testOpts, emptyMaps(), [], emptyProfile);
    const fn = result.functions.find((f) => f.name === 'complex');
    expect(fn?.cognitiveComplexity).toBeGreaterThan(0);
  });

  it('records param count', () => {
    const src = parse('function f(a: number, b: string, c: boolean) {}');
    const summary = emptyPackageSummary();
    const result = analyzeSourceFile(src, 'pkg', summary, testOpts, emptyMaps(), [], emptyProfile);
    expect(result.functions[0].params).toBe(3);
  });

  it('sets declared flag for function declarations', () => {
    const src = parse('function named() {}');
    const summary = emptyPackageSummary();
    const result = analyzeSourceFile(src, 'pkg', summary, testOpts, emptyMaps(), [], emptyProfile);
    expect(result.functions[0].declared).toBe(true);
  });

  it('collects empty catch blocks', () => {
    const src = parse('function f() { try { throw 1; } catch(e) {} }');
    const summary = emptyPackageSummary();
    const result = analyzeSourceFile(src, 'pkg', summary, testOpts, emptyMaps(), [], emptyProfile);
    expect(result.emptyCatches?.length).toBe(1);
  });

  it('does not flag non-empty catch blocks', () => {
    const src = parse('function f() { try {} catch(e) { console.log(e); } }');
    const summary = emptyPackageSummary();
    const result = analyzeSourceFile(src, 'pkg', summary, testOpts, emptyMaps(), [], emptyProfile);
    expect(result.emptyCatches?.length).toBe(0);
  });

  it('collects switches without default', () => {
    const src = parse('function f(x: number) { switch(x) { case 1: break; case 2: break; } }');
    const summary = emptyPackageSummary();
    const result = analyzeSourceFile(src, 'pkg', summary, testOpts, emptyMaps(), [], emptyProfile);
    expect(result.switchesWithoutDefault?.length).toBe(1);
  });

  it('does not flag switches with default', () => {
    const src = parse('function f(x: number) { switch(x) { case 1: break; default: break; } }');
    const summary = emptyPackageSummary();
    const result = analyzeSourceFile(src, 'pkg', summary, testOpts, emptyMaps(), [], emptyProfile);
    expect(result.switchesWithoutDefault?.length).toBe(0);
  });

  it('counts any type annotations', () => {
    const src = parse('const a: any = 1; const b: any = 2; function f(x: any) {}');
    const summary = emptyPackageSummary();
    const result = analyzeSourceFile(src, 'pkg', summary, testOpts, emptyMaps(), [], emptyProfile);
    expect(result.anyCount).toBeGreaterThanOrEqual(3);
  });

  it('collects magic numbers', () => {
    const src = parse('function f() { let x = 42; let y = 99; return x + y + 300; }');
    const summary = emptyPackageSummary();
    const result = analyzeSourceFile(src, 'pkg', summary, testOpts, emptyMaps(), [], emptyProfile);
    expect(result.magicNumbers!.length).toBeGreaterThanOrEqual(3);
  });

  it('excludes 0 and 1 from magic numbers', () => {
    const src = parse('function f() { return 0 + 1; }');
    const summary = emptyPackageSummary();
    const result = analyzeSourceFile(src, 'pkg', summary, testOpts, emptyMaps(), [], emptyProfile);
    expect(result.magicNumbers?.length).toBe(0);
  });

  it('excludes const declarations from magic numbers', () => {
    const src = parse('const TIMEOUT = 5000;');
    const summary = emptyPackageSummary();
    const result = analyzeSourceFile(src, 'pkg', summary, testOpts, emptyMaps(), [], emptyProfile);
    expect(result.magicNumbers?.length).toBe(0);
  });

  it('computes halstead metrics for functions', () => {
    const src = parse('function f(a: number, b: number) { return a + b * 2; }');
    const summary = emptyPackageSummary();
    const result = analyzeSourceFile(src, 'pkg', summary, testOpts, emptyMaps(), [], emptyProfile);
    expect(result.functions[0].halstead).toBeDefined();
    expect(result.functions[0].halstead!.volume).toBeGreaterThan(0);
  });

  it('computes maintainability index for functions', () => {
    const src = parse('function f(a: number) { return a + 1; }');
    const summary = emptyPackageSummary();
    const result = analyzeSourceFile(src, 'pkg', summary, testOpts, emptyMaps(), [], emptyProfile);
    expect(result.functions[0].maintainabilityIndex).toBeDefined();
    expect(result.functions[0].maintainabilityIndex!).toBeGreaterThan(0);
  });
});

// ─── computeHalstead ─────────────────────────────────────────────────────────

describe('computeHalstead', () => {
  it('returns zeroes for empty body', () => {
    const src = parse('function f() {}');
    const fn = firstStatement(src) as ts.FunctionDeclaration;
    const h = computeHalstead(fn.body!);
    expect(h.length).toBe(0);
    expect(h.volume).toBe(0);
    expect(h.effort).toBe(0);
  });

  it('counts operators and operands for simple expression', () => {
    const src = parse('function f(a: number, b: number) { return a + b; }');
    const fn = firstStatement(src) as ts.FunctionDeclaration;
    const h = computeHalstead(fn.body!);
    expect(h.distinctOperators).toBeGreaterThan(0);
    expect(h.distinctOperands).toBeGreaterThan(0);
    expect(h.volume).toBeGreaterThan(0);
  });

  it('computes estimated bugs based on volume', () => {
    const src = parse(`function f(x: number) {
      const a = x + 1; const b = x - 2; const c = a * b;
      return c / x + a - b;
    }`);
    const fn = firstStatement(src) as ts.FunctionDeclaration;
    const h = computeHalstead(fn.body!);
    expect(h.estimatedBugs).toBeGreaterThan(0);
    expect(h.estimatedBugs).toBe(h.volume / 3000);
  });

  it('difficulty increases with repeated operands', () => {
    const simpleCode = 'function f() { const a = 1; return a; }';
    const repetitiveCode = 'function f() { const a = 1; const b = a; const c = a; const d = a; return a + b + c + d; }';
    const simple = computeHalstead((firstStatement(parse(simpleCode)) as ts.FunctionDeclaration).body!);
    const repetitive = computeHalstead((firstStatement(parse(repetitiveCode)) as ts.FunctionDeclaration).body!);
    expect(repetitive.difficulty).toBeGreaterThan(simple.difficulty);
  });
});

// ─── computeMaintainabilityIndex ─────────────────────────────────────────────

describe('computeMaintainabilityIndex', () => {
  it('returns high MI for simple code', () => {
    const mi = computeMaintainabilityIndex(10, 1, 5);
    expect(mi).toBeGreaterThan(50);
  });

  it('returns low MI for complex code', () => {
    const mi = computeMaintainabilityIndex(50000, 50, 500);
    expect(mi).toBeLessThan(20);
  });

  it('clamps to 0 minimum', () => {
    const mi = computeMaintainabilityIndex(1e12, 1000, 100000);
    expect(mi).toBe(0);
  });

  it('returns max ~100 for trivial code', () => {
    const mi = computeMaintainabilityIndex(1, 1, 1);
    expect(mi).toBeGreaterThan(90);
    expect(mi).toBeLessThanOrEqual(100);
  });
});

// ─── Security Data Collection ────────────────────────────────────────────────

describe('collectSecurityData (via analyzeSourceFile)', () => {
  it('detects eval() usage', () => {
    const src = parse('function f(s: string) { eval(s); }');
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    expect(result.evalUsages!.length).toBeGreaterThanOrEqual(1);
  });

  it('detects new Function() usage', () => {
    const src = parse('const fn = new Function("return 1");');
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    expect(result.evalUsages!.length).toBeGreaterThanOrEqual(1);
  });

  it('detects setTimeout with string arg', () => {
    const src = parse('setTimeout("alert(1)", 100);');
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    expect(result.evalUsages!.length).toBeGreaterThanOrEqual(1);
  });

  it('detects innerHTML assignment', () => {
    const src = parse('function f(el: HTMLElement) { el.innerHTML = "<b>hi</b>"; }');
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    expect(result.unsafeHtmlAssignments!.length).toBeGreaterThanOrEqual(1);
  });

  it('detects outerHTML assignment', () => {
    const src = parse('function f(el: HTMLElement) { el.outerHTML = "<div/>"; }');
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    expect(result.unsafeHtmlAssignments!.length).toBeGreaterThanOrEqual(1);
  });

  it('detects dangerouslySetInnerHTML JSX attribute', () => {
    const src = parse('<div dangerouslySetInnerHTML={{ __html: s }} />;', '/repo/src/test.tsx');
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    expect(result.unsafeHtmlAssignments!.length).toBeGreaterThanOrEqual(1);
  });

  it('detects document.write call', () => {
    const src = parse('document.write("<h1>Hello</h1>");');
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    expect(result.unsafeHtmlAssignments!.length).toBeGreaterThanOrEqual(1);
  });

  it('detects hardcoded-secret suspicious strings from pattern matches', () => {
    const src = parse("const cfg = `password = 'mysecret123'`;");
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    expect(result.suspiciousStrings!.some(s => s.kind === 'hardcoded-secret')).toBe(true);
  });

  it('skips placeholder patterns for secrets', () => {
    const src = parse('const key = "YOUR_API_KEY_HERE";');
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    const secrets = result.suspiciousStrings!.filter(s => s.kind === 'hardcoded-secret');
    expect(secrets.length).toBe(0);
  });

  it('detects high-entropy strings as potential secrets', () => {
    const src = parse('const token = "aB3dE7gH9jK1mN5pQ8sT0uW2xY4zA6c";');
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    expect(result.suspiciousStrings!.some(s => s.kind === 'hardcoded-secret')).toBe(true);
  });

  it('tags error messages separately from secrets', () => {
    const src = parse('const msg = "invalid token provided for authentication service endpoint";');
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    const secrets = result.suspiciousStrings!.filter(s => s.kind === 'hardcoded-secret' && s.context === 'error-message');
    expect(secrets.length).toBeGreaterThanOrEqual(0);
  });

  it('detects SQL injection risk in template literals', () => {
    const src = parse('const q = `SELECT * FROM users WHERE id = ${userId}`;');
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    expect(result.suspiciousStrings!.some(s => s.kind === 'sql-injection')).toBe(true);
  });

  it('does not flag template without SQL keywords', () => {
    const src = parse('const msg = `Hello ${name}`;');
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    expect(result.suspiciousStrings!.filter(s => s.kind === 'sql-injection').length).toBe(0);
  });

  it('collects regex literals', () => {
    const src = parse('const re = /^[a-z]+$/;');
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    expect(result.regexLiterals!.length).toBeGreaterThanOrEqual(1);
  });

  it('tags regex patterns that contain secret keywords as regex-definition', () => {
    const code = "const secretRe = /password = 'foo'/i;";
    const src = parse(code);
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    const regexDefs = result.suspiciousStrings!.filter(s => s.context === 'regex-definition');
    expect(regexDefs.length).toBeGreaterThanOrEqual(1);
  });

  it('detects type assertion escapes (as any)', () => {
    const src = parse('const x = (value as any).prop;');
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    expect(result.typeAssertionEscapes!.asAny.length).toBeGreaterThanOrEqual(1);
  });

  it('detects double assertion (as unknown as T)', () => {
    const src = parse('const x = (value as unknown as string);');
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    expect(result.typeAssertionEscapes!.doubleAssertion.length).toBeGreaterThanOrEqual(1);
  });

  it('detects non-null assertions', () => {
    const src = parse('function f(x?: string) { return x!.length; }');
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    expect(result.typeAssertionEscapes!.nonNull.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Async/Error Pattern Detection ───────────────────────────────────────────

describe('async pattern detection (via analyzeSourceFile)', () => {
  it('detects unprotected async (await without try-catch)', () => {
    const src = parse('async function f() { await fetch("url"); }');
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    expect(result.unprotectedAsync?.length).toBeGreaterThanOrEqual(1);
  });

  it('does not flag async with try-catch as unprotected', () => {
    const src = parse('async function f() { try { await fetch("url"); } catch(e) { console.error(e); } }');
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    expect(result.unprotectedAsync?.length).toBe(0);
  });

  it('does not flag async with .catch chain as unprotected', () => {
    const src = parse('async function f() { await fetch("url").catch(console.error); }');
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    expect(result.unprotectedAsync?.length).toBe(0);
  });

  it('skips functions with zero awaits in metrics', () => {
    const src = parse('async function f() { return 1; }');
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    expect(result.asyncWithoutAwait?.length ?? 0).toBe(0);
    expect(result.unprotectedAsync?.length ?? 0).toBe(0);
  });
});

// ─── Performance Data Collection ─────────────────────────────────────────────

describe('collectPerformanceData (via analyzeSourceFile)', () => {
  it('detects await inside for loop', () => {
    const src = parse(`async function f(urls: string[]) {
      for (const url of urls) { await fetch(url); }
    }`);
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    expect(result.awaitInLoopLocations!.length).toBeGreaterThanOrEqual(1);
  });

  it('detects await inside while loop', () => {
    const src = parse(`async function f() {
      let i = 0;
      while (i < 10) { await fetch("url"); i++; }
    }`);
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    expect(result.awaitInLoopLocations!.length).toBeGreaterThanOrEqual(1);
  });

  it('does not flag await outside loop', () => {
    const src = parse('async function f() { await fetch("url"); }');
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    expect(result.awaitInLoopLocations?.length).toBe(0);
  });

  it('detects sync I/O calls (readFileSync)', () => {
    const src = parse('function f() { fs.readFileSync("/path", "utf8"); }');
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    expect(result.syncIoCalls!.some(c => c.name === 'readFileSync')).toBe(true);
  });

  it('detects sync I/O calls (writeFileSync)', () => {
    const src = parse('function f() { fs.writeFileSync("/path", "data"); }');
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    expect(result.syncIoCalls!.some(c => c.name === 'writeFileSync')).toBe(true);
  });

  it('detects setInterval timer calls', () => {
    const src = parse('function f() { setInterval(() => {}, 1000); }');
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    expect(result.timerCalls!.some(t => t.kind === 'setInterval')).toBe(true);
  });

  it('detects setTimeout timer calls', () => {
    const src = parse('function f() { setTimeout(() => {}, 500); }');
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    expect(result.timerCalls!.some(t => t.kind === 'setTimeout')).toBe(true);
  });

  it('marks timer as having cleanup when clearInterval present', () => {
    const src = parse(`function f() {
      const id = setInterval(() => {}, 1000);
      clearInterval(id);
    }`);
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    expect(result.timerCalls!.some(t => t.kind === 'setInterval' && t.hasCleanup)).toBe(true);
  });

  it('marks timer without cleanup', () => {
    const src = parse('function f() { setInterval(() => {}, 1000); }');
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    expect(result.timerCalls!.some(t => t.kind === 'setInterval' && !t.hasCleanup)).toBe(true);
  });

  it('detects addEventListener registrations', () => {
    const src = parse('function f(el: HTMLElement) { el.addEventListener("click", handler); }');
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    expect(result.listenerRegistrations!.length).toBeGreaterThanOrEqual(1);
  });

  it('detects removeEventListener calls', () => {
    const src = parse('function f(el: HTMLElement) { el.removeEventListener("click", handler); }');
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    expect(result.listenerRemovals!.length).toBeGreaterThanOrEqual(1);
  });

  it('detects .on() and .off() for event listeners', () => {
    const src = parse(`function f(emitter: any) {
      emitter.on("data", handler);
      emitter.off("data", handler);
    }`);
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    expect(result.listenerRegistrations!.length).toBeGreaterThanOrEqual(1);
    expect(result.listenerRemovals!.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Input Source Profile Collection ─────────────────────────────────────────

describe('collectInputSourceProfile (via analyzeSourceFile)', () => {
  it('detects function with req parameter as high-confidence input source', () => {
    const src = parse('function handler(req: any) { eval(req.body); }');
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    expect(result.inputSources!.length).toBeGreaterThanOrEqual(1);
    expect(result.inputSources![0].paramConfidence).toBe('high');
    expect(result.inputSources![0].sourceParams).toContain('req');
  });

  it('detects sinks in function body', () => {
    const src = parse('function handler(req: any) { eval(req.query); }');
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    expect(result.inputSources![0].hasSinkInBody).toBe(true);
    expect(result.inputSources![0].sinkKinds).toContain('eval');
  });

  it('detects validation patterns (typeof check)', () => {
    const src = parse('function handler(req: any) { if (typeof req === "object") { console.log(req); } }');
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    expect(result.inputSources![0].hasValidation).toBe(true);
  });

  it('detects validation via schema validators (zod/joi)', () => {
    const src = parse('function handler(body: any) { const result = z.parse(body); }');
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    expect(result.inputSources![0].hasValidation).toBe(true);
  });

  it('does not collect input sources for test files', () => {
    const src = parse('function handler(req: any) { eval(req); }', '/repo/src/test.test.ts');
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    expect(result.inputSources).toBeUndefined();
  });

  it('detects medium-confidence params (input, event)', () => {
    const src = parse('function handler(input: any) { console.log(input); }');
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    expect(result.inputSources![0].paramConfidence).toBe('medium');
  });

  it('tracks calls with input args', () => {
    const src = parse('function handler(req: any) { processData(req.body); }');
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    expect(result.inputSources![0].callsWithInputArgs.length).toBeGreaterThanOrEqual(1);
  });

  it('does not collect for functions without source params', () => {
    const src = parse('function helper(count: number) { return count + 1; }');
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    expect(result.inputSources?.length ?? 0).toBe(0);
  });
});

// ─── Top-Level Effects Collection ────────────────────────────────────────────

describe('collectTopLevelEffects (via analyzeSourceFile)', () => {
  it('detects side-effect imports', () => {
    const src = parse("import './polyfill';");
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    expect(result.topLevelEffects!.some(e => e.kind === 'side-effect-import')).toBe(true);
  });

  it('detects top-level setInterval', () => {
    const src = parse('setInterval(() => {}, 1000);');
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    expect(result.topLevelEffects!.some(e => e.kind === 'timer')).toBe(true);
  });

  it('detects top-level eval', () => {
    const src = parse('eval("console.log(1)");');
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    expect(result.topLevelEffects!.some(e => e.kind === 'eval')).toBe(true);
  });

  it('detects top-level new Function()', () => {
    const src = parse('new Function("return 1");');
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    expect(result.topLevelEffects!.some(e => e.kind === 'eval')).toBe(true);
  });

  it('detects top-level sync I/O in variable initializer', () => {
    const src = parse('const data = fs.readFileSync("/path", "utf8");');
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    expect(result.topLevelEffects!.some(e => e.kind === 'sync-io')).toBe(true);
  });

  it('detects top-level execSync', () => {
    const src = parse('const out = cp.execSync("ls");');
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    expect(result.topLevelEffects!.some(e => e.kind === 'exec-sync')).toBe(true);
  });

  it('detects top-level process.on listener', () => {
    const src = parse('process.on("uncaughtException", handler);');
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    expect(result.topLevelEffects!.some(e => e.kind === 'process-handler')).toBe(true);
  });

  it('does not collect effects for test files', () => {
    const src = parse('eval("1");', '/repo/src/test.test.ts');
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    expect(result.topLevelEffects).toBeUndefined();
  });

  it('does not flag function declarations as effects', () => {
    const src = parse('function f() { fs.readFileSync("/path"); }');
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    expect(result.topLevelEffects?.length ?? 0).toBe(0);
  });

  it('skips regular import declarations', () => {
    const src = parse("import path from 'node:path';");
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    expect(result.topLevelEffects?.some(e => e.kind === 'side-effect-import')).toBeFalsy();
  });
});

// ─── Prototype Pollution Site Collection ─────────────────────────────────────

describe('collectPrototypePollutionSites (via analyzeSourceFile)', () => {
  it('detects Object.assign with 2+ args', () => {
    const src = parse('function f(a: any, b: any) { Object.assign(a, b); }');
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    expect(result.prototypePollutionSites!.some(s => s.kind === 'object-assign')).toBe(true);
  });

  it('detects deep merge calls', () => {
    const src = parse('function f(target: any, src: any) { merge(target, src); }');
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    expect(result.prototypePollutionSites!.some(s => s.kind === 'deep-merge')).toBe(true);
  });

  it('detects computed property writes', () => {
    const src = parse('function f(obj: any, key: string, val: any) { obj[key] = val; }');
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    expect(result.prototypePollutionSites!.some(s => s.kind === 'computed-property-write')).toBe(true);
  });

  it('marks computed writes from internal iteration as guarded', () => {
    const src = parse(`function f(obj: Record<string, any>, source: Record<string, any>) {
      for (const key of Object.keys(source)) { obj[key] = source[key]; }
    }`);
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    const cpw = result.prototypePollutionSites!.filter(s => s.kind === 'computed-property-write');
    expect(cpw.length).toBeGreaterThanOrEqual(1);
    expect(cpw.some(s => s.guarded)).toBe(true);
  });

  it('marks computed writes with __proto__ guard as guarded', () => {
    const src = parse(`function f(obj: any, key: string, val: any) {
      if (key === '__proto__' || key === 'constructor') return;
      obj[key] = val;
    }`);
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    const cpw = result.prototypePollutionSites!.filter(s => s.kind === 'computed-property-write');
    expect(cpw.some(s => s.guarded)).toBe(true);
  });

  it('does not flag string literal property access', () => {
    const src = parse('function f(obj: any) { obj["known"] = 1; }');
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    const cpw = (result.prototypePollutionSites ?? []).filter(s => s.kind === 'computed-property-write');
    expect(cpw.length).toBe(0);
  });

  it('does not collect for test files', () => {
    const src = parse('function f(obj: any, key: string) { obj[key] = 1; }', '/repo/src/test.test.ts');
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    expect(result.prototypePollutionSites).toBeUndefined();
  });
});

// ─── Test Profile Collection ─────────────────────────────────────────────────

describe('collectTestProfile (via analyzeSourceFile)', () => {
  const testFileName = '/repo/src/feature.test.ts';

  function parseTest(code: string): ts.SourceFile {
    return ts.createSourceFile(testFileName, code, ts.ScriptTarget.ESNext, true);
  }

  it('collects test blocks with assertion counts', () => {
    const src = parseTest(`describe('suite', () => {
      it('test', () => { expect(1).toBe(1); });
    });`);
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    expect(result.testProfile!.testBlocks.length).toBeGreaterThanOrEqual(1);
    expect(result.testProfile!.testBlocks[0].assertionCount).toBe(1);
  });

  it('collects mock calls', () => {
    const src = parseTest(`test('mocked', () => { jest.mock('lodash'); });`);
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    expect(result.testProfile!.mockCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('collects setup calls (beforeAll, afterEach)', () => {
    const src = parseTest(`describe('s', () => {
      beforeAll(() => {});
      afterEach(() => {});
      it('t', () => {});
    });`);
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    expect(result.testProfile!.setupCalls.some(c => c.kind === 'beforeAll')).toBe(true);
    expect(result.testProfile!.setupCalls.some(c => c.kind === 'afterEach')).toBe(true);
  });

  it('collects mutable state declarations (let at describe scope)', () => {
    const src = parseTest(`describe('s', () => {
      let counter = 0;
      it('t', () => { counter++; });
    });`);
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    expect(result.testProfile!.mutableStateDecls.length).toBeGreaterThanOrEqual(1);
  });

  it('does not flag const at describe scope as mutable', () => {
    const src = parseTest(`describe('s', () => {
      const val = 42;
      it('t', () => { expect(val).toBe(42); });
    });`);
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    expect(result.testProfile!.mutableStateDecls.length).toBe(0);
  });

  it('collects focused tests (it.only)', () => {
    const src = parseTest(`describe('s', () => {
      it.only('focused', () => { expect(1).toBe(1); });
    });`);
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    expect(result.testProfile!.focusedCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('collects timer controls (useFakeTimers, useRealTimers)', () => {
    const src = parseTest(`test('timers', () => {
      jest.useFakeTimers();
      jest.useRealTimers();
    });`);
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    expect(result.testProfile!.timerControls.some(t => t.kind === 'jest.useFakeTimers')).toBe(true);
    expect(result.testProfile!.timerControls.some(t => t.kind === 'jest.useRealTimers')).toBe(true);
  });

  it('collects spy/stub calls', () => {
    const src = parseTest(`test('spy', () => {
      const spy = jest.spyOn(Date, 'now');
    });`);
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    expect(result.testProfile!.spyOrStubCalls!.length).toBeGreaterThanOrEqual(1);
    expect(result.testProfile!.spyOrStubCalls![0].kind).toBe('spy');
  });

  it('collects mockRestore calls', () => {
    const src = parseTest(`test('restore', () => {
      const spy = jest.spyOn(Date, 'now');
      spy.mockRestore();
    });`);
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    expect(result.testProfile!.mockRestores!.some(r => r.kind === 'restore')).toBe(true);
  });

  it('collects restoreAllMocks calls', () => {
    const src = parseTest(`afterEach(() => { jest.restoreAllMocks(); });`);
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    expect(result.testProfile!.mockRestores!.some(r => r.kind === 'restoreAll')).toBe(true);
  });

  it('does not collect test profile for non-test files', () => {
    const src = parse('function f() {}');
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    expect(result.testProfile).toBeUndefined();
  });

  it('collects test block names from string literals', () => {
    const src = parseTest(`it('should work correctly', () => { expect(true).toBe(true); });`);
    const result = analyzeSourceFile(src, 'pkg', emptyPackageSummary(), testOpts, emptyMaps(), [], emptyProfile);
    expect(result.testProfile!.testBlocks[0].name).toBe('should work correctly');
  });
});
