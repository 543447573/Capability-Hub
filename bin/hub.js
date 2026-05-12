#!/usr/bin/env node
// OpenClaw Capability Hub v2.0 - CLI Entry Point
const { Command } = require('commander');
const CapabilityHub = require('../src/hub.js');
const { recommend, analyzeIntent, extractKeywords } = require('../src/recommend.js');
const { searchNPM, convertToCatalogFormat, convertToRegistryFormat } = require('../src/discover-npm.js');
const LinksManager = require('../src/links.js');

const hub = new CapabilityHub();
const links = new LinksManager();
const prog = new Command();

function p(data) { console.log(JSON.stringify(data, null, 2)); }

prog.name('hub').description('OpenClaw Capability Hub v2.0').version('2.0.0');

// ─── INFO ─────────────────────────────────────────────────────────────────────
prog.command('info').description('Hub info').option('--json').action((opts) => {
  const i = hub.getInfo();
  const ls = links.getStats();
  if (opts.json) { p({ ...i, links: ls }); return; }
  console.log('');
  console.log('  OpenClaw Capability Hub v' + i.version);
  console.log('  Capabilities : ' + i.capabilities);
  console.log('  Categories  : ' + i.categories);
  console.log('  Skills      : ' + ls.totalSkills);
  console.log('  Links       : ' + ls.totalLinks + ' (cap↔skill)');
  console.log('  Last Scan   : ' + i.lastScanned);
  console.log('  Registry    : ' + (i.registryPath || i.registry || 'not set'));
  console.log('  Data Dir    : ' + (i.dataDir || 'not set'));
  console.log('');
});

// ─── SCAN ─────────────────────────────────────────────────────────────────────
prog.command('scan').description('Scan MCP configs and discover capabilities')
  .option('--json', 'Output JSON').action(async (opts) => {
    const results = await hub.scanMCPConfigs();
    if (opts.json) { p(results); return; }
    console.log('');
    console.log('  Scan complete. Results:');
    results.forEach(r => {
      console.log('  ' + (r.status === 'added' ? '[+]' : r.status === 'exists' ? '[=]' : '[-]') + ' ' + r.id + (r.message ? ' — ' + r.message : ''));
    });
    console.log('');
    console.log('  Total: ' + results.length + ' capabilities');
    console.log('');
  });

// ─── LIST ─────────────────────────────────────────────────────────────────────
prog.command('list').description('List all capabilities')
  .option('--type <type>', 'Filter by type: api|mcp').option('--category <cat>', 'Filter by category').option('--tag <tag>', 'Filter by tag')
  .option('--page <n>', 'Page number', '1').option('--limit <n>', 'Items per page', '20')
  .option('--sort <s>', 'Sort: name|updated|created', 'name').option('--json', 'Output JSON')
  .action((opts) => {
    const result = hub.listCapabilities(opts);
    if (opts.json) { p(result); return; }
    console.log('');
    console.log('  Capabilities (' + result.total + ' total, page ' + result.page + '/' + result.pages + '):');
    result.items.forEach(c => {
      console.log('  ' + c.id + ' [' + c.type + ']');
      console.log('    ' + c.name + ' — ' + c.description.substring(0, 60) + '...');
      if (c.tags.length) console.log('    Tags: ' + c.tags.join(', '));
    });
    console.log('');
  });

// ─── GET ───────────────────────────────────────────────────────────────────────
prog.command('get <capabilityId>').description('Get capability detail').option('--json')
  .action((capabilityId, opts) => {
    const cap = hub.getCapability(capabilityId);
    if (!cap) { console.error('  Error: Capability not found: ' + capabilityId); process.exit(1); }
    if (opts.json) { p(cap); return; }
    console.log('');
    console.log('  ' + cap.name + ' [' + cap.id + ']');
    console.log('  Type    : ' + cap.type);
    console.log('  Category: ' + cap.category.join(' > '));
    console.log('  Version : ' + cap.version);
    console.log('  Provider: ' + cap.provider);
    console.log('  Desc    : ' + cap.description);
    if (cap.tags.length) console.log('  Tags    : ' + cap.tags.join(', '));
    if (cap.examples.length) {
      console.log('  Examples:');
      cap.examples.forEach(e => console.log('    - ' + e));
    }
    if (cap.dependencies.length) console.log('  Depends : ' + cap.dependencies.join(', '));
    console.log('  Created : ' + cap.createdAt);
    console.log('  Updated : ' + cap.updatedAt);
    console.log('');
  });

// ─── SEARCH ───────────────────────────────────────────────────────────────────
prog.command('search <query>').description('Search capabilities by keyword')
  .option('--tag <tag>', 'Filter by tag').option('--category <cat>', 'Filter by category')
  .option('--limit <n>', 'Max results', '20').option('--json', 'Output JSON')
  .action((query, opts) => {
    const result = hub.search(query, opts);
    if (opts.json) { p(result); return; }
    console.log('');
    console.log('  Query: "' + query + '" — ' + result.total + ' results');
    result.items.forEach(c => {
      const pct = Math.round(c._score || 0);
      const score = Math.min(100, Math.max(0, pct)); const bars = Math.round(score / 20); const bar = '#'.repeat(bars) + '-'.repeat(Math.max(0, 5 - bars));
      console.log('  ' + bar + ' ' + c.id + ' (' + score + '%)');
      console.log('    ' + c.name + ' — ' + c.description.substring(0, 80));
    });
    console.log('');
  });

// ─── ADD ─────────────────────────────────────────────────────────────────────
prog.command('add')
  .description('Add a new capability')
  .option('--id <id>', 'Capability ID (required)').option('--name <name>', 'Name (required)')
  .option('--desc <desc>', 'Description (required)').option('--type <type>', 'Type: mcp|api|http', 'mcp')
  .option('--category <cats...>', 'Categories').option('--tag <tags...>', 'Tags')
  .option('--version <v>', 'Version', '1.0.0').option('--provider <p>', 'Provider', 'user')
  .option('--cmd <cmd>', 'MCP command').option('--args <args...>', 'MCP args')
  .option('--example <text>', 'Usage example').option('--json', 'Output JSON')
  .action((opts) => {
    if (!opts.id || !opts.name || !opts.desc) {
      console.error('  Error: --id, --name, and --desc are required'); process.exit(1);
    }
    const cap = { id: opts.id, name: opts.name, description: opts.desc, type: opts.type };
    if (opts.category) cap.category = opts.category;
    if (opts.tag) cap.tags = opts.tag;
    if (opts.version) cap.version = opts.version;
    if (opts.provider) cap.provider = opts.provider;
    if (opts.example) cap.examples = [opts.example];
    if (opts.type === 'mcp' && opts.cmd) {
      cap.config = { command: opts.cmd, args: opts.args || [] };
    }
    try {
      const added = hub.addCapability(cap);
      if (opts.json) { p(added); return; }
      console.log('');
      console.log('  Added: ' + added.name + ' [' + added.id + ']');
      console.log('');
    } catch (err) {
      console.error('  Error: ' + err.message); process.exit(1);
    }
  });

