import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { getFunctionName, isFunctionLike } from './ast-helpers.js';

function parse(code: string): ts.SourceFile {
  return ts.createSourceFile('test.ts', code, ts.ScriptTarget.ESNext, true);
}

function findFirst(
  node: ts.Node,
  predicate: (n: ts.Node) => boolean
): ts.Node | undefined {
  if (predicate(node)) return node;
  let found: ts.Node | undefined;
  ts.forEachChild(node, (child) => {
    if (!found) found = findFirst(child, predicate);
  });
  return found;
}

describe('isFunctionLike', () => {
  it('returns true for FunctionDeclaration', () => {
    const sf = parse('function foo() {}');
    const node = findFirst(sf, ts.isFunctionDeclaration)!;
    expect(node).toBeDefined();
    expect(isFunctionLike(node)).toBe(true);
  });

  it('returns true for FunctionExpression', () => {
    const sf = parse('const fn = function() {};');
    const node = findFirst(sf, ts.isFunctionExpression)!;
    expect(node).toBeDefined();
    expect(isFunctionLike(node)).toBe(true);
  });

  it('returns true for ArrowFunction', () => {
    const sf = parse('const fn = () => {};');
    const node = findFirst(sf, ts.isArrowFunction)!;
    expect(node).toBeDefined();
    expect(isFunctionLike(node)).toBe(true);
  });

  it('returns true for MethodDeclaration', () => {
    const sf = parse('class C { doStuff() {} }');
    const node = findFirst(sf, ts.isMethodDeclaration)!;
    expect(node).toBeDefined();
    expect(isFunctionLike(node)).toBe(true);
  });

  it('returns true for ConstructorDeclaration', () => {
    const sf = parse('class C { constructor() {} }');
    const node = findFirst(sf, ts.isConstructorDeclaration)!;
    expect(node).toBeDefined();
    expect(isFunctionLike(node)).toBe(true);
  });

  it('returns true for GetAccessor', () => {
    const sf = parse('class C { get val() { return 1; } }');
    const node = findFirst(sf, ts.isGetAccessor)!;
    expect(node).toBeDefined();
    expect(isFunctionLike(node)).toBe(true);
  });

  it('returns true for SetAccessor', () => {
    const sf = parse('class C { set val(v: number) {} }');
    const node = findFirst(sf, ts.isSetAccessor)!;
    expect(node).toBeDefined();
    expect(isFunctionLike(node)).toBe(true);
  });

  it('returns false for VariableStatement', () => {
    const sf = parse('const x = 1;');
    const node = findFirst(sf, ts.isVariableStatement)!;
    expect(node).toBeDefined();
    expect(isFunctionLike(node)).toBe(false);
  });

  it('returns false for ClassDeclaration', () => {
    const sf = parse('class C {}');
    const node = findFirst(sf, ts.isClassDeclaration)!;
    expect(node).toBeDefined();
    expect(isFunctionLike(node)).toBe(false);
  });

  it('returns false for PropertyAssignment', () => {
    const sf = parse('const o = { a: 1 };');
    const node = findFirst(sf, ts.isPropertyAssignment)!;
    expect(node).toBeDefined();
    expect(isFunctionLike(node)).toBe(false);
  });

  it('returns false for Identifier', () => {
    const sf = parse('const x = 1;');
    const node = findFirst(sf, ts.isIdentifier)!;
    expect(node).toBeDefined();
    expect(isFunctionLike(node)).toBe(false);
  });
});

describe('getFunctionName', () => {
  it('resolves named function declaration', () => {
    const sf = parse('function foo() {}');
    const node = findFirst(sf, ts.isFunctionDeclaration)!;
    expect(getFunctionName(node, sf)).toBe('foo');
  });

  it('resolves arrow function in variable', () => {
    const sf = parse('const bar = () => {};');
    const node = findFirst(sf, ts.isArrowFunction)!;
    expect(getFunctionName(node, sf)).toBe('bar');
  });

  it('resolves function expression in variable', () => {
    const sf = parse('const baz = function() {};');
    const node = findFirst(sf, ts.isFunctionExpression)!;
    expect(getFunctionName(node, sf)).toBe('baz');
  });

  it('resolves method declaration', () => {
    const sf = parse('class C { doStuff() {} }');
    const node = findFirst(sf, ts.isMethodDeclaration)!;
    expect(getFunctionName(node, sf)).toBe('doStuff');
  });

  it('resolves property assignment', () => {
    const sf = parse('const obj = { handler: function() {} };');
    const node = findFirst(sf, ts.isFunctionExpression)!;
    expect(getFunctionName(node, sf)).toBe('handler');
  });

  it('resolves property declaration in class', () => {
    const sf = parse('class C { prop = () => {} }');
    const node = findFirst(sf, ts.isArrowFunction)!;
    expect(getFunctionName(node, sf)).toBe('prop');
  });

  it('resolves get accessor', () => {
    const sf = parse('class C { get val() { return 1; } }');
    const node = findFirst(sf, ts.isGetAccessor)!;
    expect(getFunctionName(node, sf)).toBe('val');
  });

  it('resolves set accessor', () => {
    const sf = parse('class C { set val(v: number) {} }');
    const node = findFirst(sf, ts.isSetAccessor)!;
    expect(getFunctionName(node, sf)).toBe('val');
  });

  it('returns <anonymous> for anonymous arrow not in variable', () => {
    const sf = parse('[1, 2].map(() => {});');
    const node = findFirst(sf, ts.isArrowFunction)!;
    expect(getFunctionName(node, sf)).toBe('<anonymous>');
  });

  it('returns <anonymous> for constructor', () => {
    const sf = parse('class C { constructor() {} }');
    const node = findFirst(sf, ts.isConstructorDeclaration)!;
    expect(getFunctionName(node, sf)).toBe('<anonymous>');
  });

  it('resolves named function expression', () => {
    const sf = parse('const fn = function namedFn() {};');
    const node = findFirst(sf, ts.isFunctionExpression)!;
    expect(getFunctionName(node, sf)).toBe('namedFn');
  });

  it('returns <anonymous> for IIFE', () => {
    const sf = parse('(function() {})();');
    const node = findFirst(sf, ts.isFunctionExpression)!;
    expect(getFunctionName(node, sf)).toBe('<anonymous>');
  });

  it('resolves arrow in destructured assignment', () => {
    const sf = parse('const { onLoad } = { onLoad: () => {} };');
    const node = findFirst(sf, ts.isArrowFunction)!;
    expect(getFunctionName(node, sf)).toBe('onLoad');
  });

  it('returns <anonymous> for method with computed property name', () => {
    const sf = parse('class C { ["method"]() {} }');
    const node = findFirst(sf, ts.isMethodDeclaration)!;
    expect(getFunctionName(node, sf)).toBe('<anonymous>');
  });
});
