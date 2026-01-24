import {
  Project,
  SourceFile,
  SyntaxKind,
  Node,
  ClassDeclaration,
  
  
  
  EnumDeclaration,
  
  
} from 'ts-morph';
import * as path from 'path';
import type {
  ModuleGraph,
  FileNode,
  ImportInfo,
  ExportInfo,
  MemberInfo,
  SymbolType,
  FileRole,
  Position,
  AnalysisOptions,
  ExportFlow,
  EnhancedExportInfo,
} from './types.js';

/**
 * Determine the symbol type from a declaration
 */
function getSymbolType(declaration: Node): SymbolType {
  if (Node.isFunctionDeclaration(declaration) || Node.isFunctionExpression(declaration)) {
    return 'function';
  }
  if (Node.isClassDeclaration(declaration) || Node.isClassExpression(declaration)) {
    return 'class';
  }
  if (Node.isInterfaceDeclaration(declaration)) {
    return 'interface';
  }
  if (Node.isTypeAliasDeclaration(declaration)) {
    return 'type';
  }
  if (Node.isEnumDeclaration(declaration)) {
    return 'enum';
  }
  if (Node.isVariableDeclaration(declaration)) {
    const init = declaration.getInitializer();
    if (init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))) {
      return 'function';
    }
    // Check if it's const
    const varStatement = declaration.getParent()?.getParent();
    if (Node.isVariableStatement(varStatement)) {
      const declarationKind = varStatement.getDeclarationKind();
      if (declarationKind === 'const') {
        return 'const';
      }
    }
    return 'variable';
  }
  return 'unknown';
}

/**
 * Get position from a node
 */
function getPosition(node: Node): Position {
  const sourceFile = node.getSourceFile();
  const pos = node.getStart();
  const { line, column } = sourceFile.getLineAndColumnAtPos(pos);
  return { line, column };
}

/**
 * Extract class members
 */
function extractClassMembers(classDecl: ClassDeclaration): MemberInfo[] {
  const members: MemberInfo[] = [];

  // Methods
  for (const method of classDecl.getMethods()) {
    members.push({
      name: method.getName(),
      type: 'function',
      isPrivate: method.hasModifier(SyntaxKind.PrivateKeyword),
      isStatic: method.hasModifier(SyntaxKind.StaticKeyword),
      signature: method.getSignature()?.getDeclaration().getText(),
    });
  }

  // Properties
  for (const prop of classDecl.getProperties()) {
    members.push({
      name: prop.getName(),
      type: 'variable',
      isPrivate: prop.hasModifier(SyntaxKind.PrivateKeyword),
      isStatic: prop.hasModifier(SyntaxKind.StaticKeyword),
    });
  }

  // Getters/Setters
  for (const accessor of classDecl.getGetAccessors()) {
    members.push({
      name: accessor.getName(),
      type: 'function',
      isPrivate: accessor.hasModifier(SyntaxKind.PrivateKeyword),
      isStatic: accessor.hasModifier(SyntaxKind.StaticKeyword),
    });
  }

  return members;
}

/**
 * Extract enum members
 */
function extractEnumMembers(enumDecl: EnumDeclaration): MemberInfo[] {
  return enumDecl.getMembers().map((member) => ({
    name: member.getName(),
    type: 'const' as SymbolType,
    isPrivate: false,
    isStatic: true,
  }));
}

/**
 * Get JSDoc description from a node
 */
function getJSDoc(node: Node): string | undefined {
  if (Node.isJSDocable(node)) {
    const jsDocs = node.getJsDocs();
    if (jsDocs.length > 0) {
      return jsDocs[0].getDescription();
    }
  }
  return undefined;
}

/**
 * Get signature from a declaration
 */
function getSignature(declaration: Node): string | undefined {
  if (Node.isFunctionDeclaration(declaration)) {
    const params = declaration.getParameters().map((p) => p.getText()).join(', ');
    const returnType = declaration.getReturnType().getText();
    return `(${params}) => ${returnType}`;
  }
  if (Node.isClassDeclaration(declaration)) {
    return declaration.getName() || 'class';
  }
  if (Node.isInterfaceDeclaration(declaration)) {
    return declaration.getName();
  }
  if (Node.isTypeAliasDeclaration(declaration)) {
    return declaration.getType().getText();
  }
  return undefined;
}

/**
 * Extract imports from a source file
 */
