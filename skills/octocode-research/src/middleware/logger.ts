import type { Request, Response, NextFunction } from 'express';
import { logToolCall } from '../utils/logger.js';
import { resultLog } from '../utils/colors.js';

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
    
    // Results output in BLUE
    const resultMessage = `${statusIcon} ${req.method} ${req.path} ${status} ${duration}ms`;
    console.log(resultLog(resultMessage));
    
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

function extractToolName(path: string): string {
  const parts = path.split('/').filter(Boolean);
  if (parts.length >= 2) {
    return parts[0] + parts[1].charAt(0).toUpperCase() + parts[1].slice(1);
  }
  return parts.join('/') || 'unknown';
}
