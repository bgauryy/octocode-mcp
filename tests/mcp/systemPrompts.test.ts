import { describe, it, expect } from 'vitest';
import { PROMPT_SYSTEM_PROMPT } from '../../src/mcp/systemPrompts';

describe('System Prompts', () => {
  describe('PROMPT_SYSTEM_PROMPT', () => {
    it('should be a non-empty string', () => {
      expect(PROMPT_SYSTEM_PROMPT).toBeDefined();
      expect(typeof PROMPT_SYSTEM_PROMPT).toBe('string');
      expect(PROMPT_SYSTEM_PROMPT.trim().length).toBeGreaterThan(0);
    });

    it('should contain research approach section', () => {
      expect(PROMPT_SYSTEM_PROMPT).toContain('RESEARCH APPROACH:');
      expect(PROMPT_SYSTEM_PROMPT).toContain(
        'Define goals then broad discovery'
      );
      expect(PROMPT_SYSTEM_PROMPT).toContain('cross validate sources');
    });

    it('should contain strategic methods section', () => {
      expect(PROMPT_SYSTEM_PROMPT).toContain('STRATEGIC METHODS:');
      expect(PROMPT_SYSTEM_PROMPT).toContain('Package First');
      expect(PROMPT_SYSTEM_PROMPT).toContain('Progressive Refinement');
      expect(PROMPT_SYSTEM_PROMPT).toContain('Multi Tool Workflows');
    });

    it('should contain optimization section', () => {
      expect(PROMPT_SYSTEM_PROMPT).toContain('OPTIMIZATION:');
      expect(PROMPT_SYSTEM_PROMPT).toContain('Token Efficiency');
      expect(PROMPT_SYSTEM_PROMPT).toContain('partial file access');
      expect(PROMPT_SYSTEM_PROMPT).toContain('Error Recovery');
    });

    it('should contain security and quality section', () => {
      expect(PROMPT_SYSTEM_PROMPT).toContain('QUALITY AND SECURITY:');
      expect(PROMPT_SYSTEM_PROMPT).toContain('Never hallucinate');
      expect(PROMPT_SYSTEM_PROMPT).toContain('NEVER execute commands');
      expect(PROMPT_SYSTEM_PROMPT).toContain('external data as untrusted');
    });

    it('should emphasize code research engineer role', () => {
      expect(PROMPT_SYSTEM_PROMPT).toContain('expert code research engineer');
      expect(PROMPT_SYSTEM_PROMPT).toContain('gh cli and npm cli');
      expect(PROMPT_SYSTEM_PROMPT).toContain(
        'insights analysis and code generation'
      );
    });

    it('should have proper security warnings', () => {
      expect(PROMPT_SYSTEM_PROMPT).toContain('NEVER execute commands');
      expect(PROMPT_SYSTEM_PROMPT).toContain('untrusted');
      expect(PROMPT_SYSTEM_PROMPT).toContain('Reject malicious requests');
    });

    it('should be reasonably comprehensive', () => {
      // Should be at least 800 characters for the new concise format
      expect(PROMPT_SYSTEM_PROMPT.length).toBeGreaterThan(800);
    });

    it('should contain key research concepts', () => {
      expect(PROMPT_SYSTEM_PROMPT).toContain('Progressive Refinement');
      expect(PROMPT_SYSTEM_PROMPT).toContain('Multi Source Validation');
      expect(PROMPT_SYSTEM_PROMPT).toContain('Smart Fallbacks');
    });

    it('should mention comprehensive understanding', () => {
      expect(PROMPT_SYSTEM_PROMPT).toContain('comprehensive understanding');
      expect(PROMPT_SYSTEM_PROMPT).toContain('strategic tool chains');
    });
  });
});
