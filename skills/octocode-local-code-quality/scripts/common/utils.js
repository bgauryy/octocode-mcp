import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import * as ts from 'typescript';
import { IMPORT_RESOLVE_EXTS } from '../types/index.js';
export function canonicalScriptKind(ext) {
    switch (ext) {
        case '.tsx':
            return ts.ScriptKind.TSX;
        case '.jsx':
            return ts.ScriptKind.JSX;
        case '.js':
        case '.mjs':
        case '.cjs':
            return ts.ScriptKind.JS;
        case '.ts':
        default:
            return ts.ScriptKind.TS;
    }
}
export function hashString(value) {
    return crypto.createHash('sha1').update(value).digest('hex').slice(0, 16);
}
export function normalizeNodeKind(kind) {
    switch (kind) {
        case ts.SyntaxKind.Identifier:
            return 'ID';
        case ts.SyntaxKind.StringLiteral:
        case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
        case ts.SyntaxKind.TemplateMiddle:
        case ts.SyntaxKind.TemplateHead:
            return 'STR';
        case ts.SyntaxKind.NumericLiteral:
            return 'NUM';
        case ts.SyntaxKind.BigIntLiteral:
            return 'BIGINT';
        case ts.SyntaxKind.TrueKeyword:
        case ts.SyntaxKind.FalseKeyword:
            return 'BOOL';
        case ts.SyntaxKind.NullKeyword:
            return 'NULL';
        default:
            return ts.SyntaxKind[kind] || 'UNKNOWN';
    }
}
export function makeFingerprint(node, seen = new WeakMap()) {
    if (seen.has(node))
        return seen.get(node);
    const tokens = [];
    const visit = (current) => {
        tokens.push(normalizeNodeKind(current.kind));
        ts.forEachChild(current, visit);
    };
    visit(node);
    const hash = hashString(tokens.join('|'));
    seen.set(node, hash);
    return hash;
}
export function makeTreeSitterFingerprint(node) {
    const tokens = [];
    const visit = (current) => {
        tokens.push(current.type);
        for (const child of current.children)
            visit(child);
    };
    visit(node);
    return hashString(tokens.join('|'));
}
export function getLineAndCharacter(sourceFile, node) {
    const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
    return {
        lineStart: start.line + 1,
        lineEnd: end.line + 1,
        columnStart: start.character + 1,
        columnEnd: end.character + 1,
    };
}
export function buildNodeTree(node, sourceFile, depth, maxNodes, seen = new WeakSet()) {
    if (!node || maxNodes.size <= 0)
        return null;
    maxNodes.size -= 1;
    const loc = getLineAndCharacter(sourceFile, node);
    const base = {
        kind: ts.SyntaxKind[node.kind] || 'UNKNOWN',
        startLine: loc.lineStart,
        endLine: loc.lineEnd,
        children: [],
    };
    if (depth <= 0) {
        base.truncated = true;
        return base;
    }
    if (seen.has(node)) {
        base.truncated = true;
        return base;
    }
    seen.add(node);
    ts.forEachChild(node, child => {
        if (maxNodes.size <= 0)
            return;
        const childTree = buildNodeTree(child, sourceFile, depth - 1, maxNodes, seen);
        if (childTree) {
            base.children.push(childTree);
        }
    });
    return base;
}
export function buildTreeSitterTree(node, _sourceFileText, depth, maxNodes, seen = new WeakSet()) {
    if (!node || maxNodes.size <= 0)
        return null;
    maxNodes.size -= 1;
    const base = {
        kind: node.type,
        startLine: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
        children: [],
    };
    if (depth <= 0) {
        base.truncated = true;
        return base;
    }
    if (seen.has(node)) {
        base.truncated = true;
        return base;
    }
    seen.add(node);
    for (const child of node.children) {
        if (maxNodes.size <= 0)
            break;
        const childTree = buildTreeSitterTree(child, _sourceFileText, depth - 1, maxNodes, seen);
        if (childTree) {
            base.children.push(childTree);
        }
    }
    return base;
}
export function renderNodeText(node, indent = 0) {
    const pad = '  '.repeat(indent);
    const span = node.startLine === node.endLine
        ? `${node.startLine}`
        : `${node.startLine}:${node.endLine}`;
    const trunc = node.truncated ? ' ...' : '';
    let line = `${pad}${node.kind}[${span}]${trunc}\n`;
    for (const child of node.children) {
        line += renderNodeText(child, indent + 1);
    }
    return line;
}
export function renderTreesText(entries, generatedAt) {
    const lines = [`# AST Trees — ${generatedAt}`, ''];
    for (const entry of entries) {
        lines.push(`## ${entry.package} — ${entry.file}`);
        lines.push(renderNodeText(entry.tree));
    }
    return lines.join('\n');
}
export function isTestFile(filePath) {
    return (/(?:^|[\\/])(?:__tests__|__test__|tests)(?:[\\/]|$)/.test(filePath) ||
        /(?:\.test|_test|\.spec)\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(filePath));
}
export function toRepoPath(filePath, root) {
    return path.relative(root, filePath).replace(/\\/g, '/');
}
export function normalizeDependencyValue(value) {
    return path.normalize(value).replace(/\\/g, '/');
}
export function addToMapSet(map, key, value) {
    if (!map.has(key)) {
        map.set(key, new Set());
    }
    map.get(key).add(value);
}
export function isRelativeImport(specifier) {
    return (specifier.startsWith('./') ||
        specifier.startsWith('../') ||
        specifier.startsWith('.\\') ||
        specifier.startsWith('..\\'));
}
export function resolveImportTarget(currentDirectory, specifier) {
    const cleaned = specifier.replace(/[?#].*$/, '');
    const base = path.resolve(currentDirectory, cleaned);
    const candidates = [];
    const ext = path.extname(base);
    const jsToTsMap = {
        '.js': ['.ts', '.tsx'],
        '.jsx': ['.tsx'],
        '.mjs': ['.ts', '.tsx'],
        '.cjs': ['.ts', '.tsx'],
    };
    if (ext) {
        candidates.push(base);
        const altExts = jsToTsMap[ext];
        if (altExts) {
            const noExt = base.slice(0, -ext.length);
            for (const candidateExt of altExts) {
                const withTsExt = `${noExt}${candidateExt}`;
                candidates.push(withTsExt);
            }
        }
    }
    else {
        for (const ext of IMPORT_RESOLVE_EXTS) {
            candidates.push(`${base}${ext}`);
        }
        for (const ext of IMPORT_RESOLVE_EXTS) {
            candidates.push(path.join(base, `index${ext}`));
        }
    }
    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }
    return null;
}
export function increment(map, key, value) {
    if (!map.has(key))
        map.set(key, []);
    map.get(key).push(value);
}
