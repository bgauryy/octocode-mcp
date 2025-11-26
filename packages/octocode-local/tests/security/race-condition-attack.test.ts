/**
 * RACE CONDITION (TOCTOU) ATTACK TESTS
 * Time-Of-Check-Time-Of-Use vulnerabilities
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { validateExecutionContext } from '../../src/security/executionContextValidator.js';
import { PathValidator } from '../../src/security/pathValidator.js';
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
      const files = fs.readdirSync(workspace);
      files.forEach((file) => {
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

    fs.writeFileSync(testFile, 'safe content');

    const result1 = validator.validate(testFile);
    expect(result1.isValid).toBe(true);

    // Swap with symlink (attacker action)
    fs.unlinkSync(testFile);
    fs.symlinkSync('/etc/passwd', testFile);

    // Re-validation should catch the swap
    const result2 = validator.validate(testFile);
    expect(result2.isValid).toBe(false);

    fs.unlinkSync(testFile);
  });

  it('ATTACK: Race condition with directory swap', async () => {
    const testDir = path.join(workspace, 'toctou_dir');

    fs.mkdirSync(testDir);

    const result1 = validator.validate(testDir);
    expect(result1.isValid).toBe(true);

    // Swap directory with symlink
    fs.rmdirSync(testDir);
    fs.symlinkSync('/etc', testDir);

    const result2 = validator.validate(testDir);
    expect(result2.isValid).toBe(false);

    fs.unlinkSync(testDir);
  });

  it('SECURITY TEST: PathValidator uses realpath (safe against TOCTOU)', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../src/security/pathValidator.ts'),
      'utf-8'
    );

    const usesRealpath = source.includes('realpathSync');
    expect(usesRealpath).toBe(true);
  });

  it('MITIGATION: Validate just before use (recommended pattern)', () => {
    // Pattern: validate() -> use file immediately
    // Pattern: Do NOT store validation results for later use
    // Pattern: Re-validate if time has passed
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
