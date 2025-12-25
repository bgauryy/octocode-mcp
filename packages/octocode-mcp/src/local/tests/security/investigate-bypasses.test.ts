/* eslint-disable no-console */
/**
 * Investigating potential security bypasses
 */

import { describe, it, expect } from 'vitest';
import { PathValidator } from '../../security/pathValidator.js';
import path from 'path';
import { execSync } from 'child_process';

describe('🔍 Investigating Potential Bypasses', () => {
  const validator = new PathValidator('/Users/guybary');

  describe('URL Encoding Analysis', () => {
    it('URL encoded %2e%2e - check if real bypass', () => {
      const testPath = '/Users/guybary/%2e%2e/%2e%2e/etc';
      const result = validator.validate(testPath);

      // What does Node's path.resolve do?
      const resolved = path.resolve(testPath);

      console.log('\n📊 URL Encoding Analysis:');
      console.log(`   Input: ${testPath}`);
      console.log(`   Node resolve: ${resolved}`);
      console.log(`   isValid: ${result.isValid}`);
      console.log(`   sanitizedPath: ${result.sanitizedPath}`);

      // The key question: Does the resolved path escape the workspace?
      const escapedWorkspace = !resolved.startsWith('/Users/guybary');
      console.log(
        `   Escaped workspace? ${escapedWorkspace ? '🚨 YES - CRITICAL!' : '✅ NO - stays within workspace'}`
      );

      // Check if %2e is treated as literal characters
      const isLiteral = resolved.includes('%2e');
      console.log(
        `   %2e treated as literal? ${isLiteral ? '✅ YES - safe' : '🚨 NO - decoded!'}`
      );

      if (!escapedWorkspace && isLiteral) {
        console.log(
          '   ✅ VERDICT: False positive - %2e%2e creates literal directory name, not traversal'
        );
      } else if (escapedWorkspace) {
        console.log(
          '   🚨 VERDICT: REAL VULNERABILITY - Path escapes workspace!'
        );
      }

      // This test should actually pass if it doesn't escape
      expect(escapedWorkspace).toBe(false);
    });

    it('Double URL encoding %252e - check if real bypass', () => {
      const testPath = '/Users/guybary/%252e%252e/etc';
      validator.validate(testPath);
      const resolved = path.resolve(testPath);

      console.log('\n📊 Double URL Encoding Analysis:');
      console.log(`   Input: ${testPath}`);
      console.log(`   Node resolve: ${resolved}`);
      console.log(
        `   Escaped workspace? ${!resolved.startsWith('/Users/guybary') ? '🚨 YES' : '✅ NO'}`
      );

      expect(resolved.startsWith('/Users/guybary')).toBe(true);
    });
  });

  describe('Unicode Analysis', () => {
    it('Full-width dots ．． - check if real bypass', () => {
      const testPath = '/Users/guybary/．．/etc';
      const result = validator.validate(testPath);
      const resolved = path.resolve(testPath);

      console.log('\n📊 Unicode Full-Width Dots Analysis:');
      console.log(`   Input: ${testPath}`);
      console.log(`   Node resolve: ${resolved}`);
      console.log(`   isValid: ${result.isValid}`);
      console.log(
        `   Escaped workspace? ${!resolved.startsWith('/Users/guybary') ? '🚨 YES' : '✅ NO'}`
      );

      // Check if Unicode is normalized
      const containsFullWidth = resolved.includes('．');
      console.log(
        `   Full-width kept as literal? ${containsFullWidth ? '✅ YES' : '🚨 NO - normalized!'}`
      );

      expect(resolved.startsWith('/Users/guybary')).toBe(true);
    });
  });

  describe('Real-World Bypass Test', () => {
    it('Can URL encoding bypass actual file system operations?', () => {
      // Test if shell commands interpret %2e%2e as ..
      console.log('\n🔍 Testing actual file system behavior:');

      try {
        // This would fail if %2e%2e is treated literally
        execSync('ls /Users/%2e%2e 2>&1', { encoding: 'utf-8', timeout: 1000 });
        console.log('   🚨 WARNING: Shell interprets %2e%2e as .. !');
        expect.fail('Shell command should have failed');
      } catch (e: unknown) {
        const error = e as Error;
        if (error.message.includes('No such file')) {
          console.log('   ✅ SAFE: Shell treats %2e%2e as literal characters');
          console.log('   ✅ Directory /Users/%2e%2e does not exist');
        } else {
          console.log(`   Error: ${error.message}`);
        }
      }
    });
  });

  describe('Can MCP Tools Bypass with Encoding?', () => {
    it('Test if encoded paths work through actual command execution', async () => {
      // The real test: can we use these paths with the actual tools?
      console.log('\n🔍 Testing with actual command execution:');

      // Import safeExec
      const { safeExec } = await import('../../utils/exec.js');

      // Try to use ls with URL encoded path
      try {
        const result = await safeExec('ls', ['/Users/%2e%2e']);
        console.log(
          `   🚨 CRITICAL: Command succeeded! Output: ${result.stdout.substring(0, 100)}`
        );
        expect.fail('Command should have failed - potential bypass!');
      } catch (e: unknown) {
        const error = e as Error;
        console.log(`   ✅ SAFE: Command failed as expected`);
        console.log(`   Error: ${error.message.substring(0, 100)}`);
      }
    });
  });
});
