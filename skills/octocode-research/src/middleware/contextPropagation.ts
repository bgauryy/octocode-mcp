import { agentLog } from '../utils/colors.js';
/**
 * Research context propagation middleware.
 *
 * Maintains research session context across chained HTTP calls.
 * Context flows via X-Research-Context header or _ctx query param.
 *
 * @module middleware/contextPropagation
 */

import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

/**
 * Research context that flows across tool calls
 */
export interface ResearchContext {
  /** Unique session identifier */
  sessionId: string;
  /** High-level research goal (truncated to 100 chars) */
  mainGoal: string;
  /** Last 5 tools called in this session */
  toolChain: string[];
  /** Session start timestamp */
  startTime: number;
  /** Last activity timestamp */
  lastActivity: number;
}

// Note: researchContext is added to Express Request type in src/types/express.d.ts

/**
 * In-memory context store (consider Redis for production)
 */
const contextStore = new Map<string, ResearchContext>();

/**
 * Context configuration
 */
/**
 * Context propagation configuration.
 * These values balance memory usage vs research session needs.
 */
const CONFIG = {
  // 30 minutes: Balances memory usage vs typical research session length.
  // Based on observation that most research chains complete within 20 mins.
  ttlMs: 30 * 60 * 1000,

  // 10 max chain length: Prevents infinite context accumulation.
  // Research rarely needs more than 10 related queries to find an answer.
  maxChainLength: 10,

  // 100 char max goal: Reasonable length for research goal descriptions.
  maxGoalLength: 100,

  // 5 minute cleanup: Frequent enough to prevent memory bloat,
  // infrequent enough to not impact performance.
  cleanupIntervalMs: 5 * 60 * 1000,
};

// Periodic cleanup of stale contexts
let cleanupInterval: NodeJS.Timeout | null = null;

/**
 * Start context cleanup timer
 */
export function startContextCleanup(): void {
  if (cleanupInterval) return;

  cleanupInterval = setInterval(() => {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, ctx] of contextStore) {
      if (now - ctx.lastActivity > CONFIG.ttlMs) {
        contextStore.delete(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(agentLog(`🧹 Cleaned ${cleaned} stale research contexts`));
    }
  }, CONFIG.cleanupIntervalMs);
}

/**
 * Stop context cleanup timer
 */
export function stopContextCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

/**
 * Create a new research context
 */
function createContext(req: Request): ResearchContext {
  const mainGoal =
    (req.query.mainResearchGoal as string) ||
    (req.query.mainGoal as string) ||
    'Research session';

  return {
    sessionId: crypto.randomUUID(),
    mainGoal: mainGoal.slice(0, CONFIG.maxGoalLength),
    toolChain: [extractToolName(req.path)],
    startTime: Date.now(),
    lastActivity: Date.now(),
  };
}

/**
 * Encode context to base64url token
 */
