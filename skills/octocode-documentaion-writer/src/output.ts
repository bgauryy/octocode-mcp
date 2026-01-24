/**
 * Output Generator
 * Generates analysis output in various formats
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  RepoAnalysis,
  ModuleGraph,
  PackageConfig,
  PublicAPIEntry,
  ModuleGraphSummary,
  DependencyAnalysis,
  FileAnalysis,
  AnalysisInsights,
  AnalysisMetadata,
  EnhancedRepoAnalysis,
  ExportFlow,
  DependencyUsage,
  ArchitectureAnalysis,
  ExportsMapAnalysis,
  PackageJson,
} from './types.js';
import {
  buildInternalDependencies,
  buildExternalDependencies,
  findCircularDependencies,
  findUnusedExports,
  findBarrelFiles,
  findMostImportedFiles,
  findOrphanFiles,
  findTypeOnlyFiles,
  analyzeDetailedDependencyUsage,
  detectArchitecture,
} from './dependency-analyzer.js';
import { buildExportFlows } from './module-graph.js';
import { analyzeExportsMap } from './package-analyzer.js';

/**
 * Build public API entries from entry points
 */
export function buildPublicAPI(
  graph: ModuleGraph,
  _entryPaths: Set<string>,
  _rootPath: string
): PublicAPIEntry[] {
  const publicAPI: PublicAPIEntry[] = [];

  for (const [_filePath, fileNode] of graph) {
    if (fileNode.role === 'entry') {
      publicAPI.push({
        entryPoint: fileNode.relativePath,
        exports: fileNode.exports.filter((exp) => !exp.isReExport),
      });
    }
  }

  return publicAPI;
}

/**
 * Build module graph summary
 */
export function buildModuleGraphSummary(
  graph: ModuleGraph,
  packageConfig: PackageConfig
): ModuleGraphSummary {
  let totalImports = 0;
  let totalExports = 0;

  for (const fileNode of graph.values()) {
    totalImports += fileNode.imports.internal.size + fileNode.imports.external.size;
    totalExports += fileNode.exports.length;
  }

  return {
    totalFiles: graph.size,
    totalImports,
    totalExports,
    internalDependencies: buildInternalDependencies(graph),
    externalDependencies: buildExternalDependencies(graph, packageConfig.dependencies),
  };
}

/**
 * Build file analysis list
 */
export function buildFileAnalysis(
  graph: ModuleGraph,
  entryPaths: Set<string>
): FileAnalysis[] {
  const files: FileAnalysis[] = [];

  for (const [filePath, fileNode] of graph) {
    files.push({
      path: filePath,
      relativePath: fileNode.relativePath,
      role: fileNode.role,
      exportCount: fileNode.exports.length,
      importCount: fileNode.imports.internal.size,
      externalImportCount: fileNode.imports.external.size,
      linesOfCode: 0, // Would need to count lines
      isBarrel: fileNode.role === 'barrel',
      isEntryPoint: entryPaths.has(filePath) || fileNode.role === 'entry',
    });
  }

  return files;
}

/**
 * Build analysis insights
 */
export function buildInsights(
  graph: ModuleGraph,
  entryPaths: Set<string>
): AnalysisInsights {
  // Find largest files by export count
  const largestFiles = Array.from(graph.values())
    .sort((a, b) => b.exports.length - a.exports.length)
    .slice(0, 10)
    .map((f) => f.relativePath);

  return {
    unusedExports: findUnusedExports(graph, entryPaths),
    circularDependencies: findCircularDependencies(graph),
    barrelFiles: findBarrelFiles(graph),
    largestFiles,
    mostImported: findMostImportedFiles(graph),
    orphanFiles: findOrphanFiles(graph, entryPaths),
    typeOnlyFiles: findTypeOnlyFiles(graph),
  };
}

/**
 * Generate the complete analysis output
 */
