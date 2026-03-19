import * as ts from 'typescript';
import { getFunctionName, isFunctionLike } from '../ast/helpers.js';
import { getLineAndCharacter } from '../common/utils.js';
const HIGH_CONFIDENCE_PARAM = /^(req|request|body|rawBody|formData|payload|query|headers|params)$/i;
const MEDIUM_CONFIDENCE_PARAM = /^(input|event|message)$/i;
const SOURCE_PARAM_PATTERNS = /^(req|request|body|input|payload|data|params|query|headers|event|message|ctx|context|args|rawBody|formData)/i;
function getParamConfidence(params) {
    let hasMedium = false;
    for (const p of params) {
        if (HIGH_CONFIDENCE_PARAM.test(p))
            return 'high';
        if (MEDIUM_CONFIDENCE_PARAM.test(p))
            hasMedium = true;
    }
    return hasMedium ? 'medium' : 'low';
}
const SINK_CALL_PATTERNS = [
    { pattern: /^eval$/, kind: 'eval' },
    { pattern: /^Function$/, kind: 'eval' },
    { pattern: /\.exec(Sync)?$/, kind: 'exec' },
    { pattern: /^child_process\.(exec|spawn|fork)/, kind: 'exec' },
    { pattern: /^execSync$|^spawnSync$/, kind: 'exec' },
    { pattern: /^cp\.exec$|^cp\.spawn$/, kind: 'exec' },
    { pattern: /\.innerHTML$|\.outerHTML$/, kind: 'innerHTML' },
    { pattern: /dangerouslySetInnerHTML/, kind: 'innerHTML' },
    { pattern: /\.query$|\.execute$/, kind: 'sql' },
    { pattern: /\.redirect$/, kind: 'redirect' },
    { pattern: /\.send$|\.json$|\.write$/, kind: 'response' },
    { pattern: /fs\.(writeFile|appendFile)/, kind: 'fs-write' },
    { pattern: /writeFileSync|appendFileSync/, kind: 'fs-write' },
    { pattern: /fs\.(readFile|readFileSync|createReadStream)/, kind: 'fs-read' },
    { pattern: /readFileSync|readFile/, kind: 'fs-read' },
    { pattern: /path\.(resolve|join)/, kind: 'path-resolve' },
    { pattern: /^fetch$/, kind: 'ssrf' },
    { pattern: /^(http|https)\.(request|get)/, kind: 'ssrf' },
    { pattern: /axios\.(get|post|put|delete|request)/, kind: 'ssrf' },
];
const SCHEMA_VALIDATOR_PATTERNS = /\.(validate|parse|safeParse|parseAsync|check|verify)\s*\(/;
const VALIDATOR_LIB_PATTERNS = /^(z|zod|Joi|yup|ajv|validator|superstruct|io-ts)\./;
export function collectInputSourceProfile(sourceFile, _fileRelative, fileEntry) {
    const inputSources = [];
    const visitFn = (node) => {
        if (!isFunctionLike(node)) {
            ts.forEachChild(node, visitFn);
            return;
        }
        const fnNode = node;
        const params = fnNode.parameters;
        const sourceParams = [];
        for (const p of params) {
            const name = p.name.getText(sourceFile);
            if (SOURCE_PARAM_PATTERNS.test(name))
                sourceParams.push(name);
        }
        if (sourceParams.length === 0) {
            ts.forEachChild(node, visitFn);
            return;
        }
        const body = fnNode.body;
        if (!body) {
            ts.forEachChild(node, visitFn);
            return;
        }
        const sinkKinds = new Set();
        let hasValidation = false;
        const callsWithInputArgs = [];
        const sourceParamSet = new Set(sourceParams);
        const walkBody = (child) => {
            if (isFunctionLike(child) && child !== node)
                return;
            if (ts.isCallExpression(child)) {
                const callText = child.expression.getText(sourceFile);
                for (const sink of SINK_CALL_PATTERNS) {
                    if (sink.pattern.test(callText)) {
                        sinkKinds.add(sink.kind);
                        break;
                    }
                }
                if (SCHEMA_VALIDATOR_PATTERNS.test(callText) ||
                    VALIDATOR_LIB_PATTERNS.test(callText)) {
                    hasValidation = true;
                }
                for (const arg of child.arguments) {
                    const argText = arg.getText(sourceFile);
                    for (const sp of sourceParamSet) {
                        if (argText === sp ||
                            argText.startsWith(sp + '.') ||
                            argText.startsWith(sp + '[')) {
                            const loc = getLineAndCharacter(sourceFile, child);
                            callsWithInputArgs.push({
                                callee: callText,
                                lineStart: loc.lineStart,
                            });
                            break;
                        }
                    }
                }
            }
            if (ts.isTypeOfExpression(child)) {
                const operand = child.expression.getText(sourceFile);
                if (sourceParamSet.has(operand))
                    hasValidation = true;
            }
            if (ts.isPrefixUnaryExpression(child) &&
                child.operator === ts.SyntaxKind.ExclamationToken) {
                const operand = child.operand.getText(sourceFile);
                if (sourceParamSet.has(operand))
                    hasValidation = true;
            }
            if (ts.isIfStatement(child) || ts.isConditionalExpression(child)) {
                const cond = ts.isIfStatement(child)
                    ? child.expression
                    : child.condition;
                const condText = cond.getText(sourceFile);
                for (const sp of sourceParamSet) {
                    if (condText.includes(sp)) {
                        hasValidation = true;
                        break;
                    }
                }
            }
            if (ts.isCallExpression(child) &&
                child.expression.getText(sourceFile).endsWith('instanceof')) {
                hasValidation = true;
            }
            if (ts.isBinaryExpression(child) &&
                child.operatorToken.kind === ts.SyntaxKind.InstanceOfKeyword) {
                const leftText = child.left.getText(sourceFile);
                if (sourceParamSet.has(leftText))
                    hasValidation = true;
            }
            ts.forEachChild(child, walkBody);
        };
        ts.forEachChild(body, walkBody);
        if (ts.isTemplateExpression(body) || ts.isBlock(body)) {
            const bodyText = body.getText(sourceFile);
            for (const sp of sourceParamSet) {
                if (bodyText.includes(sp + '?.')) {
                    hasValidation = true;
                    break;
                }
            }
        }
        const fnLoc = getLineAndCharacter(sourceFile, node);
        const fnName = getFunctionName(node, sourceFile);
        inputSources.push({
            functionName: fnName,
            lineStart: fnLoc.lineStart,
            lineEnd: fnLoc.lineEnd,
            sourceParams,
            hasSinkInBody: sinkKinds.size > 0,
            sinkKinds: [...sinkKinds],
            hasValidation,
            callsWithInputArgs,
            paramConfidence: getParamConfidence(sourceParams),
        });
        ts.forEachChild(node, visitFn);
    };
    ts.forEachChild(sourceFile, visitFn);
    fileEntry.inputSources = inputSources;
}
