/**
 * Vitest Setup File for octocode-shared
 *
 * Global mocks to prevent tests from accessing real system resources.
 * This file runs before all tests to ensure isolation.
 */

import { vi } from 'vitest';

// Reset all mocks before each test to ensure test isolation
// Note: We don't mock process globally because session tests need full process functionality