function extractImports(
  sourceFile: SourceFile,
  rootPath: string
): FileNode['imports'] {
  const internal = new Map<string, ImportInfo[]>();
  const external = new Set<string>();
  const unresolved = new Set<string>();

  // Regular import declarations
  for (const importDecl of sourceFile.getImportDeclarations()) {
    const specifier = importDecl.getModuleSpecifierValue();
    const isExternal = !specifier.startsWith('.') && !specifier.startsWith('/');
    const position = getPosition(importDecl);
    const isTypeOnly = importDecl.isTypeOnly();

    if (isExternal) {
      // Extract package name (handle scoped packages like @org/package)
      const pkgName = specifier.startsWith('@')
        ? specifier.split('/').slice(0, 2).join('/')
        : specifier.split('/')[0];
      external.add(pkgName);
    } else {
      // Internal import
      const resolvedFile = importDecl.getModuleSpecifierSourceFile();
      if (resolvedFile) {
        const resolvedPath = resolvedFile.getFilePath();
        const identifiers: string[] = [];

        // Default import
        const defaultImport = importDecl.getDefaultImport();
        if (defaultImport) {
          identifiers.push(defaultImport.getText());
        }

        // Named imports
        for (const namedImport of importDecl.getNamedImports()) {
          identifiers.push(namedImport.getName());
        }

        // Namespace import
        const namespaceImport = importDecl.getNamespaceImport();
        if (namespaceImport) {
          identifiers.push(`* as ${namespaceImport.getText()}`);
        }

        const importInfo: ImportInfo = {
          specifier,
          resolvedPath,
          identifiers,
          isTypeOnly,
          isDynamic: false,
          position,
        };

        const existing = internal.get(resolvedPath) || [];
        existing.push(importInfo);
        internal.set(resolvedPath, existing);
      } else {
        unresolved.add(specifier);
      }
    }
  }

  // Dynamic imports
  sourceFile.forEachDescendant((node) => {
    if (Node.isCallExpression(node)) {
      const expression = node.getExpression();
      if (expression.getText() === 'import') {
        const args = node.getArguments();
        if (args.length > 0 && Node.isStringLiteral(args[0])) {
          const specifier = args[0].getLiteralText();
          const isExternal = !specifier.startsWith('.') && !specifier.startsWith('/');

          if (isExternal) {
            const pkgName = specifier.startsWith('@')
              ? specifier.split('/').slice(0, 2).join('/')
              : specifier.split('/')[0];
            external.add(pkgName);
          }
        }
      }
    }

    // require() calls
    if (Node.isCallExpression(node)) {
      const expression = node.getExpression();
      if (Node.isIdentifier(expression) && expression.getText() === 'require') {
        const args = node.getArguments();
        if (args.length > 0 && Node.isStringLiteral(args[0])) {
          const specifier = args[0].getLiteralText();
          const isExternal = !specifier.startsWith('.') && !specifier.startsWith('/');

          if (isExternal) {
            const pkgName = specifier.startsWith('@')
              ? specifier.split('/').slice(0, 2).join('/')
              : specifier.split('/')[0];
            external.add(pkgName);
          }
        }
      }
    }
  });

  return { internal, external, unresolved };
}

/**
 * Extract exports from a source file
 */
function extractExports(sourceFile: SourceFile): ExportInfo[] {
  const exports: ExportInfo[] = [];
  const exportedDeclarations = sourceFile.getExportedDeclarations();

  for (const [name, declarations] of exportedDeclarations) {
    for (const decl of declarations) {
      const exportInfo: ExportInfo = {
        name,
        type: getSymbolType(decl),
        isDefault: name === 'default',
        isReExport: decl.getSourceFile() !== sourceFile,
        jsDoc: getJSDoc(decl),
        signature: getSignature(decl),
        position: getPosition(decl),
      };

      // Extract members for classes and enums
      if (Node.isClassDeclaration(decl)) {
        exportInfo.members = extractClassMembers(decl);
      } else if (Node.isEnumDeclaration(decl)) {
        exportInfo.members = extractEnumMembers(decl);
      }

      exports.push(exportInfo);
    }
  }

  return exports;
}

/**
 * Classify a file by its role in the codebase
 */
function classifyFile(
  filePath: string,
  exports: ExportInfo[],
  isEntry: boolean
): FileRole {
  const relativePath = filePath.toLowerCase();
  const fileName = path.basename(filePath).toLowerCase();

  // Entry point
  if (isEntry) {
    return 'entry';
  }

  // Config files
  if (
    fileName.includes('.config.') ||
    fileName.includes('rc.') ||
    fileName === 'tsconfig.json' ||
    fileName === 'jest.config.ts' ||
    fileName === 'vitest.config.ts'
  ) {
    return 'config';
  }

  // Test files
  if (
    fileName.includes('.test.') ||
    fileName.includes('.spec.') ||
    relativePath.includes('__tests__') ||
    relativePath.includes('/test/') ||
    relativePath.includes('/tests/')
  ) {
    return 'test';
  }

  // Type definition files
  if (fileName.endsWith('.d.ts') || relativePath.includes('/types/')) {
    return 'type';
  }

  // Barrel files (index files that mostly re-export)
  if (fileName === 'index.ts' || fileName === 'index.js') {
    const reExportCount = exports.filter((e) => e.isReExport).length;
    if (reExportCount > exports.length * 0.5) {
      return 'barrel';
    }
  }

  // Utility files
  if (
    relativePath.includes('/utils/') ||
    relativePath.includes('/util/') ||
    relativePath.includes('/helpers/') ||
    relativePath.includes('/lib/')
  ) {
    return 'util';
  }

  // Component files (React/Vue/etc)
  if (
    relativePath.includes('/components/') ||
    fileName.endsWith('.tsx') ||
    fileName.endsWith('.vue')
  ) {
    return 'component';
  }

  // Service files
  if (
    relativePath.includes('/services/') ||
    relativePath.includes('/service/') ||
    fileName.includes('service.')
  ) {
    return 'service';
  }

  return 'unknown';
}

