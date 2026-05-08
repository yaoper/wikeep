# Wikeep

[English](README.md) | [简体中文](README_zh.md)

[![版本](https://img.shields.io/badge/版本-0.1.0-blue)](https://github.com/yaoper/wikeep/releases/latest)
[![许可证](https://img.shields.io/badge/许可证-MIT-green)](./LICENSE)
[![Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-yellow?logo=googlechrome)](https://developer.chrome.com/docs/extensions/mv3/)

**自动保存、搜索和管理 DeepWiki 历史会话的 Chrome 插件——数据全程留在本地，无需登录，保护隐私。**

---

## 🔎 概述

[DeepWiki](https://deepwiki.com) 是强大的 AI 代码知识库工具，但缺乏完善的历史会话持久化能力。Wikeep 作为其增强插件，在**无需登录、不依赖云端服务**的前提下，自动将你在 DeepWiki 中产生的高价值会话保存到本地，并通过浏览器侧边栏提供快速检索与管理能力。

### 为什么需要 Wikeep？

| 痛点 | Wikeep 解决方案 |
| --- | --- |
| **页面刷新后会话消失** | 自动捕获并持久化每一条会话到本地 |
| **无法检索历史会话** | 按仓库名称或问题内容本地全文搜索 |
| **难以回顾历史答案** | Side Panel 时间线，一键跳转来源页 |
| **重装插件后数据丢失** | 一键导出/导入 JSON 备份文件 |
| **无法控制自动捕获** | 随时开启或关闭自动保存开关 |

---

## ✨ 功能特性

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

---

## 🛠️ 技术栈

| 层次 | 技术 |
| --- | --- |
| 插件规范 | Chrome Manifest V3 |
| 前端框架 | React 19 + TypeScript |
| 构建工具 | Vite |
| 本地存储 | IndexedDB（`idb`）+ `chrome.storage.local` |
| 测试框架 | Vitest + jsdom |

---

## 🏗️ 项目结构

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

---

## 🚀 快速开始

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

---

## 🔐 权限说明

| 权限 | 用途 |
| --- | --- |
| `storage` | 保存插件设置（自动保存开关等） |
| `sidePanel` | 在浏览器侧边栏展示历史会话 |
| `activeTab` | 识别当前是否为 DeepWiki 页面 |
| `https://deepwiki.com/*` | 注入 Content Script，捕获 DeepWiki 会话页 |
| `https://api.devin.ai/ada/query/*` | 调用 DeepWiki 公开接口获取结构化 session 数据 |

> 所有数据**仅存储在用户本地浏览器**，不会上传至任何服务器。

---

## 🛡️ 隐私承诺

- 不采集用户身份信息
- 不建立后端服务
- 不支持（也不需要）账号注册与登录
- 数据随时可由用户自行清空或导出

---

## 🤝 参与贡献

欢迎提交 Issue 或 Pull Request！

1. Fork 本仓库
2. 创建功能分支（`git checkout -b feat/your-feature`）
3. 提交你的改动
4. 发起 Pull Request

---

## 许可证

[MIT](./LICENSE)