// ─── EDIT ─────────────────────────────────────────────────────────────────────
prog.command('edit <capabilityId>')
  .description('Edit a capability').option('--name <name>').option('--desc <desc>')
  .option('--category <cats...>').option('--tag <tags...>').option('--version <v>')
  .option('--provider <p>').option('--example <text>').option('--cmd <cmd>').option('--args <args...>')
  .option('--json', 'Output JSON').action((capabilityId, opts) => {
    const updates = {};
    if (opts.name) updates.name = opts.name;
    if (opts.desc) updates.description = opts.desc;
    if (opts.category) updates.category = opts.category;
    if (opts.tag) updates.tags = opts.tag;
    if (opts.version) updates.version = opts.version;
    if (opts.provider) updates.provider = opts.provider;
    if (opts.example) updates.examples = [opts.example];
    if (opts.cmd) updates.config = { command: opts.cmd, args: opts.args || [] };
    const updated = hub.updateCapability(capabilityId, updates);
    if (!updated) { console.error('  Error: Not found: ' + capabilityId); process.exit(1); }
    console.log('  Updated: ' + updated.name + ' [' + updated.id + ']');
  });

// ─── DELETE ───────────────────────────────────────────────────────────────────
prog.command('delete <capabilityId>').description('Delete a capability')
  .option('--force', 'Skip confirmation').action((capabilityId, opts) => {
    if (!opts.force) {
      console.log('  Use --force to confirm deletion of: ' + capabilityId);
      process.exit(1);
    }
    const ok = hub.deleteCapability(capabilityId);
    if (ok) { console.log('  Deleted: ' + capabilityId); }
    else { console.error('  Error: Not found: ' + capabilityId); process.exit(1); }
  });

// ─── LINK (V1.5) ─────────────────────────────────────────────────────────────
const linkCmd = prog.command('link').description('Link capabilities to Skills');
linkCmd.command('add <capabilityId> <skillName>').description('Link a capability to a skill')
  .action((capabilityId, skillName) => {
    const cap = hub.getCapability(capabilityId);
    if (!cap) { console.error('  Capability not found: ' + capabilityId); process.exit(1); }
    const added = links.addLink(capabilityId, skillName);
    console.log('');
    console.log('  + Linked: ' + cap.name + ' [' + capabilityId + ']');
    console.log('    to skill: ' + skillName);
    console.log('');
  });
linkCmd.command('remove <capabilityId> <skillName>').description('Remove a link')
  .action((capabilityId, skillName) => {
    const removed = links.removeLink(capabilityId, skillName);
    if (removed) { console.log('  Removed: ' + capabilityId + ' ← ' + skillName); }
    else { console.log('  Not found: ' + capabilityId + ' ← ' + skillName); }
  });
linkCmd.command('list').description('List all links').option('--json').action((opts) => {
  if (opts.json) { p(links.getAllLinks()); return; }
  const all = links.getAllLinks();
  const skills = Object.keys(all);
  console.log('');
  console.log('  Skills (' + skills.length + '):');
  skills.forEach(sk => {
    console.log('  * ' + sk + ' (' + sk + ')');
    all[sk].forEach(id => {
      const cap = hub.getCapability(id);
      console.log('    Capabilities: ' + (cap ? cap.name : id) + ' [' + id + ']');
    });
  });
  const caps = {};
  links.getAllLinks().forEach((sks, capId) => { caps[capId] = sks.length; });
  const sorted = Object.entries(caps).sort((a, b) => b[1] - a[1]);
  if (sorted.length) {
    console.log('');
    console.log('  Most Used Capabilities:');
    sorted.slice(0, 5).forEach(([id, count]) => {
      const cap = hub.getCapability(id);
      console.log('  * ' + (cap ? cap.name : id) + ' [' + id + '] used by ' + count + ' skill(s)');
    });
  }
  console.log('');
});
linkCmd.command('stats').description('Link statistics').option('--json').action((opts) => {
  const s = links.getStats();
  if (opts.json) { p(s); return; }
  console.log('');
  console.log('  Link Statistics:');
  console.log('    Total Skills     : ' + s.totalSkills);
  console.log('    Total Capabilities: ' + s.totalCapabilities);
  console.log('    Total Links      : ' + s.totalLinks);
  console.log('    Avg Caps/Skill   : ' + s.avgCapsPerSkill.toFixed(1));
  console.log('    Avg Skills/Cap   : ' + s.avgSkillsPerCap.toFixed(1));
  console.log('    Last Updated     : ' + s.lastUpdated);
  console.log('');
});
linkCmd.command('discover').description('Discover skills from filesystem').option('--json')
  .action((opts) => {
    const skills = links.discoverSkills();
    if (opts.json) { p(skills); return; }
    console.log('');
    console.log('  Discovered Skills (' + skills.length + '):');
    skills.forEach(s => {
      const name = s.name || s.id;
      const desc = (s.description || '').substring(0, 60);
      console.log('  * ' + name + ' (' + s.id + ')');
      if (desc) console.log('    ' + desc + '...');
    });
    console.log('');
  });
linkCmd.command('skill <skillName>').description('Show capabilities linked to a skill')
  .option('--json').action((skillName, opts) => {
    const caps = links.getSkillCapabilities(skillName);
    if (opts.json) { p(caps); return; }
    console.log('');
    console.log('  Skill: ' + skillName);
    console.log('  Linked Capabilities:');
    if (caps.length === 0) { console.log('    (none)'); }
    else { caps.forEach(id => { const c = hub.getCapability(id); console.log('  * ' + (c ? c.name : id) + ' [' + id + ']'); }); }
    console.log('');
  });
linkCmd.command('capability <capabilityId>').description('Show skills linked to a capability')
  .option('--json').action((capabilityId, opts) => {
    const skills = links.getCapabilitySkills(capabilityId);
    if (opts.json) { p(skills); return; }
    const cap = hub.getCapability(capabilityId);
    console.log('');
    console.log('  Capability: ' + (cap ? cap.name : capabilityId) + ' [' + capabilityId + ']');
    console.log('  Linked Skills:');
    if (skills.length === 0) { console.log('    (none)'); }
    else { skills.forEach(s => console.log('  * ' + s)); }
    console.log('');
  });