export function generateAnalysisOutput(
  graph: ModuleGraph,
  packageConfig: PackageConfig,
  dependencyAnalysis: DependencyAnalysis,
  rootPath: string,
  startTime: number,
  packageJson?: PackageJson
): EnhancedRepoAnalysis {
  const entryPaths = new Set<string>();

  // Collect entry point paths
  for (const [filePath, fileNode] of graph) {
    if (fileNode.role === 'entry') {
      entryPaths.add(filePath);
    }
  }

  const metadata: AnalysisMetadata = {
    version: '2.0.0',
    generatedAt: new Date().toISOString(),
    repositoryPath: rootPath,
    analysisType: 'full',
    duration: Date.now() - startTime,
  };

  // Build enhanced analysis
  const exportFlows = buildExportFlows(graph, entryPaths);
  const dependencyUsage = analyzeDetailedDependencyUsage(graph, packageConfig.dependencies);
  const architecture = detectArchitecture(graph);
  const exportsMap = packageJson ? analyzeExportsMap(packageJson, rootPath, graph) : undefined;

  // Convert Maps to Records for JSON serialization
  const exportFlowsRecord: Record<string, ExportFlow> = {};
  for (const [name, flow] of exportFlows) {
    exportFlowsRecord[name] = flow;
  }

  const dependencyUsageRecord: Record<string, DependencyUsage> = {};
  for (const [name, usage] of dependencyUsage) {
    dependencyUsageRecord[name] = usage;
  }

  return {
    metadata,
    package: packageConfig,
    publicAPI: buildPublicAPI(graph, entryPaths, rootPath),
    moduleGraph: buildModuleGraphSummary(graph, packageConfig),
    dependencies: dependencyAnalysis,
    files: buildFileAnalysis(graph, entryPaths),
    insights: buildInsights(graph, entryPaths),
    exportFlows: exportFlowsRecord,
    dependencyUsage: dependencyUsageRecord,
    architecture,
    exportsMap,
  };
}

/**
 * Write analysis output to files
 */
export async function writeAnalysisOutput(
  analysis: EnhancedRepoAnalysis,
  outputPath: string
): Promise<void> {
  // Ensure output directory exists
  await fs.promises.mkdir(outputPath, { recursive: true });

  // SPLITTING LOGIC: 
  // If files array > 300, split it
  const FILES_THRESHOLD = 300;
  if (analysis.files.length > FILES_THRESHOLD) {
    const totalParts = Math.ceil(analysis.files.length / FILES_THRESHOLD);
    console.log(`📦 Splitting ${analysis.files.length} files into ${totalParts} chunks...`);
    
    for (let i = 0; i < totalParts; i++) {
      const chunk = analysis.files.slice(i * FILES_THRESHOLD, (i + 1) * FILES_THRESHOLD);
      const chunkPath = path.join(outputPath, `static-analysis-files-${String(i).padStart(2, '0')}.json`);
      await fs.promises.writeFile(
        chunkPath,
        JSON.stringify(chunk, null, 2),
        'utf-8'
      );
    }
  }

  // Write main analysis JSON
  // Note: We keep the full analysis in analysis.json for now to satisfy schema,
  // but the split files are available for agents to consume if needed.
  const analysisPath = path.join(outputPath, 'analysis.json');
  await fs.promises.writeFile(
    analysisPath,
    JSON.stringify(analysis, null, 2),
    'utf-8'
  );

  // Write summary markdown
  const summaryPath = path.join(outputPath, 'ANALYSIS_SUMMARY.md');
  await fs.promises.writeFile(summaryPath, generateMarkdownSummary(analysis), 'utf-8');

  // Write public API markdown
  const apiPath = path.join(outputPath, 'PUBLIC_API.md');
  await fs.promises.writeFile(apiPath, generatePublicAPIDocs(analysis), 'utf-8');

  // Write dependency graph markdown
  const depsPath = path.join(outputPath, 'DEPENDENCIES.md');
  await fs.promises.writeFile(depsPath, generateDependencyDocs(analysis), 'utf-8');

  // Write insights markdown
  const insightsPath = path.join(outputPath, 'INSIGHTS.md');
  await fs.promises.writeFile(insightsPath, generateInsightsDocs(analysis), 'utf-8');

  // Write module graph as mermaid
  const graphPath = path.join(outputPath, 'MODULE_GRAPH.md');
  await fs.promises.writeFile(graphPath, generateMermaidGraph(analysis), 'utf-8');

  // Write enhanced analysis files
  if (analysis.exportFlows) {
    const flowsPath = path.join(outputPath, 'EXPORT_FLOWS.md');
    await fs.promises.writeFile(flowsPath, generateExportFlowsDocs(analysis), 'utf-8');
  }

  if (analysis.architecture) {
    const archPath = path.join(outputPath, 'ARCHITECTURE.md');
    await fs.promises.writeFile(archPath, generateArchitectureDocs(analysis), 'utf-8');
  }

  if (analysis.dependencyUsage) {
    const usagePath = path.join(outputPath, 'DEPENDENCY_USAGE.md');
    await fs.promises.writeFile(usagePath, generateDependencyUsageDocs(analysis), 'utf-8');
  }
}

