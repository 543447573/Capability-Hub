// OpenClaw Capability Hub - V2 HTTP API Server
// Provides REST endpoints for capability discovery and invocation
//
// Key design: RuntimeEngine spawns MCP servers on demand (lazy init).
// We do NOT call engine.start() at startup to avoid crashing when
// a configured MCP server (my-custom-mcp, etc.) is invalid or unavailable.

const http = require('http');
const { RuntimeEngine } = require('./runtime.js');
const { recommend } = require('./recommend.js');

// ─── Helper ──────────────────────────────────────────────────────────────────

function jsonResponse(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data, null, 2));
}

function notFound(res, msg) { jsonResponse(res, 404, { error: msg || 'Not found' }); }
function badRequest(res, msg) { jsonResponse(res, 400, { error: msg || 'Bad request' }); }
function serverError(res, err) { jsonResponse(res, 500, { error: err.message || String(err) }); }

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (e) { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

// ─── Router ──────────────────────────────────────────────────────────────────

async function _route(req, res, url, pathname, method, hub, engine) {

  // ── GET /api/v2/ ──────────────────────────────────────────────────────────
  if (pathname === '/api/v2/' || pathname === '/api/v2') {
    return jsonResponse(res, 200, {
      name: 'OpenClaw Capability Hub API v2',
      version: '2.0.0',
      endpoints: [
        'GET  /api/v2/health',
        'GET  /api/v2/health/:id',
        'GET  /api/v2/capabilities',
        'GET  /api/v2/capabilities/:id',
        'GET  /api/v2/tools',
        'GET  /api/v2/search?q=...',
        'GET  /api/v2/recommend?q=...',
        'POST /api/v2/invoke/:id',
      ],
    });
  }

  // ── GET /api/v2/health ────────────────────────────────────────────────────
  if (pathname === '/api/v2/health' && method === 'GET') {
    try {
      const result = await engine.healthCheckAll();
      return jsonResponse(res, 200, result);
    } catch (err) {
      // Gracefully handle individual MCP failures — don't crash the whole server
      return jsonResponse(res, 200, {
        capabilities: {},
        summary: { total: 0, healthy: 0, unhealthy: 0 },
        warning: 'Health check partial failure: ' + err.message,
      });
    }
  }

  // ── GET /api/v2/health/:id ───────────────────────────────────────────────
  const healthMatch = pathname.match(/^\/api\/v2\/health\/(.+)$/);
  if (healthMatch && method === 'GET') {
    const capabilityId = decodeURIComponent(healthMatch[1]);
    try {
      const result = await engine.healthCheck(capabilityId);
      return jsonResponse(res, 200, { capabilityId, ...result });
    } catch (err) {
      return jsonResponse(res, 200, { capabilityId, healthy: false, error: err.message });
    }
  }

  // ── GET /api/v2/capabilities ──────────────────────────────────────────────
  if (pathname === '/api/v2/capabilities' && method === 'GET') {
    const q = url.searchParams.get('q') || '';
    const type = url.searchParams.get('type') || '';
    const category = url.searchParams.get('category') || '';
    let caps = hub.listCapabilities({}).items;
    if (q) {
      caps = caps.filter(c =>
        (c.id || '').toLowerCase().includes(q.toLowerCase()) ||
        (c.name || '').toLowerCase().includes(q.toLowerCase()) ||
        (c.description || '').toLowerCase().includes(q.toLowerCase())
      );
    }
    if (type) caps = caps.filter(c => c.type === type);
    if (category) caps = caps.filter(c => c.category === category);
    return jsonResponse(res, 200, { capabilities: caps, count: caps.length });
  }

  // ── GET /api/v2/capabilities/:id ─────────────────────────────────────────
  const capMatch = pathname.match(/^\/api\/v2\/capabilities\/(.+)$/);
  if (capMatch && method === 'GET') {
    const capabilityId = decodeURIComponent(capMatch[1]);
    const cap = hub.getCapability(capabilityId);
    if (!cap) return notFound(res, `Capability not found: ${capabilityId}`);
    return jsonResponse(res, 200, cap);
  }

  // ── GET /api/v2/tools ─────────────────────────────────────────────────────
  if (pathname === '/api/v2/tools' && method === 'GET') {
    try {
      const result = engine.listTools();
      return jsonResponse(res, 200, result);
    } catch (err) {
      return jsonResponse(res, 200, { tools: [], error: err.message });
    }
  }

  // ── GET /api/v2/search?q=... ──────────────────────────────────────────────
  if (pathname === '/api/v2/search' && method === 'GET') {
    const q = url.searchParams.get('q') || '';
    if (!q) return badRequest(res, 'Missing ?q= parameter');
    const result = hub.search(q, { limit: 20 });
    return jsonResponse(res, 200, result);
  }

  // ── GET /api/v2/recommend?q=... ───────────────────────────────────────────
  if (pathname === '/api/v2/recommend' && method === 'GET') {
    const q = url.searchParams.get('q') || '';
    if (!q) return badRequest(res, 'Missing ?q= parameter');
    const caps = hub.listCapabilities({}).items;
    const result = recommend(caps, q, { limit: 20 });
    return jsonResponse(res, 200, result);
  }

  // ── POST /api/v2/invoke/:id ──────────────────────────────────────────────
  const invokeMatch = pathname.match(/^\/api\/v2\/invoke\/(.+)$/);
  if (invokeMatch && method === 'POST') {
    const capabilityId = decodeURIComponent(invokeMatch[1]);
    let params = {};
    try { params = await parseBody(req); } catch (e) { return badRequest(res, e.message); }
    try {
      const result = await engine.invoke(capabilityId, params);
      return jsonResponse(res, 200, { capabilityId, result });
    } catch (err) {
      return jsonResponse(res, 500, { capabilityId, error: err.message });
    }
  }

  // 404 everything else
  notFound(res, `Route not found: ${method} ${pathname}`);
}

// ─── Server factory ────────────────────────────────────────────────────────────

async function startServer(hub, port = 18765) {
  // Lazy engine: spawns MCP servers on-demand when first invoked.
  // No engine.start() at startup — avoids crashing when a configured
  // MCP server (e.g. my-custom-mcp) is invalid or unavailable.
  const engine = new RuntimeEngine(hub);

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      // Handle CORS preflight
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        });
        res.end();
        return;
      }

      const url = new URL(req.url, 'http://localhost');
      _route(req, res, url, url.pathname, req.method, hub, engine)
        .catch(err => serverError(res, err));
    });

    server.on('error', (err) => {
      engine.stop();
      if (err.code === 'EADDRINUSE') {
        reject(new Error(`Port ${port} is already in use. Try a different port or stop the existing server.`));
      } else {
        reject(err);
      }
    });

    server.listen(port, () => {
      console.log('');
      console.log('  Capability Hub API Server v2.0.0 started');
      console.log('  Listening on: http://localhost:' + port);
      resolve(server);
    });
  });
}

module.exports = { startServer };
