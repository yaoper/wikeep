# Wikeep

> **中文** | [English](#english)

自动保存、搜索和管理 DeepWiki 历史会话的 Chrome 插件——数据全程留在本地，无需登录，保护隐私。

---

## 简介

[DeepWiki](https://deepwiki.com) 是强大的 AI 代码知识库工具，但缺乏完善的历史会话持久化能力。Wikeep 作为其增强插件，在**无需登录、不依赖云端服务**的前提下，自动将你在 DeepWiki 中产生的高价值会话保存到本地，并提供快速检索与管理能力。

## 功能特性

- 🔄 **自动捕获**：打开 DeepWiki 会话页（`https://deepwiki.com/search/{queryId}`）后自动识别并保存，无需手动操作
- ⚡ **API 优先 + DOM 兜底**：优先调用 DeepWiki 公开接口获取结构化数据，必要时回退到 DOM 解析；Content Script 不可达时后台主动补抓
- 🧠 **去重识别**：对同一 `queryId` 已保存的会话直接命中本地记录，不重复抓取
- 🪟 **Side Panel 一站式入口**：点击插件图标直接打开侧边栏
- 🔍 **关键词搜索**：按仓库名称或问题内容本地全文匹配，快速找回目标会话
- 📋 **会话管理**：删除单条会话、清空全部数据
- 🔗 **快捷操作**：一键在浏览器新标签打开来源页、复制 Session 地址
- 💾 **数据备份与恢复**：将全部会话数据导出为 JSON 文件，重装插件后可一键导入恢复
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
│   ├── api/                # DeepWiki API 客户端与类型定义
│   ├── parser/             # DOM 会话内容解析与标准化
│   ├── storage/            # IndexedDB 仓库（对话 CRUD、导入导出）
│   ├── search/             # 本地关键词搜索
│   ├── shared/             # 公共类型、常量、消息协议、工具函数
│   └── ui/
│       ├── sidepanel/      # Side Panel 入口与主组件（SidePanelApp）
│       ├── components/     # 列表、搜索框、空状态等通用组件
│       ├── hooks/          # React hooks（useDebouncedValue）
│       └── styles/         # 基础样式
├── tests/                  # Vitest 单元测试
├── docs/                   # 需求说明书、技术设计方案
├── scripts/build.mjs       # 双 Vite 构建（Side Panel + Content Script）
├── LICENSE
└── package.json
```

## 快速开始

### 环境要求

- Node.js >= 18
- Chrome 浏览器

### 安装依赖

```bash
npm install
```

### 构建

```bash
npm run build
```

构建产物输出到 `dist/` 目录。

### 加载插件

1. 打开 Chrome，进入 `chrome://extensions/`
2. 开启右上角 **开发者模式**
3. 点击 **加载已解压的扩展程序**，选择项目的 `dist/` 目录
4. 点击工具栏上的 Wikeep 图标即可打开 Side Panel

### 使用流程

1. 安装后访问任意 DeepWiki 会话页（`https://deepwiki.com/search/{queryId}`）
2. Content Script 注入后自动识别页面并尝试 API 抓取，DOM 解析作为兜底
3. 若该 `queryId` 已保存，Side Panel 直接显示「Session 已保存」，不重复抓取
4. 切换 Tab 时后台自动通知 Side Panel 刷新当前页状态
5. 在 Side Panel 右上角菜单可进入「数据备份与恢复」页面，随时导出备份或从文件恢复

### 运行测试

```bash
npm test
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
| `https://deepwiki.com/*` | 注入 Content Script，捕获 DeepWiki 会话页 |
| `https://api.devin.ai/ada/query/*` | 调用 DeepWiki 公开接口获取结构化 session 数据 |

> 所有数据**仅存储在用户本地浏览器**，不会上传至任何服务器。

## 隐私承诺

- 不采集用户身份信息
- 不建立后端服务
- 不支持（也不需要）账号注册与登录
- 数据随时可由用户自行清空或导出

## License

[MIT](./LICENSE)

---

<a id="english"></a>

# Wikeep

> [中文](#wikeep) | **English**

A Chrome extension that automatically saves, searches, and manages your DeepWiki session history — all data stays local, no login required.

---

## Introduction

[DeepWiki](https://deepwiki.com) is a powerful AI-powered code knowledge tool, but it lacks persistent session history. Wikeep enhances it by **automatically saving your valuable DeepWiki sessions to local storage** with no cloud dependency or login required, while providing fast search and management.

## Features

- 🔄 **Auto-capture**: Automatically detects and saves sessions when you open a DeepWiki page (`https://deepwiki.com/search/{queryId}`)
- ⚡ **API-first + DOM fallback**: Prefers the DeepWiki public API for structured data; falls back to DOM parsing when needed; background script handles cases where the content script is unreachable
- 🧠 **Deduplication**: Recognizes already-saved sessions by `queryId` and skips re-capture
- 🪟 **Side Panel**: Opens directly in the browser side panel with one click
- 🔍 **Keyword search**: Fast local full-text search by repo name or question content
- 📋 **Session management**: Delete individual sessions or clear all data
- 🔗 **Quick actions**: Open source page in a new tab or copy the Session URL
- 💾 **Backup & restore**: Export all sessions to a JSON file and import them back after reinstalling
- ⚙️ **Auto-save toggle**: Enable or disable automatic capture at any time
- 🔔 **Tab-switch awareness**: Background script broadcasts tab context changes to the Side Panel in near real-time

## Tech Stack

| Layer | Technology |
| --- | --- |
| Extension standard | Chrome Manifest V3 |
| UI framework | React 19 + TypeScript |
| Build tool | Vite |
| Local storage | IndexedDB (`idb`) + `chrome.storage.local` |
| Test framework | Vitest + jsdom |

## Project Structure

```
wikeep/
├── public/
│   ├── manifest.json       # Chrome extension manifest (MV3)
│   └── icons/              # 16/32/48/128 px icons
├── sidepanel.html          # Side Panel entry HTML
├── src/
│   ├── background/         # Background Service Worker (routing, fallback capture, tab broadcast)
│   ├── content/            # Content Script (injected into deepwiki.com/search/*)
│   ├── api/                # DeepWiki API client and type definitions
│   ├── parser/             # DOM session parser and normalizer
│   ├── storage/            # IndexedDB repository (CRUD, import/export)
│   ├── search/             # Local keyword search
│   ├── shared/             # Shared types, constants, message protocol, utils
│   └── ui/
│       ├── sidepanel/      # Side Panel entry and root component (SidePanelApp)
│       ├── components/     # List, search box, empty state components
│       ├── hooks/          # React hooks (useDebouncedValue)
│       └── styles/         # Base CSS
├── tests/                  # Vitest unit tests
├── docs/                   # Requirements and technical design docs
├── scripts/build.mjs       # Dual Vite build (Side Panel + Content Script)
├── LICENSE
└── package.json
```

## Getting Started

### Requirements

- Node.js >= 18
- Chrome browser

### Install dependencies

```bash
npm install
```

### Build

```bash
npm run build
```

Output is written to the `dist/` directory.

### Load the extension

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** and select the `dist/` directory
4. Click the Wikeep icon in the toolbar to open the Side Panel

### Workflow

1. After installing, visit any DeepWiki session page (`https://deepwiki.com/search/{queryId}`)
2. The content script auto-detects the page and attempts API capture (DOM as fallback)
3. If the `queryId` is already saved, the Side Panel shows "Session saved" and skips re-capture
4. Switching tabs triggers an automatic context update in the Side Panel
5. Use the **Backup & Restore** page (⋮ menu) to export a JSON backup or restore from a file

### Run tests

```bash
npm test
```

### Type check

```bash
npm run typecheck
```

## Permissions

| Permission | Purpose |
| --- | --- |
| `storage` | Stores extension settings (auto-save toggle, etc.) |
| `sidePanel` | Renders session history in the browser side panel |
| `activeTab` | Checks whether the current tab is a DeepWiki page |
| `https://deepwiki.com/*` | Injects the content script to capture DeepWiki session pages |
| `https://api.devin.ai/ada/query/*` | Calls the DeepWiki public API for structured session data |

> All data is **stored locally in the user's browser only** and is never sent to any server.

## Privacy

- No user identity data is collected
- No backend service is involved
- No account registration or login is required
- All data can be cleared or exported by the user at any time

## License

[MIT](./LICENSE)
