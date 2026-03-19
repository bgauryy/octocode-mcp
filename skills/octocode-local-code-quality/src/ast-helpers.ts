import * as ts from 'typescript';

export function isFunctionLike(node: ts.Node): boolean {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isGetAccessor(node) ||
    ts.isSetAccessor(node)
  );
}

export function getFunctionName(
  node: ts.Node,
  sourceFile: ts.SourceFile
): string {
  if ('name' in node && node.name && ts.isIdentifier(node.name as ts.Node))
    return (node.name as ts.Identifier).getText(sourceFile);

  const parent = node.parent;
  if (
    parent &&
    ts.isVariableDeclaration(parent) &&
    parent.name &&
    ts.isIdentifier(parent.name)
  ) {
    return parent.name.getText(sourceFile);
  }

  if (
    parent &&
    ts.isPropertyAssignment(parent) &&
    ts.isIdentifier(parent.name)
  ) {
    return parent.name.getText(sourceFile);
  }

  if (
    parent &&
    ts.isPropertyDeclaration(parent) &&
    parent.name &&
    ts.isIdentifier(parent.name)
  ) {
    return parent.name.getText(sourceFile);
  }

  if (parent && ts.isMethodDeclaration(parent) && parent.name) {
    return parent.name.getText(sourceFile);
  }

  if (parent && ts.isGetAccessor(parent) && parent.name) {
    return parent.name.getText(sourceFile);
  }

  if (parent && ts.isSetAccessor(parent) && parent.name) {
    return parent.name.getText(sourceFile);
  }

  return '<anonymous>';
}
