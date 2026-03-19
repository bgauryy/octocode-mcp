import * as ts from 'typescript';
import { getLineAndCharacter } from '../common/utils.js';
const SECRET_PATTERNS = [
    /password\s*[:=]\s*['"`]/i,
    /api[_-]?key\s*[:=]\s*['"`]/i,
    /secret\s*[:=]\s*['"`]/i,
    /token\s*[:=]\s*['"`]/i,
    /-----BEGIN.*KEY/,
    /private[_-]?key\s*[:=]\s*['"`]/i,
    /auth[_-]?token\s*[:=]\s*['"`]/i,
];
const SQL_KEYWORDS = /\b(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE)\b/i;
/** Strings that look like placeholders, not real secrets */
const PLACEHOLDER_PATTERN = /^(YOUR_|REPLACE_ME|<[a-z_-]+>|\$\{|{{)/i;
/** UUID pattern: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isInsideRegexLiteral(node) {
    let current = node.parent;
    while (current) {
        if (ts.isRegularExpressionLiteral(current))
            return true;
        if (ts.isNewExpression(current) &&
            current.expression.getText(node.getSourceFile()) === 'RegExp')
            return true;
        current = current.parent;
    }
    return false;
}
function isPlaceholderOrUuid(value) {
    return PLACEHOLDER_PATTERN.test(value) || UUID_PATTERN.test(value);
}
/** Skip strings inside finding metadata fields (suggestedFix, reason, impact, etc.) */
const METADATA_PROP_NAMES = new Set([
    'suggestedFix',
    'strategy',
    'steps',
    'reason',
    'impact',
    'expectedResult',
    'title',
]);
function isInsideMetadataProperty(node) {
    let current = node.parent;
    while (current) {
        if (ts.isPropertyAssignment(current) && ts.isIdentifier(current.name)) {
            if (METADATA_PROP_NAMES.has(current.name.text))
                return true;
        }
        current = current.parent;
    }
    return false;
}
function computeShannonEntropy(s) {
    const freq = new Map();
    for (const ch of s)
        freq.set(ch, (freq.get(ch) || 0) + 1);
    let entropy = 0;
    for (const count of freq.values()) {
        const p = count / s.length;
        if (p > 0)
            entropy -= p * Math.log2(p);
    }
    return entropy;
}
export function collectSecurityData(sourceFile, fileRelative, fileEntry) {
    const evalUsages = [];
    const unsafeHtmlAssignments = [];
    const suspiciousStrings = [];
    const regexLiterals = [];
    const visit = (node) => {
        if (ts.isCallExpression(node)) {
            const text = node.expression.getText(sourceFile);
            if (text === 'eval' || text === 'Function') {
                const loc = getLineAndCharacter(sourceFile, node);
                evalUsages.push({
                    file: fileRelative,
                    lineStart: loc.lineStart,
                    lineEnd: loc.lineEnd,
                });
            }
            if (text === 'new Function') {
                const loc = getLineAndCharacter(sourceFile, node);
                evalUsages.push({
                    file: fileRelative,
                    lineStart: loc.lineStart,
                    lineEnd: loc.lineEnd,
                });
            }
            if ((text === 'setTimeout' || text === 'setInterval') &&
                node.arguments.length > 0) {
                const firstArg = node.arguments[0];
                if (ts.isStringLiteral(firstArg) ||
                    ts.isNoSubstitutionTemplateLiteral(firstArg)) {
                    const loc = getLineAndCharacter(sourceFile, node);
                    evalUsages.push({
                        file: fileRelative,
                        lineStart: loc.lineStart,
                        lineEnd: loc.lineEnd,
                    });
                }
            }
            if (text === 'document.write' || text === 'document.writeln') {
                const loc = getLineAndCharacter(sourceFile, node);
                unsafeHtmlAssignments.push({
                    file: fileRelative,
                    lineStart: loc.lineStart,
                    lineEnd: loc.lineEnd,
                });
            }
        }
        if (ts.isNewExpression(node) &&
            node.expression.getText(sourceFile) === 'Function') {
            const loc = getLineAndCharacter(sourceFile, node);
            evalUsages.push({
                file: fileRelative,
                lineStart: loc.lineStart,
                lineEnd: loc.lineEnd,
            });
        }
        if (ts.isBinaryExpression(node) &&
            node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
            if (ts.isPropertyAccessExpression(node.left)) {
                const prop = node.left.name.getText(sourceFile);
                if (prop === 'innerHTML' || prop === 'outerHTML') {
                    const loc = getLineAndCharacter(sourceFile, node);
                    unsafeHtmlAssignments.push({
                        file: fileRelative,
                        lineStart: loc.lineStart,
                        lineEnd: loc.lineEnd,
                    });
                }
            }
        }
        if (ts.isJsxAttribute(node) &&
            node.name.getText(sourceFile) === 'dangerouslySetInnerHTML') {
            const loc = getLineAndCharacter(sourceFile, node);
            unsafeHtmlAssignments.push({
                file: fileRelative,
                lineStart: loc.lineStart,
                lineEnd: loc.lineEnd,
            });
        }
        if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
            if (!isInsideMetadataProperty(node) && !isInsideRegexLiteral(node)) {
                const value = node.text;
                if (!isPlaceholderOrUuid(value)) {
                    for (const pattern of SECRET_PATTERNS) {
                        if (pattern.test(value)) {
                            const loc = getLineAndCharacter(sourceFile, node);
                            suspiciousStrings.push({
                                lineStart: loc.lineStart,
                                lineEnd: loc.lineEnd,
                                kind: 'hardcoded-secret',
                                snippet: value.slice(0, 40),
                                context: 'literal',
                            });
                            break;
                        }
                    }
                    if (value.length >= 20 && computeShannonEntropy(value) > 4.5) {
                        const loc = getLineAndCharacter(sourceFile, node);
                        suspiciousStrings.push({
                            lineStart: loc.lineStart,
                            lineEnd: loc.lineEnd,
                            kind: 'hardcoded-secret',
                            context: 'literal',
                        });
                    }
                }
            }
        }
        if (ts.isRegularExpressionLiteral(node)) {
            const regexText = node.getText(sourceFile);
            for (const pattern of SECRET_PATTERNS) {
                if (pattern.test(regexText)) {
                    const loc = getLineAndCharacter(sourceFile, node);
                    suspiciousStrings.push({
                        lineStart: loc.lineStart,
                        lineEnd: loc.lineEnd,
                        kind: 'hardcoded-secret',
                        snippet: regexText.slice(0, 40),
                        context: 'regex-definition',
                    });
                    break;
                }
            }
        }
        if (ts.isTemplateExpression(node)) {
            if (!isInsideMetadataProperty(node)) {
                const fullText = node.getText(sourceFile);
                if (SQL_KEYWORDS.test(fullText) && node.templateSpans.length > 0) {
                    const loc = getLineAndCharacter(sourceFile, node);
                    suspiciousStrings.push({
                        lineStart: loc.lineStart,
                        lineEnd: loc.lineEnd,
                        kind: 'sql-injection',
                        snippet: fullText.slice(0, 60),
                    });
                }
            }
        }
        if (ts.isRegularExpressionLiteral(node)) {
            const pattern = node.text;
            const loc = getLineAndCharacter(sourceFile, node);
            regexLiterals.push({
                lineStart: loc.lineStart,
                lineEnd: loc.lineEnd,
                pattern,
            });
        }
        ts.forEachChild(node, visit);
    };
    ts.forEachChild(sourceFile, visit);
    fileEntry.evalUsages = evalUsages;
    fileEntry.unsafeHtmlAssignments = unsafeHtmlAssignments;
    fileEntry.suspiciousStrings = suspiciousStrings;
    fileEntry.regexLiterals = regexLiterals;
}
