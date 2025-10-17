/**
 * local_view_binary tool - Binary file inspection
 */

import { safeExec } from '../utils/exec.js';
import { pathValidator } from '../security/pathValidator.js';
import { getToolHints } from './hints.js';
import type { ViewBinaryQuery, ViewBinaryResult } from '../types.js';

/**
 * Executes a binary viewing query
 */
export async function viewBinary(
  query: ViewBinaryQuery
): Promise<ViewBinaryResult> {
  try {
    // Validate path
    const pathValidation = pathValidator.validate(query.path);
    if (!pathValidation.isValid) {
      return {
        status: 'error',
        error: pathValidation.error,
        researchGoal: query.researchGoal,
        reasoning: query.reasoning,
      };
    }

    const sanitizedPath = pathValidation.sanitizedPath || query.path;

    // Execute operation
    switch (query.operation) {
      case 'identify':
        return await identifyFileType(sanitizedPath, query);

      case 'strings':
        return await extractStrings(sanitizedPath, query, false);

      case 'strings-utf16le':
        return await extractStrings(sanitizedPath, query, true);

      case 'hexdump':
        return await generateHexDump(sanitizedPath, query);

      case 'magic-bytes':
        return await extractMagicBytes(sanitizedPath, query);

      case 'full-inspection':
        return await performFullInspection(sanitizedPath, query);

      default:
        return {
          status: 'error',
          error: `Unknown operation: ${query.operation}`,
          researchGoal: query.researchGoal,
          reasoning: query.reasoning,
        };
    }
  } catch (error) {
    return {
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
      researchGoal: query.researchGoal,
      reasoning: query.reasoning,
      hints: getToolHints('LOCAL_VIEW_BINARY', 'error'),
    };
  }
}

/**
 * Identify file type using 'file' command
 */
async function identifyFileType(
  path: string,
  query: ViewBinaryQuery
): Promise<ViewBinaryResult> {
  const result = await safeExec('file', ['-b', path]);

  if (!result.success) {
    return {
      status: 'error',
      error: result.stderr || 'Failed to identify file type',
      researchGoal: query.researchGoal,
      reasoning: query.reasoning,
    };
  }

  const fileType = result.stdout.trim();

  return {
    status: 'hasResults',
    path,
    operation: 'identify',
    fileType,
    researchGoal: query.researchGoal,
    reasoning: query.reasoning,
    hints: getToolHints('LOCAL_VIEW_BINARY', 'hasResults'),
  };
}

/**
 * Extract printable strings from binary
 */
async function extractStrings(
  path: string,
  query: ViewBinaryQuery,
  utf16le: boolean
): Promise<ViewBinaryResult> {
  const minLength = query.minLength || 6;
  let result;

  if (utf16le) {
    // UTF-16LE: First convert with iconv, then extract strings
    // Convert to UTF-8 first (iconv doesn't pipe directly, so we use separate commands)
    try {
      const iconvResult = await safeExec('iconv', [
        '-f',
        'UTF-16LE',
        '-t',
        'UTF-8',
        path,
      ]);

      if (!iconvResult.success) {
        return {
          status: 'error',
          error: iconvResult.stderr || 'Failed to convert UTF-16LE encoding',
          researchGoal: query.researchGoal,
          reasoning: query.reasoning,
        };
      }

      // Extract strings from the converted content
      // Since we have UTF-8 text now, we can filter it ourselves
      const lines = iconvResult.stdout
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length >= minLength && isPrintableString(line))
        .slice(0, 1000);

      result = {
        success: true,
        stdout: lines.join('\n'),
        stderr: '',
        code: 0,
      };
    } catch (error) {
      return {
        status: 'error',
        error:
          error instanceof Error
            ? error.message
            : 'Failed to extract UTF-16LE strings',
        researchGoal: query.researchGoal,
        reasoning: query.reasoning,
      };
    }
  } else {
    // ASCII strings - safe direct execution
    result = await safeExec('strings', ['-n', String(minLength), path]);
  }

  if (!result.success) {
    return {
      status: 'error',
      error: result.stderr || 'Failed to extract strings',
      researchGoal: query.researchGoal,
      reasoning: query.reasoning,
    };
  }

  const strings = result.stdout
    .split('\n')
    .filter((line) => line.trim())
    .slice(0, 1000); // Limit to 1000 strings

  if (strings.length === 0) {
    return {
      status: 'empty',
      path,
      operation: utf16le ? 'strings-utf16le' : 'strings',
      stringCount: 0,
      researchGoal: query.researchGoal,
      reasoning: query.reasoning,
      hints: getToolHints('LOCAL_VIEW_BINARY', 'empty'),
    };
  }

  return {
    status: 'hasResults',
    path,
    operation: utf16le ? 'strings-utf16le' : 'strings',
    strings,
    stringCount: strings.length,
    researchGoal: query.researchGoal,
    reasoning: query.reasoning,
    hints: getToolHints('LOCAL_VIEW_BINARY', 'hasResults'),
  };
}