function encodeContext(ctx: ResearchContext): string {
  const payload = {
    s: ctx.sessionId,
    g: ctx.mainGoal,
    c: ctx.toolChain.slice(-5), // Only include last 5
  };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

/**
 * Decode context from base64url token
 */
function decodeContextToken(
  token: string
): { sessionId: string; mainGoal: string; toolChain: string[] } | null {
  try {
    const payload = JSON.parse(Buffer.from(token, 'base64url').toString());
    return {
      sessionId: payload.s,
      mainGoal: payload.g || '',
      toolChain: payload.c || [],
    };
  } catch {
    return null;
  }
}

/**
 * Extract tool name from request path
 */
function extractToolName(path: string): string {
  const parts = path.split('/').filter(Boolean);
  if (parts.length >= 2) {
    return parts[0] + parts[1].charAt(0).toUpperCase() + parts[1].slice(1);
  }
  return parts.join('/') || 'unknown';
}

/**
 * Context propagation middleware.
 *
 * Extracts context from incoming requests and attaches to response.
 */
export function contextPropagation(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Skip health checks
  if (req.path === '/health') {
    return next();
  }

  // Try to get existing context
  const ctxToken =
    (req.query._ctx as string) ||
    (req.headers['x-research-context'] as string);

  let context: ResearchContext;

  if (ctxToken) {
    const decoded = decodeContextToken(ctxToken);

    if (decoded && contextStore.has(decoded.sessionId)) {
      // Existing session - update context
      context = contextStore.get(decoded.sessionId)!;
      context.lastActivity = Date.now();

      // Update tool chain
      const currentTool = extractToolName(req.path);
      context.toolChain.push(currentTool);
      if (context.toolChain.length > CONFIG.maxChainLength) {
        context.toolChain.shift();
      }
    } else if (decoded) {
      // Token exists but session expired - recreate with same ID
      context = {
        sessionId: decoded.sessionId,
        mainGoal: decoded.mainGoal || (req.query.mainResearchGoal as string) || 'Research session',
        toolChain: [...(decoded.toolChain || []), extractToolName(req.path)],
        startTime: Date.now(),
        lastActivity: Date.now(),
      };
    } else {
      // Invalid token - create new context
      context = createContext(req);
    }
  } else {
    // No context token - create new context
    context = createContext(req);
  }

  // Store context
  contextStore.set(context.sessionId, context);

  // Attach to request
  req.researchContext = context;

  // Add context token to response headers
  const responseToken = encodeContext(context);
  res.setHeader('X-Research-Context', responseToken);

  // Also add session ID for easy access
  res.setHeader('X-Research-Session', context.sessionId);

  next();
}

/**
 * Get current context for a session
 */
export function getContext(sessionId: string): ResearchContext | undefined {
  return contextStore.get(sessionId);
}

/**
 * Get hints based on current context
 */
export function getContextualHints(ctx: ResearchContext | undefined): string[] {
  if (!ctx) return [];

  const hints: string[] = [];
  const { toolChain, mainGoal } = ctx;

  // Detect flow question without LSP calls
  if (
    mainGoal.match(/flow|trace|call|chain|how\s+does/i) &&
    !toolChain.some((t) => t.includes('lsp'))
  ) {
    hints.push(
      '⚠️ Flow question detected but no LSP tools used - consider /lsp/calls'
    );
  }

  // Detect LSP without prior search
  const lspIndex = toolChain.findIndex((t) => t.startsWith('lsp'));
  const searchIndex = toolChain.findIndex((t) => t.includes('Search'));
  if (lspIndex !== -1 && (searchIndex === -1 || searchIndex > lspIndex)) {
    hints.push(
      '⚠️ LSP tool called before search - lineHint may be inaccurate'
    );
  }

  // Detect tool loops
  const lastThree = toolChain.slice(-3);
  if (lastThree.length === 3 && lastThree.every((t) => t === lastThree[0])) {
    hints.push(
      `⚠️ Same tool (${lastThree[0]}) called 3x in a row - consider different approach`
    );
  }

  // Session duration hint
  const durationMs = Date.now() - ctx.startTime;
  if (durationMs > 5 * 60 * 1000) {
    // 5 minutes
    hints.push(
      `ℹ️ Research session active for ${Math.floor(durationMs / 60000)} minutes`
    );
  }

  return hints;
}

/**
 * Get all active sessions (for debug/health)
 */
export function getActiveSessions(): Array<{
  sessionId: string;
  mainGoal: string;
  toolCount: number;
  durationMs: number;
}> {
  return Array.from(contextStore.values()).map((ctx) => ({
    sessionId: ctx.sessionId,
    mainGoal: ctx.mainGoal,
    toolCount: ctx.toolChain.length,
    durationMs: Date.now() - ctx.startTime,
  }));
}

/**
 * Clear all contexts (for testing)
 */
export function clearAllContexts(): void {
  contextStore.clear();
}

// Start cleanup on module load
startContextCleanup();