/**
 * Generate markdown summary
 */
function generateMarkdownSummary(analysis: RepoAnalysis): string {
  const { metadata, package: pkg, moduleGraph, dependencies, insights } = analysis;

  return `# Repository Analysis: ${pkg.name}

> Generated: ${metadata.generatedAt}  
> Analysis Duration: ${metadata.duration}ms

## Overview

| Metric | Value |
|--------|-------|
| Package Name | ${pkg.name} |
| Version | ${pkg.version} |
| Total Files | ${moduleGraph.totalFiles} |
| Total Exports | ${moduleGraph.totalExports} |
| Total Internal Imports | ${moduleGraph.internalDependencies.length} |
| External Dependencies | ${moduleGraph.externalDependencies.length} |

## Description

${pkg.description || '_No description provided_'}

## Entry Points

${Array.from(pkg.entryPoints.all).map((e) => `- \`${e}\``).join('\n') || '_No entry points found_'}

## Quick Stats

- **Unused Dependencies:** ${dependencies.unused.length}
- **Unlisted Dependencies:** ${dependencies.unlisted.length}
- **Circular Dependencies:** ${insights.circularDependencies.length}
- **Unused Exports:** ${insights.unusedExports.length}
- **Orphan Files:** ${insights.orphanFiles.length}
- **Barrel Files:** ${insights.barrelFiles.length}

## Scripts

${Object.entries(pkg.scripts).length > 0
  ? Object.entries(pkg.scripts)
      .slice(0, 10)
      .map(([name, cmd]) => `- \`${name}\`: ${cmd.substring(0, 50)}${cmd.length > 50 ? '...' : ''}`)
      .join('\n')
  : '_No scripts defined_'}

---

*Generated by Octocode Documentation Writer*
`;
}

/**
 * Generate public API documentation
 */
function generatePublicAPIDocs(analysis: RepoAnalysis): string {
  const { publicAPI } = analysis;

  let content = `# Public API Reference

> ${analysis.package.name}@${analysis.package.version}

`;

  if (publicAPI.length === 0) {
    return content + '_No public API exports found_\n';
  }

  for (const entry of publicAPI) {
    content += `## ${entry.entryPoint}\n\n`;

    if (entry.exports.length === 0) {
      content += '_No exports_\n\n';
      continue;
    }

    for (const exp of entry.exports) {
      content += `### \`${exp.name}\`\n\n`;
      content += `- **Type:** ${exp.type}\n`;

      if (exp.signature) {
        content += `- **Signature:** \`${exp.signature}\`\n`;
      }

      if (exp.jsDoc) {
        content += `\n${exp.jsDoc}\n`;
      }

      if (exp.members && exp.members.length > 0) {
        content += `\n**Members:**\n`;
        for (const member of exp.members) {
          if (!member.isPrivate) {
            content += `- \`${member.name}\` (${member.type})${member.isStatic ? ' [static]' : ''}\n`;
          }
        }
      }

      content += '\n';
    }
  }

  return content;
}

/**
 * Generate dependency documentation
 */
function generateDependencyDocs(analysis: RepoAnalysis): string {
  const { dependencies, moduleGraph } = analysis;

  let content = `# Dependencies

## Production Dependencies (${dependencies.declared.production.length})

${dependencies.declared.production.map((d) => `- ${d}`).join('\n') || '_None_'}

## Development Dependencies (${dependencies.declared.development.length})

${dependencies.declared.development.map((d) => `- ${d}`).join('\n') || '_None_'}

## Peer Dependencies (${dependencies.declared.peer.length})

${dependencies.declared.peer.map((d) => `- ${d}`).join('\n') || '_None_'}

---

## Dependency Issues

### Unused Dependencies (${dependencies.unused.length})

${dependencies.unused.map((d) => `- ⚠️ ${d}`).join('\n') || '✅ _No unused dependencies_'}

### Unlisted Dependencies (${dependencies.unlisted.length})

${dependencies.unlisted.map((d) => `- ❌ ${d}`).join('\n') || '✅ _All dependencies are declared_'}

### Misplaced Dependencies (${dependencies.misplaced.length})

${dependencies.misplaced.map((d) => `- 📦 ${d} (should be devDependency)`).join('\n') || '✅ _No misplaced dependencies_'}

---

## External Dependency Usage

| Package | Used By (files) |
|---------|-----------------|
${moduleGraph.externalDependencies
  .slice(0, 30)
  .map((d) => `| ${d.name} | ${d.usedBy.length} |`)
  .join('\n')}

`;

  return content;
}

