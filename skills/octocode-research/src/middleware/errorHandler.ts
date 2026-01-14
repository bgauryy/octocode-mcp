import type { Request, Response, NextFunction } from 'express';
import type { z } from 'zod';
import { logError, logWarn } from '../utils/logger.js';

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
      query: req.query,
      details: error.details,
    });
  } else {
    logError(`[SERVER] ${req.method} ${req.path}: ${error.message}`, error);
  }

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
