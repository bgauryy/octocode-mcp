import * as ts from 'typescript';
// ─── Constants ───────────────────────────────────────────────────────────────
import path from 'node:path';
export const DEFAULT_OPTS = {
    minFunctionStatements: 6,
    minFlowStatements: 6,
    root: process.cwd(),
    includeTests: false,
    emitTree: true,
    json: false,
    graph: false,
    out: null,
    treeDepth: 4,
    findingsLimit: 250,
    parser: 'auto',
    criticalComplexityThreshold: 30,
    deepLinkTopN: 12,
    packageRoot: path.join(process.cwd(), 'packages'),
    ignoreDirs: new Set([
        '.git',
        '.next',
        '.yarn',
        '.cache',
        '.octocode',
        'node_modules',
        'dist',
        'coverage',
        'out',
    ]),
};
export const CONTROL_KIND_DUP_THRESHOLD = 3;
export const ALLOWED_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
export const IMPORT_RESOLVE_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.d.ts'];
export const TS_CONTROL_KINDS = new Set([
    ts.SyntaxKind.IfStatement,
    ts.SyntaxKind.SwitchStatement,
    ts.SyntaxKind.TryStatement,
    ts.SyntaxKind.ForStatement,
    ts.SyntaxKind.WhileStatement,
    ts.SyntaxKind.DoStatement,
    ts.SyntaxKind.ForOfStatement,
    ts.SyntaxKind.ForInStatement,
    ts.SyntaxKind.ConditionalExpression,
]);
export const TS_TREE_SITTER_CONTROL_TYPES = new Set([
    'if_statement',
    'switch_statement',
    'try_statement',
    'for_statement',
    'while_statement',
    'do_statement',
    'for_in_statement',
    'for_of_statement',
    'for_await_statement',
    'conditional_expression',
    'conditional_expression?',
    'catch_clause',
]);
export const TS_TREE_SITTER_FUNCTION_TYPES = new Set([
    'function_declaration',
    'function',
    'generator_function',
    'generator_function_declaration',
    'method_definition',
    'arrow_function',
    'function_expression',
]);
export const SEVERITY_ORDER = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
    info: 0,
};
