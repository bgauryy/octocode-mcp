/**
 * OAuth Callback Server
 *
 * Provides a temporary local HTTP server for handling OAuth callbacks.
 * Integrates with existing OAuthManager and supports multiple callback methods.
 */

import { createServer, Server, IncomingMessage, ServerResponse } from 'http';
import { URL } from 'url';

export interface CallbackServerOptions {
  port?: number;
  timeout?: number;
  hostname?: string;
}

export interface CallbackResult {
  code: string;
  state: string;
  error?: string;
  error_description?: string;
}

export class OAuthCallbackServer {
  private server: Server | null = null;
  private port: number;
  private hostname: string;
  private timeout: number;
  private isListening = false;

  private callbackResolve: ((result: CallbackResult) => void) | null = null;
  private callbackReject: ((error: Error) => void) | null = null;
  private timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  constructor(options: CallbackServerOptions = {}) {
    this.port = options.port || 8765;
    this.hostname = options.hostname || '127.0.0.1';
    this.timeout = options.timeout || 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Start the callback server and wait for OAuth callback
   */
  async startAndWaitForCallback(): Promise<CallbackResult> {
    if (this.isListening) {
      throw new Error('Callback server is already running');
    }

    return new Promise<CallbackResult>((resolve, reject) => {
      this.callbackResolve = resolve;
      this.callbackReject = reject;

      // Set up timeout
      this.timeoutHandle = setTimeout(() => {
        this.stop();
        reject(
          new Error(
            'OAuth callback timeout - no response received within timeout period'
          )
        );
      }, this.timeout);

      // Create server
      this.server = createServer((req, res) => {
        this.handleRequest(req, res);
      });

      // Handle server errors
      this.server.on('error', error => {
        this.stop();
        reject(new Error(`OAuth callback server error: ${error.message}`));
      });

      // Start listening
      this.server.listen(this.port, this.hostname, () => {
        this.isListening = true;
        // Server is ready, but we don't resolve yet - we wait for the callback
      });
    });
  }

  /**
   * Stop the callback server
   */
  stop(): void {
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }

    if (this.server && this.isListening) {
      this.server.close();
      this.server = null;
      this.isListening = false;
    }

    this.callbackResolve = null;
    this.callbackReject = null;
  }

  /**
   * Get the callback URL for this server
   */
  getCallbackUrl(): string {
    return `http://${this.hostname}:${this.port}/auth/callback`;
  }

  /**
   * Check if server is currently listening
   */
  isRunning(): boolean {
    return this.isListening;
  }

  // Private methods
  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host}`);

      if (url.pathname === '/auth/callback' && req.method === 'GET') {
        this.handleOAuthCallback(url, res);
      } else if (url.pathname === '/health' && req.method === 'GET') {
        this.handleHealthCheck(res);
      } else {
        this.handleNotFound(res);
      }
    } catch (error) {
      this.handleError(res, error);
    }
  }

  private handleOAuthCallback(url: URL, res: ServerResponse): void {
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');
    const errorDescription = url.searchParams.get('error_description');

    // Send success response to browser
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(this.getCallbackHtml(code, state, error, errorDescription));

    // Resolve the promise with callback data
    if (this.callbackResolve) {
      const result: CallbackResult = {
        code: code || '',
        state: state || '',
        error: error || undefined,
        error_description: errorDescription || undefined,
      };

      this.callbackResolve(result);
      this.stop();
    }
  }

  private handleHealthCheck(res: ServerResponse): void {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'ok',
        server: 'oauth-callback',
        timestamp: new Date().toISOString(),
        port: this.port,
      })
    );
  }

  private handleNotFound(res: ServerResponse): void {
    res.writeHead(404, { 'Content-Type': 'text/html' });
    res.end(`
      <!DOCTYPE html>
      <html>
        <head><title>Not Found</title></head>
        <body>
          <h1>404 - Not Found</h1>
          <p>This is the OAuth callback server. Only /auth/callback is supported.</p>
        </body>
      </html>
    `);
  }

  private handleError(res: ServerResponse, error: unknown): void {
    res.writeHead(500, { 'Content-Type': 'text/html' });
    res.end(`
      <!DOCTYPE html>
      <html>
        <head><title>Server Error</title></head>
        <body>
          <h1>500 - Server Error</h1>
          <p>An error occurred processing your request.</p>
        </body>
      </html>
    `);

    if (this.callbackReject) {
      this.callbackReject(new Error(`OAuth callback server error: ${error}`));
      this.stop();
    }
  }

  private getCallbackHtml(
    code: string | null,
    state: string | null,
    error: string | null,
    errorDescription: string | null
  ): string {
    if (error) {
      return `
        <!DOCTYPE html>
        <html>
          <head>
            <title>OAuth Authorization Failed</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; margin: 40px; }
              .error { color: #d73a49; background: #ffeef0; padding: 20px; border-radius: 8px; border: 1px solid #fdb8c0; }
              .details { margin-top: 15px; font-size: 14px; color: #586069; }
            </style>
          </head>
          <body>
            <h1>OAuth Authorization Failed</h1>
            <div class="error">
              <strong>Error:</strong> ${this.escapeHtml(error)}
              ${errorDescription ? `<div class="details">${this.escapeHtml(errorDescription)}</div>` : ''}
            </div>
            <p>You can close this window and try again.</p>
          </body>
        </html>
      `;
    }

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>OAuth Authorization Complete</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; margin: 40px; }
            .success { color: #28a745; background: #f0fff4; padding: 20px; border-radius: 8px; border: 1px solid #a4e8bc; }
            .code-block { background: #f6f8fa; padding: 10px; border-radius: 4px; font-family: monospace; margin: 10px 0; }
            .note { color: #586069; font-size: 14px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <h1>OAuth Authorization Complete</h1>
          <div class="success">
            <p><strong>✅ Authorization successful!</strong></p>
            <p>The MCP server has received your authorization and is completing the OAuth flow.</p>
          </div>
          
          <div class="note">
            <p><strong>Technical Details:</strong></p>
            <div class="code-block">
              Code: ${code ? this.escapeHtml(code.substring(0, 20)) + '...' : 'Not provided'}<br>
              State: ${state ? this.escapeHtml(state.substring(0, 20)) + '...' : 'Not provided'}
            </div>
            <p>You can close this window now. The OAuth flow will complete automatically.</p>
          </div>
        </body>
      </html>
    `;
  }

  private escapeHtml(text: string): string {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}

// Utility functions for easy usage
export async function startCallbackServer(
  options: CallbackServerOptions = {}
): Promise<{ server: OAuthCallbackServer; callbackUrl: string }> {
  const server = new OAuthCallbackServer(options);
  const callbackUrl = server.getCallbackUrl();

  return { server, callbackUrl };
}

export async function waitForOAuthCallback(
  options: CallbackServerOptions = {}
): Promise<CallbackResult> {
  const server = new OAuthCallbackServer(options);

  try {
    return await server.startAndWaitForCallback();
  } finally {
    server.stop();
  }
}