/**
 * Generate insights documentation
 */
function generateInsightsDocs(analysis: RepoAnalysis): string {
  const { insights } = analysis;

  let content = `# Code Insights

## Summary

| Insight | Count |
|---------|-------|
| Unused Exports | ${insights.unusedExports.length} |
| Circular Dependencies | ${insights.circularDependencies.length} |
| Barrel Files | ${insights.barrelFiles.length} |
| Orphan Files | ${insights.orphanFiles.length} |
| Type-Only Files | ${insights.typeOnlyFiles.length} |

---

## Circular Dependencies

${
  insights.circularDependencies.length > 0
    ? insights.circularDependencies
        .map((cycle, i) => `### Cycle ${i + 1}\n\n\`\`\`\n${cycle.join(' → ')}\n\`\`\``)
        .join('\n\n')
    : '✅ _No circular dependencies detected_'
}

---

## Unused Exports

${
  insights.unusedExports.length > 0
    ? insights.unusedExports
        .slice(0, 50)
        .map((exp) => `- \`${exp.export}\` in \`${exp.file}\` (${exp.type})`)
        .join('\n')
    : '✅ _No unused exports detected_'
}

${insights.unusedExports.length > 50 ? `\n_...and ${insights.unusedExports.length - 50} more_` : ''}

---

## Most Imported Files

| File | Imported By |
|------|-------------|
${insights.mostImported.map((f) => `| ${f.file} | ${f.importedByCount} files |`).join('\n')}

---

## Barrel Files

${
  insights.barrelFiles.length > 0
    ? insights.barrelFiles.map((f) => `- ${f}`).join('\n')
    : '_No barrel files detected_'
}

---

## Orphan Files

${
  insights.orphanFiles.length > 0
    ? insights.orphanFiles.map((f) => `- ${f}`).join('\n')
    : '✅ _No orphan files detected_'
}

---

## Type-Only Files

${
  insights.typeOnlyFiles.length > 0
    ? insights.typeOnlyFiles.map((f) => `- ${f}`).join('\n')
    : '_No type-only files detected_'
}

`;

  return content;
}

/**
 * Generate Mermaid graph
 */
function generateMermaidGraph(analysis: RepoAnalysis): string {
  const { moduleGraph } = analysis;

  // Limit to top 30 most connected files for readability
  const topFiles = new Set(
    analysis.files
      .sort((a, b) => (b.importCount + b.exportCount) - (a.importCount + a.exportCount))
      .slice(0, 30)
      .map((f) => f.relativePath)
  );

  const edges = moduleGraph.internalDependencies.filter(
    (edge) => topFiles.has(edge.from) && topFiles.has(edge.to)
  );

  let content = `# Module Graph

## Dependency Graph (Top 30 Most Connected Files)

\`\`\`mermaid
graph TD
`;

  // Create node IDs (sanitize file paths)
  const nodeIds = new Map<string, string>();
  let nodeCounter = 0;

  for (const file of topFiles) {
    const id = `N${nodeCounter++}`;
    nodeIds.set(file, id);
    const shortName = file.split('/').slice(-2).join('/');
    content += `    ${id}["${shortName}"]\n`;
  }

  // Add edges
  for (const edge of edges) {
    const fromId = nodeIds.get(edge.from);
    const toId = nodeIds.get(edge.to);
    if (fromId && toId) {
      content += `    ${fromId} --> ${toId}\n`;
    }
  }

  content += `\`\`\`

## File Roles

\`\`\`mermaid
pie title File Distribution by Role
`;

  const roleCounts = new Map<string, number>();
  for (const file of analysis.files) {
    roleCounts.set(file.role, (roleCounts.get(file.role) || 0) + 1);
  }

  for (const [role, count] of roleCounts) {
    content += `    "${role}" : ${count}\n`;
  }

  content += `\`\`\`
`;

  return content;
}

// ============================================================================
// Enhanced Documentation Generators
// ============================================================================

/**
 * Generate export flows documentation
 */
