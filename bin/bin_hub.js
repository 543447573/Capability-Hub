#!/usr/bin/env node
// OpenClaw Capability Hub v1.5.0 - CLI Entry Point
const { Command } = require('commander');
const CapabilityHub = require('../src/hub.js');
const { recommend, analyzeIntent } = require('../src/recommend.js');
const LinksManager = require('../src/links.js');

const hub = new CapabilityHub();
const links = new LinksManager();
const prog = new Command();

function p(data) { console.log(JSON.stringify(data, null, 2)); }

prog.name('hub').description('OpenClaw Capability Hub v1.5.0').version('1.5.0');

// ─── INFO ───────────────────────────────────────────────────────────────────
prog.command('info').description('Hub info').option('--json').action((opts) => {
  const i = hub.getInfo();
  const ls = links.getStats();
  if (opts.json) { p({ ...i, links: ls }); return; }
  console.log('');
  console.log('  OpenClaw Capability Hub v' + i.version);
  console.log('  Capabilities : ' + i.capabilities);
  console.log('  Categories   : ' + i.categories);
  console.log('  Skills       : ' + ls.totalSkills);
  console.log('  Links        : ' + ls.totalLinks + ' (cap↔skill)');
  console.log('  Last Scan    : ' + (i.lastScanned || 'never'));
  console.log('  Registry     : ' + i.registryPath);
  console.log('');
});

// ─── LIST ───────────────────────────────────────────────────────────────────
prog.command('list').description('List capabilities')
  .option('-p,--page [n]', 'Page', '1')
  .option('-l,--limit [n]', 'Limit', '20')
  .option('-s,--sort [f]', 'Sort', 'name')
  .option('-c,--category [cat]')
  .option('-t,--tag [tag]')
  .option('--json')
  .action((opts) => {
    const r = hub.listCapabilities(opts);
    if (opts.json) { p(r); return; }
    console.log('');
    console.log('  Capabilities: ' + r.total + ' (page ' + r.page + '/' + r.pages + ')');
    if (r.items.length === 0) { console.log('  No capabilities. Run: hub scan'); console.log(''); return; }
    console.log('');
    r.items.forEach(c => {
      const used = links.isUsed(c.id) ? '*' : ' ';
      const id = (c.id||'').padEnd(28);
      const nm = (c.name||'').slice(0,22).padEnd(22);
      const tp = (c.type||'').padEnd(8);
      const tg = (c.tags||[]).slice(0,4).join(',');
      console.log('  ' + used + id + ' ' + nm + ' ' + tp + ' ' + tg);
    });
    console.log('');
  });

// ─── SEARCH ─────────────────────────────────────────────────────────────────
prog.command('search [keyword]').description('Search capabilities')
  .option('-t,--tag [tag]')
  .option('-c,--category [cat]')
  .option('-l,--limit [n]', 'Limit', '20')
  .option('--json')
  .action((kw, opts) => {
    if (!kw) { kw = ''; }
    const r = hub.search(kw, opts);
    if (opts.json) { p(r); return; }
    console.log('');
    console.log('  Search: "' + kw + '" => ' + r.total + ' found');
    if (r.items.length === 0) { console.log(''); return; }
    r.items.forEach((c, i) => {
      const pct = Math.min(100, Math.round(c._score || 0));
      const bar = '#'.repeat(Math.max(0, Math.round(pct/20))) + '-'.repeat(Math.max(0, 5-Math.round(pct/20)));
      const used = links.isUsed(c.id) ? '*' : ' ';
      console.log('');
      console.log('  ' + used + (i+1) + '. ' + c.name + ' [' + c.id + ']');
      console.log('      Score: ' + bar + ' ' + pct + '%');
      const desc = c.description || '';
      for (let j=0; j<desc.length; j+=75) {
        console.log('      ' + desc.slice(j, j+75));
      }
      if (c.tags.length > 0) console.log('      Tags: ' + c.tags.slice(0,6).join(', '));
    });
    console.log('');
  });

