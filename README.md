# OpenClaw Capability Hub V2

**统一的 AI 能力注册、发现与调用平台**

---

## 概述

OpenClaw Capability Hub 是一个能力注册与发现系统，帮助 AI Agent 发现、搜索、推荐和调用各种工具能力。支持 MCP (Model Context Protocol) 服务和 HTTP API 两种能力类型。

### 核心功能

| 功能 | 说明 |
|------|------|
| **能力注册** | 扫描 MCP 配置文件，自动注册能力 |
| **智能搜索** | 关键词匹配 + 多维度评分 |
| **AI 推荐** | 基于自然语言意图的语义匹配 |
| **网络发现** | 从 NPM Registry 搜索 MCP 包，一键添加到本地 |
| **HTTP API** | RESTful 接口，支持外部系统集成 |
| **健康检查** | 实时监控能力状态 |

---

## 安装

### 前置要求

- Node.js >= 18.0.0
- npm 或 yarn

### 安装方式

```bash
# 全局安装
npm install -g openclaw-capability-hub

# 或从源码安装
git clone <repo-url>
cd capability-hub
npm install
npm link
```

### 验证安装

```bash
hub --version
# Output: Capability Hub CLI v2.0.0
```

---

## 快速开始

### 1. 扫描能力

首次使用需扫描系统中的 MCP 配置：

```bash
hub scan
```

扫描结果存储在 `~/.qclaw/capability-hub/data/registry.json`

### 2. 查看已注册能力

```bash
# 列出所有能力
hub list

# 按类型过滤：API 或 MCP
hub list --type api
hub list --type mcp

# 按分类过滤
hub list --category browser/web

# 按标签过滤
hub list --tag ai

# 分页显示
hub list --page 1 --limit 10
```

### 3. 搜索能力

```bash
# 关键词搜索
hub search browser

# 多关键词搜索
hub search "send email"
```

### 4. AI 推荐能力

```bash
# 自然语言推荐
hub recommend "我需要发送 Slack 消息"
hub recommend "帮我抓取网页内容"
```

### 5. 网络发现 MCP 包

从 NPM Registry 搜索 MCP 相关包，查看详情后添加到本地 registry：

```bash
# 搜索 MCP 包
hub discover-npm slack
hub discover-npm github --limit 20

# 搜索并直接添加
hub discover-npm browser --add playwright-mcp
hub discover-npm "send email" --add @anthropic/email-mcp

# JSON 输出（供程序调用）
hub discover-npm slack --json
```

搜索结果展示包名、下载量、版本、作者、License 等信息。添加后自动完成格式转换（npm → registry），包括分类推断和能力标签生成。

### 6. 从 MCP 目录发现

浏览内置的 MCP 目录（21+ 预置 MCP）：

```bash
# 列出所有目录
hub catalog

# 搜索目录
hub discover slack
hub discover browser --detail

# 查看配置模板
hub template slack

# 安装到 mcp.json
hub install slack --apply
```

### 7. 启动 HTTP API 服务

```bash
# 默认端口 18765
hub serve

# 自定义端口
hub serve --port 8080
```

---

## HTTP API 文档

启动服务后，可通过 HTTP 调用所有功能。

### 基础 URL

```
http://localhost:18765/api/v2/
```

### 端点列表

#### 1. 健康检查

```http
GET /api/v2/health
```

**响应示例：**

```json
{
  "capabilities": {
    "mcp/browser": { "healthy": false, "error": "No command configured" },
    "api/news": { "healthy": true, "type": "api" }
  },
  "summary": {
    "total": 16,
    "healthy": 4,
    "unhealthy": 12
  }
}
```

#### 2. 能力列表

```http
GET /api/v2/capabilities
```

**查询参数：**

| 参数 | 说明 | 示例 |
|------|------|------|
| `q` | 过滤关键词 | `?q=browser` |
| `type` | 能力类型 | `?type=mcp` 或 `?type=api` |
| `category` | 分类过滤 | `?category=social/slack` |

**响应示例：**

```json
{
  "capabilities": [
    {
      "id": "mcp/browser",
      "name": "Browser Control",
      "description": "Browser automation and web scraping",
      "type": "mcp",
      "category": ["browser/web"],
      "tags": ["browser", "automation", "web"],
      "version": "1.0.0"
    }
  ],
  "count": 1
}
```

#### 3. 能力详情

```http
GET /api/v2/capabilities/:id
```

**示例：**

```bash
curl http://localhost:18765/api/v2/capabilities/mcp%2Fbrowser
```

#### 4. 搜索能力

```http
GET /api/v2/search?q=<keyword>
```

**响应示例：**

```json
{
  "items": [
    {
      "id": "mcp/browser",
      "name": "Browser Control",
      "description": "Browser automation and web scraping",
      "_score": 100
    }
  ],
  "total": 1,
  "query": "browser"
}
```

#### 5. AI 推荐能力

```http
GET /api/v2/recommend?q=<intent>
```

**响应示例：**

```json
{
  "items": [
    {
      "capability": { "id": "mcp/slack", "name": "Slack" },
      "score": 100,
      "reasons": [
        { "keyword": "slack", "score": 50, "reason": "exact tag: slack" },
        { "keyword": "message", "score": 50, "reason": "exact tag: message" }
      ]
    }
  ],
  "total": 3,
  "query": "send a slack message"
}
```

#### 6. 调用能力

