# Wikeep

> **Keep your wiki-like knowledge** — 自动保存、检索和管理 DeepWiki 历史会话的 Chrome 浏览器插件。

## 简介

[DeepWiki](https://deepwiki.com) 是一个强大的 AI 知识库/搜索工具，但缺乏完善的历史会话持久化能力。Wikeep 作为其增强插件，在**无需登录、不依赖云端服务**的前提下，自动将你在 DeepWiki 中产生的高价值会话保存到本地，并提供快速检索和管理能力。

## 功能特性

- 🔄 **自动捕获**：在 DeepWiki 页面自动识别并保存会话内容，无需手动操作
- 💾 **本地优先**：所有数据存储在浏览器本地 IndexedDB，不依赖账号或云端
- 🔍 **关键词搜索**：对历史会话进行全文检索，快速找回目标内容
- 📋 **会话管理**：查看会话详情、删除单条会话、清空全部数据
- ⚙️ **自动保存开关**：可随时开启或关闭自动保存功能

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
│   └── manifest.json       # Chrome 插件清单
├── src/
│   ├── background/         # Background Service Worker
│   ├── content/            # Content Script（页面捕获）
│   ├── parser/             # 会话内容解析与标准化
│   ├── storage/            # IndexedDB 存储层
│   ├── search/             # 本地全文搜索
│   ├── api/                # DeepWiki API 交互
│   ├── shared/             # 公共类型与工具
│   └── ui/                 # React UI（Side Panel）
├── sidepanel.html          # Side Panel 入口页
├── vite.config.ts
└── tsconfig.json
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
| `https://deepwiki.com/*` | 捕获 DeepWiki 页面会话内容 |

> 所有数据**仅存储在用户本地浏览器**，不会上传至任何服务器。

## 隐私承诺

- 不采集用户身份信息
- 不建立后端服务
- 不支持（也不需要）账号注册与登录
- 数据随时可由用户自行清空

## License

ISC
