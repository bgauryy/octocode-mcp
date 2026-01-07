/**
 * Tests for environment detection utilities
 * Verifies Claude Code and IDE detection
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  detectEnvironment,
  shouldUseMCPLsp,
  getLspEnvironmentHint,
} from '../../../src/utils/environment/environmentDetection.js';

describe('Environment Detection', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear environment variables
    delete process.env.ENABLE_LSP_TOOL;
    delete process.env.OCTOCODE_FORCE_LSP;
    delete process.env.VSCODE_PID;
    delete process.env.VSCODE_IPC_HOOK;
    delete process.env.CURSOR_CHANNEL;
    delete process.env.CURSOR_TRACE_ID;
  });

  afterEach(() => {
    // Restore environment
    process.env = { ...originalEnv };
  });

  describe('detectEnvironment', () => {
    it('should detect Claude Code with native LSP', () => {
      process.env.ENABLE_LSP_TOOL = '1';
      expect(detectEnvironment()).toBe('claude-code-native');
    });

    it('should detect VSCode via VSCODE_PID', () => {
      process.env.VSCODE_PID = '12345';
      expect(detectEnvironment()).toBe('vscode');
    });

    it('should detect VSCode via VSCODE_IPC_HOOK', () => {
      process.env.VSCODE_IPC_HOOK = '/tmp/vscode-ipc';
      expect(detectEnvironment()).toBe('vscode');
    });

    it('should detect Cursor via CURSOR_CHANNEL', () => {
      process.env.CURSOR_CHANNEL = 'stable';
      expect(detectEnvironment()).toBe('cursor');
    });

    it('should detect Cursor via CURSOR_TRACE_ID', () => {
      process.env.CURSOR_TRACE_ID = 'abc123';
      expect(detectEnvironment()).toBe('cursor');
    });

    it('should return standalone as default', () => {
      expect(detectEnvironment()).toBe('standalone');
    });

    it('should prioritize Claude Code over VSCode', () => {
      process.env.ENABLE_LSP_TOOL = '1';
      process.env.VSCODE_PID = '12345';
      expect(detectEnvironment()).toBe('claude-code-native');
    });

    it('should prioritize VSCode over Cursor', () => {
      process.env.VSCODE_PID = '12345';
      process.env.CURSOR_CHANNEL = 'stable';
      expect(detectEnvironment()).toBe('vscode');
    });
  });

  describe('shouldUseMCPLsp', () => {
    it('should return true in standalone mode', () => {
      expect(shouldUseMCPLsp()).toBe(true);
    });

    it('should return true in VSCode', () => {
      process.env.VSCODE_PID = '12345';
      expect(shouldUseMCPLsp()).toBe(true);
    });

    it('should return true in Cursor', () => {
      process.env.CURSOR_CHANNEL = 'stable';
      expect(shouldUseMCPLsp()).toBe(true);
    });

    it('should return false in Claude Code with native LSP', () => {
      process.env.ENABLE_LSP_TOOL = '1';
      expect(shouldUseMCPLsp()).toBe(false);
    });

    it('should return true when OCTOCODE_FORCE_LSP is set', () => {
      process.env.ENABLE_LSP_TOOL = '1';
      process.env.OCTOCODE_FORCE_LSP = '1';
      expect(shouldUseMCPLsp()).toBe(true);
    });

    it('should only check for exact "1" value for force flag', () => {
      process.env.ENABLE_LSP_TOOL = '1';
      process.env.OCTOCODE_FORCE_LSP = 'true';
      expect(shouldUseMCPLsp()).toBe(false);
    });
  });

  describe('getLspEnvironmentHint', () => {
    it('should return null in standalone mode', () => {
      expect(getLspEnvironmentHint()).toBeNull();
    });

    it('should return hint when native LSP is available', () => {
      process.env.ENABLE_LSP_TOOL = '1';
      const hint = getLspEnvironmentHint();

      expect(hint).not.toBeNull();
      expect(hint).toContain('Native Claude Code LSP detected');
      expect(hint).toContain('OCTOCODE_FORCE_LSP=1');
    });

    it('should return null when force flag is set', () => {
      process.env.ENABLE_LSP_TOOL = '1';
      process.env.OCTOCODE_FORCE_LSP = '1';
      expect(getLspEnvironmentHint()).toBeNull();
    });

    it('should not return hint for ENABLE_LSP_TOOL=0', () => {
      process.env.ENABLE_LSP_TOOL = '0';
      expect(getLspEnvironmentHint()).toBeNull();
    });
  });
});