// ─── RECOMMEND (V1.5) ─────────────────────────────────────────────────────────
prog.command('recommend <text>').description('Recommend capabilities based on natural language')
  .option('--intent', 'Show intent analysis only').option('--add <skill>', 'Auto-link recommended capabilities to a skill')
  .option('--limit <n>', 'Max results', '10').option('--json', 'Output JSON')
  .action((text, opts) => {
    const caps = hub.listCapabilities({}).items;
    const result = recommend(caps, text, { limit: parseInt(opts.limit) || 10 });
    const intent = analyzeIntent(text);
    if (opts.json) { p({ ...result, intent: intent.primary }); return; }
    if (opts.intent) {
      console.log('');
      console.log('  Intent: ' + intent.primary);
      console.log('');
      return;
    }
    console.log('');
    console.log('  Recommend: "' + text + '"');
    console.log('');
    console.log('  Intent: ' + intent.primary);
    console.log('  Keywords: ' + result.keywords.slice(0, 12).join(', '));
    console.log('');
    console.log('  Found ' + result.items.length + ' matching capabilities.');
    console.log('');
    console.log('  Top Recommendations:');
    result.items.slice(0, 5).forEach((item, i) => {
      const cap = item.capability;
      const score2 = Math.min(100, Math.max(0, item.score || 0));
      const bars2 = Math.round(score2 / 20);
      const bar = '#'.repeat(bars2) + '-'.repeat(Math.max(0, 5 - bars2));
      console.log('');
      console.log('  ' + (i + 1) + '. ' + (cap ? cap.name : item.id || '?') + ' [' + (cap ? cap.id : '?') + ']');
      console.log('     Relevance: ' + bar + ' ' + Math.round(score2) + '%');
      if (cap) console.log('     ' + cap.description.substring(0, 80));
      console.log('     Why: ' + (item.reasons && item.reasons.length > 0 ? item.reasons.map(r => r.reason || r).join(', ') : 'n/a'));
      if (cap && cap.tags.length) console.log('     Tags: ' + cap.tags.join(', '));
    });
    console.log('');
    // Accuracy check
    if (result.items.length >= 3) {
      const top3 = result.items.slice(0, 3);
      console.log('  Tip: To add a capability to a skill:');
      if (result.items[0]) { const cap0 = result.items[0].capability; console.log('    hub link add ' + (cap0 ? cap0.id : result.items[0].id) + ' <skill_name>'); }
    }
    console.log('');
    // Auto-link
    if (opts.add) {
      const skill = opts.add;
      let linked = 0;
      result.items.forEach(item => { try { const capId = item.capability ? item.capability.id : item.id; links.addLink(capId, skill); linked++; } catch (e) {}
      });
      console.log('  + Linked ' + linked + ' capabilities to skill "' + skill + '"');
      console.log('');
    }
  });

// ─── INTENT ────────────────────────────────────────────────────────────────────
prog.command('intent <text>').description('Analyze intent from natural language text')
  .option('--json').action((text, opts) => {
    const result = analyzeIntent(text);
    if (opts.json) { p(result); return; }
    console.log('');
    console.log('  Intent Analysis: "' + text + '"');
    console.log('');
    console.log('  Primary Intent: ' + result.primary + ' (score: ' + result.all[0].score + ')');
    console.log('');
    console.log('  All Detected:');
    if (result.all.length === 0) { console.log('    (none)'); }
    else {
      result.all.forEach(t => {
        const bar = '#'.repeat(Math.min(10, t.score)) + '-'.repeat(Math.max(0, 10 - t.score));
        console.log('    ' + bar + ' ' + t.intent + ' (score: ' + t.score + ')');
      });
    }
    console.log('');
  });

// ─── PARSE ────────────────────────────────────────────────────────────────────
prog.command('parse [text]').description('Extract keywords from natural language text')
  .option('--json').action((text, opts) => {
    if (!text) { console.error('Error: provide text'); process.exit(1); }
    const keywords = extractKeywords(text);
    if (opts.json) { p({ text, keywords }); return; }
    console.log('');
    console.log('  Text: "' + text + '"');
    console.log('  Keywords: ' + keywords.join(', '));
    console.log('');
  });

// ─── SERVE (V2) ───────────────────────────────────────────────────────────────
prog.command('serve [port]')
  .description('Start the Capability Hub HTTP API server (V2 runtime discovery)')
  .option('--port <port>', 'Port to listen on', '18765')
  .action(async (port, opts) => {
    const actualPort = parseInt(port || opts.port || '18765');
    console.log('');
    console.log('  Starting Capability Hub API Server v2.0.0...');
    console.log('  Port: ' + actualPort);
    console.log('');
    try {
      const { startServer } = require('../src/server.js');
      const server = await startServer(hub, actualPort);
      const addr = server.address();
      console.log('  API Base: http://localhost:' + addr.port + '/api/v2/');
      console.log('');
      console.log('  Ready! Endpoints:');
      console.log('    GET  /api/v2/health            Health check (all)');
      console.log('    GET  /api/v2/capabilities      List capabilities');
      console.log('    GET  /api/v2/capabilities/:id  Capability detail');
      console.log('    GET  /api/v2/tools             OpenAI Tools format');
      console.log('    GET  /api/v2/search?q=...      Search');
      console.log('    GET  /api/v2/recommend?q=...   Recommend');
      console.log('    GET  /api/v2/health/:id        Single health check');
      console.log('    POST /api/v2/invoke/:id        Invoke capability');
      console.log('');
      console.log('  Press Ctrl+C to stop.');
    } catch (err) {
      console.error('  Error: ' + err.message); process.exit(1);
    }
  });

// ─── HEALTH (V2) ──────────────────────────────────────────────────────────────
prog.command('health [capabilityId]')
  .description('Check health of a capability or all capabilities')
  .option('--json', 'Output JSON')
  .action(async (capabilityId, opts) => {
    const { RuntimeEngine } = require('../src/runtime.js');
    const engine = new RuntimeEngine(hub);
    engine.start();
    try {
      let result;
      if (capabilityId) { result = await engine.healthCheck(capabilityId); }
      else { result = await engine.healthCheckAll(); }
      if (opts.json) { p(result); return; }
      if (capabilityId) {
        console.log('');
        console.log('  Capability: ' + capabilityId);
        console.log('  Healthy   : ' + (result.healthy ? '✅' : '❌'));
        if (result.error) console.log('  Error     : ' + result.error);
        if (result.tools !== undefined) console.log('  Tools     : ' + result.tools);
        if (result.type) console.log('  Type      : ' + result.type);
        console.log('');
      } else {
        const s = result.summary;
        console.log('');
        console.log('  Health Summary:');
        console.log('    Total     : ' + s.total);
        console.log('    Healthy   : ' + s.healthy + ' ✅');
        console.log('    Unhealthy : ' + s.unhealthy + ' ❌');
        console.log('');
        console.log('  Per Capability:');
        Object.entries(result.capabilities).forEach(([id, r]) => {
          console.log('  ' + (r.healthy ? '✅' : '❌') + ' ' + id + (r.error ? ' — ' + r.error : ''));
        });
        console.log('');
      }
    } finally { engine.stop(); }
  });

