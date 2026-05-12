// OpenClaw Capability Hub - Skill Capability Link Manager (V1.5)
// Tracks which capabilities are used by which Skills

const fs = require('fs');
const path = require('path');

const LINKS_FILE = path.join(
  process.env.USERPROFILE || process.env.HOME,
  '.qclaw', 'capability-hub', 'data', 'links.json'
);

class LinksManager {
  constructor() {
    this.ensureDataDir();
    this.links = this.load();
  }

  ensureDataDir() {
    const dir = path.dirname(LINKS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  load() {
    if (!fs.existsSync(LINKS_FILE)) {
      return { skills: {}, capabilities: {}, lastUpdated: null };
    }
    try {
      return JSON.parse(fs.readFileSync(LINKS_FILE, 'utf-8'));
    } catch (e) {
      return { skills: {}, capabilities: {}, lastUpdated: null };
    }
  }

  save() {
    this.links.lastUpdated = new Date().toISOString();
    fs.writeFileSync(LINKS_FILE, JSON.stringify(this.links, null, 2), 'utf-8');
  }

  // Link a capability to a skill
  link(capabilityId, skillId, opts) {
    opts = opts || {};
    if (!this.links.skills[skillId]) {
      this.links.skills[skillId] = { capabilities: [], name: opts.skillName || skillId, addedAt: new Date().toISOString() };
    }
    if (!this.links.skills[skillId].capabilities.includes(capabilityId)) {
      this.links.skills[skillId].capabilities.push(capabilityId);
    }
    if (!this.links.capabilities[capabilityId]) {
      this.links.capabilities[capabilityId] = { skills: [], name: opts.capName || capabilityId, addedAt: new Date().toISOString() };
    }
    if (!this.links.capabilities[capabilityId].skills.includes(skillId)) {
      this.links.capabilities[capabilityId].skills.push(skillId);
    }
    this.save();
    return { skill: skillId, capability: capabilityId, added: true };
  }

  // Unlink a capability from a skill
  unlink(capabilityId, skillId) {
    if (this.links.skills[skillId]) {
      const idx = this.links.skills[skillId].capabilities.indexOf(capabilityId);
      if (idx !== -1) this.links.skills[skillId].capabilities.splice(idx, 1);
    }
    if (this.links.capabilities[capabilityId]) {
      const idx = this.links.capabilities[capabilityId].skills.indexOf(skillId);
      if (idx !== -1) this.links.capabilities[capabilityId].skills.splice(idx, 1);
    }
    this.save();
    return true;
  }

  // Get capabilities used by a skill
  getSkillCapabilities(skillId) {
    return this.links.skills[skillId] || null;
  }

  // Get skills using a capability
  getCapabilitySkills(capabilityId) {
    return this.links.capabilities[capabilityId] || null;
  }

  // List all skills with their capabilities
  listSkills() {
    return Object.entries(this.links.skills).map(([id, data]) => ({
      skillId: id,
      name: data.name,
      capabilityCount: data.capabilities.length,
      capabilities: data.capabilities,
      addedAt: data.addedAt
    }));
  }

  // List all capabilities with their skill usage
  listCapabilityUsage() {
    return Object.entries(this.links.capabilities).map(([id, data]) => ({
      capabilityId: id,
      name: data.name,
      skillCount: data.skills.length,
      skills: data.skills,
      addedAt: data.addedAt
    })).sort((a, b) => b.skillCount - a.skillCount);
  }

  // Get all skills
  getAllSkills() {
    return Object.keys(this.links.skills);
  }

  // Check if capability is used
  isUsed(capabilityId) {
    return (this.links.capabilities[capabilityId] || { skills: [] }).skills.length > 0;
  }

  // Get all capability IDs used by any skill
  getUsedCapabilityIds() {
    return Object.keys(this.links.capabilities);
  }

  // Stats
  getStats() {
    const skillCount = Object.keys(this.links.skills).length;
    const capCount = Object.keys(this.links.capabilities).length;
    const totalLinks = Object.values(this.links.capabilities).reduce((sum, c) => sum + c.skills.length, 0);
    const avgCapsPerSkill = skillCount > 0 ? (totalLinks / skillCount).toFixed(1) : 0;
    const avgSkillsPerCap = capCount > 0 ? (totalLinks / capCount).toFixed(1) : 0;
    return {
      totalSkills: skillCount,
      totalCapabilities: capCount,
      totalLinks,
      avgCapabilitiesPerSkill: parseFloat(avgCapsPerSkill),
      avgSkillsPerCapability: parseFloat(avgSkillsPerCap),
      lastUpdated: this.links.lastUpdated,
      linksFile: LINKS_FILE
    };
  }

  // Discover skills from filesystem
  discoverSkills() {
    const openclawSkillsDir = path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'workspace', 'skills');
    const qclawSkillsDir = path.join(process.env.USERPROFILE || process.env.HOME, '.qclaw', 'skills');
    const discovered = [];
    
    const dirs = [openclawSkillsDir, qclawSkillsDir];
    
    for (const dir of dirs) {
      if (fs.existsSync(dir)) {
        const items = fs.readdirSync(dir);
        for (const item of items) {
          const skillDir = path.join(dir, item);
          if (fs.statSync(skillDir).isDirectory()) {
            const skillMd = path.join(skillDir, 'SKILL.md');
            if (fs.existsSync(skillMd)) {
              try {
                const content = fs.readFileSync(skillMd, 'utf-8');
                const nameMatch = content.match(/^name:\s*(.+)$/m);
                const descMatch = content.match(/^description:\s*(.+)/m);
                discovered.push({
                  skillId: item,
                  name: nameMatch ? nameMatch[1].trim() : item,
                  description: descMatch ? descMatch[1].trim().slice(0, 100) : '',
                  dir
                });
              } catch (e) {
                // skip
              }
            }
          }
        }
      }
    }
    
    return discovered;
  }
}

module.exports = LinksManager;
module.exports.LINKS_FILE = LINKS_FILE;
