/**
 * Request throttling middleware using express-slow-down.
 * Gradually delays responses for high-frequency users instead of blocking.
 *
 * @module middleware/throttle
 */

import slowDown from 'express-slow-down';
import { warnLog, agentLog } from '../utils/colors.js';

/**
 * Throttle configuration
 */
export interface ThrottleConfig {
  /** Time window in ms (default: 60000 = 1 minute) */
  windowMs: number;
  /** Requests before slowdown starts (default: 50) */
  delayAfter: number;
  /** Delay increment per request in ms (default: 500) */
  delayMs: number;
  /** Max delay in ms (default: 10000 = 10 seconds) */
  maxDelayMs: number;
}

const DEFAULT_CONFIG: ThrottleConfig = {
  windowMs: 60 * 1000,      // 1 minute window
  delayAfter: 50,           // Start slowing after 50 requests
  delayMs: 500,             // Add 500ms per request over threshold
  maxDelayMs: 10 * 1000,    // Max 10 second delay
};

let config: ThrottleConfig = { ...DEFAULT_CONFIG };

/**
 * Update throttle configuration
 */
export function configureThrottle(newConfig: Partial<ThrottleConfig>): void {
  config = { ...config, ...newConfig };
  console.log(agentLog('⚡ Throttle configuration updated'));
}

/**
 * Get current throttle configuration
 */
export function getThrottleConfig(): ThrottleConfig {
  return { ...config };
}

/**
 * Create the slow-down middleware.
 * 
 * - First 50 requests per minute: instant response
 * - Request 51+: adds 500ms delay per request
 * - Max delay capped at 10 seconds
 * 
 * Uses exponential backoff for gradual pressure.
 */
export function createThrottleMiddleware() {
  return slowDown({
    windowMs: config.windowMs,
    delayAfter: config.delayAfter,
    
    // Exponential backoff: 500ms, 750ms, 1125ms, ...
    delayMs: (used: number) => {
      const excess = used - config.delayAfter;
      const delay = config.delayMs * Math.pow(1.5, excess - 1);
      return Math.min(delay, config.maxDelayMs);
    },
    
    // Skip health checks
    skip: (req) => req.path === '/health',
    
    // Key by IP (supports proxy)
    keyGenerator: (req) => {
      const forwarded = req.headers['x-forwarded-for'];
      if (typeof forwarded === 'string') {
        return forwarded.split(',')[0].trim();
      }
      return req.ip || 'unknown';
    },
    
    // Log when throttling starts
    onLimitReached: (req) => {
      const ip = req.ip || 'unknown';
      console.log(warnLog(`🐢 Throttling ${ip} - slowing responses`));
    },
  });
}

/**
 * Stricter throttle for expensive operations (LSP, GitHub)
 */
export function createStrictThrottleMiddleware() {
  return slowDown({
    windowMs: config.windowMs,
    delayAfter: Math.floor(config.delayAfter / 2), // Half the threshold
    
    delayMs: (used: number) => {
      const threshold = Math.floor(config.delayAfter / 2);
      const excess = used - threshold;
      const delay = config.delayMs * 2 * Math.pow(1.5, excess - 1);
      return Math.min(delay, config.maxDelayMs);
    },
    
    skip: (req) => req.path === '/health',
    
    keyGenerator: (req) => {
      const forwarded = req.headers['x-forwarded-for'];
      if (typeof forwarded === 'string') {
        return forwarded.split(',')[0].trim();
      }
      return req.ip || 'unknown';
    },
    
    onLimitReached: (req) => {
      const ip = req.ip || 'unknown';
      console.log(warnLog(`🐢 Strict throttling ${ip} for expensive operation`));
    },
  });
}
