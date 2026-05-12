// OpenClaw Capability Hub - Core Module
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(process.env.USERPROFILE || process.env.HOME, '.qclaw', 'capability-hub', 'data');
const REGISTRY_FILE = path.join(DATA_DIR, 'registry.json');

class CapabilityHub {
  constructor() {
    this.ensureDataDir();
    this.registry = this.loadRegistry();
  }

  ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  loadRegistry() {
    if (!fs.existsSync(REGISTRY_FILE)) {
      const defaultRegistry = {
        version: '1.5.0',
        capabilities: [],
        categories: this.getDefaultCategories(),
        lastScanned: null
      };
      this.saveRegistry(defaultRegistry);
      return defaultRegistry;
    }
    try {
      const content = fs.readFileSync(REGISTRY_FILE, 'utf-8');
      return JSON.parse(content);
    } catch (e) {
      return { version: '1.5.0', capabilities: [], categories: this.getDefaultCategories(), lastScanned: null };
    }
  }

  saveRegistry(registry) {
    fs.writeFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2), 'utf-8');
  }

  getDefaultCategories() {
    return [
      { id: 'file', name: 'File Operations', children: [
        { id: 'file/system', name: 'System Files' },
        { id: 'file/cloud', name: 'Cloud Storage' }
      ]},
      { id: 'network', name: 'Network', children: [
        { id: 'network/http', name: 'HTTP Requests' },
        { id: 'network/websocket', name: 'WebSocket' }
      ]},
      { id: 'ai', name: 'AI Capabilities', children: [
        { id: 'ai/openai', name: 'OpenAI' },
        { id: 'ai/claude', name: 'Claude' },
        { id: 'ai/local', name: 'Local Models' }
      ]},
      { id: 'browser', name: 'Browser', children: [
        { id: 'browser/web', name: 'Web Automation' },
        { id: 'browser/chrome', name: 'Chrome Extension' }
      ]},
      { id: 'system', name: 'System', children: [
        { id: 'system/clipboard', name: 'Clipboard' },
        { id: 'system/notification', name: 'Notifications' }
      ]},
      { id: 'social', name: 'Social', children: [
        { id: 'social/email', name: 'Email' },
        { id: 'social/slack', name: 'Slack' }
      ]}
    ];
  }

  addCapability(cap) {
    if (!cap.id || !cap.name || !cap.description) {
      throw new Error('Missing required fields: id, name, description');
    }
    const existing = this.registry.capabilities.find(c => c.id === cap.id);
    if (existing) {
      throw new Error('Capability ' + cap.id + ' already exists. Use hub edit to update.');
    }
    const capability = {
      id: cap.id,
      name: cap.name,
      description: cap.description,
      type: cap.type || 'mcp',
      category: cap.category || [],
      tags: cap.tags || [],
      version: cap.version || '1.0.0',
      provider: cap.provider || 'user',
      author: cap.author || null,
      homepage: cap.homepage || null,
      examples: cap.examples || [],
      dependencies: cap.dependencies || [],
      config: cap.config || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.registry.capabilities.push(capability);
    this.saveRegistry(this.registry);
    return capability;
  }

  listCapabilities(opts) {
    let caps = [...this.registry.capabilities];
    if (opts.type) {
      caps = caps.filter(c => c.type === opts.type);
    }
    if (opts.category) {
      caps = caps.filter(c => c.category.some(cat => cat.startsWith(opts.category)));
    }
    if (opts.tag) {
      caps = caps.filter(c => c.tags.includes(opts.tag));
    }
    const sort = opts.sort || 'name';
    if (sort === 'name') caps.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === 'updated') caps.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    if (sort === 'created') caps.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const total = caps.length;
    const page = parseInt(opts.page) || 1;
    const limit = parseInt(opts.limit) || 20;
    const start = (page - 1) * limit;
    const items = caps.slice(start, start + limit);
    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  getCapability(id) {
    return this.registry.capabilities.find(c => c.id === id) || null;
  }

  updateCapability(id, updates) {
    const idx = this.registry.capabilities.findIndex(c => c.id === id);
    if (idx === -1) return null;
    const updated = { ...this.registry.capabilities[idx], ...updates, id, updatedAt: new Date().toISOString() };
    this.registry.capabilities[idx] = updated;
    this.saveRegistry(this.registry);
    return updated;
  }

  deleteCapability(id) {
    const idx = this.registry.capabilities.findIndex(c => c.id === id);
    if (idx === -1) return false;
    this.registry.capabilities.splice(idx, 1);
    this.saveRegistry(this.registry);
    return true;
  }

  search(query, opts) {
    if (!query || query.trim().length === 0) {
      return this.listCapabilities(opts);
    }
    const q = query.toLowerCase().trim();
    let caps = this.registry.capabilities.filter(c => {
      const matchId = c.id.toLowerCase().includes(q);
      const matchName = c.name.toLowerCase().includes(q);
      const matchDesc = c.description.toLowerCase().includes(q);
      const matchTags = c.tags.some(t => t.toLowerCase().includes(q));
      const matchCategory = c.category.some(cat => cat.toLowerCase().includes(q));
      return matchId || matchName || matchDesc || matchTags || matchCategory;
    });

    if (opts.tag) {
      caps = caps.filter(c => c.tags.includes(opts.tag));
    }
    if (opts.category) {
      caps = caps.filter(c => c.category.some(cat => cat.startsWith(opts.category)));
    }

    caps = caps.map(c => {
      let score = 0;
      if (c.id.toLowerCase() === q) score = 100;
      else if (c.id.toLowerCase().includes(q)) score += 60;
      if (c.name.toLowerCase().includes(q)) score += 80;
      if (c.tags.some(t => t.toLowerCase() === q)) score += 70;
      if (c.tags.some(t => t.toLowerCase().includes(q))) score += 40;
      if (c.description.toLowerCase().includes(q)) score += 30;
      if (c.category.some(cat => cat.toLowerCase().includes(q))) score += 20;
      return { ...c, _score: Math.min(score, 100) };
    }).sort((a, b) => b._score - a._score);

    const limit = parseInt(opts.limit) || 20;
    return { items: caps.slice(0, limit), total: caps.length, query: q };
  }

  async scanMCPConfigs() {
    const openclawDir = path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw');
    const results = [];

    const mcpConfigs = [
      path.join(openclawDir, 'config', 'mcp.json'),
      path.join(openclawDir, 'config', 'mcp-dev.json'),
      path.join(openclawDir, 'config', 'mcp-prod.json')
    ];

    for (const configPath of mcpConfigs) {
      if (fs.existsSync(configPath)) {
        try {
          const content = fs.readFileSync(configPath, 'utf-8');
          const config = JSON.parse(content);
          const servers = config.mcpServers || config.servers || config;
          for (const [name, serverConfig] of Object.entries(servers)) {
            if (typeof serverConfig === 'object' && serverConfig !== null) {
              const id = 'mcp/' + name;
              if (!this.getCapability(id)) {
                const capability = this.addCapability({
                  id,
                  name: this.formatName(name),
                  description: 'MCP Server: ' + name,
                  type: 'mcp',
                  category: ['system/mcp'],
                  tags: ['mcp', 'server', name],
                  provider: 'openclaw',
                  config: {
                    command: serverConfig.command || null,
                    args: serverConfig.args || [],
                    env: serverConfig.env || {},
                    configPath
                  }
                });
                results.push({ status: 'added', id, capability });
              } else {
                results.push({ status: 'exists', id });
              }
            }
          }
        } catch (e) {
          results.push({ status: 'error', path: configPath, message: e.message });
        }
      }
    }

    this.registry.lastScanned = new Date().toISOString();
    this.saveRegistry(this.registry);
    return results;
  }

  formatName(name) {
    return name.split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  getCategories() {
    return this.registry.categories;
  }

  getInfo() {
    return {
      version: '1.5.0',
      capabilities: this.registry.capabilities.length,
      categories: this.registry.categories.length,
      lastScanned: this.registry.lastScanned,
      registryPath: REGISTRY_FILE,
      dataDir: DATA_DIR
    };
  }

  importFromFile(filePath) {
    if (!fs.existsSync(filePath)) throw new Error('File not found: ' + filePath);
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);
    if (Array.isArray(data)) {
      let added = 0, skipped = 0;
      for (const item of data) {
        try {
          if (!this.getCapability(item.id)) {
            this.addCapability(item);
            added++;
          } else {
            skipped++;
          }
        } catch (e) {
          skipped++;
        }
      }
      return { added, skipped };
    }
    throw new Error('Invalid import file format');
  }

  exportToFile(filePath) {
    fs.writeFileSync(filePath, JSON.stringify(this.registry, null, 2), 'utf-8');
    return filePath;
  }
}

module.exports = CapabilityHub;
module.exports.DATA_DIR = DATA_DIR;
module.exports.REGISTRY_FILE = REGISTRY_FILE;