/**
 * Build the module graph from a TypeScript/JavaScript project
 */
export async function buildModuleGraph(
  options: AnalysisOptions
): Promise<ModuleGraph> {
  const {
    rootPath,
    tsConfigPath,
    extensions = ['.ts', '.tsx', '.js', '.jsx'],
    excludePatterns = ['**/node_modules/**', '**/dist/**', '**/build/**'],
    includeTests = false,
  } = options;

  // Create ts-morph project
  const projectOptions: any = {
    skipAddingFilesFromTsConfig: true,
  };

  // Use tsconfig if available
  const tsconfigFile = tsConfigPath || path.join(rootPath, 'tsconfig.json');
  try {
    await import('fs').then((fs) => {
      if (fs.existsSync(tsconfigFile)) {
        projectOptions.tsConfigFilePath = tsconfigFile;
      }
    });
  } catch {
    // Continue without tsconfig
  }

  const project = new Project(projectOptions);

  // Build glob patterns
  const includePatterns = extensions.map((ext) => `${rootPath}/**/*${ext}`);

  // Add test exclusion if needed
  const finalExcludePatterns = [...excludePatterns];
  if (!includeTests) {
    finalExcludePatterns.push('**/*.test.*', '**/*.spec.*', '**/__tests__/**');
  }

  // Add source files
  project.addSourceFilesAtPaths(includePatterns);

  // Remove excluded files
  for (const sourceFile of project.getSourceFiles()) {
    const filePath = sourceFile.getFilePath();
    const shouldExclude = finalExcludePatterns.some((pattern) => {
      // Simple glob matching - escape dots first, then convert globs
      const regex = new RegExp(
        pattern
          .replace(/\./g, '\\.')     // Escape dots first
          .replace(/\*\*/g, '.*')    // ** = any path
          .replace(/\*/g, '[^/]*')   // * = any segment
      );
      return regex.test(filePath);
    });

    // Also exclude node_modules by path check (backup)
    const isNodeModules = filePath.includes('/node_modules/') || filePath.includes('\\node_modules\\');

    if (shouldExclude || isNodeModules) {
      project.removeSourceFile(sourceFile);
    }
  }

  const graph: ModuleGraph = new Map();

  // First pass: extract imports and exports
  for (const sourceFile of project.getSourceFiles()) {
    const filePath = sourceFile.getFilePath();
    const relativePath = path.relative(rootPath, filePath);

    const imports = extractImports(sourceFile, rootPath);
    const exports = extractExports(sourceFile);

    // Check if this is an entry point (will be refined later)
    const isEntry = false;

    const fileNode: FileNode = {
      path: filePath,
      relativePath,
      imports,
      exports,
      importedBy: new Set(),
      scripts: new Set(),
      role: classifyFile(filePath, exports, isEntry),
    };

    graph.set(filePath, fileNode);
  }

  // Second pass: build reverse references (importedBy)
  for (const [filePath, fileNode] of graph) {
    for (const importedPath of fileNode.imports.internal.keys()) {
      const importedFile = graph.get(importedPath);
      if (importedFile) {
        importedFile.importedBy.add(filePath);
      }
    }
  }

  return graph;
}

/**
 * Mark entry point files in the graph
 */
export function markEntryPoints(
  graph: ModuleGraph,
  entryPaths: Set<string>,
  rootPath: string
): void {
  for (const entryPath of entryPaths) {
    // Resolve the entry path relative to root
    const absolutePath = path.isAbsolute(entryPath)
      ? entryPath
      : path.resolve(rootPath, entryPath);

    // Try different extensions
    const possiblePaths = [
      absolutePath,
      absolutePath + '.ts',
      absolutePath + '.tsx',
      absolutePath + '.js',
      absolutePath + '.jsx',
      path.join(absolutePath, 'index.ts'),
      path.join(absolutePath, 'index.tsx'),
      path.join(absolutePath, 'index.js'),
      path.join(absolutePath, 'index.jsx'),
    ];

    for (const tryPath of possiblePaths) {
      const fileNode = graph.get(tryPath);
      if (fileNode) {
        fileNode.role = 'entry';
        break;
      }
    }
  }
}

