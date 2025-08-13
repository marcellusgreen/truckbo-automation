/**
 * Dynamic Server Discovery Service
 * Automatically discovers and connects to available PDF processing servers
 */

export interface ServerInfo {
  url: string;
  port: number;
  status: 'healthy' | 'unhealthy' | 'unknown';
  version?: string;
  capabilities?: string[];
  responseTime?: number;
}

export class ServerDiscoveryService {
  private discoveredServers: Map<string, ServerInfo> = new Map();
  private preferredServer: ServerInfo | null = null;
  private readonly DEFAULT_PORTS = [3001, 3002, 3003, 3004, 3005, 3006, 3007, 3008, 3009, 3010];
  private readonly SERVICE_NAME = 'pdf-processor';

  constructor() {
    console.log('🔍 ServerDiscoveryService initialized');
  }

  /**
   * Discover available PDF processing servers
   */
  async discoverServers(): Promise<ServerInfo[]> {
    console.log('🔍 Starting server discovery...');
    const discoveryPromises: Promise<void>[] = [];
    
    // Try environment-specified server first
    const envServer = this.getEnvironmentServer();
    if (envServer) {
      console.log(`🌍 Testing environment server: ${envServer.url}`);
      discoveryPromises.push(this.testServer(envServer.url, envServer.port));
    }

    // Try common ports
    console.log(`🔍 Testing ${this.DEFAULT_PORTS.length} common ports:`, this.DEFAULT_PORTS);
    for (const port of this.DEFAULT_PORTS) {
      const url = `http://localhost:${port}`;
      discoveryPromises.push(this.testServer(url, port));
    }

    console.log(`⏳ Running ${discoveryPromises.length} discovery tests...`);

    // Run discovery in parallel with timeout
    const results = await Promise.allSettled(discoveryPromises.map(p => 
      this.withTimeout(p, 2000) // 2-second timeout per server
    ));

    console.log(`📊 Discovery results:`, results.map((r, i) => ({
      index: i,
      status: r.status,
      reason: r.status === 'rejected' ? r.reason?.message : 'fulfilled'
    })));

    const healthyServers = Array.from(this.discoveredServers.values())
      .filter(server => server.status === 'healthy')
      .sort((a, b) => (a.responseTime || Infinity) - (b.responseTime || Infinity));

    console.log(`✅ Discovery complete: Found ${healthyServers.length} healthy servers out of ${this.discoveredServers.size} tested`);
    healthyServers.forEach(server => {
      console.log(`  📡 ${server.url} (${server.responseTime}ms)`);
    });

    if (healthyServers.length === 0) {
      console.log('❌ No healthy servers found. All tested servers:');
      Array.from(this.discoveredServers.values()).forEach(server => {
        console.log(`  ❌ ${server.url} - ${server.status}`);
      });
    }

    return healthyServers;
  }

  /**
   * Get the best available server
   */
  async getBestServer(): Promise<ServerInfo | null> {
    if (this.preferredServer && this.preferredServer.status === 'healthy') {
      return this.preferredServer;
    }

    const servers = await this.discoverServers();
    this.preferredServer = servers[0] || null;
    
    if (this.preferredServer) {
      console.log(`🎯 Selected server: ${this.preferredServer.url}`);
    } else {
      console.log('❌ No healthy servers found');
    }

    return this.preferredServer;
  }

  /**
   * Get server URL for API calls
   */
  async getServerUrl(): Promise<string | null> {
    const server = await this.getBestServer();
    return server ? server.url : null;
  }

  /**
   * Test server health and capabilities
   */
  private async testServer(baseUrl: string, port: number): Promise<void> {
    const startTime = Date.now();
    
    try {
      console.log(`🔍 Testing server: ${baseUrl}`);
      
      // Test health endpoint
      const response = await fetch(`${baseUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000)
      });

      console.log(`📡 Response from ${baseUrl}: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const healthData = await response.json();
      const responseTime = Date.now() - startTime;

      console.log(`📊 Health data from ${baseUrl}:`, healthData);

      // Validate it's our PDF processing server
      if (healthData.status === 'ok' && healthData.pdfProcessorReady) {
        const serverInfo: ServerInfo = {
          url: baseUrl,
          port: port,
          status: 'healthy',
          version: healthData.version,
          capabilities: healthData.capabilities || ['pdf-processing'],
          responseTime: responseTime
        };

        this.discoveredServers.set(baseUrl, serverInfo);
        console.log(`✅ Server found: ${baseUrl} (${responseTime}ms)`);
      } else {
        throw new Error(`Invalid server response: status=${healthData.status}, pdfProcessorReady=${healthData.pdfProcessorReady}`);
      }

    } catch (error) {
      const serverInfo: ServerInfo = {
        url: baseUrl,
        port: port,
        status: 'unhealthy',
        responseTime: Date.now() - startTime
      };

      this.discoveredServers.set(baseUrl, serverInfo);
      console.log(`❌ Server unavailable: ${baseUrl} - ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get server from environment variables
   */
  private getEnvironmentServer(): { url: string; port: number } | null {
    const envUrl = import.meta.env.VITE_SERVER_URL;
    if (envUrl) {
      try {
        const url = new URL(envUrl);
        const port = parseInt(url.port) || (url.protocol === 'https:' ? 443 : 80);
        console.log(`🌍 Environment server specified: ${envUrl}`);
        return { url: envUrl, port };
      } catch (error) {
        console.warn(`⚠️ Invalid VITE_SERVER_URL: ${envUrl}`);
      }
    }

    return null;
  }

  /**
   * Add timeout to promises
   */
  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), timeoutMs)
      )
    ]);
  }

  /**
   * Force refresh server discovery
   */
  async refresh(): Promise<ServerInfo[]> {
    this.discoveredServers.clear();
    this.preferredServer = null;
    return this.discoverServers();
  }

  /**
   * Get current server status
   */
  getServerStatus(): {
    hasHealthyServer: boolean;
    serverCount: number;
    preferredServer: ServerInfo | null;
    allServers: ServerInfo[];
  } {
    const allServers = Array.from(this.discoveredServers.values());
    const healthyServers = allServers.filter(s => s.status === 'healthy');

    return {
      hasHealthyServer: healthyServers.length > 0,
      serverCount: healthyServers.length,
      preferredServer: this.preferredServer,
      allServers: allServers
    };
  }

  /**
   * Health check for current preferred server
   */
  async checkCurrentServerHealth(): Promise<boolean> {
    if (!this.preferredServer) return false;

    try {
      const response = await fetch(`${this.preferredServer.url}/health`, {
        signal: AbortSignal.timeout(3000)
      });
      const data = await response.json();
      
      const isHealthy = response.ok && data.status === 'ok' && data.pdfProcessorReady;
      
      if (!isHealthy) {
        console.log(`⚠️ Preferred server ${this.preferredServer.url} is no longer healthy`);
        this.preferredServer.status = 'unhealthy';
        this.preferredServer = null;
      }

      return isHealthy;
    } catch (error) {
      console.log(`❌ Health check failed for ${this.preferredServer.url}`);
      this.preferredServer.status = 'unhealthy';
      this.preferredServer = null;
      return false;
    }
  }
}

// Export singleton instance
export const serverDiscovery = new ServerDiscoveryService();