// ─── RECOMMEND (V1.5) ───────────────────────────────────────────────────────
prog.command('recommend [description]').description('V1.5: Recommend capabilities for a skill idea')
  .option('-l,--limit [n]', 'Max results', '5')
  .option('-s,--min-score [n]', 'Min score', '10')
  .option('-i,--intent', 'Show intent analysis only')
  .option('-a,--add [skillId]', 'Add recommended capabilities to a skill after showing')
  .option('--json')
  .action((desc, opts) => {
    if (!desc) {
      console.error('Error: provide a description (e.g., hub recommend "帮我获取天气数据")');
      process.exit(1);
    }
    
    // Intent analysis
    const intent = analyzeIntent(desc);
    if (opts.intent) {
      if (opts.json) { p(intent); } else {
        console.log('');
        console.log('  Intent Analysis: "' + desc + '"');
        console.log('  Primary Intent: ' + (intent.primary || 'unknown'));
        console.log('');
        console.log('  All detected intents:');
        intent.all.forEach(t => console.log('    * ' + t.intent + ' (score: ' + t.score + ', matched: ' + t.matched + ')'));
        console.log('');
      }
      return;
    }
    
    // Recommendation
    const caps = hub.registry.capabilities;
    const result = recommend(caps, desc, { limit: parseInt(opts.limit), minScore: parseInt(opts.minScore) });
    
    if (opts.json) {
      p({ ...result, intent });
      return;
    }
    
    console.log('');
    console.log('  ============================================');
    console.log('  Recommend: "' + desc + '"');
    console.log('  ============================================');
    console.log('');
    console.log('  Intent: ' + (intent.primary || 'unknown'));
    console.log('  Keywords: ' + result.keywords.slice(0, 8).join(', '));
    console.log('');
    console.log('  ' + result.message);
    console.log('');
    
    if (result.items.length === 0) {
      console.log('  No matching capabilities found.');
      console.log('  Try: hub scan to discover MCP capabilities first.');
      console.log('');
      return;
    }
    
    console.log('  Top Recommendations:');
    console.log('');
    result.items.forEach((item, i) => {
      const pct = Math.min(100, Math.round(item.score));
      const bar = '#'.repeat(Math.max(0, Math.round(pct/20))) + '-'.repeat(Math.max(0, 5-Math.round(pct/20)));
      const used = links.isUsed(item.capability.id) ? ' [IN USE]' : '';
      console.log('  ' + (i+1) + '. ' + item.capability.name + ' [' + item.capability.id + ']' + used);
      console.log('     Relevance: ' + bar + ' ' + pct + '%');
      console.log('     ' + item.capability.description.slice(0, 70));
      if (item.reasons.length > 0) {
        const reasonText = item.reasons.map(r => r.reason).join(', ');
        console.log('     Why: ' + reasonText);
      }
      if (item.capability.tags.length > 0) {
        console.log('     Tags: ' + item.capability.tags.join(', '));
      }
      console.log('');
    });
    
    // Accuracy metric
    if (result.items.length >= 3) {
      const top3Relevant = result.items.slice(0, 3).filter(i => i.matchedKeywords >= 1).length;
      const accuracy = Math.round((top3Relevant / 3) * 100);
      console.log('  Accuracy (Top 3): ' + top3Relevant + '/3 relevant (' + accuracy + '% target: >=70%)');
    }
    
    // Show discovery command
    console.log('');
    console.log('  Tip: To add a capability to a skill:');
    console.log('    hub link ' + (result.items[0] ? result.items[0].capability.id : '<cap_id>') + ' <skill_name>');
    console.log('');
    
    // Auto-add mode
    if (opts.add) {
      const skillId = opts.add;
      let added = 0;
      result.items.forEach(item => {
        try {
          links.link(item.capability.id, skillId, {
            skillName: skillId,
            capName: item.capability.name
          });
          added++;
        } catch(e) {
          // skip
        }
      });
      console.log('  + Linked ' + added + ' capabilities to skill "' + skillId + '"');
      console.log('');
    }
  });