// ============================================================================
// Export Flow Analysis
// ============================================================================

/**
 * Extract release tag from JSDoc (@public, @internal, @beta, @alpha)
 */
export function extractReleaseTag(jsDoc: string | undefined): EnhancedExportInfo['releaseTag'] {
  if (!jsDoc) return undefined;

  if (jsDoc.includes('@internal')) return 'internal';
  if (jsDoc.includes('@alpha')) return 'alpha';
  if (jsDoc.includes('@beta')) return 'beta';
  if (jsDoc.includes('@public')) return 'public';

  return undefined;
}

/**
 * Find the original source file for a re-exported symbol
 */
function findOriginalSource(
  graph: ModuleGraph,
  filePath: string,
  exportName: string,
  visited: Set<string> = new Set()
): string | undefined {
  if (visited.has(filePath)) return undefined;
  visited.add(filePath);

  const node = graph.get(filePath);
  if (!node) return undefined;

  const exportInfo = node.exports.find((e) => e.name === exportName);

  if (!exportInfo) return undefined;

  // If it's not a re-export, this is the original source
  if (!exportInfo.isReExport) {
    return filePath;
  }

  // It's a re-export - find where it comes from
  for (const [importedPath, imports] of node.imports.internal) {
    for (const imp of imports) {
      if (imp.identifiers.includes(exportName) || imp.identifiers.some((id) => id.startsWith('* as '))) {
        // Recursively trace to origin
        const origin = findOriginalSource(graph, importedPath, exportName, visited);
        if (origin) return origin;
      }
    }
  }

  return undefined;
}

/**
 * Trace where an export originates and how it flows through barrels
 */
export function traceExportOrigin(
  graph: ModuleGraph,
  filePath: string,
  exportName: string,
  visited: Set<string> = new Set()
): ExportFlow {
  const defaultFlow: ExportFlow = {
    definedIn: filePath,
    exportType: 'named',
    reExportChain: [],
    publicFrom: [],
    conditions: [],
  };

  if (visited.has(filePath)) return defaultFlow;
  visited.add(filePath);

  const node = graph.get(filePath);
  if (!node) return defaultFlow;

  const exportInfo = node.exports.find((e) => e.name === exportName);

  if (!exportInfo) return defaultFlow;

  // If it's not a re-export, this is the origin
  if (!exportInfo.isReExport) {
    return {
      definedIn: filePath,
      exportType: exportInfo.isDefault ? 'default' : 'named',
      reExportChain: [],
      publicFrom: [],
      conditions: [],
    };
  }

  // It's a re-export - find where it comes from
  for (const [importedPath, imports] of node.imports.internal) {
    for (const imp of imports) {
      const isNamespaceImport = imp.identifiers.some((id) => id.startsWith('* as '));
      if (imp.identifiers.includes(exportName) || isNamespaceImport) {
        const originFlow = traceExportOrigin(graph, importedPath, exportName, visited);
        return {
          ...originFlow,
          reExportChain: [node.relativePath, ...originFlow.reExportChain],
        };
      }
    }
  }

  return defaultFlow;
}

/**
 * Build export flows for all exports in the graph
 */
export function buildExportFlows(
  graph: ModuleGraph,
  entryPaths: Set<string>
): Map<string, ExportFlow> {
  const flows = new Map<string, ExportFlow>();

  // Find all entry point files
  const entryFiles = new Set<string>();
  for (const [filePath, node] of graph) {
    if (node.role === 'entry' || entryPaths.has(filePath)) {
      entryFiles.add(filePath);
    }
  }

  // For each entry point, trace all exports
  for (const entryPath of entryFiles) {
    const entryNode = graph.get(entryPath);
    if (!entryNode) continue;

    for (const exp of entryNode.exports) {
      const flowKey = `${exp.name}`;

      if (!flows.has(flowKey)) {
        const flow = traceExportOrigin(graph, entryPath, exp.name);
        flow.publicFrom.push(entryNode.relativePath);
        flows.set(flowKey, flow);
      } else {
        // Add this entry point to existing flow
        const existingFlow = flows.get(flowKey)!;
        if (!existingFlow.publicFrom.includes(entryNode.relativePath)) {
          existingFlow.publicFrom.push(entryNode.relativePath);
        }
      }
    }
  }

  return flows;
}

/**
 * Enhance export info with flow tracking and release tags
 */
export function enhanceExportInfo(
  exportInfo: ExportInfo,
  flow: ExportFlow | undefined,
  originalSource: string | undefined
): EnhancedExportInfo {
  return {
    ...exportInfo,
    flow,
    originalSource,
    releaseTag: extractReleaseTag(exportInfo.jsDoc),
  };
}
