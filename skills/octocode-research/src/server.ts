import express, { type Express, type Request, type Response } from 'express';
import type { Server } from 'http';
import { toolsRoutes } from './routes/tools.js';
import { promptsRoutes } from './routes/prompts.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/logger.js';
import { stopContextCleanup } from './middleware/contextPropagation.js';
import { createThrottleMiddleware, getThrottleConfig } from './middleware/throttle.js';
import { initializeProviders, initializeSession, logSessionInit } from './index.js';
import { initializeMcpContent } from './mcpCache.js';
import { getLogsPath, initializeLogger } from './utils/logger.js';
import { getAllCircuitStates, clearAllCircuits } from './utils/circuitBreaker.js';
import { agentLog, successLog, errorLog, warnLog, dimLog } from './utils/colors.js';

const PORT = 1987;
let server: Server | null = null;

export async function createServer(): Promise<Express> {
  // Initialize logger first (sync for startup, async after)
  initializeLogger();
  
  // Load mcpContent ONCE at startup (includes initialize())
  await initializeMcpContent();
  await initializeProviders();

  // Initialize session for telemetry tracking
  initializeSession();

  const app = express();
  app.use(express.json());
  
  // Throttling: gradually slow down high-frequency requests
  app.use(createThrottleMiddleware());
  
  app.use(requestLogger);
  
  app.get('/health', (_req: Request, res: Response) => {
    const memoryUsage = process.memoryUsage();
    const throttleConfig = getThrottleConfig();
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
      throttle: {
        windowMs: throttleConfig.windowMs,
        delayAfter: throttleConfig.delayAfter,
        maxDelayMs: throttleConfig.maxDelayMs,
      },
      circuits: getAllCircuitStates(),
    });
  });
  
  // All tool execution via /tools/call/:toolName
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
          'GET  /health',
          'GET  /tools/list',
          'GET  /tools/info/:toolName',
          'GET  /tools/system',
          'POST /tools/call/:toolName',
          'GET  /prompts/list',
          'GET  /prompts/info/:promptName',
        ],
        hint: 'All tools are called via POST /tools/call/{toolName}',
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
  
  clearAllCircuits();
  console.log(successLog('✅ Circuit breakers cleared'));
  
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
      const throttle = getThrottleConfig();
      console.log(agentLog(`🔍 Octocode Research Server running on http://localhost:${PORT}`));
      console.log(agentLog(`📁 Logs: ${getLogsPath()}`));
      console.log(agentLog(`🐢 Throttle: ${throttle.delayAfter} req/min before slowdown (max ${throttle.maxDelayMs/1000}s delay)`));
      console.log(agentLog(`\nRoutes:`));
      console.log(dimLog(`  GET  /health                  - Server health`));
      console.log(dimLog(`  GET  /tools/system            - System prompt (LOAD FIRST)`));
      console.log(dimLog(`  GET  /tools/list              - List all tools`));
      console.log(dimLog(`  GET  /tools/info/:toolName    - Tool schema (BEFORE calling)`));
      console.log(dimLog(`  POST /tools/call/:toolName    - Execute tool`));
      console.log(dimLog(`  GET  /prompts/list            - List prompts`));
      console.log(dimLog(`  GET  /prompts/info/:name      - Get prompt content`));

      // Log session initialization after server is ready
      logSessionInit().catch(() => {});

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