// ─── LINK (V1.5) ─────────────────────────────────────────────────────────────
prog.command('link').description('V1.5: Link capability to a skill')
  .option('-c,--capability [capId]', 'Capability ID (required)')
  .option('-s,--skill [skillId]', 'Skill ID (required)')
  .option('-l,--list', 'List all links')
  .option('--skill-links [skillId]', 'Show capabilities for a specific skill')
  .option('--cap-links [capId]', 'Show skills using a specific capability')
  .option('--stats', 'Show link statistics')
  .option('--discover', 'Discover skills from filesystem')
  .option('--unlink', 'Remove link instead of adding')
  .option('--json')
  .action((opts) => {
    // List all links
    if (opts.list) {
      const skills = links.listSkills();
      const caps = links.listCapabilityUsage();
      if (opts.json) { p({ skills, capabilities: caps }); return; }
      console.log('');
      console.log('  Skills (' + skills.length + '):');
      skills.forEach(s => {
        console.log('  * ' + s.name + ' (' + s.skillId + ')');
        console.log('    Capabilities: ' + s.capabilities.join(', '));
      });
      if (skills.length === 0) console.log('  No skills linked yet.');
      console.log('');
      console.log('  Most Used Capabilities:');
      caps.slice(0, 5).forEach(c => {
        console.log('  * ' + c.name + ' [' + c.capabilityId + '] used by ' + c.skillCount + ' skill(s)');
      });
      console.log('');
      return;
    }
    
    // Show stats
    if (opts.stats) {
      const stats = links.getStats();
      if (opts.json) { p(stats); return; }
      console.log('');
      console.log('  Link Statistics:');
      console.log('  Total Skills    : ' + stats.totalSkills);
      console.log('  Total Capabilities: ' + stats.totalCapabilities);
      console.log('  Total Links     : ' + stats.totalLinks);
      console.log('  Avg Caps/Skill  : ' + stats.avgCapabilitiesPerSkill);
      console.log('  Avg Skills/Cap  : ' + stats.avgSkillsPerCapability);
      console.log('  Last Updated    : ' + stats.lastUpdated);
      console.log('');
      return;
    }
    
    // Discover skills
    if (opts.discover) {
      const discovered = links.discoverSkills();
      if (opts.json) { p(discovered); return; }
      console.log('');
      console.log('  Discovered Skills (' + discovered.length + '):');
      discovered.forEach(s => {
        console.log('  * ' + s.name + ' (' + s.skillId + ')');
        console.log('    ' + s.description);
      });
      console.log('');
      return;
    }
    
    // Show skill links
    if (opts.skillLinks) {
      const data = links.getSkillCapabilities(opts.skillLinks);
      if (opts.json) { p(data); return; }
      console.log('');
      console.log('  Skill: ' + opts.skillLinks);
      if (!data) { console.log('  No capabilities linked.'); console.log(''); return; }
      console.log('  Linked Capabilities:');
      data.capabilities.forEach(c => {
        const cap = hub.getCapability(c);
        const name = cap ? cap.name : c;
        console.log('  * ' + name + ' [' + c + ']');
      });
      console.log('');
      return;
    }
    
    // Show capability links
    if (opts.capLinks) {
      const data = links.getCapabilitySkills(opts.capLinks);
      if (opts.json) { p(data); return; }
      console.log('');
      console.log('  Capability: ' + opts.capLinks);
      if (!data) { console.log('  Not used by any skill.'); console.log(''); return; }
      console.log('  Used by Skills:');
      data.skills.forEach(s => console.log('  * ' + s));
      console.log('');
      return;
    }
    
    // Link or unlink
    if (!opts.capability || !opts.skill) {
      console.error('Error: --capability and --skill are required');
      console.log('  Examples:');
      console.log('    hub link --capability mcp/filesystem --skill my-skill');
      console.log('    hub link --capability api/openai-chat --skill ai-writer --unlink');
      process.exit(1);
    }
    
    // Verify capability exists
    const cap = hub.getCapability(opts.capability);
    if (!cap) {
      console.error('Error: capability not found: ' + opts.capability);
      console.log('  Run: hub list');
      process.exit(1);
    }
    
    if (opts.unlink) {
      links.unlink(opts.capability, opts.skill);
      console.log('');
      console.log('  - Unlinked: ' + opts.capability + ' from skill "' + opts.skill + '"');
      console.log('');
    } else {
      const result = links.link(opts.capability, opts.skill, {
        skillName: opts.skill,
        capName: cap.name
      });
      console.log('');
      console.log('  + Linked: ' + cap.name + ' [' + opts.capability + ']');
      console.log('    to skill: ' + opts.skill);
      console.log('');
    }
  });

