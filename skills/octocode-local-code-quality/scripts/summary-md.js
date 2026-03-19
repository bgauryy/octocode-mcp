import fs from 'node:fs';
import path from 'node:path';
import { PILLAR_CATEGORIES, SEVERITY_ORDER } from './types.js';
export function severityBreakdown(findings) {
    const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for (const f of findings)
        counts[f.severity] = (counts[f.severity] || 0) + 1;
    return counts;
}
export function categoryBreakdown(findings) {
    const counts = {};
    for (const f of findings)
        counts[f.category] = (counts[f.category] || 0) + 1;
    return counts;
}
export function computeHealthScore(findings, totalFiles) {
    if (totalFiles === 0)
        return 100;
    const weights = { critical: 25, high: 10, medium: 3, low: 1, info: 0 };
    let penalty = 0;
    for (const f of findings)
        penalty += weights[f.severity] || 0;
    const normalized = (penalty / totalFiles) * 10;
    return Math.max(0, Math.round(100 - normalized));
}
export function collectTagCloud(findings) {
    const tagCounts = new Map();
    for (const f of findings) {
        if (!f.tags)
            continue;
        for (const tag of f.tags) {
            tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
        }
    }
    return [...tagCounts.entries()]
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count);
}
export function formatFileSize(bytes) {
    if (bytes < 1024)
        return `${bytes} B`;
    if (bytes < 1024 * 1024)
        return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
export function diversifyFindings(sorted, limit) {
    if (!Number.isFinite(limit) || limit >= sorted.length)
        return sorted;
    const groups = new Map();
    for (const f of sorted) {
        const cat = f.category;
        if (!groups.has(cat))
            groups.set(cat, []);
        groups.get(cat).push(f);
    }
    const categoryOrder = [...groups.entries()].sort((a, b) => {
        const aTop = SEVERITY_ORDER[a[1][0].severity] ?? 0;
        const bTop = SEVERITY_ORDER[b[1][0].severity] ?? 0;
        return bTop - aTop;
    });
    const result = [];
    const cursors = new Map();
    for (const [cat] of categoryOrder)
        cursors.set(cat, 0);
    while (result.length < limit) {
        let picked = false;
        for (const [cat, items] of categoryOrder) {
            if (result.length >= limit)
                break;
            const cursor = cursors.get(cat);
            if (cursor < items.length) {
                result.push(items[cursor]);
                cursors.set(cat, cursor + 1);
                picked = true;
            }
        }
        if (!picked)
            break;
    }
    return result;
}
export function diverseTopRecommendations(findings, limit = 20, maxPerCategory = 2) {
    const result = [];
    const countByCategory = new Map();
    for (const f of findings) {
        const catCount = countByCategory.get(f.category) || 0;
        if (catCount >= maxPerCategory)
            continue;
        result.push(f);
        countByCategory.set(f.category, catCount + 1);
        if (result.length >= limit)
            break;
    }
    return result;
}
export function generateSummaryMd(opts) {
    const { dir, report, outputFiles, architectureFindings, codeQualityFindings, deadCodeFindings, hotFiles = [], activeFeatures = null, scope = null, root = process.cwd(), scopeSymbols = null, semanticEnabled = false, securityFindings = [], testQualityFindings = [], reportAnalysis = null, } = opts;
    const allFindings = report.optimizationFindings || [];
    const sev = severityBreakdown(allFindings);
    const summary = report.summary;
    const agentOutput = report.agentOutput;
    const depGraph = report.dependencyGraph;
    const lines = [];
    lines.push('# Code Quality Scan Report\n');
    lines.push(`**Generated**: ${report.generatedAt}  `);
    lines.push(`**Root**: \`${report.repoRoot}\`\n`);
    lines.push('## Scan Scope\n');
    lines.push(`| Metric | Count |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Files analyzed | ${summary.totalFiles ?? '—'} |`);
    lines.push(`| Functions | ${summary.totalFunctions ?? '—'} |`);
    lines.push(`| Flow nodes | ${summary.totalFlows ?? '—'} |`);
    lines.push(`| Dependency files | ${summary.totalDependencyFiles ?? '—'} |`);
    lines.push(`| Packages | ${summary.totalPackages ?? '—'} |`);
    lines.push('');
    lines.push('## Findings Overview\n');
    lines.push(`| Severity | Count |`);
    lines.push(`|----------|-------|`);
    lines.push(`| Critical | ${sev.critical} |`);
    lines.push(`| High | ${sev.high} |`);
    lines.push(`| Medium | ${sev.medium} |`);
    lines.push(`| Low | ${sev.low} |`);
    lines.push(`| **Total** | **${allFindings.length}** |`);
    lines.push('');
    const totalBefore = agentOutput?.totalBeforeTruncation;
    const dropped = agentOutput?.droppedCategories;
    if (totalBefore && totalBefore > allFindings.length) {
        lines.push(`> **Truncated**: Showing ${allFindings.length} of ${totalBefore} findings (\`--findings-limit ${allFindings.length}\`).`);
        if (dropped && dropped.length > 0) {
            lines.push(`> Dropped categories: ${dropped.map((c) => `\`${c}\``).join(', ')}`);
        }
        lines.push('');
    }
    if (activeFeatures) {
        lines.push(`> **Features filter**: \`--features=${[...activeFeatures].join(',')}\``);
        lines.push('');
    }
    if (scope && scope.length > 0) {
        const scopeDisplay = scope.map((s) => path.relative(root, s)).filter(Boolean);
        if (scopeDisplay.length > 0) {
            let scopeLabel = scopeDisplay.map((p) => `\`${p}\``).join(', ');
            if (scopeSymbols && scopeSymbols.size > 0) {
                const symParts = [];
                for (const [absFile, names] of scopeSymbols) {
                    const rel = path.relative(root, absFile);
                    symParts.push(...names.map((n) => `\`${rel}:${n}\``));
                }
                scopeLabel = symParts.join(', ');
            }
            lines.push(`> **Scoped scan**: Only showing findings for: ${scopeLabel}`);
            lines.push('');
        }
    }
    if (semanticEnabled) {
        lines.push('> **Semantic analysis**: TypeChecker + LanguageService enabled (14 additional categories)');
        lines.push('');
    }
    const renderPillarCategories = (pillarKey, findings) => {
        const breakdown = categoryBreakdown(findings);
        const pillarCats = PILLAR_CATEGORIES[pillarKey] || [];
        const isFiltered = activeFeatures !== null;
        for (const cat of pillarCats) {
            const count = breakdown[cat] || 0;
            const skipped = isFiltered && !activeFeatures.has(cat);
            if (skipped) {
                lines.push(`- \`${cat}\`: — *(skipped)*`);
            }
            else {
                lines.push(`- \`${cat}\`: ${count}`);
            }
        }
        lines.push('');
    };
    const totalFiles = summary.totalFiles || 1;
    const overallHealth = computeHealthScore(allFindings, totalFiles);
    const archHealth = computeHealthScore(architectureFindings, totalFiles);
    const qualHealth = computeHealthScore(codeQualityFindings, totalFiles);
    const deadHealth = computeHealthScore(deadCodeFindings, totalFiles);
    const secHealth = computeHealthScore(securityFindings, totalFiles);
    const testHealth = computeHealthScore(testQualityFindings, totalFiles);
    lines.push('## Health Scores\n');
    lines.push('| Pillar | Score | Grade |');
    lines.push('|--------|-------|-------|');
    const grade = (s) => s >= 80 ? 'A' : s >= 60 ? 'B' : s >= 40 ? 'C' : s >= 20 ? 'D' : 'F';
    lines.push(`| **Overall** | **${overallHealth}/100** | **${grade(overallHealth)}** |`);
    lines.push(`| Architecture | ${archHealth}/100 | ${grade(archHealth)} |`);
    lines.push(`| Code Quality | ${qualHealth}/100 | ${grade(qualHealth)} |`);
    lines.push(`| Dead Code & Hygiene | ${deadHealth}/100 | ${grade(deadHealth)} |`);
    if (securityFindings.length > 0)
        lines.push(`| Security | ${secHealth}/100 | ${grade(secHealth)} |`);
    if (testQualityFindings.length > 0)
        lines.push(`| Test Quality | ${testHealth}/100 | ${grade(testHealth)} |`);
    lines.push('');
    const tagCloud = collectTagCloud(allFindings);
    if (tagCloud.length > 0) {
        lines.push('## Top Concern Tags\n');
        lines.push('Searchable tags across all findings — use to filter `findings.json` with `jq`.\n');
        for (const { tag, count } of tagCloud.slice(0, 12)) {
            lines.push(`- \`${tag}\`: ${count} findings`);
        }
        lines.push('');
    }
    if (reportAnalysis) {
        lines.push('## Analysis Signals\n');
        lines.push(`- **Graph Signal**: ${reportAnalysis.strongestGraphSignal?.summary || 'No dominant graph signal in this scan.'}`);
        lines.push(`- **AST Signal**: ${reportAnalysis.strongestAstSignal?.summary || 'No dominant AST signal in this scan.'}`);
        lines.push(`- **Combined Interpretation**: ${reportAnalysis.combinedInterpretation?.summary || 'No combined interpretation available yet.'}`);
        lines.push(`- **Confidence**: ${reportAnalysis.combinedInterpretation?.confidence || reportAnalysis.strongestGraphSignal?.confidence || reportAnalysis.strongestAstSignal?.confidence || 'low'}`);
        const validationSummary = reportAnalysis.recommendedValidation
            ? `${reportAnalysis.recommendedValidation.summary} (tools: ${reportAnalysis.recommendedValidation.tools.join(' -> ')})`
            : 'Use Octocode local tools to confirm the strongest signal before presenting it as fact.';
        lines.push(`- **Recommended Validation**: ${validationSummary}`);
        const megaFolderSignal = reportAnalysis.graphSignals.find((signal) => signal.kind === 'mega-folder-cluster');
        if (megaFolderSignal) {
            lines.push(`- **Structural Layout Alert**: ${megaFolderSignal.summary}`);
        }
        if (reportAnalysis.investigationPrompts.length > 0) {
            lines.push('');
            lines.push('**Investigation Prompts**');
            for (const prompt of reportAnalysis.investigationPrompts.slice(0, 4)) {
                lines.push(`- ${prompt}`);
            }
        }
        lines.push('');
    }
    lines.push('## Architecture Health\n');
    lines.push(`> ${architectureFindings.length} findings (score: ${archHealth}/100) — see [\`architecture.json\`](./architecture.json)\n`);
    if (depGraph) {
        lines.push(`| Metric | Value |`);
        lines.push(`|--------|-------|`);
        lines.push(`| Modules | ${depGraph.totalModules} |`);
        lines.push(`| Import edges | ${depGraph.totalEdges} |`);
        lines.push(`| Cycles | ${depGraph.cycles?.length ?? 0} |`);
        lines.push(`| Critical paths | ${depGraph.criticalPaths?.length ?? 0} |`);
        lines.push(`| Root modules | ${depGraph.rootsCount} |`);
        lines.push(`| Leaf modules | ${depGraph.leavesCount} |`);
        lines.push(`| Test-only modules | ${depGraph.testOnlyModules?.length ?? 0} |`);
        lines.push(`| Unresolved imports | ${depGraph.unresolvedEdgeCount} |`);
        lines.push('');
    }
    renderPillarCategories('architecture', architectureFindings);
    if (hotFiles.length > 0) {
        lines.push('## Change Risk Hotspots\n');
        lines.push('Files most dangerous to change — high fan-in, complexity, or cycle membership.\n');
        lines.push('| File | Risk | Fan-In | Fan-Out | Complexity | Exports | Cycle | Critical Path |');
        lines.push('|------|------|--------|---------|------------|---------|-------|---------------|');
        for (const hf of hotFiles.slice(0, 15)) {
            lines.push(`| \`${hf.file}\` | ${hf.riskScore} | ${hf.fanIn} | ${hf.fanOut} | ${hf.complexityScore} | ${hf.exportCount} | ${hf.inCycle ? 'Y' : '-'} | ${hf.onCriticalPath ? 'Y' : '-'} |`);
        }
        lines.push('');
    }
    lines.push('## Code Quality\n');
    lines.push(`> ${codeQualityFindings.length} findings (score: ${qualHealth}/100) — see [\`code-quality.json\`](./code-quality.json)\n`);
    renderPillarCategories('code-quality', codeQualityFindings);
    lines.push('## Dead Code & Hygiene\n');
    lines.push(`> ${deadCodeFindings.length} findings (score: ${deadHealth}/100) — see [\`dead-code.json\`](./dead-code.json)\n`);
    renderPillarCategories('dead-code', deadCodeFindings);
    if (securityFindings.length > 0) {
        lines.push('## Security\n');
        lines.push(`> ${securityFindings.length} findings (score: ${secHealth}/100) — see [\`security.json\`](./security.json)\n`);
        renderPillarCategories('security', securityFindings);
    }
    if (testQualityFindings.length > 0) {
        lines.push('## Test Quality\n');
        lines.push(`> ${testQualityFindings.length} findings (score: ${testHealth}/100) — see [\`test-quality.json\`](./test-quality.json)\n`);
        renderPillarCategories('test-quality', testQualityFindings);
    }
    const topRecs = (agentOutput?.topRecommendations ?? []);
    if (topRecs.length > 0) {
        lines.push('## Top Recommendations\n');
        for (const rec of topRecs.slice(0, 10)) {
            lines.push(`- **[${rec.severity.toUpperCase()}]** \`${rec.file}\` — ${rec.title} *(${rec.category})* `);
        }
        lines.push('');
    }
    if (outputFiles.astTrees) {
        lines.push('## AST Trees (`ast-trees.txt`)\n');
        lines.push('Compact indented text format — each node is `Kind[startLine:endLine]`, nesting = indentation.\n');
        lines.push('```');
        lines.push('SourceFile[1:152]');
        lines.push('  ImportDeclaration[1]');
        lines.push('  FunctionDeclaration[3:20]');
        lines.push('    Block[4:19]');
        lines.push('      IfStatement[5:12] ...');
        lines.push('```\n');
        lines.push('**Smart navigation:**\n');
        lines.push('| Goal | Command |');
        lines.push('|------|---------|');
        lines.push('| List all files | `grep "^##" ast-trees.txt` |');
        lines.push('| Find functions | `grep -E "FunctionDeclaration\\|function_declaration\\|ArrowFunction\\|arrow_function" ast-trees.txt` |');
        lines.push('| Find classes | `grep -E "ClassDeclaration\\|class_declaration" ast-trees.txt` |');
        lines.push('| Find control flow | `grep -E "IfStatement\\|SwitchStatement\\|ForStatement\\|WhileStatement" ast-trees.txt` |');
        lines.push('| Deep nesting (>3) | `grep -E "^\\s{8,}" ast-trees.txt` |');
        lines.push('| Truncated subtrees | `grep "\\.\\.\\.$" ast-trees.txt` |');
        lines.push('| Large spans (regex) | Use pattern `\\[(\\d+):(\\d+)\\]` — subtract to find span size |');
        lines.push('');
    }
    lines.push('## Output Files\n');
    lines.push('| File | Size | Description |');
    lines.push('|------|------|-------------|');
    const descriptions = {
        summary: 'Scan metadata, agent output, parse errors',
        architecture: 'Dependency graph, cycles, critical paths, architecture findings',
        codeQuality: 'Duplicate detection, complexity, god modules/functions',
        deadCode: 'Dead files/exports/re-exports, unused deps, boundary violations',
        fileInventory: 'Per-file function/flow/dependency details',
        findings: 'All findings across all categories (master list)',
        graph: 'Mermaid dependency graph',
        astTrees: 'AST tree snapshots (compact indented text — grep/regex friendly)',
        summaryMd: 'This file — human-readable overview',
    };
    for (const [key, file] of Object.entries(outputFiles)) {
        let size = '—';
        try {
            size = formatFileSize(fs.statSync(path.join(dir, file)).size);
        }
        catch {
            size = '—';
        }
        lines.push(`| [\`${file}\`](./${file}) | ${size} | ${descriptions[key] || key} |`);
    }
    lines.push('');
    if (report.parseErrors?.length > 0) {
        lines.push('## Parse Errors\n');
        lines.push(`${report.parseErrors.length} file(s) failed to parse:\n`);
        for (const err of report.parseErrors.slice(0, 10)) {
            lines.push(`- \`${err.file}\`: ${err.message}`);
        }
        lines.push('');
    }
    return lines.join('\n');
}
