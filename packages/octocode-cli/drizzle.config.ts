/**
 * Drizzle Kit Configuration
 *
 * Configuration for database migrations and schema management.
 * Run migrations with: npx drizzle-kit generate
 */

import type { Config } from 'drizzle-kit';
import { join } from 'node:path';
import { homedir } from 'node:os';

export default {
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: join(homedir(), '.octocode', 'sessions.db'),
  },
  verbose: true,
  strict: true,
} satisfies Config;
