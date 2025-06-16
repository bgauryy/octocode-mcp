import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { executeGitHubCommand } from '../../utils/exec';
import { generateCacheKey, withCache } from '../../utils/cache';
import {
  GitHubRepositoryStructureParams,
  GitHubRepositoryStructureResult,
} from '../../types';
import { createErrorResult, createSuccessResult } from '../util';

// Enhanced file type detection and metadata
interface FileMetadata {
  name: string;
  type: 'file' | 'dir';
  size?: number;
  extension?: string;
  category:
    | 'code'
    | 'config'
    | 'docs'
    | 'assets'
    | 'data'
    | 'build'
    | 'test'
    | 'other';
  language?: string;
  description?: string;
}

function getFileMetadata(item: any): FileMetadata {
  const name = item.name || '';
  const type = item.type === 'dir' ? 'dir' : 'file';
  const size = item.size;

  // Extract extension
  const extension =
    type === 'file' && name.includes('.')
      ? name.split('.').pop()?.toLowerCase()
      : undefined;

  // Categorize and detect language
  let category: FileMetadata['category'] = 'other';
  let language: string | undefined;
  let description: string | undefined;

  if (type === 'dir') {
    // Directory categorization
    const lowerName = name.toLowerCase();
    if (
      ['src', 'lib', 'app', 'components', 'pages', 'routes'].includes(lowerName)
    ) {
      category = 'code';
      description = 'Source code directory';
    } else if (
      ['test', 'tests', '__tests__', 'spec', 'specs'].includes(lowerName)
    ) {
      category = 'test';
      description = 'Test files directory';
    } else if (['docs', 'documentation', 'doc'].includes(lowerName)) {
      category = 'docs';
      description = 'Documentation directory';
    } else if (
      ['assets', 'static', 'public', 'images', 'img'].includes(lowerName)
    ) {
      category = 'assets';
      description = 'Static assets directory';
    } else if (['build', 'dist', 'out', 'target', 'bin'].includes(lowerName)) {
      category = 'build';
      description = 'Build output directory';
    } else if (['config', 'configs', 'configuration'].includes(lowerName)) {
      category = 'config';
      description = 'Configuration directory';
    } else if (['data', 'fixtures', 'mock', 'mocks'].includes(lowerName)) {
      category = 'data';
      description = 'Data files directory';
    }
  } else if (extension) {
    const configExtensions = {
      json: 'JSON Configuration',
      yaml: 'YAML Configuration',
      yml: 'YAML Configuration',
      toml: 'TOML Configuration',
      ini: 'INI Configuration',
      cfg: 'Configuration File',
      conf: 'Configuration File',
      config: 'Configuration File',
      env: 'Environment Variables',
      properties: 'Properties File',
      xml: 'XML Configuration',
    };

    const docsExtensions = {
      md: 'Markdown',
      markdown: 'Markdown',
      rst: 'reStructuredText',
      txt: 'Text Document',
      pdf: 'PDF Document',
      doc: 'Word Document',
      docx: 'Word Document',
      rtf: 'Rich Text Format',
    };

    const assetExtensions = {
      png: 'PNG Image',
      jpg: 'JPEG Image',
      jpeg: 'JPEG Image',
      gif: 'GIF Image',
      svg: 'SVG Image',
      webp: 'WebP Image',
      ico: 'Icon',
      bmp: 'Bitmap Image',
      tiff: 'TIFF Image',
      mp4: 'MP4 Video',
      avi: 'AVI Video',
      mov: 'QuickTime Video',
      webm: 'WebM Video',
      mp3: 'MP3 Audio',
      wav: 'WAV Audio',
      ogg: 'OGG Audio',
      flac: 'FLAC Audio',
      woff: 'Web Font',
      woff2: 'Web Font',
      ttf: 'TrueType Font',
      otf: 'OpenType Font',
      eot: 'Embedded OpenType Font',
    };

    const dataExtensions = {
      csv: 'CSV Data',
      tsv: 'TSV Data',
      xlsx: 'Excel Spreadsheet',
      xls: 'Excel Spreadsheet',
      ods: 'OpenDocument Spreadsheet',
      sqlite: 'SQLite Database',
      db: 'Database File',
      sql: 'SQL Script',
      dump: 'Database Dump',
    };

    const buildExtensions = {
      lock: 'Lock File',
      map: 'Source Map',
      'min.js': 'Minified JavaScript',
      'min.css': 'Minified CSS',
      'bundle.js': 'JavaScript Bundle',
      'chunk.js': 'JavaScript Chunk',
    };

    if (
      extension &&
      configExtensions[extension as keyof typeof configExtensions]
    ) {
      category = 'config';
      language = configExtensions[extension as keyof typeof configExtensions];
    } else if (
      extension &&
      docsExtensions[extension as keyof typeof docsExtensions]
    ) {
      category = 'docs';
      language = docsExtensions[extension as keyof typeof docsExtensions];
    } else if (
      extension &&
      assetExtensions[extension as keyof typeof assetExtensions]
    ) {
      category = 'assets';
      language = assetExtensions[extension as keyof typeof assetExtensions];
    } else if (
      extension &&
      dataExtensions[extension as keyof typeof dataExtensions]
    ) {
      category = 'data';
      language = dataExtensions[extension as keyof typeof dataExtensions];
    } else if (
      (extension &&
        buildExtensions[extension as keyof typeof buildExtensions]) ||
      name.includes('.min.') ||
      name.includes('.bundle.')
    ) {
      category = 'build';
      language =
        (extension &&
          buildExtensions[extension as keyof typeof buildExtensions]) ||
        'Build Artifact';
    }

    // Special file name patterns
    const lowerName = name.toLowerCase();
    if (lowerName.includes('test') || lowerName.includes('spec')) {
      category = 'test';
      description = 'Test file';
    }
  }

  return {
    name,
    type,
    size,
    extension,
    category,
    language,
    description,
  };
}

