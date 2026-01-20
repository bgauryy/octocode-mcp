/**
 * PM2 Ecosystem Configuration for Octocode Research Server
 * 
 * @version 2.2.0
 * 
 * Restart Strategy:
 * - Idle-based restart: Server self-restarts after 30 minutes of inactivity (handled in server.ts)
 * - Memory guard: PM2 restarts if memory exceeds 500MB (safety net)
 * - NO cron restart: Removed in favor of idle-based restart
 * 
 * @see docs/SERVER_FLOWS.md for detailed flow documentation
 * @see docs/IDLE_RESTART_PLAN.md for implementation plan
 */

// PM2 logs disabled - app handles all logging with rotation

module.exports = {
  apps: [{
    name: 'octocode-research',
    script: './scripts/server.js',
    
    // ============================================
    // RESTART STRATEGIES
    // ============================================
    
    // ❌ REMOVED: cron_restart: '0 * * * *'
    // Replaced by idle-based restart in server.ts (30 min idle → restart)
    
    // ✅ Memory guard (PM2 safety net)
    max_memory_restart: '500M',
    
    // ============================================
    // GRACEFUL SHUTDOWN
    // ============================================
    
    // Allow 2 minutes for connection draining during shutdown
    // This gives long-running requests time to complete
    kill_timeout: 120000,
    
    // Wait for process.send('ready') before marking as online
    wait_ready: true,
    
    // Timeout for ready signal (15s for MCP initialization)
    listen_timeout: 15000,
    
    // ============================================
    // RESTART BEHAVIOR
    // ============================================
    
    // Auto-restart on crash
    autorestart: true,
    
    // Max consecutive restarts before stopping
    max_restarts: 10,
    
    // Delay between restarts
    restart_delay: 1000,
    
    // Exponential backoff on repeated crashes
    exp_backoff_restart_delay: 100,
    
    // Minimum uptime to consider app started successfully
    min_uptime: 5000,
    
    // ============================================
    // LOGGING
    // ============================================
    
    // PM2 logs disabled - app handles logging in ~/.octocode/logs/
    out_file: '/dev/null',
    error_file: '/dev/null',
    merge_logs: true,
    combine_logs: true,
    
    // ============================================
    // ENVIRONMENT
    // ============================================
    
    // Node.js environment
    env: {
      NODE_ENV: 'production',
    },
    
    // Development environment (pm2 start --env development)
    env_development: {
      NODE_ENV: 'development',
    },
  }]
};
