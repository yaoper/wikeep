# Wikeep

> **Keep your wiki-like knowledge** — 自动保存、检索和管理 DeepWiki 历史会话的 Chrome 浏览器插件。

## 简介

[DeepWiki](https://deepwiki.com) 是一个强大的 AI 知识库/搜索工具，但缺乏完善的历史会话持久化能力。Wikeep 作为其增强插件，在**无需登录、不依赖云端服务**的前提下，自动将你在 DeepWiki 中产生的高价值会话保存到本地，并提供快速检索和管理能力。

## 功能特性

- 🔄 **自动捕获**：在 DeepWiki 会话页（`https://deepwiki.com/search/{queryId}`）打开后自动识别并保存内容，无需手动操作
- ⚡ **API 优先 + DOM 兜底**：优先调用 DeepWiki 公开读取接口拿到结构化数据，必要时回退到 DOM 解析；后台还会在 Content Script 不可达时主动兜底抓取
- 🧠 **去重提示**：对同一 `queryId` 已经保存过的会话直接命中本地记录，不重复抓取
- 🪟 **Side Panel 一站式入口**：点击插件图标直接打开侧边栏，不再使用 Popup
- 🔍 **关键词搜索**：对历史会话进行本地全文匹配，快速找回目标内容
- 📋 **会话管理**：查看会话详情、删除单条会话、清空全部数据
- ⚙️ **自动保存开关**：可随时开启或关闭自动保存功能
- 🔔 **Tab 切换感知**：后台监听活动 Tab 变化并主动通知 Side Panel，状态切换近乎即时

## 技术栈

| 层次 | 技术 |
| --- | --- |
| 插件规范 | Chrome Manifest V3 |
| 前端框架 | React 19 + TypeScript |
| 构建工具 | Vite |
| 本地存储 | IndexedDB（`idb`）+ `chrome.storage.local` |
| 测试框架 | Vitest + jsdom |

## 项目结构

```
wikeep/
├── public/
│   ├── manifest.json       # Chrome 插件清单（MV3）
│   └── icons/              # 16/32/48/128 各尺寸图标
├── sidepanel.html          # Side Panel 入口页
├── src/
│   ├── background/         # Background Service Worker（消息路由、兜底抓取、Tab 上下文广播）
│   ├── content/            # Content Script（在 deepwiki.com/search/* 注入）
│   ├── api/                # DeepWiki / Devin API 客户端与类型
│   ├── parser/             # 会话内容解析与标准化
│   ├── storage/            # IndexedDB 仓库（schema v3）
│   ├── search/             # 本地全文搜索
│   ├── shared/             # 公共类型、常量、消息协议
│   └── ui/
│       ├── sidepanel/      # Side Panel 入口与主组件（SidePanelApp）
│       ├── components/     # 列表、搜索框、空状态等通用组件
│       ├── hooks/          # React hooks（如 useDebouncedValue）
│       └── styles/         # 基础样式
├── tests/                  # Vitest 单元测试
├── scripts/build.mjs       # 双 Vite 构建（Side Panel + Content Script）
├── vite.config.ts
├── tsconfig.json
├── Wikeep需求说明书.md
└── Wikeep技术设计方案.md
```

## 快速开始

### 环境要求

- Node.js >= 18
- Chrome 浏览器

### 安装依赖

```bash
npm install
```

### 开发构建

```bash
npm run build
```

构建产物输出到 `dist/` 目录。

### 加载插件

1. 打开 Chrome，进入 `chrome://extensions/`
2. 开启右上角 **开发者模式**
3. 点击 **加载已解压的扩展程序**，选择项目的 `dist/` 目录
4. 点击工具栏上的 Wikeep 图标即可直接打开 Side Panel（不再有 Popup）

### 使用流程

1. 安装并加载插件后，访问任意 DeepWiki 会话页（`https://deepwiki.com/search/{queryId}`）
2. Content Script 在 `document_end` 注入后自动识别页面并尝试 API 抓取，DOM 作为兜底
3. 如果该 `queryId` 已在本地保存过，Side Panel 会直接显示「Session 已保存」，不再重复抓取
4. 切换浏览器 Tab 时，后台会通过 `ACTIVE_TAB_CONTEXT_CHANGED` 主动通知 Side Panel 刷新当前页状态
5. 当 Content Script 因页面策略等原因不可达时，后台会主动调用 API 兜底完成抓取并轮询 pending 状态


### 运行测试

```bash
npm run test
```

### 类型检查

```bash
npm run typecheck
```

## 权限说明

| 权限 | 用途 |
| --- | --- |
| `storage` | 保存插件设置（自动保存开关等） |
| `sidePanel` | 在浏览器侧边栏展示历史会话 |
| `activeTab` | 识别当前是否为 DeepWiki 页面 |
| `https://deepwiki.com/*` | 注入 Content Script，捕获 DeepWiki 会话页 DOM |
| `https://api.devin.ai/ada/query/*` | 调用 DeepWiki 公开读取接口获取结构化 session 数据 |

> 所有数据**仅存储在用户本地浏览器**，不会上传至任何服务器。

## 隐私承诺

- 不采集用户身份信息
- 不建立后端服务
- 不支持（也不需要）账号注册与登录
- 数据随时可由用户自行清空

## License

ISC
