/**
 * Zod schemas for LSP configuration file validation.
 *
 * Validates parsed JSON from lsp-servers.json config files
 * before type-asserting to LSPConfigFile.
 */

import { z } from 'zod';

/**
 * Schema for user-defined language server configuration.
 */
const UserLanguageServerConfigSchema = z
  .object({
    command: z.string().optional(),
    args: z.array(z.string()).optional(),
    initializationOptions: z.record(z.unknown()).optional(),
  })
  .passthrough();

/**
 * Schema for the LSP config file (lsp-servers.json).
 */
export const LSPConfigFileSchema = z
  .object({
    languageServers: z
      .record(z.string(), UserLanguageServerConfigSchema)
      .optional(),
  })
  .passthrough();
