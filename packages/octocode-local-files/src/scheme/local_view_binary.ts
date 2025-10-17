/**
 * Zod schema for local_view_binary tool
 */

import { z } from 'zod';
import { BaseQuerySchema } from './baseSchema.js';

/**
 * Tool description for MCP registration
 */
export const LOCAL_VIEW_BINARY_DESCRIPTION = `Inspect binary files using Unix CLI tools for reverse engineering and analysis.

Why: Extract human-readable information from binaries (executables, libraries, archives) without specialized tools.

IMPORTANT: This tool is for analyzing and reading binary files only (executables, libraries, archives). 
DO NOT:
- Execute or run any binary files
- Modify, write, or extract binary contents to the filesystem
- Assist with creating, modifying, or improving binaries that may be used maliciously
- Help with obfuscation, packing, or anti-analysis techniques

Only use this tool for defensive security analysis, reverse engineering for understanding, 
debugging, vulnerability research, and educational purposes. Read and analyze only - never 
execute or modify.

Operations:
• identify - Detect file type (PE, ELF, Mach-O, WASM, JAR, etc.)
• strings - Extract ASCII printable strings (min length 6)
• strings-utf16le - Extract UTF-16LE strings (Windows PE files)
• hexdump - View hex + ASCII side-by-side (configurable lines)
• magic-bytes - Show first 32 bytes in hex (file signature)
• list-archive - List contents of ZIP/JAR/archive files
• extract-file - Extract and read specific file from archive
• full-inspection - Complete analysis: type + magic + strings + hex preview + archive listing

Partial Content Support for extract-file:
- Use fullContent=true to get entire extracted file (token expensive).
- Use startLine/endLine for line range.
- Use matchString with matchStringContextLines for matches with context.
- minified=true to reduce token usage.
- Similar to local_fetch_content for handling large extracted files.

Examples:
• Quick analysis: operation="identify", path="/path/to/binary"
• Find strings: operation="strings", minLength=8, path="/bin/ls"
• Windows PE: operation="strings-utf16le", minLength=6, path="program.exe"
• Verify signature: operation="magic-bytes", path="file.wasm"
• List JAR/ZIP: operation="list-archive", path="plugin.jar", maxFiles=100
• Extract file: operation="extract-file", path="plugin.jar", archiveFile="META-INF/plugin.xml"
• Complete view: operation="full-inspection", path="library.so"

Best Practices:
- Start with "identify" to understand file type
- Use "full-inspection" for comprehensive first-time analysis
- For JAR/ZIP files: use "list-archive" to see contents, then "extract-file" for specific files
- Extract strings for embedded text, URLs, error messages
- Check magic-bytes to verify file format (signatures)
- Use strings-utf16le for PE/Windows binaries (DLL, EXE)
- minLength=6-8 reduces noise in string extraction
- hexLines=20-50 for meaningful hex preview
- maxFiles limits archive listing (default: 200, max: 1000)

Platform Compatibility:
- Works on Linux and macOS with standard Unix tools
- UTF-16LE extraction uses universal iconv method
- All operations use cross-platform commands`;

/**
 * View binary query schema
 */
export const ViewBinaryQuerySchema = BaseQuerySchema.extend({
  path: z.string().describe('Path to binary file (required)'),

  operation: z
    .enum([
      'identify',
      'strings',
      'strings-utf16le',
      'hexdump',
      'magic-bytes',
      'list-archive',
      'extract-file',
      'full-inspection',
    ])
    .describe(
      'Operation: identify (file type), strings (ASCII), strings-utf16le (UTF-16LE), hexdump (hex+ASCII), magic-bytes (signature), list-archive (ZIP/JAR contents), extract-file (read file from archive), full-inspection (complete analysis)'
    ),

  // String extraction options
  minLength: z
    .number()
    .min(3)
    .max(20)
    .optional()
    .describe('Minimum string length for extraction (default: 6)'),

  // Hex dump options
  maxBytes: z
    .number()
    .min(16)
    .max(10240)
    .optional()
    .describe('Maximum bytes to process (default: 4096, max: 10KB)'),

  hexLines: z
    .number()
    .min(5)
    .max(200)
    .optional()
    .describe('Number of hex dump lines to display (default: 20)'),

  includeOffsets: z
    .boolean()
    .optional()
    .describe('Include byte offsets in output (default: true)'),

  // Archive inspection options
  maxFiles: z
    .number()
    .min(1)
    .max(1000)
    .optional()
    .describe(
      'Maximum number of files to list from archive (default: 200, max: 1000)'
    ),

  archiveFile: z
    .string()
    .optional()
    .describe(
      'Specific file path within archive to extract (required for extract-file operation)'
    ),

  // Partial content options for extract-file
  fullContent: z
    .boolean()
    .default(false)
    .optional()
    .describe(
      'For extract-file: Return entire extracted content (token expensive for large files)'
    ),

  startLine: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      'For extract-file: Start line number for partial read (must use with endLine)'
    ),

  endLine: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      'For extract-file: End line number for partial read (must use with startLine)'
    ),

  matchString: z
    .string()
    .optional()
    .describe(
      'For extract-file: Search pattern to find within the extracted file - returns only matching sections with context'
    ),

  matchStringContextLines: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(5)
    .optional()
    .describe(
      'For extract-file: Lines of context around each match (1-50, default 5)'
    ),

  minified: z
    .boolean()
    .default(true)
    .optional()
    .describe(
      'For extract-file: Minify extracted content for token efficiency (removes extra whitespace)'
    ),
});

export type ViewBinaryQuery = z.infer<typeof ViewBinaryQuerySchema>;
