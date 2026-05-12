// OpenClaw Capability Hub - NPM Registry Discovery
const https = require('https');

const NPM_REGISTRY_API = 'https://registry.npmjs.org';

/**
 * Search NPM registry for MCP-related packages
 * @param {string} query - Search keyword
 * @param {number} limit - Max results to return (default: 10)
 * @returns {Promise<Array>} Array of NPM search results
 */
function searchNPM(query, limit = 10) {
  return new Promise((resolve, reject) => {
    const encodedQuery = encodeURIComponent(query);
    const url = `${NPM_REGISTRY_API}/-/v1/search?text=mcp+${encodedQuery}&size=${limit}&quality=0.65&maintenance=0.5&popularity=0.5`;

    https.get(url, { headers: { Accept: 'application/json' } }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`NPM API returned ${res.statusCode}`));
        return;
      }

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const results = (json.objects || []).map(formatNPMPackage);
          resolve(results);
        } catch (e) {
          reject(new Error('Failed to parse NPM response: ' + e.message));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Fetch full package metadata from NPM
 * @param {string} packageName - NPM package name
 * @returns {Promise<Object>} Full package metadata
 */
function fetchNPMPackageMeta(packageName) {
  return new Promise((resolve, reject) => {
    const url = `${NPM_REGISTRY_API}/${encodeURIComponent(packageName)}`;

    https.get(url, { headers: { Accept: 'application/json' } }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`NPM API returned ${res.statusCode} for ${packageName}`));
        return;
      }

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Failed to parse NPM package metadata: ' + e.message));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Format NPM search result into display-friendly format
 */
function formatNPMPackage(obj) {
  const pkg = obj.package || {};
  const dl = obj.downloads || {};

  return {
    name: pkg.name,
    description: pkg.description || 'No description available',
    version: pkg.version,
    keywords: pkg.keywords || [],
    publisher: pkg.publisher ? pkg.publisher.username : 'unknown',
    license: pkg.license || 'unknown',
    homepage: pkg.links ? pkg.links.homepage : null,
    npmUrl: pkg.links ? pkg.links.npm : `https://www.npmjs.com/package/${pkg.name}`,
    repository: pkg.links ? pkg.links.repository : null,
    bugs: pkg.links ? pkg.links.bugs : null,
    downloads: {
      monthly: dl.monthly || 0,
      weekly: dl.weekly || 0,
    },
    dependents: obj.dependents || '0',
    searchScore: Math.round(obj.searchScore || 0),
    qualityScore: obj.score ? Math.round(obj.score.detail.quality * 100) : 0,
    maintenanceScore: obj.score ? Math.round(obj.score.detail.maintenance * 100) : 0,
    updated: obj.updated || null,
    flags: obj.flags || {},
  };
}

/**
 * Infer category from NPM keywords
 */
function inferCategory(keywords = [], description = '') {
  const text = (keywords.join(' ') + ' ' + description).toLowerCase();

  const categoryMap = [
    { keywords: ['browser', 'playwright', 'puppeteer', 'chrome', 'devtools', 'web'], category: 'browser' },
    { keywords: ['filesystem', 'fs', 'file', 'storage'], category: 'file' },
    { keywords: ['openai', 'claude', 'gemini', 'llm', 'ai', 'gpt', 'anthropic', 'ollama', 'localai'], category: 'ai' },
    { keywords: ['slack', 'discord', 'teams', 'telegram', 'email', 'notification', 'sendgrid', 'resend'], category: 'communication' },
    { keywords: ['http', 'fetch', 'request', 'api', 'rest', 'graphql'], category: 'network' },
    { keywords: ['sql', 'postgres', 'mysql', 'mongodb', 'database', 'redis', 'pg', 'sqlite'], category: 'database' },
    { keywords: ['github', 'gitlab', 'bitbucket', 'git', 'repo'], category: 'code' },
    { keywords: ['aws', 's3', 'gcp', 'azure', 'cloud'], category: 'cloud' },
    { keywords: ['memory', 'context', 'knowledge', 'embedding', 'vector', 'pinecone', 'qdrant'], category: 'knowledge' },
    { keywords: ['image', 'vision', 'video', 'media', 'ffmpeg', 'audio', 'transcribe', 'whisper'], category: 'media' },
    { keywords: ['sentry', 'datadog', 'monitoring', 'logging', 'log'], category: 'monitoring' },
    { keywords: ['everart', 'brave', 'search'], category: 'search' },
  ];

  for (const entry of categoryMap) {
    if (entry.keywords.some(k => text.includes(k))) {
      return entry.category;
    }
  }
  return 'general';
}

/**
 * Infer capabilities from keywords and description
 */
function inferCapabilities(keywords = [], description = '') {
  const text = (keywords.join(' ') + ' ' + description).toLowerCase();
  const caps = [];

  const capabilityMap = [
    { keywords: ['browser', 'playwright', 'puppeteer', 'chrome'], caps: ['Browser Automation', 'Take Screenshots', 'Web Scraping'] },
    { keywords: ['filesystem', 'fs', 'file'], caps: ['Read Files', 'Write Files', 'List Directory'] },
    { keywords: ['openai', 'claude', 'llm', 'ai', 'gpt', 'anthropic'], caps: ['AI Chat', 'Text Generation', 'Embeddings'] },
    { keywords: ['slack'], caps: ['Send Slack Message', 'Read Slack Channels', 'Slack Notifications'] },
    { keywords: ['github'], caps: ['GitHub API', 'Repository Management', 'Issues', 'PR'] },
    { keywords: ['http', 'fetch', 'request', 'api'], caps: ['HTTP Requests', 'API Calls'] },
    { keywords: ['sql', 'postgres', 'mysql', 'database'], caps: ['Query Database', 'Database Operations'] },
    { keywords: ['memory', 'context'], caps: ['Store Memories', 'Context Retrieval'] },
    { keywords: ['image', 'vision'], caps: ['Image Analysis', 'Vision Processing'] },
    { keywords: ['search', 'brave'], caps: ['Web Search', 'Find Information'] },
    { keywords: ['sentry'], caps: ['Error Tracking', 'Performance Monitoring'] },
    { keywords: ['email', 'sendgrid', 'resend'], caps: ['Send Email', 'Email Notifications'] },
    { keywords: ['aws', 's3', 'cloud'], caps: ['Cloud Storage', 'S3 Operations'] },
  ];

  for (const entry of capabilityMap) {
    if (entry.keywords.some(k => text.includes(k))) {
      caps.push(...entry.caps);
    }
  }

  // Remove duplicates and limit
  return [...new Set(caps)].slice(0, 6);
}

/**
 * Generate ID from package name
 */
function generateId(packageName) {
  return packageName
    .replace(/^@/, '')           // Remove @ prefix
    .replace(/\//g, '_')         // Replace / with _
    .replace(/[^a-zA-Z0-9_-]/g, '') // Remove invalid chars
    .toLowerCase();
}

/**
 * Generate configTemplate from package info
 */
function generateConfigTemplate(pkg) {
  const packageName = pkg.name;
  const repoUrl = pkg.repository;

  // Try to determine the executable command from repo URL
  let command = 'npx';
  let args = ['-y', packageName];

  if (repoUrl && repoUrl.includes('github.com')) {
    // Extract GitHub repo for direct execution
    const match = repoUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
    if (match) {
      const [, org, repo] = match;
      args = ['-y', `${org}/${repo}`];
    }
  }

  return {
    command,
    args,
    env: {}
  };
}

/**
 * Convert NPM package to catalog format
 */
function convertToCatalogFormat(npmPkg, fullMeta = null) {
  const pkg = fullMeta || npmPkg;
  const keywords = pkg.keywords || npmPkg.keywords || [];
  const description = pkg.description || npmPkg.description || '';
  const category = inferCategory(keywords, description);
  const capabilities = inferCapabilities(keywords, description);
  const id = generateId(pkg.name);

  // Handle scoped packages for name
  const displayName = pkg.name.startsWith('@')
    ? pkg.name.split('/')[1].replace(/-/g, ' ')
    : pkg.name.replace(/-/g, ' ').replace(/_/g, ' ');

  const entry = {
    id,
    name: displayName.charAt(0).toUpperCase() + displayName.slice(1),
    nameEn: pkg.name,
    description,
    category,
    tags: [...new Set([...keywords.map(k => k.toLowerCase()), 'mcp', 'npm', category])].slice(0, 15),
    source: {
      type: 'npm',
      package: pkg.name,
      registry: npmPkg.npmUrl || `https://www.npmjs.com/package/${pkg.name}`
    },
    configTemplate: generateConfigTemplate(pkg),
    configParams: [],
    capabilities,
    requirements: {
      node: pkg.engines ? pkg.engines.node : '>=18.0.0'
    },
    links: {
      homepage: npmPkg.homepage || null,
      npm: npmPkg.npmUrl || `https://www.npmjs.com/package/${pkg.name}`,
      repository: npmPkg.repository || null,
      bugs: npmPkg.bugs || null
    },
    verified: false,
    quality: {
      downloadsMonthly: npmPkg.downloads ? npmPkg.downloads.monthly : 0,
      searchScore: npmPkg.searchScore || 0,
      qualityScore: npmPkg.qualityScore || 0,
      maintenanceScore: npmPkg.maintenanceScore || 0,
      publisher: npmPkg.publisher || 'unknown',
      license: npmPkg.license || 'unknown',
      lastUpdated: npmPkg.updated || null
    }
  };

  return entry;
}

/**
 * Convert catalog format to registry format
 */
function convertToRegistryFormat(catalogEntry) {
  return {
    id: catalogEntry.id,
    name: catalogEntry.name,
    description: catalogEntry.description,
    type: 'mcp',
    category: [`system/mcp`, `type/${catalogEntry.category}`],
    tags: catalogEntry.tags || [],
    version: catalogEntry.quality ? 'latest' : '1.0.0',
    provider: 'npm',
    author: catalogEntry.quality ? catalogEntry.quality.publisher : null,
    homepage: catalogEntry.links ? catalogEntry.links.homepage : null,
    examples: [],
    dependencies: [],
    config: {
      source: catalogEntry.source,
      configTemplate: catalogEntry.configTemplate,
      configParams: catalogEntry.configParams,
      capabilities: catalogEntry.capabilities,
      requirements: catalogEntry.requirements,
      links: catalogEntry.links,
      quality: catalogEntry.quality
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

module.exports = {
  searchNPM,
  fetchNPMPackageMeta,
  formatNPMPackage,
  inferCategory,
  generateId,
  convertToCatalogFormat,
  convertToRegistryFormat,
  NPM_REGISTRY_API
};
