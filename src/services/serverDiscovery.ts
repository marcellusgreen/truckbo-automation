// Server discovery utility for locating local PDF processing services.
// Simplified and sanitized to avoid legacy logging artifacts.

export interface ServerInfo {
  url: string;
  port: number;
  status: 'healthy' | 'unhealthy' | 'unknown';
  version?: string;
  capabilities?: string[];
  responseTime?: number;
}

const DEFAULT_PORTS = [3001, 3002, 3003, 3004, 3005, 3006, 3007, 3008, 3009, 3010];

class ServerDiscoveryService {
  private discoveredServers: Map<string, ServerInfo> = new Map();
  private preferredServer: ServerInfo | null = null;

  constructor() {
    console.log('[ServerDiscovery] Initialized');
  }

  async discoverServers(): Promise<ServerInfo[]> {
    console.log('[ServerDiscovery] Starting server discovery');
    const tests: Promise<void>[] = [];

    const envServer = this.getEnvironmentServer();
    if (envServer) {
      tests.push(this.testServer(envServer.url, envServer.port));
    }

    for (const port of DEFAULT_PORTS) {
      tests.push(this.testServer(`http://localhost:${port}`, port));
    }

    await Promise.allSettled(tests.map(test => this.withTimeout(test, 2000)));

    const healthyServers = Array.from(this.discoveredServers.values())
      .filter(server => server.status === 'healthy')
      .sort((a, b) => (a.responseTime ?? Infinity) - (b.responseTime ?? Infinity));

    console.log(`[ServerDiscovery] Discovery complete. Healthy servers: ${healthyServers.length}`);
    return healthyServers;
  }

  async getBestServer(): Promise<ServerInfo | null> {
    if (this.preferredServer && this.preferredServer.status === 'healthy') {
      return this.preferredServer;
    }

    const healthyServers = await this.discoverServers();
    this.preferredServer = healthyServers[0] ?? null;

    if (this.preferredServer) {
      console.log(`[ServerDiscovery] Selected ${this.preferredServer.url}`);
    } else {
      console.warn('[ServerDiscovery] No healthy servers available');
    }

    return this.preferredServer;
  }

  async getServerUrl(): Promise<string | null> {
    const server = await this.getBestServer();
    return server?.url ?? null;
  }

  getServerStatus(): {
    hasHealthyServer: boolean;
    serverCount: number;
    preferredServer: ServerInfo | null;
    allServers: ServerInfo[];
  } {
    const servers = Array.from(this.discoveredServers.values());
    const healthyServers = servers.filter(server => server.status === 'healthy');

    return {
      hasHealthyServer: healthyServers.length > 0,
      serverCount: healthyServers.length,
      preferredServer: this.preferredServer,
      allServers: servers
    };
  }

  async checkCurrentServerHealth(): Promise<boolean> {
    const currentServer = this.preferredServer;
    if (!currentServer) {
      return false;
    }

    try {
      const response = await fetch(`${currentServer.url}/health`, {
        signal: AbortSignal.timeout(3000)
      });
      const data = await response.json();

      const isHealthy = response.ok && data.status === 'ok' && data.pdfProcessorReady;
      if (!isHealthy) {
        console.warn(`[ServerDiscovery] Preferred server ${currentServer.url} failed health check`);
        currentServer.status = 'unhealthy';
        this.preferredServer = null;
      }

      return isHealthy;
    } catch (error) {
      console.warn(`[ServerDiscovery] Health check failed for ${currentServer.url}`, error);
      currentServer.status = 'unhealthy';
      this.preferredServer = null;
      return false;
    }
  }

  private async testServer(baseUrl: string, port: number): Promise<void> {
    const start = Date.now();

    try {
      const response = await fetch(`${baseUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      if (data.status !== 'ok' || !data.pdfProcessorReady) {
        throw new Error('Server not ready');
      }

      const info: ServerInfo = {
        url: baseUrl,
        port,
        status: 'healthy',
        version: data.version,
        capabilities: data.capabilities ?? ['pdf-processing'],
        responseTime: Date.now() - start
      };

      this.discoveredServers.set(baseUrl, info);
      console.log(`[ServerDiscovery] Healthy server found at ${baseUrl}`);
    } catch (error) {
      const info: ServerInfo = {
        url: baseUrl,
        port,
        status: 'unhealthy',
        responseTime: Date.now() - start
      };

      this.discoveredServers.set(baseUrl, info);
      console.warn(`[ServerDiscovery] Server unavailable at ${baseUrl}`, error);
    }
  }

  private getEnvironmentServer(): { url: string; port: number } | null {
    const envUrl = import.meta.env?.VITE_PDF_PROCESSOR_URL || process.env.VITE_PDF_PROCESSOR_URL;
    if (!envUrl) {
      return null;
    }

    try {
      const url = new URL(envUrl);
      return {
        url: `${url.protocol}//${url.host}`,
        port: Number(url.port || url.href.match(/:(\d+)/)?.[1] || 3001)
      };
    } catch (error) {
      console.warn('[ServerDiscovery] Invalid VITE_PDF_PROCESSOR_URL', error);
      return null;
    }
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timeoutHandle: NodeJS.Timeout;
    const timeoutPromise = new Promise<T>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new Error('Timed out'));
      }, timeoutMs);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      clearTimeout(timeoutHandle!);
    }
  }
}

export const serverDiscovery = new ServerDiscoveryService();