export async function viewRepositoryStructure(
  params: GitHubRepositoryStructureParams
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('gh-repo-structure-enhanced', params);

  return withCache(cacheKey, async () => {
    const { owner, repo, branch, path: requestedPath = '' } = params;
    const items: FileMetadata[] = [];
    let actualBranch = branch;

    // Define branch fallback order
    const branchFallbacks = [branch, 'main', 'master', 'develop', 'trunk'];

    try {
      // Construct the path segment
      const pathSegment = requestedPath.startsWith('/')
        ? requestedPath.substring(1)
        : requestedPath;

      // Try each branch in the fallback order
      let lastError: Error | null = null;
      let success = false;

      for (const tryBranch of branchFallbacks) {
        try {
          const apiPath = `repos/${owner}/${repo}/contents/${pathSegment}?ref=${tryBranch}`;
          const args = [apiPath];
          const result = await executeGitHubCommand('api', args, {
            cache: false,
          });

          if (result.isError) {
            throw new Error(result.content[0].text as string);
          }

          // Extract the actual content from the exec result
          const execResult = JSON.parse(result.content[0].text as string);
          const apiItems = JSON.parse(execResult.result);

          // If we get here, the request succeeded
          actualBranch = tryBranch;
          success = true;

          // Process items with enhanced metadata
          if (Array.isArray(apiItems)) {
            for (const item of apiItems) {
              items.push(getFileMetadata(item));
            }
          } else if (apiItems) {
            // Handle single file case
            items.push(getFileMetadata(apiItems));
          }

          break; // Success, exit the loop
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));

          // If this is not a 404 error (branch not found), or if it's the last attempt, break
          const errorMessage = lastError.message.toLowerCase();
          if (
            !errorMessage.includes('no commit found') &&
            !errorMessage.includes('404') &&
            !errorMessage.includes('not found')
          ) {
            // This is a different kind of error (permissions, network, etc.), don't continue fallback
            break;
          }

          // Continue to next branch fallback
          continue;
        }
      }

      if (!success) {
        // All branch attempts failed
        const attemptedBranches = branchFallbacks.join(', ');
        throw new Error(
          `Failed to access repository structure. Tried branches: ${attemptedBranches}. ` +
            `Last error: ${lastError?.message || 'Unknown error'}`
        );
      }

      // Sort items: directories first, then alphabetically
      items.sort((a, b) => {
        // Directories first
        if (a.type !== b.type) {
          return a.type === 'dir' ? -1 : 1;
        }

        // Alphabetical
        return a.name.localeCompare(b.name);
      });

      // Generate analysis
      const analysis = {
        totalItems: items.length,
        directories: items.filter(item => item.type === 'dir').length,
        files: items.filter(item => item.type === 'file').length,
        categories: {} as Record<string, number>,
        languages: {} as Record<string, number>,
        totalSize: items.reduce((sum, item) => sum + (item.size || 0), 0),
        largestFiles: items
          .filter(item => item.type === 'file' && item.size)
          .sort((a, b) => (b.size || 0) - (a.size || 0))
          .slice(0, 5)
          .map(item => ({
            name: item.name,
            size: item.size,
            category: item.category,
          })),
      };

      // Count categories and languages
      items.forEach(item => {
        analysis.categories[item.category] =
          (analysis.categories[item.category] || 0) + 1;
        if (item.language) {
          analysis.languages[item.language] =
            (analysis.languages[item.language] || 0) + 1;
        }
      });

      // Convert to sorted arrays
      const finalAnalysis = {
        ...analysis,
        categories: Object.entries(analysis.categories)
          .sort(([, a], [, b]) => b - a)
          .map(([category, count]) => ({ category, count })),
        languages: Object.entries(analysis.languages)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 10)
          .map(([language, count]) => ({ language, count })),
      };

      const result: GitHubRepositoryStructureResult = {
        owner,
        repo,
        branch: actualBranch,
        path: requestedPath,
        items,
        analysis: finalAnalysis,
        structure: items.map(item =>
          item.type === 'dir' ? `${item.name}/` : item.name
        ),
        ...(actualBranch !== branch && {
          branchFallback: {
            requested: branch,
            used: actualBranch,
            message: `Used '${actualBranch}' instead of '${branch}'`,
          },
        }),
      };

      return createSuccessResult(result);
    } catch (error) {
      // Final error handling with comprehensive error message
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return createErrorResult(
        `Repository access failed: ${owner}/${repo}${requestedPath ? ` at ${requestedPath}` : ''}`,
        new Error(
          `${errorMessage}. Use github_search_repos to verify repository exists`
        )
      );
    }
  });
}