/**
 * Check if a string contains only printable characters
 */
function isPrintableString(str: string): boolean {
  // Allow common printable ASCII and unicode characters
  // Reject strings with too many control characters
  // eslint-disable-next-line no-control-regex
  const controlChars = str.match(/[\x00-\x1F\x7F]/g);
  return !controlChars || controlChars.length < str.length * 0.1;
}

/**
 * Generate hex dump of binary file
 */
async function generateHexDump(
  path: string,
  query: ViewBinaryQuery
): Promise<ViewBinaryResult> {
  const hexLines = query.hexLines || 20;

  // Execute hexdump with canonical format - safe, no shell expansion
  const result = await safeExec('hexdump', ['-C', path]);

  if (!result.success) {
    return {
      status: 'error',
      error: result.stderr || 'Failed to generate hex dump',
      researchGoal: query.researchGoal,
      reasoning: query.reasoning,
    };
  }

  // Limit output to requested number of lines in JavaScript (safe)
  const lines = result.stdout.split('\n').slice(0, hexLines);
  const hexDump = lines.join('\n').trim();

  if (!hexDump) {
    return {
      status: 'empty',
      path,
      operation: 'hexdump',
      researchGoal: query.researchGoal,
      reasoning: query.reasoning,
      hints: getToolHints('LOCAL_VIEW_BINARY', 'empty'),
    };
  }

  return {
    status: 'hasResults',
    path,
    operation: 'hexdump',
    hexDump,
    researchGoal: query.researchGoal,
    reasoning: query.reasoning,
    hints: getToolHints('LOCAL_VIEW_BINARY', 'hasResults'),
  };
}

/**
 * Extract magic bytes (file signature)
 */
async function extractMagicBytes(
  path: string,
  query: ViewBinaryQuery
): Promise<ViewBinaryResult> {
  // Get first 32 bytes in hex - safe, no shell expansion
  const result = await safeExec('hexdump', ['-C', '-n', '32', path]);

  if (!result.success) {
    return {
      status: 'error',
      error: result.stderr || 'Failed to extract magic bytes',
      researchGoal: query.researchGoal,
      reasoning: query.reasoning,
    };
  }

  const output = result.stdout.trim();

  // Parse the first line to get just the hex values
  const firstLine = output.split('\n')[0];
  const hexMatch = firstLine?.match(/^[0-9a-f]+\s+(.+?)\s+\|/);
  const hexValues = hexMatch ? hexMatch[1].trim() : output;

  return {
    status: 'hasResults',
    path,
    operation: 'magic-bytes',
    magicBytes: hexValues,
    researchGoal: query.researchGoal,
    reasoning: query.reasoning,
    hints: getToolHints('LOCAL_VIEW_BINARY', 'hasResults'),
  };
}

/**
 * Perform full inspection (all operations combined)
 */
async function performFullInspection(
  path: string,
  query: ViewBinaryQuery
): Promise<ViewBinaryResult> {
  // Run all operations in parallel
  const [fileTypeRes, magicRes, asciiRes, utf16Res, hexRes] =
    await Promise.allSettled([
      identifyFileType(path, query),
      extractMagicBytes(path, query),
      extractStrings(path, query, false),
      extractStrings(path, query, true),
      generateHexDump(path, { ...query, hexLines: 20 }),
    ]);

  // Extract results
  const fileType =
    fileTypeRes.status === 'fulfilled' ? fileTypeRes.value.fileType : 'Unknown';
  const magicBytes =
    magicRes.status === 'fulfilled' ? magicRes.value.magicBytes : '';
  const asciiStrings =
    asciiRes.status === 'fulfilled' ? asciiRes.value.strings || [] : [];
  const utf16leStrings =
    utf16Res.status === 'fulfilled' ? utf16Res.value.strings || [] : [];
  const hexPreview =
    hexRes.status === 'fulfilled' ? hexRes.value.hexDump || '' : '';

  return {
    status: 'hasResults',
    path,
    operation: 'full-inspection',
    fullInspection: {
      fileType: fileType || 'Unknown',
      magicBytes: magicBytes || '',
      asciiStrings: asciiStrings.slice(0, 50), // Limit to 50 strings
      utf16leStrings: utf16leStrings.slice(0, 50),
      hexPreview,
    },
    researchGoal: query.researchGoal,
    reasoning: query.reasoning,
    hints: getToolHints('LOCAL_VIEW_BINARY', 'hasResults'),
  };
}