// ─── TOOLS (V2) ────────────────────────────────────────────────────────────────
prog.command('tools').description('List all capabilities in OpenAI Tool Calling format')
  .option('--json', 'Output JSON')
  .action((opts) => {
    const { RuntimeEngine } = require('../src/runtime.js');
    const engine = new RuntimeEngine(hub);
    engine.start();
    try {
      const result = engine.listTools();
      if (opts.json) { p(result); return; }
      console.log('');
      console.log('  Total Tools: ' + result.count);
      console.log('');
      result.tools.forEach(t => {
        const fn = t.function;
        console.log('  ' + fn.name);
        console.log('    ' + fn.description);
        console.log('');
      });
    } finally { engine.stop(); }
  });

// ─── INVOKE (V2) ───────────────────────────────────────────────────────────────
prog.command('invoke <capabilityId> [params...]')
  .description('Invoke a capability with parameters')
  .option('--json', 'Output JSON').option('--tool <name>', 'MCP tool name to call')
  .action(async (capabilityId, params, opts) => {
    let args = {};
    if (params.length > 0) {
      try { args = JSON.parse(params.join(' ')); }
      catch {
        for (const p of params) {
          const idx = p.indexOf('=');
          if (idx > 0) {
            const k = p.substring(0, idx);
            const v = p.substring(idx + 1);
            try { args[k] = JSON.parse(v); } catch { args[k] = v; }
          }
        }
      }
    }
    if (opts.tool) args._tool = opts.tool;
    const cap = hub.getCapability(capabilityId);
    if (!cap) { console.error('Error: Capability not found: ' + capabilityId); process.exit(1); }
    const { RuntimeEngine } = require('../src/runtime.js');
    const engine = new RuntimeEngine(hub);
    engine.start();
    try {
      console.log('');
      console.log('  Invoking: ' + capabilityId + ' (' + cap.type + ')');
      console.log('  Params  : ' + JSON.stringify(args));
      console.log('');
      const startTime = Date.now();
      const result = await engine.invoke(capabilityId, args);
      const latencyMs = Date.now() - startTime;
      if (opts.json) { p({ capabilityId, result, latencyMs }); return; }
      console.log('  Result:');
      console.log('  ' + JSON.stringify(result, null, 2));
      console.log('');
      console.log('  Latency: ' + latencyMs + 'ms');
      console.log('');
    } catch (err) {
      if (opts.json) { p({ error: err.message }); return; }
      console.error('  Error: ' + err.message); process.exit(1);
    } finally { engine.stop(); }
  });

// ─── API (V2 HTTP proxy) ───────────────────────────────────────────────────────
const apiCmd = prog.command('api').description('Call HTTP API endpoints (requires hub serve running)');

function apiGet(path, port) {
  return new Promise((resolve, reject) => {
    const http = require('http');
    http.get('http://localhost:' + port + path, (res) => {
      let body = ''; res.on('data', c => body += c);
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve(body); } });
    }).on('error', reject);
  });
}

