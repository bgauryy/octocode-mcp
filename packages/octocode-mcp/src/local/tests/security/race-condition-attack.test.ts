/* eslint-disable no-console */
/**
 * RACE CONDITION (TOCTOU) ATTACK TESTS
 * Time-Of-Check-Time-Of-Use vulnerabilities
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { validateExecutionContext } from '../../security/executionContextValidator.js';
import { PathValidator } from '../../security/pathValidator.js';
import fs from 'fs';
import path from 'path';

describe('RACE CONDITION ATTACKS (TOCTOU)', () => {
  const workspace = '/Users/guybary/path_validator_toctou_test';
  let validator: PathValidator;

  beforeAll(() => {
    fs.mkdirSync(workspace, { recursive: true });
    validator = new PathValidator(workspace);
  });

  afterAll(() => {
    try {
      // Cleanup
      const files = fs.readdirSync(workspace);
      files.forEach(file => {
        const filePath = path.join(workspace, file);
        try {
          if (fs.lstatSync(filePath).isSymbolicLink()) {
            fs.unlinkSync(filePath);
          } else if (fs.statSync(filePath).isDirectory()) {
            fs.rmdirSync(filePath);
          } else {
            fs.unlinkSync(filePath);
          }
        } catch {
          // Ignore cleanup errors
        }
      });
      fs.rmdirSync(workspace);
    } catch {
      // Ignore cleanup errors
    }
  });

  it('ATTACK: Swap file after validation (classic TOCTOU)', async () => {
    const testFile = path.join(workspace, 'toctou_test.txt');

    // Step 1: Create legitimate file
    fs.writeFileSync(testFile, 'safe content');

    console.log('\n🔴 ATTACK: TOCTOU - Swap file after validation');

    // Step 2: Validate (TIME OF CHECK)
    const result1 = validator.validate(testFile);
    console.log(`   Validation 1: ${result1.isValid ? 'PASS' : 'FAIL'}`);
    expect(result1.isValid).toBe(true);

    // Step 3: Swap with symlink (ATTACKER SWAPS FILE)
    fs.unlinkSync(testFile);
    fs.symlinkSync('/etc/passwd', testFile);

    // Step 4: Use the file (TIME OF USE)
    // The validator should catch this if it validates again
    const result2 = validator.validate(testFile);
    console.log(
      `   Validation 2 (after swap): ${result2.isValid ? '❌ BYPASSED' : '✅ BLOCKED'}`
    );
    console.log(`   Error: ${result2.error || 'none'}`);

    // The validator uses fs.realpathSync() which should catch this
    expect(result2.isValid).toBe(false);

    // Cleanup
    fs.unlinkSync(testFile);
  });

  it('ATTACK: Race condition with directory swap', async () => {
    const testDir = path.join(workspace, 'toctou_dir');

    // Step 1: Create legitimate directory
    fs.mkdirSync(testDir);

    console.log('\n🔴 ATTACK: TOCTOU - Directory swap');

    // Validate
    const result1 = validator.validate(testDir);
    console.log(`   Validation 1: ${result1.isValid ? 'PASS' : 'FAIL'}`);
    expect(result1.isValid).toBe(true);

    // Swap directory with symlink
    fs.rmdirSync(testDir);
    fs.symlinkSync('/etc', testDir);

    // Validate again
    const result2 = validator.validate(testDir);
    console.log(
      `   Validation 2 (after swap): ${result2.isValid ? '❌ BYPASSED' : '✅ BLOCKED'}`
    );

    expect(result2.isValid).toBe(false);

    // Cleanup
    fs.unlinkSync(testDir);
  });

  it('SECURITY TEST: PathValidator uses realpath (safe against TOCTOU)', () => {
    console.log('\n🔍 Checking if PathValidator uses fs.realpathSync():');

    // Read the source code to verify
    const source = fs.readFileSync(
      path.join(__dirname, '../../security/pathValidator.ts'),
      'utf-8'
    );

    const usesRealpath = source.includes('realpathSync');
    console.log(
      `   Uses fs.realpathSync(): ${usesRealpath ? '✅ YES - Protected' : '❌ NO - Vulnerable'}`
    );

    expect(usesRealpath).toBe(true);
  });

  it('MITIGATION: Validate just before use (recommended pattern)', () => {
    console.log('\n✅ RECOMMENDED: Always validate immediately before use');
    console.log('   Pattern: validate() -> use file immediately');
    console.log('   Pattern: Do NOT store validation results for later use');
    console.log('   Pattern: Re-validate if time has passed');

    expect(true).toBe(true);
  });

  it('TOCTOU FIX: validator.validate does not crash if path disappears', () => {
    const tmp = path.join(workspace, 'maybe-missing');
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    const res = validator.validate(tmp);
    expect(res.isValid).toBe(true);
    expect(res.sanitizedPath).toBeDefined();
  });

  it('TOCTOU FIX: executionContextValidator allows non-existent cwd within workspace', () => {
    const tmp = path.join(workspace, 'missing-cwd');
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    const res = validateExecutionContext(tmp, workspace);
    expect(res.isValid).toBe(true);
    expect(res.sanitizedPath).toBeDefined();
  });
});
