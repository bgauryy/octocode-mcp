/**
 * ANSI color codes for terminal output
 * 
 * Color scheme:
 * - AGENT (purple): Server/agent messages, startup, shutdown
 * - RESULT (blue): Tool output, skill results
 */

export const colors = {
  // Reset
  reset: '\x1b[0m',
  
  // Agent messages - Purple/Magenta
  agent: '\x1b[35m',
  agentBright: '\x1b[95m',
  
  // Results/Tool output - Blue
  result: '\x1b[34m',
  resultBright: '\x1b[94m',
  
  // Status colors
  success: '\x1b[32m',  // Green
  error: '\x1b[31m',    // Red
  warn: '\x1b[33m',     // Yellow
  
  // Dim for secondary info
  dim: '\x1b[2m',
};

// Helper functions for consistent formatting
export function agentLog(message: string): string {
  return `${colors.agentBright}${message}${colors.reset}`;
}

export function resultLog(message: string): string {
  return `${colors.resultBright}${message}${colors.reset}`;
}

export function successLog(message: string): string {
  return `${colors.success}${message}${colors.reset}`;
}

export function errorLog(message: string): string {
  return `${colors.error}${message}${colors.reset}`;
}

export function warnLog(message: string): string {
  return `${colors.warn}${message}${colors.reset}`;
}

export function dimLog(message: string): string {
  return `${colors.dim}${message}${colors.reset}`;
}
