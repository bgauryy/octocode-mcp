import express, { type Express, type Request, type Response } from 'express';
import type { Server } from 'http';
import { toolsRoutes } from './routes/tools.js';
import { promptsRoutes } from './routes/prompts.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/logger.js';
import { initializeProviders, initializeSession, logSessionInit } from './index.js';
import { initializeMcpContent, isMcpInitialized } from './mcpCache.js';
import { getLogsPath, initializeLogger } from './utils/logger.js';
import { getAllCircuitStates, clearAllCircuits, stopCircuitCleanup } from './utils/circuitBreaker.js';
import { agentLog, successLog, errorLog, warnLog, dimLog } from './utils/colors.js';
import { fireAndForgetWithTimeout } from './utils/asyncTimeout.js';
import { errorQueue } from './utils/errorQueue.js';

const PORT = 1987;
const MAX_IDLE_TIME_MS = 3600000; // 1 hour
const IDLE_CHECK_INTERVAL_MS = 300000; // Check every 5 minutes
let server: Server | null = null;
let lastRequestTime = Date.now();
let idleCheckInterval: ReturnType<typeof setInterval> | null = null;

export async function createServer(): Promise<Express> {
  // Initialize logger first (sync for startup, async after)
  initializeLogger();
  
  // Initialize session for telemetry tracking
  initializeSession();

  const app = express();
  app.use(express.json());
  
  // Reset idle timer on every request
  app.use((_req: Request, _res: Response, next: () => void) => {
    lastRequestTime = Date.now();
    next();
  });
  
  app.use(requestLogger);
  
  app.get('/health', (_req: Request, res: Response) => {
    const memoryUsage = process.memoryUsage();
    const recentErrors = errorQueue.getRecent(5);
    const initialized = isMcpInitialized();
    // Note: lastRequestTime was just reset by the middleware, so we show ~0 for current request
    // This is expected - idle time is reset on every request including health checks

    res.json({
      status: initialized ? 'ok' : 'initializing',
      port: PORT,
      version: '2.0.0',
      uptime: Math.floor(process.uptime()),
      idleTimeMs: 0, // Just received this request, so idle time is ~0
      maxIdleTimeMs: MAX_IDLE_TIME_MS,
      idleCheckIntervalMs: IDLE_CHECK_INTERVAL_MS,
      memory: {
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        rss: Math.round(memoryUsage.rss / 1024 / 1024),
      },
      circuits: getAllCircuitStates(),
      errors: {
        queueSize: errorQueue.size,
        recentErrors: recentErrors.map((e) => ({
          timestamp: e.timestamp.toISOString(),
          context: e.context,
          message: e.error.message,
        })),
      },
    });
  });
  
  // All tool execution via /tools/call/:toolName (readiness check applied in route files)
  app.use('/tools', toolsRoutes);
  app.use('/prompts', promptsRoutes);

  // 404 handler for undefined routes
  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: {
        message: 'Route not found',
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

function checkIdleRestart(): void {
  const idleTime = Date.now() - lastRequestTime;
  const idleMinutes = Math.floor(idleTime / 60000);
  
  if (idleTime > MAX_IDLE_TIME_MS) {
    console.log(warnLog(`⚠️ Server idle for ${idleMinutes}m (>${MAX_IDLE_TIME_MS / 60000}m). Initiating automatic restart...`));
    
    // Clean shutdown and restart
    fireAndForgetWithTimeout(
      async () => {
        console.log(agentLog('🔄 Performing automatic idle restart...'));
        gracefulShutdown('IDLE_TIMEOUT');
      },
      100,
      'idleAutoRestart'
    );
  } else if (idleTime > MAX_IDLE_TIME_MS / 2) {
    // Log warning at 50% idle threshold
    console.log(dimLog(`⏰ Idle time: ${idleMinutes}m / ${MAX_IDLE_TIME_MS / 60000}m`));
  }
}

function startIdleCheck(): void {
  if (idleCheckInterval) {
    clearInterval(idleCheckInterval);
  }
  
  idleCheckInterval = setInterval(checkIdleRestart, IDLE_CHECK_INTERVAL_MS);
  console.log(dimLog(`⏰ Idle check enabled: restart after ${MAX_IDLE_TIME_MS / 60000}m of inactivity`));
}

function stopIdleCheck(): void {
  if (idleCheckInterval) {
    clearInterval(idleCheckInterval);
    idleCheckInterval = null;
    console.log(successLog('✅ Idle check interval stopped'));
  }
}

function gracefulShutdown(signal: string): void {
  // Agent messages in PURPLE
  console.log(agentLog(`\n🛑 Received ${signal}. Starting graceful shutdown...`));

  // Stop idle check interval first
  stopIdleCheck();

  // Stop periodic cleanup interval
  stopCircuitCleanup();
  console.log(successLog('✅ Circuit cleanup interval stopped'));

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
      console.log(agentLog(`🔍 Octocode Research Server running on http://localhost:${PORT}`));
      console.log(dimLog(`⏳ initializing context...`));
      
      // Start background initialization (Warm Start)
      initializeMcpContent()
        .then(() => initializeProviders())
        .then(() => {
          console.log(successLog('✅ Context initialized - Server Ready'));
          console.log(agentLog(`📁 Logs: ${getLogsPath()}`));
          console.log(agentLog(`\nRoutes:`));
          console.log(dimLog(`  GET  /health                  - Server health`));
          console.log(dimLog(`  GET  /tools/system            - System prompt (LOAD FIRST)`));
          console.log(dimLog(`  GET  /tools/list              - List all tools`));
          console.log(dimLog(`  GET  /tools/info/:toolName    - Tool schema (BEFORE calling)`));
          console.log(dimLog(`  POST /tools/call/:toolName    - Execute tool`));
          console.log(dimLog(`  GET  /prompts/list            - List prompts`));
          console.log(dimLog(`  GET  /prompts/info/:name      - Get prompt content`));

          // Start idle check after initialization
          startIdleCheck();

          // Log session initialization after server is ready
          fireAndForgetWithTimeout(
            () => logSessionInit(),
            5000,
            'logSessionInit'
          );
        })
        .catch((err) => {
          console.error(errorLog('❌ Initialization failed:'), err);
        });

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