function apiPost(path, body, port) {
  return new Promise((resolve, reject) => {
    const http = require('http');
    const data = JSON.stringify(body);
    const req = http.request({
      hostname: 'localhost', port, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, (res) => {
      let result = ''; res.on('data', c => result += c);
      res.on('end', () => { try { resolve(JSON.parse(result)); } catch { resolve(result); } });
    });
    req.on('error', reject);
    req.write(data); req.end();
  });
}

apiCmd.command('health [capabilityId]').option('--port <port>', 'API port', '18765').action(async (capabilityId, opts) => {
  const path = capabilityId ? '/api/v2/health/' + capabilityId : '/api/v2/health';
  const data = await apiGet(path, opts.port);
  p(data);
});
apiCmd.command('capabilities').option('--port <port>', 'API port', '18765').action(async (opts) => {
  p(await apiGet('/api/v2/capabilities', opts.port));
});
apiCmd.command('tools').option('--port <port>', 'API port', '18765').action(async (opts) => {
  p(await apiGet('/api/v2/tools', opts.port));
});
apiCmd.command('search <query>').option('--port <port>', 'API port', '18765').action(async (query, opts) => {
  p(await apiGet('/api/v2/search?q=' + encodeURIComponent(query), opts.port));
});
apiCmd.command('recommend <text>').option('--port <port>', 'API port', '18765').action(async (text, opts) => {
  p(await apiGet('/api/v2/recommend?q=' + encodeURIComponent(text), opts.port));
});
apiCmd.command('invoke <capabilityId>').option('--port <port>', 'API port', '18765')
  .option('--params <json>', 'JSON params', '{}').action(async (capabilityId, opts) => {
  p(await apiPost('/api/v2/invoke/' + capabilityId, JSON.parse(opts.params || '{}'), opts.port));
});

// ─── CATEGORIES ───────────────────────────────────────────────────────────────
prog.command('categories').description('List all categories').option('--json')
  .action((opts) => {
    const info = hub.getInfo();
    const categories = hub.getCategories();
    if (opts.json) { p(categories); return; }
    console.log('');
    categories.forEach(c => {
      if (c.children) {
        console.log('  ' + c.name + ' [' + c.id + ']');
        c.children.forEach(ch => console.log('    ↳ ' + ch.name + ' [' + ch.id + ']'));
      } else {
        console.log('  ' + c.name + ' [' + c.id + ']');
      }
    });
    console.log('');
  });

// ─── EXPORT ───────────────────────────────────────────────────────────────────
prog.command('export [filepath]').description('Export registry to JSON file')
  .action((filepath, opts) => {
    filepath = filepath || 'registry-export.json';
    const data = hub.exportRegistry();
    require('fs').writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
    console.log('  Exported: ' + filepath + ' (' + data.capabilities.length + ' capabilities)');
  });

// ─── IMPORT ───────────────────────────────────────────────────────────────────
prog.command('import <filepath>').description('Import capabilities from JSON file')
  .option('--replace', 'Replace existing capabilities').action((filepath, opts) => {
    const data = JSON.parse(require('fs').readFileSync(filepath, 'utf-8'));
    let added = 0, skipped = 0;
    (data.capabilities || []).forEach(cap => {
      try { hub.addCapability(cap); added++; } catch (e) { if (opts.replace) { hub.deleteCapability(cap.id); hub.addCapability(cap); added++; } else { skipped++; } }
    });
    console.log('  Imported: ' + added + ' added, ' + skipped + ' skipped');
  });

// ─── CATALOG (MCP Discovery) ──────────────────────────────────────────────────

const CATALOG_FILE = require('path').join(__dirname, '..', 'data', 'mcp-catalog.json');
const USER_CATALOG_FILE = require('path').join(__dirname, '..', 'data', 'mcp-catalog-user.json');

function loadCatalog() {
  const builtIn = [];
  if (require('fs').existsSync(CATALOG_FILE)) {
    try {
      const data = JSON.parse(require('fs').readFileSync(CATALOG_FILE, 'utf-8'));
      builtIn.push(...(data.mcpServers || []));
    } catch (e) {
      console.error('  Failed to load built-in catalog: ' + e.message);
    }
  }
  const userEntries = {};
  if (require('fs').existsSync(USER_CATALOG_FILE)) {
    try {
      const data = JSON.parse(require('fs').readFileSync(USER_CATALOG_FILE, 'utf-8'));
      (data.mcpServers || []).forEach(m => { userEntries[m.id] = m; });
    } catch (e) {
      console.error('  Failed to load user catalog: ' + e.message);
    }
  }
  // Merge: user entries override built-in with same id
  const merged = builtIn.map(m => userEntries[m.id] ? userEntries[m.id] : m);
  Object.values(userEntries).forEach(m => {
    if (!merged.find(existing => existing.id === m.id)) merged.push(m);
  });
  return {
    mcpServers: merged,
    _builtIn: builtIn.length,
    _userAdded: Object.keys(userEntries).length
  };
}

function saveUserCatalog(mcpServers) {
  const fs = require('fs');
  const dir = require('path').dirname(USER_CATALOG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(USER_CATALOG_FILE, JSON.stringify({ mcpServers, version: '1.0.0', updatedAt: new Date().toISOString().split('T')[0] }, null, 2), 'utf-8');
}

function validateMCPEntry(entry) {
  const errors = [];
  if (!entry.id) errors.push('缺少 id 字段');
  if (!entry.name) errors.push('缺少 name 字段');
  if (!entry.configTemplate) errors.push('缺少 configTemplate 字段');
  if (entry.id && !/^[a-z0-9-]+$/.test(entry.id)) errors.push('id 只能包含小写字母、数字、连字符');
  return errors;
}

function matchMCP(mcp, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    mcp.id.includes(q) ||
    mcp.name.includes(q) ||
    (mcp.nameEn || '').toLowerCase().includes(q) ||
    (mcp.description || '').toLowerCase().includes(q) ||
    (mcp.tags || []).some(t => t.toLowerCase().includes(q)) ||
    (mcp.category || '').toLowerCase().includes(q)
  );
}

function printMCP(mcp, installedCaps, showDetail) {
  const installed = installedCaps.has('mcp/' + mcp.id);
  const star = installed ? '[*] ' : '[ ] ';
  const pop = '★'.repeat(mcp.popularity || 3) + '☆'.repeat(5 - (mcp.popularity || 3));
  const verified = mcp.verified ? ' ✓' : '';
  console.log(star + mcp.name + ' (' + mcp.id + ')' + verified);
  console.log('    ' + (mcp.description || '').substring(0, 70) + (mcp.description && mcp.description.length > 70 ? '...' : ''));
  console.log('    分类: ' + (mcp.category || 'unknown') + ' | 热度: ' + pop + ' | 来源: ' + (mcp.source ? mcp.source.type : 'n/a'));
  if (showDetail) {
    if (mcp.capabilities && mcp.capabilities.length) console.log('    能力: ' + mcp.capabilities.join(', '));
    if (mcp.links && mcp.links.homepage) console.log('    链接: ' + mcp.links.homepage);
    if (mcp.notes) console.log('    备注: ' + mcp.notes);
  }
}

// hub discover [query]
prog.command('discover [query]')
  .description('Discover MCPs from the curated catalog')
  .option('--category <cat>', 'Filter by category')
  .option('--tags <tags>', 'Filter by tags (comma-separated)')
  .option('--installed', 'Show only locally installed MCPs')
  .option('--detail', 'Show detailed info for each MCP')
  .option('--json', 'Output raw JSON')
  .action((query, opts) => {
    const catalog = loadCatalog();
    if (catalog.mcpServers.length === 0) {
      console.log('  Catalog is empty. Run: hub catalog refresh');
      return;
    }
    const installedIds = new Set(hub.listCapabilities({}).items.map(c => c.id));
    let results = catalog.mcpServers;

    // Filter by category
    if (opts.category) {
      results = results.filter(m => (m.category || '') === opts.category);
    }

    // Filter by tags
    if (opts.tags) {
      const tags = opts.tags.split(',').map(t => t.trim().toLowerCase());
      results = results.filter(m =>
        tags.some(tag => (m.tags || []).some(t => t.toLowerCase().includes(tag)))
      );
    }

    // Filter by query
    if (query) {
      results = results.filter(m => matchMCP(m, query));
    }

    // Filter by installed
    if (opts.installed) {
      results = results.filter(m => installedIds.has('mcp/' + m.id));
    }

    if (opts.json) {
      console.log(JSON.stringify(results, null, 2));
      return;
    }

    // If single ID match, show full detail
    if (results.length === 1 && query) {
      const mcp = results[0];
      console.log('');
      console.log('  ╔══════════════════════════════════════════════════════════╗');
      console.log('  ║ ' + mcp.name + ' (' + mcp.id + ')' + (mcp.verified ? ' ✓ 已验证' : '') + '║');
      console.log('  ╚══════════════════════════════════════════════════════════╝');
      console.log('  描述: ' + (mcp.description || 'N/A'));
      console.log('  分类: ' + (mcp.category || 'unknown'));
      console.log('  标签: ' + ((mcp.tags || []).join(', ') || 'none'));
      console.log('  来源: ' + (mcp.source ? mcp.source.type + ' — ' + (mcp.source.package || mcp.source.url || 'n/a') : 'N/A'));
      console.log('  热度: ' + '★'.repeat(mcp.popularity || 3) + '☆'.repeat(5 - (mcp.popularity || 3)));
      console.log('  状态: ' + (installedIds.has('mcp/' + mcp.id) ? '✅ 已安装' : '⬜ 未安装'));
      if (mcp.capabilities && mcp.capabilities.length) {
        console.log('  能力:');
        mcp.capabilities.forEach(c => console.log('    - ' + c));
      }
      if (mcp.requirements) {
        console.log('  要求: ' + Object.entries(mcp.requirements).map(([k,v]) => k + ': ' + v).join(', '));
      }
      if (mcp.configParams && mcp.configParams.length) {
        console.log('  参数:');
        mcp.configParams.forEach(p => {
          const req = p.required ? '[必需]' : '[可选]';
          const def = p.default ? ' 默认: ' + p.default : '';
          console.log('    - ' + p.name + ' ' + req + def);
          console.log('      ' + p.description);
        });
      }
      if (mcp.notes) console.log('  备注: ' + mcp.notes);
      if (mcp.links) {
        console.log('  链接:');
        Object.entries(mcp.links).forEach(([k, v]) => console.log('    ' + k + ': ' + v));
      }
      console.log('');
      console.log('  配置模板: hub template ' + mcp.id);
      console.log('');
      return;
    }

    // List mode
    console.log('');
    const title = query ? '搜索 "' + query + '" — ' + results.length + ' results' :
      (opts.category ? '分类: ' + opts.category + ' — ' + results.length + ' MCPs' :
      (opts.tags ? '标签: ' + opts.tags + ' — ' + results.length + ' MCPs' :
      'MCP 目录 — ' + results.length + ' MCPs'));
    console.log('  ' + title);
    console.log('  ─────────────────────────────────────────────────────');
    results.forEach(mcp => printMCP(mcp, installedIds, opts.detail));
    console.log('');
    const installedCount = results.filter(m => installedIds.has('mcp/' + m.id)).length;
    console.log('  [*] = 已安装  ' + installedCount + '/' + results.length + ' 已安装');
    console.log('  详情: hub discover ' + (query || '') + ' --detail');
    console.log('  配置: hub template <id>');
    console.log('');
  });

// hub discover-npm [query]
prog.command('discover-npm [query]')
  .description('Search NPM registry for MCP packages and add to local registry')
  .option('--limit <n>', 'Max results', '10')
  .option('--add <names>', 'Comma-separated package names to add (skip interactive mode)')
  .option('--json', 'Output raw JSON')
  .action(async (query, opts) => {
    if (!query) {
      console.log('  Usage: hub discover-npm <keyword> [--limit 10] [--add @org/package,name2]');
      console.log('  Example: hub discover-npm slack --limit 10');
      console.log('  Example: hub discover-npm github --add @modelcontextprotocol/server-github');
      return;
    }
    const limit = parseInt(opts.limit) || 10;
    const installedIds = new Set(hub.listCapabilities({}).items.map(c => c.id));

    console.log('');
    console.log('  🔍 Searching NPM for MCP packages: "' + query + '"');
    console.log('  ' + '─'.repeat(55));

    let results;
    try {
      results = await searchNPM(query, limit);
    } catch (err) {
      console.error('  NPM search failed: ' + err.message);
      console.error('  Check your network connection and try again.');
      process.exit(1);
    }

    if (results.length === 0) {
      console.log('  No MCP packages found for: "' + query + '"');
      console.log('  Try a different keyword or use: hub discover (local catalog)');
      return;
    }

    if (opts.json) {
      console.log(JSON.stringify(results, null, 2));
      return;
    }

    // ── Display results ──
    console.log('  Found ' + results.length + ' packages:');
    console.log('');
    results.forEach((pkg, i) => {
      const idx = (i + 1).toString().padStart(2, ' ');
      const scoreBar = '#'.repeat(Math.round(pkg.searchScore / 20)) + '-'.repeat(Math.max(0, 5 - Math.round(pkg.searchScore / 20)));
      const dlMonthly = (pkg.downloads.monthly / 1000).toFixed(0) + 'K';
      const installed = installedIds.has('mcp/' + pkg.name.replace(/^@/, '').replace('/', '_'));
      const status = installed ? ' [installed]' : '';
      console.log('  [' + idx + '] ' + scoreBar + '  ' + pkg.name + status);
      console.log('      ⬇ ' + dlMonthly + '/mo | v' + pkg.version + ' | by ' + pkg.publisher + ' | ' + pkg.license);
      console.log('      "' + pkg.description.substring(0, 70) + (pkg.description.length > 70 ? '...' : '') + '"');
      if (pkg.keywords.length > 0) {
        console.log('      Tags: ' + pkg.keywords.slice(0, 6).join(', '));
      }
      console.log('');
    });

    // ── Add packages ──
    let toAdd = [];
    let addedNames = [];
    if (opts.add) {
      // Non-interactive: match package names to result indices
      const names = opts.add.split(',').map(n => n.trim().toLowerCase()).filter(Boolean);
      names.forEach(name => {
        const idx = results.findIndex(r => r.name.toLowerCase() === name || r.name.toLowerCase() === '@' + name);
        if (idx >= 0) toAdd.push(idx + 1);
        else console.log('  ⚠ Not found in results: ' + name);
      });
    } else {
      // Interactive: prompt user
      const rl = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });
      const ask = () => new Promise(resolve => {
        rl.question('  Enter package numbers to add (e.g. 1,3 or Enter to skip): ', ans => {
          if (!ans.trim()) { rl.close(); resolve([]); return; }
          resolve(ans.split(',').map(n => parseInt(n.trim())).filter(n => n >= 1 && n <= results.length));
        });
      });
      toAdd = await ask();
    }

    if (toAdd.length === 0) {
      console.log('  No packages selected. Done.');
      console.log('');
      return;
    }

    console.log('');
    console.log('  Adding ' + toAdd.length + ' package(s) to registry...');
    console.log('');

    let added = 0, skipped = 0;
    for (const idx of toAdd) {
      const npmPkg = results[idx - 1];
      if (!npmPkg) { skipped++; continue; }
      const catalogEntry = convertToCatalogFormat(npmPkg);
      const registryEntry = convertToRegistryFormat(catalogEntry);
      // Check if already exists
      if (installedIds.has(registryEntry.id)) {
        console.log('  ⏭  Skip: ' + npmPkg.name + ' (already in registry)');
        skipped++;
        continue;
      }
      try {
        hub.addCapability(registryEntry);
        console.log('  ✅ Added: ' + npmPkg.name + ' [' + registryEntry.id + ']');
        addedNames.push(registryEntry.id);
        added++;
      } catch (err) {
        console.log('  ❌ Error: ' + npmPkg.name + ' — ' + err.message);
        skipped++;
      }
    }

    console.log('');
    console.log('  Done! Added: ' + added + ', Skipped: ' + skipped);
    if (addedNames.length > 0) {
      console.log('');
      console.log('  Next steps:');
      console.log('    1. View added: hub list --type mcp');
      addedNames.forEach(id => console.log('    2. Install: hub template ' + id));
    }
    console.log('');
  });

