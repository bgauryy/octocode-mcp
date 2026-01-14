import type { Request, Response, NextFunction } from 'express';
import { logToolCall } from '../utils/logger.js';

export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    const statusIcon = status >= 400 ? '❌' : '✅';
    const success = status < 400;

    // Console output for immediate feedback
    console.log(`${statusIcon} ${req.method} ${req.path} ${status} ${duration}ms`);

    // Persist to ~/.octocode/logs/tools.log (skip health checks)
    if (req.path !== '/health') {
      logToolCall({
        tool: extractToolName(req.path),
        route: req.path,
        method: req.method,
        params: req.query as Record<string, unknown>,
        duration,
        success,
        error: success ? undefined : `HTTP ${status}`,
      });
    }
  });

  next();
}

/**
 * Extract tool name from request path.
 * /local/search -> localSearch
 * /github/content -> githubContent
 */
function extractToolName(path: string): string {
  const parts = path.split('/').filter(Boolean);
  if (parts.length >= 2) {
    return parts[0] + parts[1].charAt(0).toUpperCase() + parts[1].slice(1);
  }
  return parts.join('/') || 'unknown';
}
