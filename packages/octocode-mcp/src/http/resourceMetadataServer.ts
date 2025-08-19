/**
 * MCP Resource Metadata Server
 *
 * Serves the protected resource metadata as per the MCP Authorization spec
 * at /.well-known/mcp-resource-metadata. Intended for strict enterprise
 * environments that require a resolvable metadata URL.
 */

import { createServer, Server, IncomingMessage, ServerResponse } from 'http';

export interface MetadataServerOptions {
  port?: number;
  hostname?: string;
}

export class ResourceMetadataServer {
  private server: Server | null = null;
  private port: number;
  private hostname: string;
  private isListening = false;

  constructor(options: MetadataServerOptions = {}) {
    this.port = options.port || 8787;
    this.hostname = options.hostname || '127.0.0.1';
  }

  async start(): Promise<void> {
    if (this.isListening) return;

    await new Promise<void>((resolve, reject) => {
      try {
        this.server = createServer((req, res) => this.handleRequest(req, res));
        this.server.on('error', error => reject(error));
        this.server.listen(this.port, this.hostname, () => {
          this.isListening = true;
          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  stop(): void {
    if (this.server && this.isListening) {
      this.server.close();
      this.server = null;
      this.isListening = false;
    }
  }

  getBaseUrl(): string {
    return `http://${this.hostname}:${this.port}`;
  }

  private async handleRequest(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host}`);

      if (url.pathname === '/.well-known/mcp-resource-metadata') {
        await this.handleMetadata(res);
        return;
      }

      if (url.pathname === '/health') {
        this.handleHealth(res);
        return;
      }

      this.handleNotFound(res);
    } catch (error) {
      this.handleError(res, error);
    }
  }

  private async handleMetadata(res: ServerResponse): Promise<void> {
    try {
      const { MCPAuthProtocol } = await import('../auth/mcpAuthProtocol.js');
      const metadata =
        MCPAuthProtocol.getInstance().getProtectedResourceMetadata();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(metadata));
    } catch (error) {
      this.handleError(res, error);
    }
  }

  private handleHealth(res: ServerResponse): void {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'ok',
        server: 'mcp-resource-metadata',
        timestamp: new Date().toISOString(),
        port: this.port,
      })
    );
  }

  private handleNotFound(res: ServerResponse): void {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  }

  private handleError(res: ServerResponse, error: unknown): void {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Server Error', message: String(error) }));
  }
}
