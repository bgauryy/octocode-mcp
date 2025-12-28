import { describe, it, expect } from 'vitest';
import { TOOL_NAMES, STATIC_TOOL_NAMES } from '../../src/tools/toolMetadata.js';
import { HINTS } from '../../src/tools/hints.js';

describe('Debug proxy', () => {
  it('should show values', () => {
    expect(TOOL_NAMES.LOCAL_RIPGREP).toBe(STATIC_TOOL_NAMES.LOCAL_RIPGREP);
    expect(HINTS[STATIC_TOOL_NAMES.LOCAL_RIPGREP]).toBeDefined();
  });
});