// ─── GET ─────────────────────────────────────────────────────────────────────
prog.command('get [id]').description('Get capability details')
  .option('-e,--example [n]')
  .option('--json')
  .action((id, opts) => {
    const c = hub.getCapability(id);
    if (!c) { console.error('Not found: ' + id); process.exit(1); }
    if (opts.json) { p(c); return; }
    const usage = links.getCapabilitySkills(id);
    console.log('');
    console.log('  ' + c.name);
    console.log('  ID: ' + c.id);
    console.log('');
    console.log('  Description:');
    console.log('  ' + (c.description||''));
    console.log('');
    console.log('  Category: ' + (c.category||[]).join(', '));
    console.log('  Tags: ' + (c.tags||[]).join(', '));
    console.log('  Type: ' + (c.type||'') + '   Version: ' + (c.version||''));
    console.log('  Provider: ' + (c.provider||''));
    if (c.author) console.log('  Author: ' + c.author);
    if (c.homepage) console.log('  Docs: ' + c.homepage);
    if (usage && usage.skills.length > 0) {
      console.log('');
      console.log('  Used by ' + usage.skills.length + ' skill(s): ' + usage.skills.join(', '));
    }
    if (c.config && c.config.command) {
      console.log('');
      console.log('  Config:');
      console.log('    Command: ' + c.config.command);
      if (c.config.args && c.config.args.length) console.log('    Args: ' + c.config.args.join(' '));
    }
    if (c.examples && c.examples.length > 0) {
      console.log('');
      console.log('  Examples:');
      c.examples.forEach((ex, i) => {
        console.log('  ' + (i+1) + '. ' + (ex.title||''));
        const lines = (ex.code||'').split('\n');
        lines.forEach(l => console.log('    ' + l));
      });
    }
    console.log('');
    console.log('  Created: ' + c.createdAt + '   Updated: ' + c.updatedAt);
    console.log('');
  });

// ─── ADD ─────────────────────────────────────────────────────────────────────
prog.command('add [id]').description('Add capability')
  .option('-n,--name [name]')
  .option('-d,--description [desc]')
  .option('-t,--type [type]')
  .option('-c,--category [cats]')
  .option('-g,--tags [tags]')
  .option('-p,--provider [p]')
  .option('-f,--file [path]')
  .option('--json')
  .action((id, opts) => {
    if (opts.file) {
      const r = hub.importFromFile(opts.file);
      console.log('');
      console.log('  + Imported: added=' + r.added + ' skipped=' + r.skipped);
      console.log('');
      return;
    }
    if (!id) { console.error('Error: provide capability ID'); process.exit(1); }
    if (!opts.name || !opts.description) {
      console.error('Error: -n/--name and -d/--description are required');
      console.log('  Example: hub add mcp/mytool -n "My Tool" -d "A useful tool"');
      process.exit(1);
    }
    try {
      const c = hub.addCapability({
        id, name: opts.name, description: opts.description,
        type: opts.type || 'mcp',
        category: opts.category ? opts.category.split(',').map(s=>s.trim()) : [],
        tags: opts.tags ? opts.tags.split(',').map(s=>s.trim()) : [],
        provider: opts.provider || 'user'
      });
      console.log('');
      console.log('  + Added: ' + c.id + ' - ' + c.name);
      console.log('');
    } catch(e) { console.error('Error: ' + e.message); process.exit(1); }
  });

// ─── EDIT ─────────────────────────────────────────────────────────────────────
prog.command('edit [id]').description('Edit capability')
  .option('-n,--name [name]')
  .option('-d,--description [desc]')
  .option('-c,--category [cats]')
  .option('-g,--tags [tags]')
  .option('--json')
  .action((id, opts) => {
    if (!id) { console.error('Error: provide capability ID'); process.exit(1); }
    const u = {};
    if (opts.name) u.name = opts.name;
    if (opts.description) u.description = opts.description;
    if (opts.category) u.category = opts.category.split(',').map(s=>s.trim());
    if (opts.tags) u.tags = opts.tags.split(',').map(s=>s.trim());
    if (Object.keys(u).length === 0) { console.error('Error: provide at least one field'); process.exit(1); }
    const c = hub.updateCapability(id, u);
    if (!c) { console.error('Not found: ' + id); process.exit(1); }
    console.log('');
    console.log('  + Updated: ' + c.id);
    console.log('');
  });

