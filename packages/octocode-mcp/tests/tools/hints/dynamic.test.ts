/**
 * Tests for dynamic hints generation
 * Covers error handlers and edge cases for all tools with dynamic hints
 */

import { describe, it, expect } from 'vitest';
import {
  getDynamicHints,
  hasDynamicHints,
  HINTS,
} from '../../../src/tools/hints/dynamic.js';
import { STATIC_TOOL_NAMES } from '../../../src/tools/toolNames.js';
import type { HintContext } from '../../../src/tools/hints/types.js';

describe('Dynamic Hints', () => {
  describe('getDynamicHints', () => {
    it('should return empty array for unknown tool', () => {
      const hints = getDynamicHints('unknown_tool', 'hasResults');
      expect(hints).toEqual([]);
    });

    it('should return empty array for unknown status', () => {
      const hints = getDynamicHints(
        STATIC_TOOL_NAMES.LOCAL_RIPGREP,
        'unknown' as 'hasResults'
      );
      expect(hints).toEqual([]);
    });

    it('should filter out undefined values from conditional hints', () => {
      // Call without context - conditional hints should be undefined and filtered
      const hints = getDynamicHints(
        STATIC_TOOL_NAMES.LOCAL_RIPGREP,
        'hasResults'
      );
      expect(hints.every(h => typeof h === 'string')).toBe(true);
      expect(hints.every(h => h !== undefined)).toBe(true);
    });
  });

  describe('hasDynamicHints', () => {
    it('should return true for all registered tools', () => {
      Object.keys(HINTS).forEach(toolName => {
        expect(hasDynamicHints(toolName)).toBe(true);
      });
    });

    it('should return false for unregistered tools', () => {
      expect(hasDynamicHints('fake_tool')).toBe(false);
      expect(hasDynamicHints('')).toBe(false);
    });
  });

  describe('LOCAL_RIPGREP hints', () => {
    it('should include grep fallback hint when searchEngine is grep', () => {
      const hints = getDynamicHints(
        STATIC_TOOL_NAMES.LOCAL_RIPGREP,
        'hasResults',
        {
          searchEngine: 'grep',
        }
      );
      expect(hints.some(h => h.includes('grep fallback'))).toBe(true);
    });

    it('should NOT include grep hint when searchEngine is ripgrep', () => {
      const hints = getDynamicHints(
        STATIC_TOOL_NAMES.LOCAL_RIPGREP,
        'hasResults',
        {
          searchEngine: 'ripgrep',
        }
      );
      expect(hints.some(h => h.includes('grep fallback'))).toBe(false);
    });

    it('should include parallel hint when fileCount > 5', () => {
      const hints = getDynamicHints(
        STATIC_TOOL_NAMES.LOCAL_RIPGREP,
        'hasResults',
        {
          fileCount: 10,
        }
      );
      expect(hints.some(h => h.includes('parallel'))).toBe(true);
    });

    it('should include cross-file hint when fileCount > 1', () => {
      const hints = getDynamicHints(
        STATIC_TOOL_NAMES.LOCAL_RIPGREP,
        'hasResults',
        {
          fileCount: 3,
        }
      );
      expect(hints.some(h => h.includes('lspFindReferences'))).toBe(true);
    });

    it('should include grep warning in empty status with grep engine', () => {
      const hints = getDynamicHints(STATIC_TOOL_NAMES.LOCAL_RIPGREP, 'empty', {
        searchEngine: 'grep',
      });
      expect(hints.some(h => h.includes('.gitignore'))).toBe(true);
    });

    it('should return size_limit error hints', () => {
      const hints = getDynamicHints(STATIC_TOOL_NAMES.LOCAL_RIPGREP, 'error', {
        errorType: 'size_limit',
        matchCount: 500,
      });
      expect(hints.some(h => h.includes('500 matches'))).toBe(true);
      expect(hints.some(h => h.includes('RECOVERY'))).toBe(true);
    });

    it('should return size_limit error hints with path containing node_modules', () => {
      const hints = getDynamicHints(STATIC_TOOL_NAMES.LOCAL_RIPGREP, 'error', {
        errorType: 'size_limit',
        path: '/project/node_modules/lodash',
      });
      expect(hints.some(h => h.includes('node_modules'))).toBe(true);
    });

    it('should return generic error hints for non-size_limit errors', () => {
      const hints = getDynamicHints(STATIC_TOOL_NAMES.LOCAL_RIPGREP, 'error', {
        errorType: 'other',
      });
      expect(hints.some(h => h.includes('Tool unavailable'))).toBe(true);
    });
  });

  describe('LOCAL_FETCH_CONTENT hints', () => {
    it('should include pagination hint when hasMoreContent', () => {
      const hints = getDynamicHints(
        STATIC_TOOL_NAMES.LOCAL_FETCH_CONTENT,
        'hasResults',
        { hasMoreContent: true } as HintContext
      );
      expect(hints.some(h => h.includes('charOffset'))).toBe(true);
    });

    it('should return size_limit error hints with file size', () => {
      const hints = getDynamicHints(
        STATIC_TOOL_NAMES.LOCAL_FETCH_CONTENT,
        'error',
        {
          errorType: 'size_limit',
          isLarge: true,
          hasPagination: false,
          hasPattern: false,
          fileSize: 400,
        }
      );
      expect(hints.some(h => h.includes('100'))).toBe(true); // ~400 * 0.25
      expect(hints.some(h => h.includes('tokens'))).toBe(true);
    });

    it('should return size_limit error hints without file size', () => {
      const hints = getDynamicHints(
        STATIC_TOOL_NAMES.LOCAL_FETCH_CONTENT,
        'error',
        {
          errorType: 'size_limit',
          isLarge: true,
          hasPagination: false,
          hasPattern: false,
        }
      );
      expect(hints.some(h => h.includes('Large file'))).toBe(true);
    });

    it('should NOT return size_limit hints when hasPagination is true', () => {
      const hints = getDynamicHints(
        STATIC_TOOL_NAMES.LOCAL_FETCH_CONTENT,
        'error',
        {
          errorType: 'size_limit',
          isLarge: true,
          hasPagination: true,
          hasPattern: false,
        }
      );
      expect(hints.some(h => h.includes('Large file'))).toBe(false);
    });

    it('should NOT return size_limit hints when hasPattern is true', () => {
      const hints = getDynamicHints(
        STATIC_TOOL_NAMES.LOCAL_FETCH_CONTENT,
        'error',
        {
          errorType: 'size_limit',
          isLarge: true,
          hasPagination: false,
          hasPattern: true,
        }
      );
      expect(hints.some(h => h.includes('Large file'))).toBe(false);
    });

    it('should return pattern_too_broad error hints', () => {
      const hints = getDynamicHints(
        STATIC_TOOL_NAMES.LOCAL_FETCH_CONTENT,
        'error',
        {
          errorType: 'pattern_too_broad',
          tokenEstimate: 50000,
        }
      );
      expect(hints.some(h => h.includes('50,000'))).toBe(true);
      expect(hints.some(h => h.includes('Pattern too broad'))).toBe(true);
    });

    it('should return pattern_too_broad error hints without tokenEstimate', () => {
      const hints = getDynamicHints(
        STATIC_TOOL_NAMES.LOCAL_FETCH_CONTENT,
        'error',
        {
          errorType: 'pattern_too_broad',
        }
      );
      expect(hints.some(h => h.includes('Pattern too broad'))).toBe(true);
    });

    it('should return not_found error hints', () => {
      const hints = getDynamicHints(
        STATIC_TOOL_NAMES.LOCAL_FETCH_CONTENT,
        'error',
        {
          errorType: 'not_found',
        }
      );
      expect(hints.some(h => h.includes('File not found'))).toBe(true);
    });

    it('should return generic error hints for unknown error type', () => {
      const hints = getDynamicHints(
        STATIC_TOOL_NAMES.LOCAL_FETCH_CONTENT,
        'error',
        {
          errorType: 'unknown',
        }
      );
      expect(hints.some(h => h.includes('localFindFiles'))).toBe(true);
    });
  });

  describe('LOCAL_VIEW_STRUCTURE hints', () => {
    it('should include parallelize hint when entryCount > 10', () => {
      const hints = getDynamicHints(
        STATIC_TOOL_NAMES.LOCAL_VIEW_STRUCTURE,
        'hasResults',
        { entryCount: 20 }
      );
      expect(hints.some(h => h.includes('Parallelize'))).toBe(true);
    });

    it('should return size_limit error hints with entry count', () => {
      const hints = getDynamicHints(
        STATIC_TOOL_NAMES.LOCAL_VIEW_STRUCTURE,
        'error',
        {
          errorType: 'size_limit',
          entryCount: 500,
          tokenEstimate: 10000,
        }
      );
      expect(hints.some(h => h.includes('500 entries'))).toBe(true);
      expect(hints.some(h => h.includes('10,000'))).toBe(true);
    });

    it('should return generic error hints without size_limit', () => {
      const hints = getDynamicHints(
        STATIC_TOOL_NAMES.LOCAL_VIEW_STRUCTURE,
        'error',
        {}
      );
      expect(hints.some(h => h.includes('localFindFiles'))).toBe(true);
    });
  });

  describe('LOCAL_FIND_FILES hints', () => {
    it('should include batch hint when fileCount > 3', () => {
      const hints = getDynamicHints(
        STATIC_TOOL_NAMES.LOCAL_FIND_FILES,
        'hasResults',
        { fileCount: 5 }
      );
      expect(hints.some(h => h.includes('Batch'))).toBe(true);
    });

    it('should return extended hints when fileCount > 20', () => {
      const hints = getDynamicHints(
        STATIC_TOOL_NAMES.LOCAL_FIND_FILES,
        'hasResults',
        { fileCount: 25 }
      );
      // Should have more hints due to metadata dynamic hints
      expect(hints.length).toBeGreaterThan(0);
    });

    it('should NOT include batch hint when fileCount <= 3', () => {
      const hints = getDynamicHints(
        STATIC_TOOL_NAMES.LOCAL_FIND_FILES,
        'hasResults',
        { fileCount: 2 }
      );
      expect(hints.some(h => h.includes('Batch'))).toBe(false);
    });
  });

  describe('GITHUB_SEARCH_CODE hints', () => {
    it('should include single repo hint when hasOwnerRepo is true', () => {
      const hints = getDynamicHints(
        STATIC_TOOL_NAMES.GITHUB_SEARCH_CODE,
        'hasResults',
        { hasOwnerRepo: true }
      );
      expect(hints.some(h => h.includes('single repo'))).toBe(true);
    });

    it('should include multi-repo hint when hasOwnerRepo is false', () => {
      const hints = getDynamicHints(
        STATIC_TOOL_NAMES.GITHUB_SEARCH_CODE,
        'hasResults',
        { hasOwnerRepo: false }
      );
      expect(hints.some(h => h.includes('multiple repos'))).toBe(true);
    });

    it('should include path hint for empty with match=path', () => {
      const hints = getDynamicHints(
        STATIC_TOOL_NAMES.GITHUB_SEARCH_CODE,
        'empty',
        { match: 'path' }
      );
      expect(hints.some(h => h.includes('match="path"'))).toBe(true);
    });

    it('should include cross-repo hint for empty without owner/repo', () => {
      const hints = getDynamicHints(
        STATIC_TOOL_NAMES.GITHUB_SEARCH_CODE,
        'empty',
        { hasOwnerRepo: false }
      );
      expect(hints.some(h => h.includes('Cross-repo'))).toBe(true);
    });
  });

  describe('GITHUB_FETCH_CONTENT hints', () => {
    it('should include large file hint when isLarge', () => {
      const hints = getDynamicHints(
        STATIC_TOOL_NAMES.GITHUB_FETCH_CONTENT,
        'hasResults',
        { isLarge: true }
      );
      expect(hints.some(h => h.includes('Large file'))).toBe(true);
    });

    it('should return size_limit error hint', () => {
      const hints = getDynamicHints(
        STATIC_TOOL_NAMES.GITHUB_FETCH_CONTENT,
        'error',
        { errorType: 'size_limit' }
      );
      expect(hints.some(h => h.includes('FILE_TOO_LARGE'))).toBe(true);
    });

    it('should return empty for non-size_limit errors', () => {
      const hints = getDynamicHints(
        STATIC_TOOL_NAMES.GITHUB_FETCH_CONTENT,
        'error',
        { errorType: 'other' }
      );
      expect(hints).toEqual([]);
    });
  });

  describe('GITHUB_VIEW_REPO_STRUCTURE hints', () => {
    it('should include pagination hint when entryCount > 50', () => {
      const hints = getDynamicHints(
        STATIC_TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
        'hasResults',
        { entryCount: 100 }
      );
      expect(hints.some(h => h.includes('100 entries'))).toBe(true);
    });

    it('should NOT include pagination hint when entryCount <= 50', () => {
      const hints = getDynamicHints(
        STATIC_TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
        'hasResults',
        { entryCount: 30 }
      );
      expect(hints.some(h => h.includes('entries'))).toBe(false);
    });
  });

  describe('LSP_GOTO_DEFINITION hints', () => {
    it('should include multiple definitions hint', () => {
      const hints = getDynamicHints(
        STATIC_TOOL_NAMES.LSP_GOTO_DEFINITION,
        'hasResults',
        { locationCount: 3 } as HintContext
      );
      expect(hints.some(h => h.includes('Multiple definitions (3)'))).toBe(
        true
      );
    });

    it('should include external package hint', () => {
      const hints = getDynamicHints(
        STATIC_TOOL_NAMES.LSP_GOTO_DEFINITION,
        'hasResults',
        { hasExternalPackage: true } as HintContext
      );
      expect(hints.some(h => h.includes('External package'))).toBe(true);
    });

    it('should include fallback hint', () => {
      const hints = getDynamicHints(
        STATIC_TOOL_NAMES.LSP_GOTO_DEFINITION,
        'hasResults',
        { isFallback: true } as HintContext
      );
      expect(hints.some(h => h.includes('text-based resolution'))).toBe(true);
    });

    it('should include search radius hint in empty results', () => {
      const hints = getDynamicHints(
        STATIC_TOOL_NAMES.LSP_GOTO_DEFINITION,
        'empty',
        { searchRadius: 2, lineHint: 50 } as HintContext
      );
      expect(hints.some(h => h.includes('±2 lines'))).toBe(true);
    });

    it('should include lineHint is 1-indexed hint when no searchRadius', () => {
      const hints = getDynamicHints(
        STATIC_TOOL_NAMES.LSP_GOTO_DEFINITION,
        'empty',
        {}
      );
      expect(hints.some(h => h.includes('1-indexed'))).toBe(true);
    });

    it('should include recovery hint with symbolName in empty results', () => {
      const hints = getDynamicHints(
        STATIC_TOOL_NAMES.LSP_GOTO_DEFINITION,
        'empty',
        { symbolName: 'myFunction' } as HintContext
      );
      expect(hints.some(h => h.includes('myFunction'))).toBe(true);
    });

    it('should return symbol_not_found error hints', () => {
      const hints = getDynamicHints(
        STATIC_TOOL_NAMES.LSP_GOTO_DEFINITION,
        'error',
        {
          errorType: 'symbol_not_found',
          symbolName: 'foo',
          lineHint: 42,
        } as HintContext
      );
      expect(hints.some(h => h.includes('"foo"'))).toBe(true);
      expect(hints.some(h => h.includes('line 42'))).toBe(true);
    });

    it('should return file_not_found error hints', () => {
      const hints = getDynamicHints(
        STATIC_TOOL_NAMES.LSP_GOTO_DEFINITION,
        'error',
        {
          errorType: 'file_not_found',
          uri: 'src/utils/helper.ts',
        } as HintContext
      );
      expect(hints.some(h => h.includes('File not found'))).toBe(true);
      expect(hints.some(h => h.includes('helper.ts'))).toBe(true);
    });

    it('should return file_not_found hints with fallback pattern when no uri', () => {
      const hints = getDynamicHints(
        STATIC_TOOL_NAMES.LSP_GOTO_DEFINITION,
        'error',
        { errorType: 'file_not_found' } as HintContext
      );
      expect(hints.some(h => h.includes('*.ts'))).toBe(true);
    });

    it('should return timeout error hints', () => {
      const hints = getDynamicHints(
        STATIC_TOOL_NAMES.LSP_GOTO_DEFINITION,
        'error',
        {
          errorType: 'timeout',
          uri: 'src/big.ts',
          symbolName: 'process',
        } as HintContext
      );
      expect(hints.some(h => h.includes('LSP timeout'))).toBe(true);
      expect(hints.some(h => h.includes('src/big.ts'))).toBe(true);
      expect(hints.some(h => h.includes('process'))).toBe(true);
    });

    it('should return generic error hints for unknown error type', () => {
      const hints = getDynamicHints(
        STATIC_TOOL_NAMES.LSP_GOTO_DEFINITION,
        'error',
        { errorType: 'unknown' } as HintContext
      );
      expect(hints.some(h => h.includes('LSP error'))).toBe(true);
    });
  });

  describe('LSP_FIND_REFERENCES hints', () => {
    it('should include pagination hint when many references', () => {
      const hints = getDynamicHints(
        STATIC_TOOL_NAMES.LSP_FIND_REFERENCES,
        'hasResults',
        { locationCount: 50 } as HintContext
      );
      expect(hints.some(h => h.includes('50 references'))).toBe(true);
      expect(hints.some(h => h.includes('paginate'))).toBe(true);
    });

    it('should include multi-file hint', () => {
      const hints = getDynamicHints(
        STATIC_TOOL_NAMES.LSP_FIND_REFERENCES,
        'hasResults',
        { hasMultipleFiles: true, fileCount: 5 } as HintContext
      );
      expect(hints.some(h => h.includes('5 files'))).toBe(true);
    });

    it('should fallback to "multiple" when hasMultipleFiles but no fileCount', () => {
      const hints = getDynamicHints(
        STATIC_TOOL_NAMES.LSP_FIND_REFERENCES,
        'hasResults',
        { hasMultipleFiles: true } as HintContext
      );
      expect(hints.some(h => h.includes('multiple files'))).toBe(true);
    });

    it('should include next page hint', () => {
      const hints = getDynamicHints(
        STATIC_TOOL_NAMES.LSP_FIND_REFERENCES,
        'hasResults',
        { hasMorePages: true, currentPage: 2, totalPages: 5 } as HintContext
      );
      expect(hints.some(h => h.includes('Page 2/5'))).toBe(true);
      expect(hints.some(h => h.includes('page=3'))).toBe(true);
    });

    it('should fallback to page=2 when hasMorePages but no currentPage', () => {
      const hints = getDynamicHints(
        STATIC_TOOL_NAMES.LSP_FIND_REFERENCES,
        'hasResults',
        { hasMorePages: true, totalPages: 5 } as HintContext
      );
      expect(hints.some(h => h.includes('page=2'))).toBe(true);
    });

    it('should include fallback hint', () => {
      const hints = getDynamicHints(
        STATIC_TOOL_NAMES.LSP_FIND_REFERENCES,
        'hasResults',
        { isFallback: true } as HintContext
      );
      expect(hints.some(h => h.includes('text-based search'))).toBe(true);
    });

    it('should include semantic precision hint when not fallback', () => {
      const hints = getDynamicHints(
        STATIC_TOOL_NAMES.LSP_FIND_REFERENCES,
        'hasResults',
        { isFallback: false } as HintContext
      );
      expect(hints.some(h => h.includes('More precise than grep'))).toBe(true);
    });

    it('should include recovery hint with symbolName in empty results', () => {
      const hints = getDynamicHints(
        STATIC_TOOL_NAMES.LSP_FIND_REFERENCES,
        'empty',
        { symbolName: 'myVar' } as HintContext
      );
      expect(hints.some(h => h.includes('myVar'))).toBe(true);
    });

    it('should return symbol_not_found error hints', () => {
      const hints = getDynamicHints(
        STATIC_TOOL_NAMES.LSP_FIND_REFERENCES,
        'error',
        { errorType: 'symbol_not_found', symbolName: 'bar' } as HintContext
      );
      expect(hints.some(h => h.includes('Could not resolve symbol'))).toBe(
        true
      );
      expect(hints.some(h => h.includes('bar'))).toBe(true);
    });

    it('should return timeout error hints', () => {
      const hints = getDynamicHints(
        STATIC_TOOL_NAMES.LSP_FIND_REFERENCES,
        'error',
        { errorType: 'timeout', symbolName: 'heavyFunction' } as HintContext
      );
      expect(hints.some(h => h.includes('LSP timeout'))).toBe(true);
      expect(hints.some(h => h.includes('paginate'))).toBe(true);
      expect(hints.some(h => h.includes('heavyFunction'))).toBe(true);
    });

    it('should return generic error hints for unknown error type', () => {
      const hints = getDynamicHints(
        STATIC_TOOL_NAMES.LSP_FIND_REFERENCES,
        'error',
        { errorType: 'unknown', symbolName: 'test' } as HintContext
      );
      expect(hints.some(h => h.includes('LSP error'))).toBe(true);
    });
  });

  describe('LSP_CALL_HIERARCHY hints', () => {
    it('should show incoming callers hint', () => {
      const hints = getDynamicHints(
        STATIC_TOOL_NAMES.LSP_CALL_HIERARCHY,
        'hasResults',
        { direction: 'incoming', callCount: 5 } as HintContext
      );
      expect(hints.some(h => h.includes('5 callers'))).toBe(true);
    });

    it('should show outgoing callees hint', () => {
      const hints = getDynamicHints(
        STATIC_TOOL_NAMES.LSP_CALL_HIERARCHY,
        'hasResults',
        { direction: 'outgoing', callCount: 3 } as HintContext
      );
      expect(hints.some(h => h.includes('3 callees'))).toBe(true);
    });

    it('should suggest increasing depth when depth=1', () => {
      const hints = getDynamicHints(
        STATIC_TOOL_NAMES.LSP_CALL_HIERARCHY,
        'hasResults',
        { depth: 1 } as HintContext
      );
      expect(hints.some(h => h.includes('depth=2'))).toBe(true);
    });

    it('should show current depth when depth > 1', () => {
      const hints = getDynamicHints(
        STATIC_TOOL_NAMES.LSP_CALL_HIERARCHY,
        'hasResults',
        { depth: 2 } as HintContext
      );
      expect(hints.some(h => h.includes('Depth=2'))).toBe(true);
    });

    it('should suggest switching direction', () => {
      const hints = getDynamicHints(
        STATIC_TOOL_NAMES.LSP_CALL_HIERARCHY,
        'hasResults',
        { direction: 'incoming' } as HintContext
      );
      expect(hints.some(h => h.includes('direction="outgoing"'))).toBe(true);
    });

    it('should include pagination hint when more pages', () => {
      const hints = getDynamicHints(
        STATIC_TOOL_NAMES.LSP_CALL_HIERARCHY,
        'hasResults',
        { hasMorePages: true, currentPage: 1, totalPages: 3 } as HintContext
      );
      expect(hints.some(h => h.includes('Page 1/3'))).toBe(true);
    });

    it('should fallback to page=2 when hasMorePages but no currentPage', () => {
      const hints = getDynamicHints(
        STATIC_TOOL_NAMES.LSP_CALL_HIERARCHY,
        'hasResults',
        { hasMorePages: true, totalPages: 3 } as HintContext
      );
      expect(hints.some(h => h.includes('page=2'))).toBe(true);
    });

    it('should include fallback hint', () => {
      const hints = getDynamicHints(
        STATIC_TOOL_NAMES.LSP_CALL_HIERARCHY,
        'hasResults',
        { isFallback: true } as HintContext
      );
      expect(hints.some(h => h.includes('text-based analysis'))).toBe(true);
    });

    it('should show incoming empty hint', () => {
      const hints = getDynamicHints(
        STATIC_TOOL_NAMES.LSP_CALL_HIERARCHY,
        'empty',
        { direction: 'incoming' } as HintContext
      );
      expect(hints.some(h => h.includes('No callers'))).toBe(true);
    });

    it('should show outgoing empty hint', () => {
      const hints = getDynamicHints(
        STATIC_TOOL_NAMES.LSP_CALL_HIERARCHY,
        'empty',
        { direction: 'outgoing' } as HintContext
      );
      expect(hints.some(h => h.includes('No callees'))).toBe(true);
    });

    it('should include recovery hint with symbolName in empty results', () => {
      const hints = getDynamicHints(
        STATIC_TOOL_NAMES.LSP_CALL_HIERARCHY,
        'empty',
        { symbolName: 'myFn' } as HintContext
      );
      expect(hints.some(h => h.includes('myFn'))).toBe(true);
    });

    it('should return not_a_function error hints', () => {
      const hints = getDynamicHints(
        STATIC_TOOL_NAMES.LSP_CALL_HIERARCHY,
        'error',
        { errorType: 'not_a_function', symbolName: 'MyType' } as HintContext
      );
      expect(hints.some(h => h.includes('function/method'))).toBe(true);
      expect(hints.some(h => h.includes('MyType'))).toBe(true);
    });

    it('should return timeout error hints with depth', () => {
      const hints = getDynamicHints(
        STATIC_TOOL_NAMES.LSP_CALL_HIERARCHY,
        'error',
        {
          errorType: 'timeout',
          depth: 3,
          symbolName: 'complexFn',
        } as HintContext
      );
      expect(hints.some(h => h.includes('Depth=3'))).toBe(true);
      expect(hints.some(h => h.includes('complexFn'))).toBe(true);
    });

    it('should return generic error hints for unknown error type', () => {
      const hints = getDynamicHints(
        STATIC_TOOL_NAMES.LSP_CALL_HIERARCHY,
        'error',
        { errorType: 'unknown', symbolName: 'fn' } as HintContext
      );
      expect(hints.some(h => h.includes('LSP error'))).toBe(true);
    });
  });

  describe('Tools with empty dynamic hints', () => {
    it('should return empty for GITHUB_SEARCH_PULL_REQUESTS all statuses', () => {
      expect(
        getDynamicHints(
          STATIC_TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
          'hasResults'
        )
      ).toEqual([]);
      expect(
        getDynamicHints(STATIC_TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS, 'empty')
      ).toEqual([]);
      expect(
        getDynamicHints(STATIC_TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS, 'error')
      ).toEqual([]);
    });

    it('should return empty for GITHUB_SEARCH_REPOSITORIES all statuses', () => {
      expect(
        getDynamicHints(
          STATIC_TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
          'hasResults'
        )
      ).toEqual([]);
      expect(
        getDynamicHints(STATIC_TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES, 'empty')
      ).toEqual([]);
      expect(
        getDynamicHints(STATIC_TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES, 'error')
      ).toEqual([]);
    });

    it('should return empty for PACKAGE_SEARCH all statuses', () => {
      expect(
        getDynamicHints(STATIC_TOOL_NAMES.PACKAGE_SEARCH, 'hasResults')
      ).toEqual([]);
      expect(
        getDynamicHints(STATIC_TOOL_NAMES.PACKAGE_SEARCH, 'empty')
      ).toEqual([]);
      expect(
        getDynamicHints(STATIC_TOOL_NAMES.PACKAGE_SEARCH, 'error')
      ).toEqual([]);
    });
  });

  describe('HINTS object structure', () => {
    it('should have all required tools registered', () => {
      const expectedTools = [
        STATIC_TOOL_NAMES.LOCAL_RIPGREP,
        STATIC_TOOL_NAMES.LOCAL_FETCH_CONTENT,
        STATIC_TOOL_NAMES.LOCAL_VIEW_STRUCTURE,
        STATIC_TOOL_NAMES.LOCAL_FIND_FILES,
        STATIC_TOOL_NAMES.GITHUB_SEARCH_CODE,
        STATIC_TOOL_NAMES.GITHUB_FETCH_CONTENT,
        STATIC_TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
        STATIC_TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
        STATIC_TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        STATIC_TOOL_NAMES.PACKAGE_SEARCH,
        STATIC_TOOL_NAMES.LSP_GOTO_DEFINITION,
        STATIC_TOOL_NAMES.LSP_FIND_REFERENCES,
        STATIC_TOOL_NAMES.LSP_CALL_HIERARCHY,
      ];

      expectedTools.forEach(tool => {
        expect(HINTS[tool]).toBeDefined();
        expect(typeof HINTS[tool].hasResults).toBe('function');
        expect(typeof HINTS[tool].empty).toBe('function');
        expect(typeof HINTS[tool].error).toBe('function');
      });
    });

    it('should return arrays from all hint generators', () => {
      Object.entries(HINTS).forEach(([toolName, generators]) => {
        ['hasResults', 'empty', 'error'].forEach(status => {
          const result = generators[status as keyof typeof generators]({});
          expect(Array.isArray(result)).toBe(true);
        });
      });
    });
  });
});
