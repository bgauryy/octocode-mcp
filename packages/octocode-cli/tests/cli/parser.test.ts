/**
 * CLI Parser Tests
 */

import { describe, it, expect } from 'vitest';
import {
  parseArgs,
  hasHelpFlag,
  hasVersionFlag,
} from '../../src/cli/parser.js';

describe('CLI Parser', () => {
  describe('parseArgs', () => {
    it('should parse command', () => {
      const result = parseArgs(['install']);
      expect(result.command).toBe('install');
      expect(result.args).toEqual([]);
      expect(result.options).toEqual({});
    });

    it('should parse command with positional args', () => {
      const result = parseArgs(['install', 'arg1', 'arg2']);
      expect(result.command).toBe('install');
      expect(result.args).toEqual(['arg1', 'arg2']);
    });

    it('should parse long options with values using =', () => {
      const result = parseArgs(['--ide=cursor']);
      expect(result.options).toEqual({ ide: 'cursor' });
    });

    it('should parse long options with values as next arg', () => {
      const result = parseArgs(['--ide', 'cursor']);
      expect(result.options).toEqual({ ide: 'cursor' });
    });

    it('should parse boolean long options', () => {
      const result = parseArgs(['--force']);
      expect(result.options).toEqual({ force: true });
    });

    it('should parse short boolean options', () => {
      const result = parseArgs(['-f']);
      expect(result.options).toEqual({ f: true });
    });

    it('should parse combined short options', () => {
      const result = parseArgs(['-fv']);
      expect(result.options).toEqual({ f: true, v: true });
    });

    it('should parse command with options', () => {
      const result = parseArgs(['install', '--ide', 'cursor', '--force']);
      expect(result.command).toBe('install');
      expect(result.options).toEqual({ ide: 'cursor', force: true });
    });

    it('should handle empty argv', () => {
      const result = parseArgs([]);
      expect(result.command).toBeNull();
      expect(result.args).toEqual([]);
      expect(result.options).toEqual({});
    });

    it('should parse --method option', () => {
      const result = parseArgs(['install', '--method', 'npx']);
      expect(result.command).toBe('install');
      expect(result.options).toEqual({ method: 'npx' });
    });

    it('should handle options before command', () => {
      const result = parseArgs(['--help', 'install']);
      expect(result.command).toBe('install');
      expect(result.options).toEqual({ help: true });
    });

    it('should parse --hostname option', () => {
      const result = parseArgs([
        'status',
        '--hostname',
        'github.enterprise.com',
      ]);
      expect(result.command).toBe('status');
      expect(result.options).toEqual({ hostname: 'github.enterprise.com' });
    });

    it('should parse -h option with value for hostname', () => {
      const result = parseArgs(['token', '-h', 'github.enterprise.com']);
      expect(result.command).toBe('token');
      expect(result.options).toEqual({ h: 'github.enterprise.com' });
    });

    it('should parse --git-protocol option', () => {
      const result = parseArgs(['login', '--git-protocol', 'ssh']);
      expect(result.command).toBe('login');
      expect(result.options).toEqual({ 'git-protocol': 'ssh' });
    });
  });

  describe('hasHelpFlag', () => {
    it('should detect --help', () => {
      const args = parseArgs(['--help']);
      expect(hasHelpFlag(args)).toBe(true);
    });

    it('should detect -h', () => {
      const args = parseArgs(['-h']);
      expect(hasHelpFlag(args)).toBe(true);
    });

    it('should return false when no help flag', () => {
      const args = parseArgs(['install']);
      expect(hasHelpFlag(args)).toBe(false);
    });
  });

  describe('hasVersionFlag', () => {
    it('should detect --version', () => {
      const args = parseArgs(['--version']);
      expect(hasVersionFlag(args)).toBe(true);
    });

    it('should detect -v', () => {
      const args = parseArgs(['-v']);
      expect(hasVersionFlag(args)).toBe(true);
    });

    it('should return false when no version flag', () => {
      const args = parseArgs(['install']);
      expect(hasVersionFlag(args)).toBe(false);
    });
  });
});