// hub template <id>
prog.command('template <mcpId>')
  .description('Show MCP config template (ready to copy into mcp.json)')
  .option('--json', 'Output as JSON config block')
  .action((mcpId, opts) => {
    const catalog = loadCatalog();
    const mcp = catalog.mcpServers.find(m => m.id === mcpId);
    if (!mcp) {
      console.log('  MCP not found in catalog: ' + mcpId);
      console.log('  Run: hub discover ' + mcpId + ' --detail');
      return;
    }
    const config = {
      [mcpId]: {
        command: mcp.configTemplate ? mcp.configTemplate.command : 'npx',
        args: (mcp.configTemplate ? mcp.configTemplate.args : []).map(a => {
          // Replace ${param} placeholders with example/default values
          return a.replace(/\$\{(\w+)\}/g, (match, paramName) => {
            const param = (mcp.configParams || []).find(p => p.name === paramName);
            return param ? (param.default || param.example || match) : match;
          });
        }),
        env: {}
      }
    };
    if (mcp.configTemplate && mcp.configTemplate.env) {
      Object.entries(mcp.configTemplate.env).forEach(([k, v]) => {
        if (v.startsWith('${') && v.endsWith('}')) {
          const paramName = v.slice(2, -1);
          const param = (mcp.configParams || []).find(p => p.name === paramName);
          config[mcpId].env[k] = param ? (param.default || '<YOUR_' + paramName + '>') : '<YOUR_VALUE>';
        } else {
          config[mcpId].env[k] = v;
        }
      });
    }

    console.log('');
    console.log('  MCP: ' + mcp.name + ' (' + mcp.id + ')');
    console.log('');
    if (!opts.json) {
      console.log('  # 复制以下配置到 ~/.openclaw/config/mcp.json 的 mcpServers 节点:');
      console.log('');
      console.log('  ' + JSON.stringify(config, null, 2).replace(/\n/g, '\n  '));
      console.log('');
      if (mcp.configParams && mcp.configParams.some(p => p.required)) {
        console.log('  # 必填参数:');
        mcp.configParams.filter(p => p.required).forEach(p => {
          console.log('  #   ' + p.name + ': ' + p.description);
          if (p.example) console.log('  #   示例: ' + p.example);
        });
      }
    } else {
      console.log(JSON.stringify(config, null, 2));
    }
    console.log('');
  });

