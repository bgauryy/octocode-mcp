import express, { type Express, type Request, type Response } from 'express';
import { localRoutes } from './routes/local.js';
import { lspRoutes } from './routes/lsp.js';
import { githubRoutes } from './routes/github.js';
import { packageRoutes } from './routes/package.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/logger.js';
import { initialize } from './index.js';
import { getLogsPath } from './utils/logger.js';

const PORT = 1987;

export async function createServer(): Promise<Express> {
  // Initialize GitHub token resolution
  await initialize();

  const app = express();

  // Middleware
  app.use(express.json());
  app.use(requestLogger);

  // Health check
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', port: PORT, version: '2.0.0' });
  });

  // Routes
  app.use('/local', localRoutes);
  app.use('/lsp', lspRoutes);
  app.use('/github', githubRoutes);
  app.use('/package', packageRoutes);

  // Error handling
  app.use(errorHandler);

  return app;
}

export async function startServer(): Promise<void> {
  const app = await createServer();
  app.listen(PORT, () => {
    console.log(
      `🔍 Octocode Research Server running on http://localhost:${PORT}`
    );
    console.log(`📁 Logs: ${getLogsPath()}`);
    console.log(`\nAvailable routes:`);
    console.log(`  GET /health              - Server health check`);
    console.log(`  GET /local/search        - Search code (ripgrep)`);
    console.log(`  GET /local/content       - Read file content`);
    console.log(`  GET /local/find          - Find files`);
    console.log(`  GET /local/structure     - View directory tree`);
    console.log(`  GET /lsp/definition      - Go to definition`);
    console.log(`  GET /lsp/references      - Find references`);
    console.log(`  GET /lsp/calls           - Call hierarchy`);
    console.log(`  GET /github/search       - Search GitHub code`);
    console.log(`  GET /github/content      - Read GitHub files`);
    console.log(`  GET /github/repos        - Search repositories`);
    console.log(`  GET /github/structure    - View repo structure`);
    console.log(`  GET /github/prs          - Search pull requests`);
    console.log(`  GET /package/search      - Search npm/PyPI`);
  });
}

// Start if run directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  startServer().catch(console.error);
}
