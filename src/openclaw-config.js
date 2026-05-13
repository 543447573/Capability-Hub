// OpenClaw MCP Config Manager
// 统一管理 openclaw.json 中的 mcp.servers 配置
// 目标文件: ~/.qclaw/openclaw.json

const fs = require('fs');
const path = require('path');
const os = require('os');

const OPENCLAW_JSON_PATH = path.join(os.homedir(), '.qclaw', 'openclaw.json');

/**
 * 读取 openclaw.json（如果不存在或解析失败，返回空对象）
 */
function readOpenClawConfig() {
  if (!fs.existsSync(OPENCLAW_JSON_PATH)) {
    return {};
  }
  try {
    const content = fs.readFileSync(OPENCLAW_JSON_PATH, 'utf-8');
    return JSON.parse(content);
  } catch (e) {
    console.error('[openclaw-config] 读取失败: ' + e.message);
    return {};
  }
}

/**
 * 写入 openclaw.json（完整覆盖，保留其他字段）
 */
function writeOpenClawConfig(data) {
  try {
    const dir = path.dirname(OPENCLAW_JSON_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(OPENCLAW_JSON_PATH, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error('[openclaw-config] 写入失败: ' + e.message);
    return false;
  }
}

/**
 * 获取所有 MCP servers（从 openclaw.json）
 */
function listMCPServers() {
  const config = readOpenClawConfig();
  const servers = config.mcp?.servers || {};
  return servers;
}

/**
 * 添加或更新一个 MCP server
 * @param {string} name - server 名称
 * @param {object} serverConfig - { command, args, env, url, headers, cwd }
 * @returns {boolean} 是否成功
 */
function addMCPServer(name, serverConfig) {
  const config = readOpenClawConfig();
  if (!config.mcp) config.mcp = {};
  if (!config.mcp.servers) config.mcp.servers = {};
  config.mcp.servers[name] = serverConfig;
  return writeOpenClawConfig(config);
}

/**
 * 移除一个 MCP server
 * @param {string} name - server 名称
 * @returns {boolean} 是否成功
 */
function removeMCPServer(name) {
  const config = readOpenClawConfig();
  if (!config.mcp?.servers) return true; // 已经不存在
  if (config.mcp.servers[name]) {
    delete config.mcp.servers[name];
    return writeOpenClawConfig(config);
  }
  return true;
}

/**
 * 获取单个 MCP server 配置
 * @param {string} name
 * @returns {object|null}
 */
function getMCPServer(name) {
  const servers = listMCPServers();
  return servers[name] || null;
}

/**
 * 检查 MCP server 是否存在
 * @param {string} name
 * @returns {boolean}
 */
function hasMCPServer(name) {
  const servers = listMCPServers();
  return !!servers[name];
}

/**
 * 获取 openclaw.json 路径（供显示用）
 */
function getConfigPath() {
  return OPENCLAW_JSON_PATH;
}

module.exports = {
  OPENCLAW_JSON_PATH,
  readOpenClawConfig,
  writeOpenClawConfig,
  listMCPServers,
  addMCPServer,
  removeMCPServer,
  getMCPServer,
  hasMCPServer,
  getConfigPath,
};