// hub catalog
prog.command('catalog')
  .description('MCP catalog management')
  .option('--json', 'Output as JSON')
  .action((opts) => {
    const catalog = loadCatalog();
    const installedIds = new Set(hub.listCapabilities({}).items.map(c => c.id));
    const installedMCPs = catalog.mcpServers.filter(m => installedIds.has('mcp/' + m.id)).length;
    const byCategory = {};
    catalog.mcpServers.forEach(m => {
      const cat = m.category || 'unknown';
      if (!byCategory[cat]) byCategory[cat] = 0;
      byCategory[cat]++;
    });
    const verifiedCount = catalog.mcpServers.filter(m => m.verified).length;
    if (opts.json) {
      console.log(JSON.stringify({ ...catalog, stats: {
        total: catalog.mcpServers.length,
        installed: installedMCPs,
        verified: verifiedCount,
        byCategory
      } }, null, 2));
      return;
    }
    console.log('');
    console.log('  MCP 目录统计');
    console.log('  ─────────────────────────────────────────────────────');
    console.log('  MCP 总数  : ' + catalog.mcpServers.length);
    console.log('  已安装    : ' + installedMCPs + '/' + catalog.mcpServers.length);
    console.log('  已验证    : ' + verifiedCount + '/' + catalog.mcpServers.length);
    console.log('  目录文件  : ' + CATALOG_FILE);
    console.log('  更新时间  : ' + (catalog.updatedAt || 'unknown'));
    console.log('');
    console.log('  按分类:');
    Object.entries(byCategory).sort((a, b) => b[1] - a[1]).forEach(([cat, count]) => {
      const mcpList = catalog.mcpServers.filter(m => m.category === cat);
      const names = mcpList.map(m => m.name).join(', ');
      console.log('    ' + cat + ' (' + count + '): ' + names);
    });
    console.log('');
    console.log('  使用说明:');
    console.log('    hub discover [关键词]       搜索 MCP');
    console.log('    hub discover <id> --detail 查看详情');
    console.log('    hub template <id>          显示配置模板');
    if (catalog._userAdded > 0) {
      console.log('    hub catalog add <json>     添加自定义 MCP（当前 ' + catalog._userAdded + ' 个）');
    } else {
      console.log('    hub catalog-add          添加自定义 MCP');
    }
    console.log('    hub catalog-refresh      更新目录');
    console.log('    hub install <id>           安装 MCP 到 mcp.json');
    console.log('');
  });

// hub catalog-add
prog.command('catalog-add')
  .description('Add a custom MCP to your user catalog (alias: hub catalog add)')
  .option('--json <json>', 'Inline JSON entry')
  .option('--file <path>', 'Load entry from JSON file')
  .action((opts) => {
    const fs = require('fs');
    let entry;
    if (opts.json) {
      try {
        entry = JSON.parse(opts.json);
      } catch (e) {
        console.error('  JSON 解析失败: ' + e.message);
        process.exit(1);
      }
    } else if (opts.file) {
      try {
        entry = JSON.parse(fs.readFileSync(opts.file, 'utf-8'));
      } catch (e) {
        console.error('  读取文件失败: ' + e.message);
        process.exit(1);
      }
    } else {
      // Interactive: read from stdin
      console.log('  请输入 MCP 条目 JSON（输入空行结束）:');
      const rl = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });
      const lines = [];
      rl.on('line', l => { if (l.trim() === '') { rl.close(); } else { lines.push(l); } });
      rl.on('close', () => {
        try {
          entry = JSON.parse(lines.join('\n'));
          doAdd(entry);
        } catch (e) {
          console.error('  JSON 解析失败: ' + e.message);
          process.exit(1);
        }
      });
      return;
    }
    doAdd(entry);

    function doAdd(entry) {
      // Normalize: support single entry or array
      const entries = Array.isArray(entry) ? entry : [entry];
      let added = 0, skipped = 0, errors = [];
      // Load existing user catalog
      let userEntries = {};
      if (fs.existsSync(USER_CATALOG_FILE)) {
        try {
          const data = JSON.parse(fs.readFileSync(USER_CATALOG_FILE, 'utf-8'));
          (data.mcpServers || []).forEach(m => { userEntries[m.id] = m; });
        } catch (e) { /* ignore */ }
      }
      entries.forEach(e => {
        const errs = validateMCPEntry(e);
        if (errs.length > 0) {
          errors.push(e.id || e.name || JSON.stringify(e).substring(0, 30) + '...: ' + errs.join(', '));
          return;
        }
        userEntries[e.id] = e;
        added++;
      });
      if (errors.length > 0) {
        console.error('  验证失败:');
        errors.forEach(e => console.error('    ' + e));
      }
      if (added > 0) {
        saveUserCatalog(Object.values(userEntries));
        console.log('  已添加 ' + added + ' 个 MCP 到用户目录');
        console.log('  文件: ' + USER_CATALOG_FILE);
      } else {
        console.log('  无新增条目' + (errors.length > 0 ? '（' + errors.length + ' 个错误）' : ''));
      }
    }
  });

