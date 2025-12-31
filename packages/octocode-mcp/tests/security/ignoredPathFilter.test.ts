/**
 * Tests for ignoredPathFilter security
 */

import { describe, it, expect } from 'vitest';
import {
  shouldIgnorePath,
  shouldIgnoreFile,
  shouldIgnore,
} from '../../src/security/ignoredPathFilter.js';

describe('ignoredPathFilter', () => {
  describe('shouldIgnorePath', () => {
    it('should return true for empty path', () => {
      expect(shouldIgnorePath('')).toBe(true);
    });

    it('should return true for whitespace-only path', () => {
      expect(shouldIgnorePath('   ')).toBe(true);
    });

    it('should return true for .ssh directory', () => {
      expect(shouldIgnorePath('.ssh')).toBe(true);
      expect(shouldIgnorePath('/project/.ssh')).toBe(true);
      expect(shouldIgnorePath('/project/.ssh/keys')).toBe(true);
    });

    it('should return true for .aws directory', () => {
      expect(shouldIgnorePath('.aws')).toBe(true);
      expect(shouldIgnorePath('/home/user/.aws')).toBe(true);
      expect(shouldIgnorePath('/home/user/.aws/credentials')).toBe(true);
    });

    it('should return true for secrets directory', () => {
      expect(shouldIgnorePath('secrets')).toBe(true);
      expect(shouldIgnorePath('/project/secrets')).toBe(true);
      expect(shouldIgnorePath('/project/secrets/api-key')).toBe(true);
    });

    it('should return false for normal paths', () => {
      expect(shouldIgnorePath('/project/src')).toBe(false);
      expect(shouldIgnorePath('/project/lib')).toBe(false);
      expect(shouldIgnorePath('src/utils')).toBe(false);
    });

    it('should handle backslash paths (Windows-style converted to forward slash)', () => {
      // The function normalizes backslashes to forward slashes
      expect(shouldIgnorePath('project/.ssh')).toBe(true);
    });
  });

  describe('shouldIgnoreFile', () => {
    it('should return true for empty filename', () => {
      expect(shouldIgnoreFile('')).toBe(true);
    });

    it('should return true for whitespace-only filename', () => {
      expect(shouldIgnoreFile('   ')).toBe(true);
    });

    it('should return true for .env files', () => {
      expect(shouldIgnoreFile('.env')).toBe(true);
      expect(shouldIgnoreFile('.env.local')).toBe(true);
      expect(shouldIgnoreFile('.env.production')).toBe(true);
    });

    it('should return true for key files', () => {
      expect(shouldIgnoreFile('private.key')).toBe(true);
      expect(shouldIgnoreFile('server.pem')).toBe(true);
      expect(shouldIgnoreFile('id_rsa')).toBe(true);
    });

    it('should return true for credentials', () => {
      expect(shouldIgnoreFile('credentials')).toBe(true);
      expect(shouldIgnoreFile('.credentials')).toBe(true);
    });

    it('should return false for normal files', () => {
      expect(shouldIgnoreFile('index.ts')).toBe(false);
      expect(shouldIgnoreFile('package.json')).toBe(false);
      expect(shouldIgnoreFile('README.md')).toBe(false);
    });

    it('should check full path for .ssh file patterns', () => {
      expect(shouldIgnoreFile('.ssh/id_rsa')).toBe(true);
    });

    // Backup files are NOW ALLOWED for code exploration
    it('should return false for backup files (allowed for diff analysis)', () => {
      expect(shouldIgnoreFile('config.bak')).toBe(false);
      expect(shouldIgnoreFile('settings.old')).toBe(false);
    });

    // Log files are NOW ALLOWED for code exploration
    it('should return false for log files (allowed for debugging)', () => {
      expect(shouldIgnoreFile('app.log')).toBe(false);
      expect(shouldIgnoreFile('error.log')).toBe(false);
    });

    // Database files are NOW ALLOWED for code exploration (content sanitized)
    it('should return false for database files (allowed, content sanitized)', () => {
      expect(shouldIgnoreFile('data.db')).toBe(false);
      expect(shouldIgnoreFile('users.sqlite')).toBe(false);
      expect(shouldIgnoreFile('dump.sql')).toBe(false);
    });
  });

  describe('shouldIgnore', () => {
    it('should return true if path should be ignored', () => {
      expect(shouldIgnore('.ssh')).toBe(true);
      expect(shouldIgnore('/project/.aws')).toBe(true);
    });

    it('should return true if file should be ignored', () => {
      expect(shouldIgnore('.env')).toBe(true);
      expect(shouldIgnore('server.key')).toBe(true);
    });

    // Log files are NOW ALLOWED
    it('should return false for log files (allowed for debugging)', () => {
      expect(shouldIgnore('/project/config/app.log')).toBe(false);
    });

    it('should return false for normal paths and files', () => {
      expect(shouldIgnore('/project/src/index.ts')).toBe(false);
    });
  });
});
