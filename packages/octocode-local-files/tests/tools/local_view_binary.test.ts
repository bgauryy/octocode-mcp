/**
 * Tests for local_view_binary tool
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { viewBinary } from '../../src/tools/local_view_binary.js';
import * as pathValidator from '../../src/security/pathValidator.js';
import * as exec from '../../src/utils/exec.js';

// Mock exec
vi.mock('../../src/utils/exec.js', () => ({
  safeExec: vi.fn(),
}));

// Mock pathValidator
vi.mock('../../src/security/pathValidator.js', () => ({
  pathValidator: {
    validate: vi.fn(),
  },
}));

describe('local_view_binary', () => {
  const mockSafeExec = vi.mocked(exec.safeExec);
  const mockValidate = vi.mocked(pathValidator.pathValidator.validate);

  beforeEach(() => {
    vi.clearAllMocks();
    mockValidate.mockReturnValue({ isValid: true });
  });

  describe('identify operation', () => {
    it('should identify PE executable', async () => {
      mockSafeExec.mockResolvedValue({
        success: true,
        stdout: 'PE32+ executable (console) x86-64, for MS Windows',
        stderr: '',
        code: 0,
      });

      const result = await viewBinary({
        path: '/path/to/binary.exe',
        operation: 'identify',
      });

      expect(result.status).toBe('hasResults');
      expect(result.operation).toBe('identify');
      expect(result.fileType).toContain('PE32+');
    });

    it('should identify ELF binary', async () => {
      mockSafeExec.mockResolvedValue({
        success: true,
        stdout: 'ELF 64-bit LSB executable, x86-64',
        stderr: '',
        code: 0,
      });

      const result = await viewBinary({
        path: '/bin/ls',
        operation: 'identify',
      });

      expect(result.status).toBe('hasResults');
      expect(result.fileType).toContain('ELF');
    });
  });

  describe('strings operation', () => {
    it('should extract ASCII strings', async () => {
      mockSafeExec.mockResolvedValue({
        success: true,
        stdout: 'string1\nstring2\nstring3\n',
        stderr: '',
        code: 0,
      });

      const result = await viewBinary({
        path: '/path/to/binary',
        operation: 'strings',
        minLength: 6,
      });

      expect(result.status).toBe('hasResults');
      expect(result.operation).toBe('strings');
      expect(result.strings).toEqual(['string1', 'string2', 'string3']);
      expect(result.stringCount).toBe(3);
    });

    it('should return empty when no strings found', async () => {
      mockSafeExec.mockResolvedValue({
        success: true,
        stdout: '',
        stderr: '',
        code: 0,
      });

      const result = await viewBinary({
        path: '/path/to/binary',
        operation: 'strings',
      });

      expect(result.status).toBe('empty');
      expect(result.stringCount).toBe(0);
    });
  });

  describe('strings-utf16le operation', () => {
    it('should extract UTF-16LE strings', async () => {
      mockSafeExec.mockResolvedValue({
        success: true,
        stdout: 'widestring1\nwidestring2\n',
        stderr: '',
        code: 0,
      });

      const result = await viewBinary({
        path: '/path/to/program.exe',
        operation: 'strings-utf16le',
        minLength: 8,
      });

      expect(result.status).toBe('hasResults');
      expect(result.operation).toBe('strings-utf16le');
      expect(result.strings).toContain('widestring1');
      expect(result.strings).toContain('widestring2');
    });
  });

  describe('hexdump operation', () => {
    it('should generate hex dump', async () => {
      const hexOutput = `00000000  7f 45 4c 46 02 01 01 00  00 00 00 00 00 00 00 00  |.ELF............|
00000010  02 00 3e 00 01 00 00 00  50 0b 40 00 00 00 00 00  |..>.....P.@.....|`;

      mockSafeExec.mockResolvedValue({
        success: true,
        stdout: hexOutput,
        stderr: '',
        code: 0,
      });

      const result = await viewBinary({
        path: '/bin/ls',
        operation: 'hexdump',
        hexLines: 20,
      });

      expect(result.status).toBe('hasResults');
      expect(result.operation).toBe('hexdump');
      expect(result.hexDump).toContain('7f 45 4c 46');
      expect(result.hexDump).toContain('ELF');
    });
  });

  describe('magic-bytes operation', () => {
    it('should extract magic bytes', async () => {
      const hexOutput = `00000000  7f 45 4c 46 02 01 01 00  00 00 00 00 00 00 00 00  |.ELF............|
00000010  02 00 3e 00 01 00 00 00  50 0b 40 00 00 00 00 00  |..>.....P.@.....|`;

      mockSafeExec.mockResolvedValue({
        success: true,
        stdout: hexOutput,
        stderr: '',
        code: 0,
      });

      const result = await viewBinary({
        path: '/bin/ls',
        operation: 'magic-bytes',
      });

      expect(result.status).toBe('hasResults');
      expect(result.operation).toBe('magic-bytes');
      expect(result.magicBytes).toBeDefined();
    });
  });

  describe('full-inspection operation', () => {
    it('should perform complete analysis', async () => {
      // Mock multiple exec calls
      mockSafeExec
        .mockResolvedValueOnce({
          success: true,
          stdout: 'ELF 64-bit LSB executable',
          stderr: '',
          code: 0,
        })
        .mockResolvedValueOnce({
          success: true,
          stdout:
            '00000000  7f 45 4c 46 02 01 01 00  00 00 00 00 00 00 00 00  |.ELF............|',
          stderr: '',
          code: 0,
        })
        .mockResolvedValueOnce({
          success: true,
          stdout: 'string1\nstring2\n',
          stderr: '',
          code: 0,
        })
        .mockResolvedValueOnce({
          success: true,
          stdout: 'widestring1\n',
          stderr: '',
          code: 0,
        })
        .mockResolvedValueOnce({
          success: true,
          stdout: '00000000  7f 45 4c 46',
          stderr: '',
          code: 0,
        });

      const result = await viewBinary({
        path: '/bin/ls',
        operation: 'full-inspection',
      });

      expect(result.status).toBe('hasResults');
      expect(result.operation).toBe('full-inspection');
      expect(result.fullInspection).toBeDefined();
      expect(result.fullInspection?.fileType).toContain('ELF');
      expect(result.fullInspection?.asciiStrings).toContain('string1');
      expect(result.fullInspection?.utf16leStrings).toContain('widestring1');
    });
  });

  describe('Error handling', () => {
    it('should handle invalid paths', async () => {
      mockValidate.mockReturnValue({
        isValid: false,
        error: 'Invalid path',
      });

      const result = await viewBinary({
        path: '/invalid/path',
        operation: 'identify',
      });

      expect(result.status).toBe('error');
      expect(result.error).toBe('Invalid path');
    });

    it('should handle command execution errors', async () => {
      mockSafeExec.mockResolvedValue({
        success: false,
        stdout: '',
        stderr: 'File not found',
        code: 1,
      });

      const result = await viewBinary({
        path: '/nonexistent/binary',
        operation: 'identify',
      });

      expect(result.status).toBe('error');
      expect(result.error).toBe('File not found');
    });

    it('should handle unknown operations', async () => {
      const result = await viewBinary({
        path: '/path/to/binary',
        // @ts-expect-error - Testing invalid operation type
        operation: 'invalid-operation',
      });

      expect(result.status).toBe('error');
      expect(result.error).toContain('Unknown operation');
    });
  });

  describe('Research context', () => {
    it('should preserve research goal and reasoning', async () => {
      mockSafeExec.mockResolvedValue({
        success: true,
        stdout: 'ELF 64-bit',
        stderr: '',
        code: 0,
      });

      const result = await viewBinary({
        path: '/bin/ls',
        operation: 'identify',
        researchGoal: 'Analyze binary structure',
        reasoning: 'Understanding file format',
      });

      expect(result.researchGoal).toBe('Analyze binary structure');
      expect(result.reasoning).toBe('Understanding file format');
    });
  });
});