// hub catalog-refresh
prog.command('catalog-refresh')
  .description('Refresh/update the MCP catalog')
  .action(() => {
    const catalog = loadCatalog();
    const fs = require('fs');
    // Touch the built-in catalog to update its timestamp
    if (fs.existsSync(CATALOG_FILE)) {
      try {
        const data = JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf-8'));
        data.updatedAt = new Date().toISOString().split('T')[0];
        fs.writeFileSync(CATALOG_FILE, JSON.stringify(data, null, 2), 'utf-8');
      } catch (e) {
        console.error('  更新目录时间戳失败: ' + e.message);
      }
    }
    const rebuilt = loadCatalog();
    console.log('');
    console.log('  目录已刷新');
    console.log('  ─────────────────────────────────────────────────────');
    console.log('  MCP 总数  : ' + rebuilt.mcpServers.length + ' (内置 ' + rebuilt._builtIn + ', 用户 ' + rebuilt._userAdded + ')');
    console.log('  内置目录  : ' + CATALOG_FILE);
    console.log('  用户目录  : ' + USER_CATALOG_FILE);
    console.log('');
  });

// hub install
prog.command('install <mcpId>')
  .description('Install an MCP to your mcp.json config')
  .option('--params <json-or-file>', 'Provide params as JSON string, or a file path containing JSON')
  .option('--params-file <path>', 'Provide params from a JSON file')
  .option('--dry-run', 'Show generated config without modifying mcp.json')
  .option('--apply', 'Apply generated config to mcp.json')
  .option('--force', 'Overwrite existing entry in mcp.json')
  .action((mcpId, opts) => {
    const fs = require('fs');
    const catalog = loadCatalog();
    const mcp = catalog.mcpServers.find(m => m.id === mcpId);
    if (!mcp) {
      console.error('  未找到 MCP: ' + mcpId);
      console.error('  运行 hub discover ' + mcpId + ' 查看是否在目录中');
      process.exit(1);
    }

    // Parse params
    let params = {};
    const paramsSource = opts.paramsFile || opts.params;
    if (paramsSource) {
      try {
        const fs = require('fs');
        if (fs.existsSync(paramsSource)) {
          params = JSON.parse(fs.readFileSync(paramsSource, 'utf-8'));
        } else {
          params = JSON.parse(paramsSource);
        }
      } catch (e) {
        console.error('  参数解析失败（请提供 JSON 字符串或文件路径）: ' + e.message);
        process.exit(1);
      }
    }

    // Check required params
    const missing = (mcp.configParams || []).filter(p => p.required && !params[p.name]);
    if (missing.length > 0 && !opts.dryRun) {
      console.error('  缺少必填参数:');
      missing.forEach(p => console.error('    --params ' + JSON.stringify({ [p.name]: '<value>' })));
      console.error('');
      console.error('  或使用 --dry-run 查看完整配置');
      console.error('  查看参数说明: hub discover ' + mcpId + ' --detail');
      process.exit(1);
    }

    // Generate config
    const mcpConfig = {
      command: mcp.configTemplate ? mcp.configTemplate.command : 'npx',
      args: (mcp.configTemplate ? mcp.configTemplate.args : []).map(a => {
        return a.replace(/\$\{(\w+)\}/g, (match, paramName) => {
          if (params[paramName]) return params[paramName];
          const param = (mcp.configParams || []).find(p => p.name === paramName);
          return param ? (param.default || param.example || match) : match;
        });
      }),
      env: {}
    };
    if (mcp.configTemplate && mcp.configTemplate.env) {
      Object.entries(mcp.configTemplate.env).forEach(([k, v]) => {
        if (typeof v === 'string' && v.startsWith('${') && v.endsWith('}')) {
          const paramName = v.slice(2, -1);
          mcpConfig.env[k] = params[paramName] || '';
        } else {
          mcpConfig.env[k] = v;
        }
      });
    }

    console.log('');
    console.log('  MCP: ' + mcp.name + ' (' + mcp.id + ')');
    console.log('');
    const dryRunConfig = { [mcpId]: mcpConfig };
    if (opts.dryRun) {
      console.log('  [Dry Run] 生成配置:');
      console.log('');
      console.log('  ' + JSON.stringify(dryRunConfig, null, 2).replace(/\n/g, '\n  '));
      console.log('');
      if (!opts.apply) {
        console.log('  使用 --apply 写入 mcp.json');
      }
    }
    if (!opts.dryRun || opts.apply) {
      // Find mcp.json
      const openclawDir = require('path').join(require('os').homedir(), '.openclaw', 'config');
      const mcpJsonPath = require('path').join(openclawDir, 'mcp.json');
      let mcpJson = { mcpServers: {} };
      if (fs.existsSync(mcpJsonPath)) {
        try {
          mcpJson = JSON.parse(fs.readFileSync(mcpJsonPath, 'utf-8'));
          // Handle legacy array format
          if (Array.isArray(mcpJson.mcpServers)) {
            const legacy = mcpJson.mcpServers;
            mcpJson.mcpServers = {};
            legacy.forEach(item => {
              const key = Object.keys(item)[0];
              if (key) mcpJson.mcpServers[key] = item[key];
            });
          }
        } catch (e) {
          console.error('  警告: mcp.json 解析失败，将创建新文件');
          mcpJson = { mcpServers: {} };
        }
      } else {
        console.log('  mcp.json 不存在，将创建新文件');
      }
      if (!mcpJson.mcpServers || typeof mcpJson.mcpServers !== 'object') {
        mcpJson.mcpServers = {};
      }

      // Check for existing entry
      const isOverwrite = !!mcpJson.mcpServers[mcpId];
      if (isOverwrite && !opts.force) {
        console.error('  警告: ' + mcpId + ' 已存在于 mcp.json 中');
        console.error('  使用 --force 覆盖现有条目');
        process.exit(1);
      }
      mcpJson.mcpServers[mcpId] = mcpConfig;
      console.log('  已' + (isOverwrite ? '覆盖' : '添加') + '条目: ' + mcpId);
      if (!fs.existsSync(openclawDir)) fs.mkdirSync(openclawDir, { recursive: true });
      fs.writeFileSync(mcpJsonPath, JSON.stringify(mcpJson, null, 2), 'utf-8');
      console.log('');
      console.log('  已写入: ' + mcpJsonPath);
      console.log('');
      console.log('  下一步:');
      console.log('    1. 重启 OpenClaw Gateway: openclaw gateway restart');
      console.log('    2. 验证安装: hub discover ' + mcpId + ' --installed');
      console.log('    3. 扫描新配置: hub scan');
    }
  });

prog.parse(process.argv);
if (!process.argv.slice(2).length) prog.outputHelp();