function generateExportFlowsDocs(analysis: EnhancedRepoAnalysis): string {
  const { exportFlows, package: pkg } = analysis;

  let content = `# Export Flows

> How symbols travel from source to public API in ${pkg.name}

`;

  if (!exportFlows || Object.keys(exportFlows).length === 0) {
    return content + '_No export flows detected_\n';
  }

  // Group by origin file
  const byOrigin = new Map<string, { name: string; flow: ExportFlow }[]>();
  for (const [name, flow] of Object.entries(exportFlows)) {
    const origins = byOrigin.get(flow.definedIn) || [];
    origins.push({ name, flow });
    byOrigin.set(flow.definedIn, origins);
  }

  content += `## Summary

| Metric | Value |
|--------|-------|
| Total Tracked Exports | ${Object.keys(exportFlows).length} |
| Origin Files | ${byOrigin.size} |
| Re-exported Symbols | ${Object.values(exportFlows).filter(f => f.reExportChain.length > 0).length} |

---

## Export Flow Details

`;

  for (const [origin, flows] of byOrigin) {
    content += `### From \`${origin}\`\n\n`;

    for (const { name, flow } of flows) {
      content += `#### \`${name}\`\n\n`;
      content += `- **Type:** ${flow.exportType}\n`;
      content += `- **Defined in:** \`${flow.definedIn}\`\n`;

      if (flow.reExportChain.length > 0) {
        content += `- **Re-export chain:** ${flow.reExportChain.map(f => `\`${f}\``).join(' → ')}\n`;
      }

      if (flow.publicFrom.length > 0) {
        content += `- **Public from:** ${flow.publicFrom.map(f => `\`${f}\``).join(', ')}\n`;
      }

      if (flow.conditions.length > 0) {
        content += `- **Conditions:** ${flow.conditions.join(', ')}\n`;
      }

      content += '\n';
    }
  }

  // Mermaid diagram
  content += `---

## Export Flow Diagram

\`\`\`mermaid
flowchart TB
    subgraph "Public API"
`;

  const entryPoints = new Set<string>();
  for (const flow of Object.values(exportFlows)) {
    for (const ep of flow.publicFrom) {
      entryPoints.add(ep);
    }
  }

  let nodeId = 0;
  const nodeIds = new Map<string, string>();

  for (const ep of entryPoints) {
    const id = `EP${nodeId++}`;
    nodeIds.set(ep, id);
    content += `        ${id}["${ep}"]\n`;
  }

  content += `    end\n\n`;

  // Add origin files and connections
  for (const [origin, flows] of byOrigin) {
    const originId = `O${nodeId++}`;
    nodeIds.set(origin, originId);
    content += `    ${originId}["${origin}"]\n`;

    for (const { flow } of flows) {
      if (flow.publicFrom.length > 0) {
        for (const pub of flow.publicFrom) {
          const pubId = nodeIds.get(pub);
          if (pubId) {
            content += `    ${originId} --> ${pubId}\n`;
          }
        }
      }
    }
  }

  content += `\`\`\`
`;

  return content;
}

/**
 * Generate architecture documentation
 */
function generateArchitectureDocs(analysis: EnhancedRepoAnalysis): string {
  const { architecture, package: pkg } = analysis;

  let content = `# Architecture Analysis

> Code organization patterns in ${pkg.name}

`;

  if (!architecture) {
    return content + '_No architecture analysis available_\n';
  }

  content += `## Detected Pattern: **${architecture.pattern}**

`;

  // Pattern description
  const patternDescriptions: Record<string, string> = {
    'layered': 'The codebase follows a layered architecture with distinct layers for presentation, domain, infrastructure, and shared utilities.',
    'feature-based': 'The codebase is organized by features/modules, with each feature containing its own components, services, and types.',
    'flat': 'The codebase has a flat structure with minimal directory nesting.',
    'monorepo': 'The codebase is a monorepo with multiple packages or applications.',
    'unknown': 'The architecture pattern could not be automatically detected.',
  };

  content += `${patternDescriptions[architecture.pattern]}\n\n`;

  // Layer summary
  if (architecture.layers.length > 0) {
    content += `## Layers

| Layer | Description | Files |
|-------|-------------|-------|
`;

    for (const layer of architecture.layers) {
      content += `| ${layer.name} | ${layer.description} | ${layer.files.length} |\n`;
    }

    content += '\n';

    // Layer details
    for (const layer of architecture.layers) {
      content += `### ${layer.name}\n\n`;
      content += `> ${layer.description}\n\n`;
      content += `**Allowed dependencies:** ${layer.dependsOn.length > 0 ? layer.dependsOn.join(', ') : 'none (base layer)'}\n\n`;

      if (layer.files.length > 0) {
        content += `**Files (${layer.files.length}):**\n`;
        for (const file of layer.files.slice(0, 20)) {
          content += `- \`${file}\`\n`;
        }
        if (layer.files.length > 20) {
          content += `- _...and ${layer.files.length - 20} more_\n`;
        }
        content += '\n';
      }
    }
  }

  // Violations
  content += `---

## Layer Violations

`;

  if (architecture.violations.length === 0) {
    content += '✅ _No layer violations detected_\n';
  } else {
    content += `⚠️ **${architecture.violations.length} violations detected**\n\n`;
    content += `| From | To | From Layer | To Layer |\n`;
    content += `|------|----|-----------|---------|\n`;

    for (const violation of architecture.violations.slice(0, 30)) {
      content += `| \`${violation.from}\` | \`${violation.to}\` | ${violation.fromLayer} | ${violation.toLayer} |\n`;
    }

    if (architecture.violations.length > 30) {
      content += `\n_...and ${architecture.violations.length - 30} more violations_\n`;
    }
  }

  // Mermaid diagram
  content += `
---

## Architecture Diagram

\`\`\`mermaid
graph TB
`;

  for (const layer of architecture.layers) {
    const layerId = layer.name.replace(/[^a-zA-Z0-9]/g, '');
    content += `    subgraph ${layerId}["${layer.name} (${layer.files.length} files)"]\n`;
    content += `    end\n`;
  }

  // Add layer dependencies
  for (const layer of architecture.layers) {
    const fromId = layer.name.replace(/[^a-zA-Z0-9]/g, '');
    for (const dep of layer.dependsOn) {
      const toId = dep.replace(/[^a-zA-Z0-9]/g, '');
      content += `    ${fromId} --> ${toId}\n`;
    }
  }

  content += `\`\`\`
`;

  return content;
}

/**
 * Generate detailed dependency usage documentation
 */
function generateDependencyUsageDocs(analysis: EnhancedRepoAnalysis): string {
  const { dependencyUsage, package: pkg } = analysis;

  let content = `# Dependency Usage Details

> Which symbols are imported from each package in ${pkg.name}

`;

  if (!dependencyUsage || Object.keys(dependencyUsage).length === 0) {
    return content + '_No dependency usage data available_\n';
  }

  // Summary table
  content += `## Summary

| Package | Type | Files Used In | Total Imports | Type-Only |
|---------|------|---------------|---------------|-----------|
`;

  const sortedUsage = Object.entries(dependencyUsage).sort(
    (a, b) => b[1].stats.filesUsedIn - a[1].stats.filesUsedIn
  );

  for (const [_name, usage] of sortedUsage) {
    content += `| ${usage.package} | ${usage.declaredAs} | ${usage.stats.filesUsedIn} | ${usage.stats.totalImports} | ${usage.stats.typeOnlyCount} |\n`;
  }

  content += '\n---\n\n';

  // Detailed usage
  content += `## Detailed Usage\n\n`;

  for (const [_name, usage] of sortedUsage) {
    content += `### \`${usage.package}\`\n\n`;
    content += `- **Declared as:** ${usage.declaredAs}\n`;
    content += `- **Used in ${usage.stats.filesUsedIn} files**\n`;

    if (usage.stats.uniqueSymbols.length > 0) {
      content += `- **Symbols used:** ${usage.stats.uniqueSymbols.slice(0, 10).map(s => `\`${s}\``).join(', ')}`;
      if (usage.stats.uniqueSymbols.length > 10) {
        content += ` _...and ${usage.stats.uniqueSymbols.length - 10} more_`;
      }
      content += '\n';
    }

    content += '\n**Usage locations:**\n';
    for (const loc of usage.usageLocations.slice(0, 10)) {
      content += `- \`${loc.file}\``;
      if (loc.isTypeOnly) content += ' (type-only)';
      if (loc.isDynamic) content += ' (dynamic)';
      if (loc.isNamespace) content += ' (namespace)';
      content += '\n';
    }
    if (usage.usageLocations.length > 10) {
      content += `- _...and ${usage.usageLocations.length - 10} more locations_\n`;
    }

    content += '\n';
  }

  return content;
}
