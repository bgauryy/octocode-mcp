/**
 * OAuth Error Handler Utility
 *
 * Provides enhanced error handling for OAuth operations with specific
 * error messages and hints for different failure scenarios.
 */

export interface OAuthErrorResult {
  error: string;
  hints: string[];
}

/**
 * Enhanced error handling for OAuth operations
 * Analyzes error messages and provides specific error messages and hints
 */
export function handleOAuthError(error: unknown): OAuthErrorResult {
  const errorMessage = error instanceof Error ? error.message : String(error);

  // Enhanced error handling for specific scenarios
  let specificError = '';
  let customHints: string[] = [];

  if (
    errorMessage.includes('Network timeout') ||
    errorMessage.includes('ETIMEDOUT')
  ) {
    specificError = 'Network timeout occurred during OAuth flow';
    customHints = [
      'Check your internet connection',
      'Try again in a few moments',
      'Verify GitHub is accessible from your network',
    ];
  } else if (
    errorMessage.includes('ENOTFOUND') ||
    errorMessage.includes('DNS resolution failed')
  ) {
    specificError = 'DNS resolution failed - cannot reach GitHub servers';
    customHints = [
      'Check your DNS settings',
      'Verify internet connectivity',
      'Try using a different DNS server',
    ];
  } else if (
    errorMessage.includes('ECONNREFUSED') ||
    errorMessage.includes('Connection refused')
  ) {
    specificError = 'Connection refused by GitHub servers';
    customHints = [
      'GitHub servers may be unavailable',
      'Check GitHub status at status.github.com',
      'Try again later',
    ];
  } else if (
    errorMessage.includes('certificate') ||
    errorMessage.includes('SSL') ||
    errorMessage.includes(
      'tunneling socket could not be established, statusCode=407'
    )
  ) {
    specificError = 'SSL certificate verification failed';
    customHints = [
      'Check your system certificates',
      'Corporate firewall or proxy may be interfering',
      'Contact your network administrator',
    ];
  } else if (errorMessage.includes('Proxy authentication required')) {
    specificError = 'Proxy authentication required';
    customHints = [
      'Configure proxy authentication',
      'Check proxy settings',
      'Contact network administrator',
    ];
  } else if (errorMessage.includes('invalid_client')) {
    specificError = 'Invalid client credentials provided';
    customHints = [
      'Check GITHUB_OAUTH_CLIENT_ID environment variable',
      'Check GITHUB_OAUTH_CLIENT_SECRET environment variable',
      'Verify OAuth app configuration on GitHub',
    ];
  } else if (
    errorMessage.includes('invalid_grant') &&
    (errorMessage.includes('Refresh token expired') ||
      errorMessage.includes('refresh token expired'))
  ) {
    specificError = 'OAuth refresh token expired';
    customHints = [
      'Re-authenticate required',
      'Use simpleOAuth authenticate',
      'Start new OAuth flow',
    ];
  } else if (errorMessage.includes('invalid_grant')) {
    specificError = 'Invalid authorization code or grant';
    customHints = [
      'Code may have expired (10 minute limit)',
      'Code may have already been used',
      'Start OAuth flow again',
    ];
  } else if (errorMessage.includes('redirect_uri_mismatch')) {
    specificError = 'Redirect URI mismatch in OAuth configuration';
    customHints = [
      'Check GITHUB_OAUTH_REDIRECT_URI environment variable',
      'Update OAuth app configuration on GitHub',
      'Ensure redirect URI matches exactly',
    ];
  } else if (errorMessage.includes('invalid_scope')) {
    specificError = 'Invalid OAuth scope requested';
    customHints = [
      'Check requested scopes are valid',
      'Verify OAuth app has required permissions',
      'Use standard scopes: repo, read:user, read:org',
      'Check OAuth app permissions',
    ];
  } else if (
    errorMessage.includes('rate limit') ||
    errorMessage.includes('too many')
  ) {
    if (errorMessage.includes('token requests')) {
      specificError = 'OAuth rate limit exceeded';
      customHints = [
        'Too many token requests in short period',
        'Wait before retrying',
        'Consider using GitHub App authentication for higher limits',
      ];
    } else {
      specificError = 'API rate limit exceeded';
      customHints = [
        'GitHub API rate limit reached',
        'Wait for rate limit reset',
        'Use authentication for higher limits',
      ];
    }
  } else if (
    errorMessage.includes('Rate limit exceeded') &&
    errorMessage.includes('1000 requests per hour')
  ) {
    specificError = 'Internal rate limit exceeded';
    customHints = [
      'Rate limit exceeded: 1000 requests per hour',
      'Wait for rate limit reset',
      'Try again after rate limit window',
    ];
  } else if (errorMessage.includes('heap out of memory')) {
    specificError = 'Memory exhaustion during OAuth operation';
    customHints = [
      'System running low on memory',
      'Close other applications',
      'Contact administrator if problem persists',
    ];
  } else if (errorMessage.includes('Polling too frequently')) {
    specificError = 'Device flow polling rate limit exceeded';
    customHints = [
      'Polling too frequently for device flow',
      'Slow down polling interval',
      'Wait longer between requests',
    ];
  } else if (
    errorMessage.includes('expired') &&
    errorMessage.includes('15 minutes')
  ) {
    specificError =
      'Device flow expired - user did not authorize within time limit';
    customHints = [
      'User did not authorize within 15 minutes',
      'Start new device flow',
      'Complete authorization more quickly',
    ];
  } else if (
    errorMessage.includes('State parameter validation failed') ||
    errorMessage.includes('CSRF')
  ) {
    specificError =
      'State parameter validation failed - possible security issue';
    customHints = [
      'Possible CSRF attack detected',
      'State parameter mismatch',
      'Start OAuth flow again',
    ];
  } else if (errorMessage.includes('PKCE verification failed')) {
    specificError = 'PKCE verification failed - possible security issue';
    customHints = [
      'Authorization code may have been intercepted',
      'PKCE code challenge verification failed',
      'Start OAuth flow again',
    ];
  } else if (
    errorMessage.includes('Invalid response format') ||
    errorMessage.includes('JSON') ||
    errorMessage.includes('Unexpected token')
  ) {
    specificError = 'Invalid response format from GitHub';
    customHints = [
      'GitHub API may be experiencing issues',
      'Malformed JSON response received',
      'Try again later',
    ];
  } else if (
    errorMessage.includes('Missing required fields') ||
    errorMessage.includes('The "data" argument must be')
  ) {
    specificError = 'Invalid token response - missing required fields';
    customHints = [
      'GitHub API returned incomplete response',
      'Missing required fields in token response',
      'Contact support if problem persists',
    ];
  } else if (
    errorMessage.includes('Corrupted state data') ||
    errorMessage.includes('Invalid time value')
  ) {
    specificError = 'OAuth state data corruption detected';
    customHints = [
      'Start OAuth flow again',
      'Clear browser cache and cookies',
      'Check for data corruption issues',
    ];
  } else if (errorMessage.includes('Callback timeout')) {
    specificError = 'OAuth callback server timeout';
    customHints = [
      'User did not complete authorization in time',
      'Callback server timed out waiting',
      'Try OAuth flow again',
    ];
  } else if (
    errorMessage.includes('Max retries exceeded') ||
    errorMessage.includes('Temporary server error')
  ) {
    specificError = 'Maximum retry attempts exceeded';
    customHints = [
      'Persistent server issues detected',
      'All retry attempts failed',
      'Contact support for assistance',
    ];
  } else if (errorMessage.includes('Invalid input detected')) {
    specificError = 'Security validation failed - invalid input detected';
    customHints = [
      'Potential security violation in input',
      'Input contains suspicious patterns',
      'Use proper OAuth flow parameters',
    ];
  } else if (errorMessage.includes('Invalid or expired OAuth state')) {
    specificError = 'OAuth state validation failed';
    customHints = [
      'State may have already been used',
      'State may have expired',
      'Possible replay attack detected',
    ];
  } else if (errorMessage.includes('Token has been revoked')) {
    specificError = 'OAuth token has been revoked';
    customHints = [
      'Token has been revoked by user or admin',
      'Re-authenticate to continue',
      'Check OAuth app permissions',
    ];
  } else if (
    errorMessage.includes('Refresh token expired') ||
    errorMessage.includes('refresh token expired')
  ) {
    specificError = 'OAuth refresh token expired';
    customHints = [
      'Re-authenticate required',
      'Use simpleOAuth authenticate',
      'Start new OAuth flow',
    ];
  } else if (errorMessage.includes('insufficient_scope')) {
    specificError = 'Insufficient OAuth scopes for requested operation';
    customHints = [
      'Token lacks required permissions',
      'Re-authenticate with broader scopes',
      'Check OAuth app scope configuration',
    ];
  } else if (
    errorMessage.includes('Service unavailable') ||
    errorMessage.includes('503')
  ) {
    specificError = 'GitHub service temporarily unavailable';
    customHints = [
      'GitHub API is temporarily unavailable',
      'Check GitHub status page',
      'Try again in a few minutes',
    ];
  } else if (errorMessage.includes('OAuth not configured')) {
    specificError = 'OAuth configuration missing';
    customHints = [
      'OAuth requires client credentials',
      'Set GITHUB_OAUTH_CLIENT_ID environment variable',
      'Set GITHUB_OAUTH_CLIENT_SECRET environment variable',
      'Get credentials from github.com/settings/developers',
    ];
  } else {
    specificError = `Failed to complete OAuth flow: ${errorMessage}`;
    customHints = [
      'Ensure code and state parameters are correct from GitHub callback',
      'State may have expired (15 minute limit) - start new OAuth flow',
      'Check that OAuth application configuration matches',
      'Verify network connectivity to GitHub',
    ];
  }

  return {
    error: specificError,
    hints: customHints,
  };
}
