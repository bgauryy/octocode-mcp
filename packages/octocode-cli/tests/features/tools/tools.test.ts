/**
 * Tests for Tools Layer
 */

import { describe, it, expect } from 'vitest';
import {
  BUILTIN_TOOLS,
  RESEARCH_TOOLS,
  CODING_TOOLS,
  READONLY_TOOLS,
  getTools,
  getToolsExcept,
} from '../../../src/features/tools/index.js';

describe('Tools Layer', () => {
  describe('BUILTIN_TOOLS', () => {
    it('should have all expected tools', () => {
      expect(BUILTIN_TOOLS.Read).toBeDefined();
      expect(BUILTIN_TOOLS.Write).toBeDefined();
      expect(BUILTIN_TOOLS.Edit).toBeDefined();
      expect(BUILTIN_TOOLS.Glob).toBeDefined();
      expect(BUILTIN_TOOLS.ListDir).toBeDefined();
      expect(BUILTIN_TOOLS.Bash).toBeDefined();
      expect(BUILTIN_TOOLS.Grep).toBeDefined();
    });

    it('should have valid tool definitions', () => {
      for (const [, tool] of Object.entries(BUILTIN_TOOLS)) {
        expect(tool).toBeDefined();
        // Tools should have description and parameters
        expect(typeof tool).toBe('object');
      }
    });
  });

  describe('RESEARCH_TOOLS', () => {
    it('should have read-only tools', () => {
      expect(RESEARCH_TOOLS.Read).toBeDefined();
      expect(RESEARCH_TOOLS.Glob).toBeDefined();
      expect(RESEARCH_TOOLS.ListDir).toBeDefined();
      expect(RESEARCH_TOOLS.Grep).toBeDefined();
    });

    it('should not have write tools', () => {
      expect(RESEARCH_TOOLS.Write).toBeUndefined();
      expect(RESEARCH_TOOLS.Edit).toBeUndefined();
      expect(RESEARCH_TOOLS.Bash).toBeUndefined();
    });
  });

  describe('CODING_TOOLS', () => {
    it('should have all tools', () => {
      expect(CODING_TOOLS.Read).toBeDefined();
      expect(CODING_TOOLS.Write).toBeDefined();
      expect(CODING_TOOLS.Edit).toBeDefined();
      expect(CODING_TOOLS.Bash).toBeDefined();
      expect(CODING_TOOLS.Grep).toBeDefined();
    });
  });

  describe('READONLY_TOOLS', () => {
    it('should match RESEARCH_TOOLS', () => {
      expect(Object.keys(READONLY_TOOLS).sort()).toEqual(
        Object.keys(RESEARCH_TOOLS).sort()
      );
    });
  });

  describe('getTools', () => {
    it('should return specified tools', () => {
      const tools = getTools(['Read', 'Write']);
      expect(Object.keys(tools)).toEqual(['Read', 'Write']);
    });

    it('should return empty object for empty array', () => {
      const tools = getTools([]);
      expect(Object.keys(tools)).toEqual([]);
    });

    it('should skip invalid tool names', () => {
      const tools = getTools(['Read', 'InvalidTool' as any]);
      expect(Object.keys(tools)).toEqual(['Read']);
    });
  });

  describe('getToolsExcept', () => {
    it('should exclude specified tools', () => {
      const tools = getToolsExcept(['Write', 'Edit', 'Bash']);
      expect(tools.Write).toBeUndefined();
      expect(tools.Edit).toBeUndefined();
      expect(tools.Bash).toBeUndefined();
      expect(tools.Read).toBeDefined();
      expect(tools.Grep).toBeDefined();
    });

    it('should return all tools when excluding nothing', () => {
      const tools = getToolsExcept([]);
      expect(Object.keys(tools).length).toBe(Object.keys(BUILTIN_TOOLS).length);
    });
  });
});