// ─── DELETE ───────────────────────────────────────────────────────────────────
prog.command('delete [id]').description('Delete capability')
  .option('-f,--force')
  .action((id, opts) => {
    if (!id) { console.error('Error: provide capability ID'); process.exit(1); }
    if (!opts.force) { console.error('Use --force to confirm deletion'); process.exit(1); }
    if (!hub.deleteCapability(id)) { console.error('Not found: ' + id); process.exit(1); }
    console.log('');
    console.log('  + Deleted: ' + id);
    console.log('');
  });

// ─── SCAN ─────────────────────────────────────────────────────────────────────
prog.command('scan').description('Scan MCP configs').option('--json')
  .action(async (opts) => {
    console.log('');
    console.log('  Scanning MCP configs...');
    const results = await hub.scanMCPConfigs();
    if (opts.json) { p(results); return; }
    const added = results.filter(r=>r.status==='added');
    const exists = results.filter(r=>r.status==='exists').length;
    const errors = results.filter(r=>r.status==='error');
    if (added.length > 0) {
      console.log('  + Added: ' + added.length);
      added.forEach(r => console.log('    ' + r.capability.id + ' - ' + r.capability.name));
    }
    if (exists > 0) console.log('  - Already exists: ' + exists);
    if (errors.length > 0) {
      console.log('  ! Errors: ' + errors.length);
      errors.forEach(r=>console.log('    ' + r.path + ': ' + r.message));
    }
    if (added.length === 0 && exists === 0 && errors.length === 0) {
      console.log('  No MCP configs found. Check ~/.openclaw/config/');
    }
    console.log('');
    console.log('  Total capabilities: ' + hub.getInfo().capabilities);
    console.log('');
  });

// ─── CATEGORIES ───────────────────────────────────────────────────────────────
prog.command('categories').description('List categories').option('--json')
  .action((opts) => {
    const cats = hub.getCategories();
    if (opts.json) { p(cats); return; }
    console.log('');
    console.log('  Categories:');
    cats.forEach(cat => {
      const capCount = hub.listCapabilities({ category: cat.id, limit: 100 }).total;
      console.log('  * ' + cat.name + ' (' + cat.id + ') [' + capCount + ']');
      if (cat.children) cat.children.forEach(ch => {
        const childCount = hub.listCapabilities({ category: ch.id, limit: 100 }).total;
        console.log('    + ' + ch.name + ' (' + ch.id + ') [' + childCount + ']');
      });
    });
    console.log('');
  });

// ─── EXPORT ───────────────────────────────────────────────────────────────────
prog.command('export [file]').description('Export registry')
  .action((file) => {
    const fp = file || 'capability-registry.json';
    hub.exportToFile(fp);
    console.log('');
    console.log('  + Exported: ' + fp);
    console.log('');
  });