```http
POST /api/v2/invoke/:id
Content-Type: application/json

{
  "param1": "value1",
  "param2": "value2"
}
```

> ⚠️ 此端点需要 MCP 服务已正确配置并运行。

#### 7. OpenAI Tools 格式

```http
GET /api/v2/tools
```

返回 OpenAI Function Calling 兼容的工具列表格式。

---

## CLI 命令参考

### 能力管理

```bash
hub list [options]               # 列出能力（支持 --type, --category, --tag, --page, --limit）
hub search <query>               # 搜索能力
hub recommend <text>             # AI 推荐能力
hub info <capabilityId>          # 查看详情
hub health [capabilityId]        # 健康检查
```

### 目录管理（内置 MCP 目录）

```bash
hub catalog                 # 查看目录统计
hub discover <keyword>      # 搜索内置目录
hub discover <id> --detail  # 查看单个 MCP 详情
hub template <id>           # 显示配置模板
hub install <id> --apply    # 安装到 mcp.json
hub catalog-add             # 添加自定义 MCP
hub catalog-refresh         # 刷新目录
```

### 网络发现（NPM Registry）

```bash
hub discover-npm <keyword>            # 搜索 NPM 上的 MCP 包
hub discover-npm <keyword> --limit 20 # 限制结果数
hub discover-npm <keyword> --json     # JSON 输出
hub discover-npm <keyword> --add @org/pkg  # 搜索后直接添加到 registry
```

### API 服务

```bash
hub serve [port]            # 启动 HTTP API 服务
hub api <endpoint> [args]   # 调用 API 端点
```

### 配置

```bash
hub config                  # 查看配置
hub scan                    # 扫描 MCP 配置
```

---

## 配置文件

### MCP 配置文件位置

Capability Hub 自动扫描以下路径的 MCP 配置：

```
~/.openclaw/config/mcp.json
~/.openclaw/config/mcp-dev.json
~/.openclaw/config/mcp-prod.json
```

### MCP 配置格式

```json
{
  "mcpServers": {
    "my-mcp-server": {
      "command": "node",
      "args": ["server.js"],
      "env": {
        "API_KEY": "your-key"
      }
    }
  }
}
```

### 注册数据存储

```
~/.qclaw/capability-hub/data/registry.json
```

---

## 能力类型

### MCP 能力

MCP (Model Context Protocol) 能力是通过子进程运行的服务：

```json
{
  "id": "mcp/browser",
  "name": "Browser Control",
  "type": "mcp",
  "config": {
    "command": "node",
    "args": ["browser-server.js"],
    "env": {}
  }
}
```

### API 能力

HTTP API 能力是通过网络调用的服务：

```json
{
  "id": "api/news",
  "name": "News API",
  "type": "api",
  "config": {
    "baseUrl": "https://api.example.com",
    "headers": {
      "Authorization": "Bearer ${API_KEY}"
    }
  }
}
```

---

## 搜索与推荐算法

### 搜索评分（满分 100）

| 匹配维度 | 分值 |
|---------|------|
| ID 完全匹配 | +100 |
| 名称完全匹配 | +50 |
| 标签完全匹配 | +50 |
| 描述包含关键词 | +20 |
| 分类匹配 | +30 |

### 推荐评分

基于自然语言意图分析：

1. **关键词提取**：从查询文本中提取关键词和短语
2. **多维度匹配**：ID、名称、标签、描述、分类
3. **语义权重**：根据匹配位置和频率计算分数
4. **结果排序**：按综合得分降序返回

---

## 与 AI Agent 集成

### OpenAI Function Calling

```javascript
// 获取工具列表
const response = await fetch('http://localhost:18765/api/v2/tools');
const { tools } = await response.json();

// 传递给 OpenAI API
const completion = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [...],
  tools: tools  // 直接使用
});
```

### LangChain 集成

```python
import requests

# 获取能力列表
caps = requests.get('http://localhost:18765/api/v2/capabilities').json()

# 搜索相关能力
results = requests.get(
  'http://localhost:18765/api/v2/search',
  params={'q': 'send email'}
).json()
```

---

## 常见问题

### Q: 端口被占用怎么办？

```bash
hub serve --port 8080
```

### Q: 能力列表为空？

运行扫描命令：

```bash
hub scan
hub list
```

### Q: MCP 能力显示 "No command configured"？

检查 MCP 配置文件中的 `command` 和 `args` 是否正确。

### Q: 如何添加自定义能力？

编辑 `~/.openclaw/config/mcp.json`，添加新的 MCP 服务器配置，然后运行 `hub scan`。

### Q: 搜索结果评分为什么是 100 分？

评分已做上限处理，最高 100 分，避免过度匹配导致的评分膨胀。

---

## 项目结构

```
capability-hub/
├── bin/
│   └── hub.js          # CLI 入口
├── src/
│   ├── hub.js          # 核心逻辑（搜索、列表）
│   ├── server.js       # HTTP API 服务
│   ├── recommend.js    # AI 推荐算法
│   ├── runtime.js        # MCP 进程管理
│   ├── discover-npm.js   # NPM Registry 搜索与格式转换
│   └── links.js          # 能力-Skill 关联管理
├── data/
│   └── registry.json   # 能力注册数据
└── README.md
```

---

## 更新日志



---

## 许可证

MIT License

---

## 联系方式

- 项目地址：`https://github.com/543447573/Capability-Hub`
- 问题反馈：提交 Issue 或联系543447573@qq.com
