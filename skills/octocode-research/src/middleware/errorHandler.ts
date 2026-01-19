import type { Request, Response, NextFunction } from 'express';
import type { z } from 'zod';
import { logError, logWarn, sanitizeQueryParams } from '../utils/logger.js';
import { logSessionError } from '../index.js';
import { errorQueue } from '../utils/errorQueue.js';

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
  details?: z.ZodIssue[];
}

export function errorHandler(
  error: ApiError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = error.statusCode ?? 500;
  const isValidationError = statusCode === 400;

  // Log with appropriate level - now persisted to ~/.octocode/logs/errors.log
  if (isValidationError) {
    logWarn(`[VALIDATION] ${req.method} ${req.path}: ${error.message}`, {
      path: req.path,
      query: sanitizeQueryParams(req.query as Record<string, unknown>),
      details: error.details,
    });
  } else {
    logError(`[SERVER] ${req.method} ${req.path}: ${error.message}`, error);
  }

  // Log error to session telemetry
  // Extract tool name from path if it's a tool call (e.g., /tools/call/localSearchCode)
  const toolCallMatch = req.path.match(/^\/tools\/call\/(\w+)$/);
  const toolName = toolCallMatch ? toolCallMatch[1] : 'unknown';
  const errorCode = error.code ?? (isValidationError ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR');
  logSessionError(toolName, errorCode).catch(err => errorQueue.push(err, 'logSessionError'));

  const response: {
    success: false;
    error: {
      message: string;
      code: string;
      details?: z.ZodIssue[];
    };
  } = {
    success: false,
    error: {
      message: error.message,
      code: error.code ?? 'INTERNAL_ERROR',
    },
  };

  // Include validation details for 400 errors
  if (isValidationError && error.details) {
    response.error.details = error.details;
  }

  res.status(statusCode).json(response);
}
