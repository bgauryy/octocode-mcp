import path from 'node:path';
import * as ts from 'typescript';
import { TS_CONTROL_KINDS } from './types.js';
import { getLineAndCharacter, makeFingerprint, hashString, buildNodeTree, increment } from './utils.js';
import { computeCognitiveComplexity } from './architecture.js';
export function isFunctionLike(node) {
    return ts.isFunctionDeclaration(node)
        || ts.isFunctionExpression(node)
        || ts.isArrowFunction(node)
        || ts.isMethodDeclaration(node)
        || ts.isConstructorDeclaration(node)
        || ts.isGetAccessor(node)
        || ts.isSetAccessor(node);
}
export function getFunctionName(node, sourceFile) {
    if ('name' in node && node.name && ts.isIdentifier(node.name))
        return node.name.getText(sourceFile);
    const parent = node.parent;
    if (parent && ts.isVariableDeclaration(parent) && parent.name && ts.isIdentifier(parent.name)) {
        return parent.name.getText(sourceFile);
    }
    if (parent && ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name)) {
        return parent.name.getText(sourceFile);
    }
    if (parent && ts.isPropertyDeclaration(parent) && parent.name && ts.isIdentifier(parent.name)) {
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
export function collectMetrics(rootNode) {
    const metrics = {
        complexity: 1,
        maxBranchDepth: 0,
        maxLoopDepth: 0,
        returns: 0,
        awaits: 0,
        calls: 0,
        loops: 0,
    };
    const visit = (node, branchDepth, loopDepth) => {
        switch (node.kind) {
            case ts.SyntaxKind.IfStatement:
            case ts.SyntaxKind.WhileStatement:
            case ts.SyntaxKind.DoStatement:
            case ts.SyntaxKind.ForStatement:
            case ts.SyntaxKind.ForInStatement:
            case ts.SyntaxKind.ForOfStatement:
            case ts.SyntaxKind.SwitchStatement:
            case ts.SyntaxKind.CatchClause:
                metrics.complexity += 1;
                branchDepth += 1;
                metrics.maxBranchDepth = Math.max(metrics.maxBranchDepth, branchDepth);
                break;
            case ts.SyntaxKind.ConditionalExpression:
                metrics.complexity += 1;
                break;
            case ts.SyntaxKind.ReturnStatement:
            case ts.SyntaxKind.ThrowStatement:
                metrics.returns += 1;
                break;
            case ts.SyntaxKind.AwaitExpression:
                metrics.awaits += 1;
                break;
            case ts.SyntaxKind.CallExpression:
                metrics.calls += 1;
                break;
            default:
                if (node.kind === ts.SyntaxKind.BinaryExpression &&
                    (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
                        node.operatorToken.kind === ts.SyntaxKind.BarBarToken)) {
                    metrics.complexity += 1;
                }
        }
        if (node.kind === ts.SyntaxKind.ForStatement ||
            node.kind === ts.SyntaxKind.ForInStatement ||
            node.kind === ts.SyntaxKind.ForOfStatement) {
            const nextLoopDepth = loopDepth + 1;
            metrics.loops += 1;
            metrics.maxLoopDepth = Math.max(metrics.maxLoopDepth, nextLoopDepth);
            ts.forEachChild(node, (child) => visit(child, branchDepth, nextLoopDepth));
            return;
        }
        ts.forEachChild(node, (child) => visit(child, branchDepth, loopDepth));
    };
    visit(rootNode, 0, 0);
    return metrics;
}
export function buildDependencyCriticality(fileSummary, options) {
    if (!fileSummary || !Array.isArray(fileSummary.functions)) {
        return {
            file: fileSummary?.file || '<unknown>',
            complexityRisk: 1,
            highComplexityFunctions: 0,
            functionCount: 0,
            flows: 0,
            score: 1,
        };
    }
    let totalComplexity = 0;
    let highComplexity = 0;
    for (const fn of fileSummary.functions) {
        const complexity = Number(fn.complexity) || 0;
        totalComplexity += complexity;
        if (complexity >= options.criticalComplexityThreshold) {
            highComplexity += 1;
        }
    }
    const flows = fileSummary.flows ? fileSummary.flows.length : 0;
    const score = Math.max(1, Math.round(totalComplexity * 0.7 + fileSummary.functions.length * 2 + flows * 0.2));
    return {
        file: fileSummary.file,
        functionCount: fileSummary.functions.length,
        highComplexityFunctions: highComplexity,
        flows,
        complexitySum: totalComplexity,
        complexityRisk: highComplexity,
        score,
    };
}
function countControlFlowStatements(node) {
    if (ts.isIfStatement(node)) {
        const then = node.thenStatement;
        return ts.isBlock(then) ? then.statements.length : 1;
    }
    if (ts.isSwitchStatement(node)) {
        return node.caseBlock.clauses.length;
    }
    if (ts.isTryStatement(node)) {
        return node.tryBlock.statements.length;
    }
    if (ts.isForStatement(node) || ts.isWhileStatement(node) || ts.isDoStatement(node)
        || ts.isForOfStatement(node) || ts.isForInStatement(node)) {
        const stmt = node.statement;
        return ts.isBlock(stmt) ? stmt.statements.length : 1;
    }
    return 1;
}
export function countLinesInNode(sourceFile, node) {
    const loc = getLineAndCharacter(sourceFile, node);
    return Math.max(1, loc.lineEnd - loc.lineStart + 1);
}
export function makeLocationFromTs(node, sourceFile, repoRoot) {
    const loc = getLineAndCharacter(sourceFile, node);
    return {
        file: path.relative(repoRoot, node.getSourceFile().fileName),
        lineStart: loc.lineStart,
        lineEnd: loc.lineEnd,
        columnStart: loc.columnStart,
        columnEnd: loc.columnEnd,
    };
}
export function analyzeSourceFile(sourceFile, packageName, packageFileSummary, options, maps, trees, dependencyProfile) {
    const filePath = sourceFile.fileName;
    const fileRelative = path.relative(options.root, filePath);
    packageFileSummary.fileCount += 1;
    packageFileSummary.nodeCount += 1;
    packageFileSummary.kindCounts.SourceFile = (packageFileSummary.kindCounts.SourceFile || 0) + 1;
    const fileEntry = {
        package: packageName,
        file: fileRelative,
        parseEngine: 'typescript',
        nodeCount: 0,
        kindCounts: {},
        functions: [],
        flows: [],
        dependencyProfile,
    };
    if (options.emitTree) {
        const nodeBudget = { size: 8000 };
        const tree = buildNodeTree(sourceFile, sourceFile, options.treeDepth, nodeBudget);
        if (tree) {
            trees.push({
                package: packageName,
                file: fileRelative,
                tree,
            });
        }
    }
    const controlKinds = TS_CONTROL_KINDS;
    const visit = (node) => {
        fileEntry.nodeCount += 1;
        packageFileSummary.nodeCount += 1;
        const kind = ts.SyntaxKind[node.kind] || 'UNKNOWN';
        fileEntry.kindCounts[kind] = (fileEntry.kindCounts[kind] || 0) + 1;
        packageFileSummary.kindCounts[kind] = (packageFileSummary.kindCounts[kind] || 0) + 1;
        if (isFunctionLike(node)) {
            const funcNode = node;
            const body = funcNode.body;
            const statementCount = body && ts.isBlock(body) ? body.statements.length : 1;
            const loc = makeLocationFromTs(node, sourceFile, options.root);
            const signature = getFunctionName(node, sourceFile);
            const metrics = body ? collectMetrics(body) : {
                complexity: 1,
                maxBranchDepth: 0,
                maxLoopDepth: 0,
                returns: 0,
                awaits: 0,
                calls: 0,
                loops: 0,
            };
            const entry = {
                kind,
                name: signature,
                nameHint: signature,
                file: fileRelative,
                lineStart: loc.lineStart,
                lineEnd: loc.lineEnd,
                columnStart: loc.columnStart,
                columnEnd: loc.columnEnd,
                statementCount,
                complexity: metrics.complexity,
                maxBranchDepth: metrics.maxBranchDepth,
                maxLoopDepth: metrics.maxLoopDepth,
                returns: metrics.returns,
                awaits: metrics.awaits,
                calls: metrics.calls,
                loops: metrics.loops,
                lengthLines: countLinesInNode(sourceFile, node),
                cognitiveComplexity: body ? computeCognitiveComplexity(body) : 0,
            };
            if (ts.isFunctionDeclaration(node)) {
                entry.declared = true;
            }
            if (statementCount >= options.minFunctionStatements) {
                const bodyHash = body ? makeFingerprint(body) : hashString(fileRelative);
                increment(maps.flowMap, `${bodyHash}|${node.kind}`, {
                    ...entry,
                    hash: bodyHash,
                    metrics,
                });
            }
            if (funcNode.parameters) {
                entry.params = funcNode.parameters.length;
            }
            fileEntry.functions.push(entry);
            packageFileSummary.functions.push(entry);
            packageFileSummary.functionCount += 1;
        }
        if (controlKinds.has(node.kind)) {
            const statementCount = countControlFlowStatements(node);
            const loc = makeLocationFromTs(node, sourceFile, options.root);
            const flowEntry = {
                kind,
                file: fileRelative,
                lineStart: loc.lineStart,
                lineEnd: loc.lineEnd,
                columnStart: loc.columnStart,
                columnEnd: loc.columnEnd,
                statementCount,
            };
            fileEntry.flows.push(flowEntry);
            packageFileSummary.flowCount += 1;
            if (statementCount >= options.minFlowStatements) {
                const flowHash = makeFingerprint(node);
                increment(maps.controlMap, `${flowHash}|${node.kind}`, {
                    ...flowEntry,
                    hash: flowHash,
                });
            }
        }
        ts.forEachChild(node, visit);
    };
    ts.forEachChild(sourceFile, visit);
    return fileEntry;
}
