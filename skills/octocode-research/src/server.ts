import express, { type Express, type Request, type Response } from 'express';
import type { Server } from 'http';
import { localRoutes } from './routes/local.js';
import { lspRoutes } from './routes/lsp.js';
import { githubRoutes } from './routes/github.js';
import { packageRoutes } from './routes/package.js';
import { toolsRoutes } from './routes/tools.js';
import { promptsRoutes } from './routes/prompts.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/logger.js';
import { stopContextCleanup } from './middleware/contextPropagation.js';
import { initialize, initializeProviders } from './index.js';
import { getLogsPath } from './utils/logger.js';
import { agentLog, successLog, errorLog, warnLog, dimLog } from './utils/colors.js';

const PORT = 1987;
let server: Server | null = null;

export async function createServer(): Promise<Express> {
  await initialize();
  await initializeProviders();
  
  const app = express();
  app.use(express.json());
  app.use(requestLogger);
  
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', port: PORT, version: '2.0.0' });
  });
  
  app.use('/local', localRoutes);
  app.use('/lsp', lspRoutes);
  app.use('/github', githubRoutes);
  app.use('/package', packageRoutes);
  app.use('/tools', toolsRoutes);
  app.use('/prompts', promptsRoutes);
  
  app.use(errorHandler);
  
  return app;
}

function gracefulShutdown(signal: string): void {
  // Agent messages in PURPLE
  console.log(agentLog(`\n🛑 Received ${signal}. Starting graceful shutdown...`));
  
  stopContextCleanup();
  console.log(successLog('✅ Context cleanup stopped'));
  
  if (server) {
    server.close((err) => {
      if (err) {
        console.error(errorLog('❌ Error closing server:'), err);
        process.exit(1);
      }
      console.log(successLog('✅ HTTP server closed'));
      process.exit(0);
    });
    
    setTimeout(() => {
      console.error(warnLog('⚠️ Forced shutdown after timeout'));
      process.exit(1);
    }, 10000);
  } else {
    process.exit(0);
  }
}

export async function startServer(): Promise<void> {
  const app = await createServer();
  
  await new Promise<void>((resolve) => {
    const httpServer = app.listen(PORT);
    server = httpServer;
    
    httpServer.on('listening', () => {
      // Agent startup messages in PURPLE
      console.log(agentLog(
        `🔍 Octocode Research Server running on http://localhost:${PORT}`
      ));
      console.log(agentLog(`📁 Logs: ${getLogsPath()}`));
      console.log(agentLog(`\nAvailable routes:`));
      
      // Routes in dim for secondary info
      console.log(dimLog(`  GET /health              - Server health check`));
      console.log(dimLog(`  GET /local/search        - Search code (ripgrep)`));
      console.log(dimLog(`  GET /local/content       - Read file content`));
      console.log(dimLog(`  GET /local/find          - Find files`));
      console.log(dimLog(`  GET /local/structure     - View directory tree`));
      console.log(dimLog(`  GET /lsp/definition      - Go to definition`));
      console.log(dimLog(`  GET /lsp/references      - Find references`));
      console.log(dimLog(`  GET /lsp/calls           - Call hierarchy`));
      console.log(dimLog(`  GET /github/search       - Search GitHub code`));
      console.log(dimLog(`  GET /github/content      - Read GitHub files`));
      console.log(dimLog(`  GET /github/repos        - Search repositories`));
      console.log(dimLog(`  GET /github/structure    - View repo structure`));
      console.log(dimLog(`  GET /github/prs          - Search pull requests`));
      console.log(dimLog(`  GET /package/search      - Search npm/PyPI`));
      console.log(dimLog(`  GET /tools/system        - System prompt (LOAD FIRST)`));
      console.log(dimLog(`  GET /tools/list          - List all tools (MCP format)`));
      console.log(dimLog(`  GET /tools/info          - List all tools`));
      console.log(dimLog(`  GET /tools/info/:name    - Get specific tool info`));
      console.log(dimLog(`  GET /prompts/list        - List all prompts (MCP format)`));
      console.log(dimLog(`  GET /prompts/info/:name  - Get specific prompt info`));
      
      resolve();
    });
  });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  startServer().catch((err) => {
    console.error(errorLog('❌ Failed to start server:'), err);
    process.exit(1);
  });
}
