/**
 * Test setup and global configuration
 */

import { beforeAll, afterAll } from 'vitest';

beforeAll(() => {
  // Set up test environment
  process.env.DEBUG = 'false';
});

afterAll(() => {
  // Clean up
});
