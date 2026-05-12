// OpenClaw Capability Hub - V2 Runtime Engine
// MCP Client Pool + Capability Invoker

const { spawn } = require('child_process');
const readline = require('readline');

// Path to OpenClaw's MCP SDK CJS build
const MCP_SDK_ROOT = 'C:/Program Files/QClaw/resources/openclaw/node_modules/@modelcontextprotocol/sdk/dist/cjs';

class MCPClient {
  constructor(capabilityId, config) {
    this.capabilityId = capabilityId;
    this.config = config; // { command, args, env }
    this.process = null;
    this.ready = false;
    this.pendingRequests = new Map();
    this.requestId = 0;
    this._readyResolve = null;
    this._readyReject = null;
    this.readyPromise = new Promise((resolve, reject) => {
      this._readyResolve = resolve;
      this._readyReject = reject;
    });
  }

  async connect() {
    if (this.process) return;

    return new Promise((resolve, reject) => {
      const { command, args = [], env = {} } = this.config;
      const defaultEnv = {
        PATH: process.env.PATH || '',
        USERPROFILE: process.env.USERPROFILE || '',
        HOME: process.env.USERPROFILE || '',
      };
      const mergedEnv = { ...defaultEnv, ...env };

      try {
        this.process = spawn(command, args, {
          env: mergedEnv,
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: false,
          windowsHide: true,
        });
      } catch (err) {
        return reject(new Error(`Failed to spawn MCP server: ${err.message}`));
      }

      // Capture stderr for logging
      let stderrBuf = '';
      this.process.stderr.on('data', (data) => {
        stderrBuf += data.toString();
      });

      // Handle process exit
      this.process.on('close', (code) => {
        this.ready = false;
        this.process = null;
        // Reject any pending requests
        for (const [id, { reject }] of this.pendingRequests) {
          reject(new Error(`MCP server exited with code ${code}`));
        }
        this.pendingRequests.clear();
      });

      this.process.on('error', (err) => {
        this._readyReject(new Error(`MCP process error: ${err.message}`));
      });

      // Read responses from stdout (JSON-RPC messages, one per line)
      const rl = readline.createInterface({
        input: this.process.stdout,
        crlfDelay: Infinity,
      });

      rl.on('line', (line) => {
        if (!line.trim()) return;
        try {
          const msg = JSON.parse(line);
          this._handleMessage(msg);
        } catch (e) {
          // Ignore non-JSON lines
        }
      });

      // Wait for the server to be ready (send initialize request)
      this._sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'capability-hub', version: '1.5.0' },
      })
        .then((result) => {
          this.ready = true;
          // Send notifications/initialized
          this._sendNotification('notifications/initialized', {});
          this._readyResolve(result);
          resolve(result);
        })
        .catch((err) => {
          this._readyReject(err);
          reject(err);
        });
    });
  }

  _handleMessage(msg) {
    // Response to a request (has id)
    if (msg.id !== undefined) {
      const pending = this.pendingRequests.get(msg.id);
      if (pending) {
        this.pendingRequests.delete(msg.id);
        if (msg.error) {
          pending.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        } else {
          pending.resolve(msg.result);
        }
      }
    }
    // Notification (no id) - log it
    else if (msg.method) {
      // Server-sent notification (e.g., logging)
      // console.log(`[MCP notify] ${msg.method}:`, msg.params);
    }
  }

  _sendRequest(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++this.requestId;
      this.pendingRequests.set(id, { resolve, reject });
      const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params });
      if (this.process && this.process.stdin.writable) {
        this.process.stdin.write(payload + '\n');
      } else {
        reject(new Error('MCP process stdin not writable'));
      }
      // Timeout: 30s
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`MCP request timeout: ${method}`));
        }
      }, 30000);
    });
  }

  _sendNotification(method, params) {
    const payload = JSON.stringify({ jsonrpc: '2.0', method, params });
    if (this.process && this.process.stdin.writable) {
      this.process.stdin.write(payload + '\n');
    }
  }

  async request(method, params) {
    if (!this.ready) {
      throw new Error('MCP client not connected');
    }
    return this._sendRequest(method, params);
  }

  async invokeTool(toolName, arguments_) {
    return this.request('tools/call', {
      name: toolName,
      arguments: arguments_ || {},
    });
  }

  async listTools() {
    if (!this.ready) {
      throw new Error('MCP client not connected');
    }
    return this.request('tools/list', {});
  }

  async close() {
    if (this.process) {
      try {
        this._sendNotification('shutdown', {});
      } catch (e) {}
      this.process.kill();
      this.process = null;
      this.ready = false;
    }
  }
}

// Connection pool
class MCPClientPool {
  constructor() {
    this.clients = new Map(); // capabilityId -> { client, lastUsed, expiresAt }
    this.ttl = 5 * 60 * 1000; // 5 minutes TTL
    this.cleanupInterval = null;
  }

  _cleanup() {
    const now = Date.now();
    for (const [id, entry] of this.clients) {
      if (now > entry.expiresAt) {
        entry.client.close().catch(() => {});
        this.clients.delete(id);
      }
    }
  }

  startCleanup() {
    if (!this.cleanupInterval) {
      this.cleanupInterval = setInterval(() => this._cleanup(), 60000);
    }
  }

  stopCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    // Close all clients
    for (const [id, entry] of this.clients) {
      entry.client.close().catch(() => {});
    }
    this.clients.clear();
  }

  async getClient(capabilityId, config) {
    const now = Date.now();
    if (this.clients.has(capabilityId)) {
      const entry = this.clients.get(capabilityId);
      entry.expiresAt = now + this.ttl;
      return entry.client;
    }

    // Create new client
    const client = new MCPClient(capabilityId, config);
    try {
      await client.connect();
      this.clients.set(capabilityId, {
        client,
        lastUsed: now,
        expiresAt: now + this.ttl,
      });
      return client;
    } catch (err) {
      return null; // Return null if connection fails
    }
  }

  async invoke(capabilityId, config, toolName, arguments_) {
    const client = await this.getClient(capabilityId, config);
    if (!client) {
      throw new Error(`MCP server unavailable for ${capabilityId}`);
    }
    const now = Date.now();
    const entry = this.clients.get(capabilityId);
    if (entry) entry.lastUsed = now;
    return client.invokeTool(toolName, arguments_);
  }
}

// HTTP API Client (for api/* capabilities that are HTTP-based)
class HTTPAPIClient {
  async invoke(config, params) {
    const { method = 'GET', url, headers = {}, body } = config;
    return new Promise((resolve, reject) => {
      const http = require('http');
      const urlObj = new URL(url);
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method,
        headers,
      };
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve({ content: [{ type: 'text', text: data }] });
          } catch (e) {
            resolve({ content: [{ type: 'text', text: data }] });
          }
        });
      });
      req.on('error', reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }
}

// Unified runtime engine
class RuntimeEngine {
  constructor(hub) {
    this.hub = hub;
    this.mcpPool = new MCPClientPool();
    this.httpClient = new HTTPAPIClient();
    this._healthCache = new Map();
    this._healthCacheTTL = 30000; // 30s
  }

  start() {
    this.mcpPool.startCleanup();
  }

  stop() {
    this.mcpPool.stopCleanup();
  }

  // Convert MCP capability to OpenAI Tool format
  toOpenAITool(capability) {
    return {
      type: 'function',
      function: {
        name: capability.id,
        description: capability.description || capability.name,
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
    };
  }

  // List capabilities in OpenAI Tools format
  listTools() {
    const caps = this.hub.listCapabilities({}).items;
    return {
      tools: caps.map((c) => this.toOpenAITool(c)),
      count: caps.length,
    };
  }

  // Invoke a capability
  async invoke(capabilityId, params) {
    const cap = this.hub.getCapability(capabilityId);
    if (!cap) {
      throw new Error(`Capability not found: ${capabilityId}`);
    }

    if (cap.type === 'mcp') {
      const config = cap.config || {};
      if (!config.command) {
        throw new Error(`MCP capability ${capabilityId} has no command configured`);
      }
      // toolName is in params._tool or 'default'
      const toolName = params._tool || 'invoke';
      const args = { ...params };
      delete args._tool;
      return this.mcpPool.invoke(capabilityId, config, toolName, args);
    } else if (cap.type === 'api' || cap.type === 'http') {
      return this.httpClient.invoke(cap.config || {}, params);
    } else {
      throw new Error(`Unsupported capability type: ${cap.type}`);
    }
  }

  // Health check for a capability
  async healthCheck(capabilityId) {
    const now = Date.now();
    const cached = this._healthCache.get(capabilityId);
    if (cached && now < cached.expiresAt) {
      return cached.status;
    }

    const cap = this.hub.getCapability(capabilityId);
    if (!cap) {
      const status = { healthy: false, error: 'Not found' };
      this._healthCache.set(capabilityId, { status, expiresAt: now + this._healthCacheTTL });
      return status;
    }

    if (cap.type === 'mcp') {
      const config = cap.config || {};
      if (!config.command) {
        const status = { healthy: false, error: 'No command configured' };
        this._healthCache.set(capabilityId, { status, expiresAt: now + this._healthCacheTTL });
        return status;
      }
      try {
        const testClient = new MCPClient(capabilityId, config);
        await Promise.race([
          testClient.connect(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
        ]);
        const tools = await testClient.listTools();
        await testClient.close();
        const status = { healthy: true, tools: (tools.tools || []).length };
        this._healthCache.set(capabilityId, { status, expiresAt: now + this._healthCacheTTL });
        return status;
      } catch (err) {
        const status = { healthy: false, error: err.message };
        this._healthCache.set(capabilityId, { status, expiresAt: now + this._healthCacheTTL });
        return status;
      }
    } else {
      return { healthy: true, type: cap.type };
    }
  }

  // Bulk health check
  async healthCheckAll() {
    const caps = this.hub.listCapabilities({}).items;
    const results = {};
    await Promise.allSettled(
      caps.map(async (cap) => {
        results[cap.id] = await this.healthCheck(cap.id);
      })
    );
    const healthy = Object.values(results).filter((r) => r.healthy).length;
    return {
      capabilities: results,
      summary: { total: caps.length, healthy, unhealthy: caps.length - healthy },
    };
  }
}

module.exports = { MCPClient, MCPClientPool, HTTPAPIClient, RuntimeEngine };
