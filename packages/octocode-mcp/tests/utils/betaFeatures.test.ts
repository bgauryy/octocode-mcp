import { describe, it, expect, afterEach } from 'vitest';
import { isBetaEnabled, isSamplingEnabled } from '../../src/utils/betaFeatures';

describe('Beta Features', () => {
  const originalBeta = process.env.BETA;

  afterEach(() => {
    // Restore original environment
    if (originalBeta !== undefined) {
      process.env.BETA = originalBeta;
    } else {
      delete process.env.BETA;
    }
  });

  describe('isBetaEnabled', () => {
    it('should return true when BETA=1', () => {
      process.env.BETA = '1';
      expect(isBetaEnabled()).toBe(true);
    });

    it('should return true when BETA=true', () => {
      process.env.BETA = 'true';
      expect(isBetaEnabled()).toBe(true);
    });

    it('should return false when BETA=0', () => {
      process.env.BETA = '0';
      expect(isBetaEnabled()).toBe(false);
    });

    it('should return false when BETA is not set', () => {
      delete process.env.BETA;
      expect(isBetaEnabled()).toBe(false);
    });
  });

  describe('isSamplingEnabled', () => {
    it('should return true when BETA=1', () => {
      process.env.BETA = '1';
      expect(isSamplingEnabled()).toBe(true);
    });

    it('should return false when BETA is not enabled', () => {
      process.env.BETA = '0';
      expect(isSamplingEnabled()).toBe(false);
    });
  });
});
