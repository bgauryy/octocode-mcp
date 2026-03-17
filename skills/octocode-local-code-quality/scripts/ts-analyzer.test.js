import { describe, expect, it } from 'vitest';
import * as ts from 'typescript';
import { DEFAULT_OPTS } from './types.js';
import { isFunctionLike, getFunctionName, collectMetrics, buildDependencyCriticality, countLinesInNode, analyzeSourceFile, } from './ts-analyzer.js';
function parse(code, fileName = '/repo/src/test.ts') {
    return ts.createSourceFile(fileName, code, ts.ScriptTarget.ESNext, true);
}
function firstStatement(src) {
    return src.statements[0];
}
function emptyPackageSummary() {
    return { fileCount: 0, nodeCount: 0, functionCount: 0, flowCount: 0, kindCounts: {}, functions: [], flows: [] };
}
function emptyMaps() {
    return { flowMap: new Map(), controlMap: new Map() };
}
const emptyProfile = {
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
        const decl = firstStatement(src).declarationList.declarations[0];
        expect(isFunctionLike(decl.initializer)).toBe(true);
    });
    it('matches method declarations in class', () => {
        const src = parse('class A { method() {} }');
        const cls = firstStatement(src);
        const method = cls.members[0];
        expect(isFunctionLike(method)).toBe(true);
    });
    it('rejects non-function nodes', () => {
        const src = parse('const x = 1;');
        expect(isFunctionLike(firstStatement(src))).toBe(false);
    });
    it('matches getters and setters', () => {
        const src = parse('class A { get val() { return 1; } set val(v: number) {} }');
        const cls = firstStatement(src);
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
        const decl = firstStatement(src).declarationList.declarations[0];
        expect(getFunctionName(decl.initializer, src)).toBe('handler');
    });
    it('returns <anonymous> for unnamed function expression', () => {
        const src = parse('(function() {})');
        const expr = firstStatement(src).expression;
        const paren = expr.expression;
        expect(getFunctionName(paren, src)).toBe('<anonymous>');
    });
});
// ─── collectMetrics ─────────────────────────────────────────────────────────
describe('collectMetrics', () => {
    it('returns base complexity of 1 for empty function', () => {
        const src = parse('function f() {}');
        const fn = firstStatement(src);
        const metrics = collectMetrics(fn.body);
        expect(metrics.complexity).toBe(1);
        expect(metrics.maxBranchDepth).toBe(0);
        expect(metrics.returns).toBe(0);
    });
    it('increments complexity for if statement', () => {
        const src = parse('function f(x: boolean) { if (x) { return; } }');
        const fn = firstStatement(src);
        const metrics = collectMetrics(fn.body);
        expect(metrics.complexity).toBeGreaterThan(1);
    });
    it('tracks max branch depth', () => {
        const src = parse(`function f(a: boolean, b: boolean) {
      if (a) { if (b) { return; } }
    }`);
        const fn = firstStatement(src);
        const metrics = collectMetrics(fn.body);
        expect(metrics.maxBranchDepth).toBe(2);
    });
    it('tracks loop depth', () => {
        const src = parse(`function f() {
      for (let i = 0; i < 10; i++) {
        for (let j = 0; j < 10; j++) {}
      }
    }`);
        const fn = firstStatement(src);
        const metrics = collectMetrics(fn.body);
        expect(metrics.maxLoopDepth).toBe(2);
        expect(metrics.loops).toBe(2);
    });
    it('counts await expressions', () => {
        const src = parse('async function f() { await fetch("x"); await fetch("y"); }');
        const fn = firstStatement(src);
        const metrics = collectMetrics(fn.body);
        expect(metrics.awaits).toBe(2);
    });
    it('counts call expressions', () => {
        const src = parse('function f() { a(); b(); c(); }');
        const fn = firstStatement(src);
        const metrics = collectMetrics(fn.body);
        expect(metrics.calls).toBe(3);
    });
    it('counts return and throw statements', () => {
        const src = parse('function f(x: boolean) { if (x) return 1; throw new Error(); }');
        const fn = firstStatement(src);
        const metrics = collectMetrics(fn.body);
        expect(metrics.returns).toBe(2);
    });
    it('counts logical operators as complexity', () => {
        const src = parse('function f(a: boolean, b: boolean, c: boolean) { return a && b || c; }');
        const fn = firstStatement(src);
        const metrics = collectMetrics(fn.body);
        expect(metrics.complexity).toBeGreaterThanOrEqual(3);
    });
    it('handles switch + catch', () => {
        const src = parse(`function f(x: number) {
      switch(x) { case 1: break; case 2: break; }
      try {} catch(e) {}
    }`);
        const fn = firstStatement(src);
        const metrics = collectMetrics(fn.body);
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
        const entry = {
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
        const entry = {
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
        const trees = [];
        const result = analyzeSourceFile(src, 'test-pkg', summary, testOpts, maps, trees, emptyProfile);
        expect(result.functions.length).toBe(2);
        expect(result.functions[0].name).toBe('greet');
        expect(result.package).toBe('test-pkg');
    });
    it('extracts control flows', () => {
        const src = parse('function f(x: boolean) { if (x) { console.log(x); } }');
        const summary = emptyPackageSummary();
        const maps = emptyMaps();
        const trees = [];
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
});
