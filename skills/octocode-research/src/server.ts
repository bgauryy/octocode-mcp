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
import { initializeProviders } from './index.js';
import { initializeMcpContent } from './mcpCache.js';
import { getLogsPath } from './utils/logger.js';
import { getAllCircuitStates } from './utils/circuitBreaker.js';
import { agentLog, successLog, errorLog, warnLog, dimLog } from './utils/colors.js';

const PORT = 1987;
let server: Server | null = null;

export async function createServer(): Promise<Express> {
  // Load mcpContent ONCE at startup (includes initialize())
  await initializeMcpContent();
  await initializeProviders();
  
  const app = express();
  app.use(express.json());
  app.use(requestLogger);
  
  app.get('/health', (_req: Request, res: Response) => {
    const memoryUsage = process.memoryUsage();
    res.json({
      status: 'ok',
      port: PORT,
      version: '2.0.0',
      uptime: Math.floor(process.uptime()),
      memory: {
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        rss: Math.round(memoryUsage.rss / 1024 / 1024),
      },
      circuits: getAllCircuitStates(),
    });
  });
  
  app.use('/', localRoutes);
  app.use('/', lspRoutes);
  app.use('/', githubRoutes);
  app.use('/', packageRoutes);
  app.use('/tools', toolsRoutes);
  app.use('/prompts', promptsRoutes);

  // 404 handler for undefined routes
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: {
        message: `Route not found: ${req.method} ${req.path}`,
        code: 'NOT_FOUND',
        availableRoutes: [
          '/health',
          '/localSearchCode',
          '/localGetFileContent',
          '/localFindFiles',
          '/localViewStructure',
          '/lspGotoDefinition',
          '/lspFindReferences',
          '/lspCallHierarchy',
          '/githubSearchCode',
          '/githubGetFileContent',
          '/githubSearchRepositories',
          '/githubViewRepoStructure',
          '/githubSearchPullRequests',
          '/packageSearch',
          '/tools/list',
          '/tools/system',
          '/prompts/list',
          '/prompts/info/:name',
        ],
      },
    });
  });

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
      console.log(dimLog(`  GET /localSearchCode         - Search code (ripgrep)`));
      console.log(dimLog(`  GET /localGetFileContent     - Read file content`));
      console.log(dimLog(`  GET /localFindFiles          - Find files`));
      console.log(dimLog(`  GET /localViewStructure      - View directory tree`));
      console.log(dimLog(`  GET /lspGotoDefinition       - Go to definition`));
      console.log(dimLog(`  GET /lspFindReferences       - Find references`));
      console.log(dimLog(`  GET /lspCallHierarchy        - Call hierarchy`));
      console.log(dimLog(`  GET /githubSearchCode        - Search GitHub code`));
      console.log(dimLog(`  GET /githubGetFileContent    - Read GitHub files`));
      console.log(dimLog(`  GET /githubSearchRepositories- Search repositories`));
      console.log(dimLog(`  GET /githubViewRepoStructure - View repo structure`));
      console.log(dimLog(`  GET /githubSearchPullRequests- Search pull requests`));
      console.log(dimLog(`  GET /packageSearch           - Search npm/PyPI`));
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
