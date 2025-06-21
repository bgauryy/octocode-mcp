import { ServerManager } from './utils/server-manager.js';
import { Logger } from './utils/logger.js';

/**
 * Octocode MCP Server - Optimized for Code Research & Analysis
 *
 * Research-focused features:
 * - Smart workflow chaining (NPM → GitHub → code analysis)
 * - Token-efficient responses for LLM consumption
 * - Quality-first defaults (stars >1000, focused limits)
 * - Comprehensive error handling with actionable guidance
 *
 * Architecture optimized for:
 * - Implementation discovery and analysis
 * - Architectural pattern research
 * - Bug investigation workflows
 * - Performance optimization studies
 */

async function main(): Promise<void> {
  try {
    // Initialize server manager
    const serverManager = new ServerManager();

    // Start the server
    await serverManager.start();
  } catch (error) {
    Logger.error('Critical error during server startup', error);
    process.exit(1);
  }
}

// Bootstrap the application
main().catch(error => {
  Logger.error('Unhandled error in main process', error);
  process.exit(1);
});
