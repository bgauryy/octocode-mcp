/**
 * Secure Environment Manager
 *
 * Filters dangerous environment variables from child processes to prevent
 * environment variable injection attacks and ensure secure process execution.
 *
 * This is a critical security component that prevents:
 * - Command injection via NODE_OPTIONS
 * - Library preloading attacks via LD_PRELOAD/DYLD_INSERT_LIBRARIES
 * - Shell manipulation via custom PS1/PS2
 * - Path manipulation attacks
 */

export class SecureEnvironmentManager {
  /**
   * Environment variables that can be dangerous if controlled by an attacker
   */
  private static readonly DANGEROUS_ENV_VARS = [
    // Node.js specific
    'NODE_OPTIONS', // Can inject --require malicious.js
    'NODE_PATH', // Can redirect module resolution
    'NODE_ENV', // Will be set to safe default

    // NPM specific
    'NPM_CONFIG_SCRIPT_SHELL', // Can change shell for npm scripts
    'NPM_CONFIG_CACHE', // Can redirect cache location
    'NPM_CONFIG_PREFIX', // Can change install location
    'NPM_CONFIG_AUDIT', // Will be set to safe default

    // Shell and process manipulation
    'SHELL', // Can change shell interpreter
    'PS1', // Can manipulate shell prompt
    'PS2', // Can manipulate shell prompt
    'IFS', // Can change field separator (injection risk)

    // Path manipulation
    'PATH_EXT', // Windows path extension manipulation
    'PATHEXT', // Windows executable extension manipulation

    // Library preloading (major security risk)
    'LD_PRELOAD', // Unix library preloading
    'LD_LIBRARY_PATH', // Unix library path manipulation
    'DYLD_INSERT_LIBRARIES', // macOS library injection
    'DYLD_LIBRARY_PATH', // macOS library path manipulation
    'DYLD_FRAMEWORK_PATH', // macOS framework path manipulation

    // Debugging and profiling (can expose sensitive info)
    'NODE_DEBUG', // Can enable debug output
    'UV_THREADPOOL_SIZE', // Can affect performance/DoS

    // Git specific (can affect git operations)
    'GIT_DIR', // Can redirect git directory
    'GIT_WORK_TREE', // Can change git working tree
    'GIT_CONFIG', // Can specify alternate git config
  ];

  /**
   * Get a secure environment object with dangerous variables filtered out
   * and safe defaults applied.
   *
   * @returns Filtered environment variables as Record<string, string>
   */
  public static getSecureEnv(): Record<string, string> {
    const filtered: Record<string, string> = {};

    // Copy all environment variables except dangerous ones
    for (const [key, value] of Object.entries(process.env)) {
      if (!this.DANGEROUS_ENV_VARS.includes(key) && value !== undefined) {
        // Ensure all values are strings (Node.js env vars should be strings)
        filtered[key] = String(value);
      }
    }

    // Apply safe defaults for critical variables
    filtered.NODE_ENV = 'production'; // Ensure production mode
    filtered.NPM_CONFIG_AUDIT = 'false'; // Disable audit for performance/security

    // Preserve essential variables that are safe
    if (process.env.HOME) {
      filtered.HOME = process.env.HOME;
    }
    if (process.env.USER) {
      filtered.USER = process.env.USER;
    }
    if (process.env.LANG) {
      filtered.LANG = process.env.LANG;
    }
    if (process.env.TZ) {
      filtered.TZ = process.env.TZ;
    }

    // Preserve GitHub-related variables (needed for functionality)
    if (process.env.GITHUB_TOKEN) {
      filtered.GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    }
    if (process.env.GH_TOKEN) {
      filtered.GH_TOKEN = process.env.GH_TOKEN;
    }

    return filtered;
  }

  /**
   * Check if an environment variable is considered dangerous
   *
   * @param varName - Environment variable name to check
   * @returns true if the variable is dangerous and should be filtered
   */
  public static isDangerousEnvVar(varName: string): boolean {
    return this.DANGEROUS_ENV_VARS.includes(varName);
  }

  /**
   * Get the list of dangerous environment variables (for testing/debugging)
   *
   * @returns Array of dangerous environment variable names
   */
  public static getDangerousEnvVars(): readonly string[] {
    return [...this.DANGEROUS_ENV_VARS];
  }
}