// ─── POPULATE (dev helper - add sample capabilities) ─────────────────────────
prog.command('populate').description('Add sample capabilities for demo')
  .action(() => {
    const samples = [
      { id: 'mcp/filesystem', name: 'File System', description: 'Provides file system operations - read, write, list directories, create folders', type: 'mcp', category: ['file/system'], tags: ['filesystem','read','write','file','folder'] },
      { id: 'mcp/browser', name: 'Browser Control', description: 'Browser automation and web scraping capabilities', type: 'mcp', category: ['browser/web'], tags: ['browser','automation','web','scrape','crawl'] },
      { id: 'api/openai-chat', name: 'OpenAI Chat', description: 'OpenAI GPT model chat API interface for AI conversations', type: 'api', category: ['ai/openai'], tags: ['openai','gpt','chat','ai','llm'] },
      { id: 'api/weather', name: 'Weather API', description: 'Real-time weather data and forecast API integration', type: 'api', category: ['network/http'], tags: ['weather','forecast','api','http'] },
      { id: 'mcp/email', name: 'Email', description: 'Send and receive emails via SMTP and IMAP protocols', type: 'mcp', category: ['social/email'], tags: ['email','smtp','imap','send','receive'] },
      { id: 'mcp/slack', name: 'Slack', description: 'Slack messaging integration for sending messages and managing channels', type: 'mcp', category: ['social/slack'], tags: ['slack','message','notify','channel'] },
      { id: 'mcp/clipboard', name: 'Clipboard', description: 'System clipboard read/write operations', type: 'mcp', category: ['system/clipboard'], tags: ['clipboard','copy','paste','system'] },
      { id: 'mcp/notification', name: 'System Notification', description: 'Send native system notifications and alerts', type: 'mcp', category: ['system/notification'], tags: ['notification','alert','system','notify'] },
      { id: 'api/news', name: 'News API', description: 'Real-time news aggregation and search API', type: 'api', category: ['network/http'], tags: ['news','rss','feed','search'] },
      { id: 'mcp/database', name: 'Database', description: 'SQL and NoSQL database operations - query, insert, update', type: 'mcp', category: ['system/database'], tags: ['database','sql','mongodb','query'] },
      { id: 'mcp/image', name: 'Image Processing', description: 'Image manipulation, transformation, and analysis capabilities', type: 'mcp', category: ['system/media'], tags: ['image','resize','convert','thumbnail','ocr'] },
      { id: 'api/translate', name: 'Translation API', description: 'Multi-language translation using AI models', type: 'api', category: ['ai/local'], tags: ['translate','language','nlp','ai'] },
      { id: 'mcp/calendar', name: 'Calendar', description: 'Calendar integration for scheduling and event management', type: 'mcp', category: ['social/calendar'], tags: ['calendar','schedule','event','appointment'] },
      { id: 'mcp/tts', name: 'Text to Speech', description: 'Convert text to natural speech using TTS engines', type: 'mcp', category: ['ai/local'], tags: ['tts','speech','audio','synthesis'] },
      { id: 'mcp/screenshot', name: 'Screenshot', description: 'Capture screenshots of web pages and desktop', type: 'mcp', category: ['browser/web'], tags: ['screenshot','capture','image','web'] }
    ];
    let added = 0, skipped = 0;
    samples.forEach(s => {
      if (!hub.getCapability(s.id)) {
        hub.addCapability(s);
        added++;
      } else { skipped++; }
    });
    console.log('');
    console.log('  + Added: ' + added + ' sample capabilities');
    console.log('  - Skipped: ' + skipped + ' (already existed)');
    console.log('');
  });

// ─── INTENT (standalone) ───────────────────────────────────────────────────────
prog.command('intent [text]').description('Analyze intent of a natural language query')
  .option('--json')
  .action((text, opts) => {
    if (!text) {
      console.error('Error: provide text to analyze');
      process.exit(1);
    }
    const result = analyzeIntent(text);
    if (opts.json) { p(result); return; }
    console.log('');
    console.log('  Intent Analysis: "' + text + '"');
    console.log('');
    console.log('  Primary Intent: ' + (result.primary || 'unknown'));
    console.log('');
    console.log('  All Detected:');
    if (result.all.length === 0) {
      console.log('    (none)');
    } else {
      result.all.forEach(t => {
        const bar = '#'.repeat(Math.min(10, t.score)) + '-'.repeat(Math.max(0, 10-t.score));
        console.log('    ' + bar + ' ' + t.intent + ' (score: ' + t.score + ')');
      });
    }
    console.log('');
  });

// ─── PARSE ─────────────────────────────────────────────────────────────────────
prog.command('parse [text]').description('Extract keywords from natural language text')
  .option('--json')
  .action((text, opts) => {
    if (!text) { console.error('Error: provide text'); process.exit(1); }
    const { extractKeywords } = require('../src/recommend.js');
    const keywords = extractKeywords(text);
    if (opts.json) { p({ text, keywords }); return; }
    console.log('');
    console.log('  Text: "' + text + '"');
    console.log('  Keywords: ' + keywords.join(', '));
    console.log('');
  });

prog.parse(process.argv);
if (!process.argv.slice(2).length) prog.outputHelp();
