# Wikeep 技术设计方案

## 1. 文档概述

### 1.1 文档目的

本文档基于 `Wikeep需求说明书.md`，进一步定义 Wikeep Chrome 浏览器插件的技术架构、工程结构、核心数据流、存储模型、模块接口、权限与隐私策略、错误处理方案、测试策略和后续扩展设计。

本文档用于指导后续创建和开发 Wikeep Chrome 插件工程。

### 1.2 设计范围

本文档覆盖 Wikeep MVP 的技术落地方案：

- DeepWiki 页面识别。
- DeepWiki 会话内容自动捕获。
- 本地 IndexedDB 持久化。
- 历史会话列表。
- 关键词搜索。
- 会话详情查看。
- 删除单条会话和清空本地数据。
- 自动保存开关和基础设置。
- 权限、隐私、安全和错误处理。

本文档同时为后续 Markdown 导出、长图生成、标签收藏和本地备份导入导出预留扩展点，但这些能力不纳入首版 MVP 的强制实现范围。

### 1.3 核心技术决策

| 维度 | 技术选择 | 说明 |
| --- | --- | --- |
| 插件规范 | Chrome Manifest V3 | 当前 Chrome 插件推荐规范。 |
| 前端技术栈 | React + TypeScript + Vite | 用于构建 Side Panel UI，兼顾类型安全和开发效率。 |
| UI 入口 | 仅 Side Panel | 当前实现已移除 Popup，点击 action 图标通过 `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` 直接打开 Side Panel。 |
| 内容采集 | DeepWiki API 优先，Content Script + DOM 兜底 | 已确认公开 session 读取接口可用，DOM 捕获作为接口不可用时的降级方案；Background 在 Content Script 不可达时还会做兜底抓取。 |
| 后台协调 | Background Service Worker | 负责生命周期事件、消息协调、Tab 上下文广播、兜底抓取与 pending 轮询。 |
| 会话存储 | IndexedDB（schema v3） | 适合存储较大量结构化会话和消息。 |
| 设置存储 | chrome.storage.local | 适合轻量配置。 |
| 搜索方式 | 本地简单全文匹配 | MVP 优先实现稳定可用，后续可升级索引。 |
| 云端服务 | 不引入 | 首版坚持本地优先、无需登录。 |

## 2. 总体架构

### 2.1 架构目标

Wikeep 的技术架构需要满足以下目标：

1. 只在 DeepWiki 相关页面启用捕获逻辑。
2. 将页面 DOM 中的会话内容标准化为稳定的数据结构。
3. 避免重复保存同一消息或同一会话。
4. 在浏览器本地可靠持久化会话和消息。
5. 提供可扩展的 UI 层，支持列表、搜索、详情和设置。
6. 将权限和数据采集范围限制在最小必要范围。
7. 为后续导出、长图、标签、备份等能力保留模块扩展点。

### 2.2 架构分层

```text
┌─────────────────────────────────────────────────────────────┐
│                         Chrome UI                            │
│                         Side Panel                           │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               │ chrome.runtime messaging
                               │  ├─ GET_ACTIVE_TAB_CONTEXT
                               │  ├─ ACTIVE_TAB_CONTEXT_CHANGED (background → panel)
                               │  ├─ REPORT_PAGE_STATUS (content → background)
                               │  └─ LIST_/GET_/DELETE_/CLEAR_ ...
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                Background Service Worker                     │
│   lifecycle / routing / tab context / fallback capture       │
└───────────────┬──────────────────────────────┬──────────────┘
                │                              │
                │                              │
┌───────────────▼──────────────┐   ┌───────────▼──────────────┐
│        Content Script         │   │      Storage Layer        │
│ document_end / API + DOM /    │   │ IndexedDB / storage.local │
│ MutationObserver / status     │   │ (schema v3)               │
└───────────────┬──────────────┘   └───────────┬──────────────┘
                │                              │
┌───────────────▼──────────────┐   ┌───────────▼──────────────┐
│         Parser Layer          │   │       Search Layer        │
│ normalize / role / dedupe key │   │ local text matching       │
└──────────────────────────────┘   └──────────────────────────┘
```

### 2.3 模块职责

| 模块 | 主要职责 | 运行环境 |
| --- | --- | --- |
| Manifest | 声明权限、入口、资源和匹配规则 | Chrome Extension |
| Content Script | 在 `https://deepwiki.com/search/*` 注入（document_end），扫描 DOM、调用 API、上报状态 | Web Page Isolated World |
| Parser Layer | 将 API/DOM 数据解析为标准消息对象 | Content Script / Background |
| Background Service Worker | 处理插件生命周期、消息路由、Tab 上下文广播、兜底抓取、pending 轮询 | Extension Service Worker |
| Storage Layer | 封装 IndexedDB（schema v3）与 `chrome.storage.local` | Extension Context |
| Search Layer | 基于本地数据执行关键词搜索 | Extension Context |
| UI Layer | Side Panel 中展示历史列表、搜索、详情、设置 | Side Panel |
| Export Layer | 后续 Markdown/长图导出 | Extension Context/UI |
| Shared Layer | 类型、常量、工具函数、消息协议 | 所有模块 |

## 3. 推荐工程结构

首版工程采用 Vite + React + TypeScript，并针对 Chrome 插件多入口构建（Side Panel HTML + Background Service Worker + 单文件 Content Script）。

```text
wikeep/
├── README.md
├── LICENSE
├── package.json
├── tsconfig.json
├── vite.config.ts
├── sidepanel.html
├── docs/
│   ├── Wikeep需求说明书.md
│   └── Wikeep技术设计方案.md
├── scripts/
│   └── build.mjs              # 双 Vite 构建入口（Side Panel/Background + Content Script）
├── public/
│   ├── manifest.json
│   └── icons/                 # icon16/32/48/128.png
├── src/
│   ├── background/
│   │   └── index.ts           # Service Worker：消息路由、Tab 上下文、兜底抓取、轮询
│   ├── content/
│   │   └── index.ts           # 注入脚本：DOM 抓取 + API 抓取 + MutationObserver + 状态上报
│   ├── api/
│   │   ├── deepwikiApi.ts
│   │   └── deepwikiTypes.ts
│   ├── parser/
│   │   └── deepwikiDomParser.ts   # DOM 内容标准化、角色识别
│   ├── storage/
│   │   ├── db.ts
│   │   ├── conversationRepository.ts   # 对话 CRUD、导入导出
│   │   └── settingsRepository.ts
│   ├── search/
│   │   └── searchService.ts
│   ├── ui/
│   │   ├── sidepanel/
│   │   │   ├── main.tsx
│   │   │   └── SidePanelApp.tsx
│   │   ├── components/
│   │   │   ├── ConversationList.tsx
│   │   │   ├── SearchBox.tsx
│   │   │   └── EmptyState.tsx
│   │   ├── hooks/
│   │   │   └── useDebouncedValue.ts
│   │   └── styles/
│   └── shared/
│       ├── constants.ts
│       ├── messages.ts
│       ├── types.ts
│       └── utils.ts
└── tests/

### 3.1 构建产物

```text
dist/
├── manifest.json
├── background.js          # Vite rollup output (entry: src/background/index.ts)
├── content.js             # 第二次 Vite IIFE 构建产物（src/content/index.ts）
├── sidepanel.html
├── assets/
│   ├── sidepanel.js
│   └── ...
└── icons/
    ├── icon16.png
    ├── icon32.png
    ├── icon48.png
    └── icon128.png
```

构建流程（`scripts/build.mjs`）：

1. 第一次 Vite 构建：以 `sidepanel.html` + `src/background/index.ts` 作为入口，复制 `public/` 到 `dist/`。
2. 第二次 Vite 构建：以 IIFE 单文件方式打包 `src/content/index.ts` 为 `dist/content.js`，避免 Content Script 使用动态 import。

不再保留 Popup 入口。

## 4. Manifest V3 设计

### 4.1 Manifest 实际配置

DeepWiki 域名为 `https://deepwiki.com`，公开 session 读取接口域名为 `https://api.devin.ai`。当前 `public/manifest.json` 实际配置如下：

```json
{
  "manifest_version": 3,
  "name": "Wikeep - Save and search DeepWiki",
  "description": "Save and search DeepWiki conversations locally.",
  "version": "0.1.0",
  "permissions": ["storage", "sidePanel", "activeTab"],
  "host_permissions": [
    "https://deepwiki.com/*",
    "https://api.devin.ai/ada/query/*"
  ],
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "icons": {
    "16": "icons/icon16.png",
    "32": "icons/icon32.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  "content_scripts": [
    {
      "matches": ["https://deepwiki.com/search/*"],
      "js": ["content.js"],
      "run_at": "document_end"
    }
  ],
  "side_panel": {
    "default_path": "sidepanel.html"
  },
  "action": {
    "default_title": "Wikeep",
    "default_icon": {
      "16": "icons/icon16.png",
      "32": "icons/icon32.png",
      "48": "icons/icon48.png"
    }
  }
}
```

要点：

- Content Script 仅匹配 `/search/*` 路径，不再匹配整个 `deepwiki.com`，缩小注入面。
- `run_at` 由原方案的 `document_idle` 调整为 `document_end`，使页面识别和状态上报更早。
- 不配置 `default_popup`；Background 启动时调用 `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`，点击图标直接打开 Side Panel。
- Action 图标只配置 16/32/48 三个尺寸（Chrome 工具栏需要），128 仅用于 `icons` 全局展示。
- 当前未维护 action badge，Background 仅在 Tab 切换时清理残留 badge。

### 4.2 权限说明

| 权限 | 是否必需 | 用途 |
| --- | --- | --- |
| `storage` | 必需 | 保存设置项和轻量状态。 |
| `sidePanel` | 推荐 | 提供主界面。 |
| `activeTab` | 可选 | 用户主动点击插件时读取当前标签页状态。 |
| DeepWiki host permission | 必需 | 注入 Content Script，捕获 DeepWiki 页面会话。 |
| Devin API host permission | 必需 | 从 `https://api.devin.ai/ada/query/{queryId}` 读取公开 DeepWiki session 数据。 |

### 4.3 权限边界

首版不应申请：

- `<all_urls>`。
- `history`。
- `tabs`，除非后续证明 `activeTab` 不足。
- `cookies`。
- `downloads`，除非 Markdown 下载阶段确实需要；MVP 不需要。

## 5. 核心数据模型

### 5.1 TypeScript 类型定义

```ts
export type MessageRole = 'user' | 'assistant' | 'system' | 'unknown';

export interface Conversation {
  id: string;
  title: string;
  source: 'deepwiki';
  sourceUrl: string;
  sourceHost: string;
  sourceSessionId?: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  summary: string;
  tags: string[];
  isFavorite: boolean;
  metadata?: {
    repoNames?: string[];
    orgId?: string;
  };
  schemaVersion: number;
}

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  contentHash: string;
  order: number;
  externalId?: string;
  sourceNodeKey?: string;
  metadata?: {
    engineId?: string;
    citations?: unknown[];
    sourceResponseTypes?: string[];
  };
  createdAt: number;
  updatedAt: number;
  schemaVersion: number;
}

export interface Settings {
  autoCaptureEnabled: boolean;
  preferredPanel: 'sidePanel' | 'popup';
  hasSeenPrivacyNotice: boolean;
  schemaVersion: number;
}

export interface ParsedConversationSnapshot {
  title?: string;
  sourceUrl: string;
  sourceSessionId?: string;
  messages: ParsedMessage[];
  capturedAt: number;
}

export interface ParsedMessage {
  role: MessageRole;
  content: string;
  order: number;
  sourceNodeKey?: string;
}

export interface CaptureStatus {
  supported: boolean;
  active: boolean;
  reason?: CaptureStatusReason;
  lastCapturedAt?: number;
}

export type CaptureStatusReason =
  | 'not_deepwiki_page'
  | 'auto_capture_disabled'
  | 'api_fetch_failed'
  | 'dom_not_ready'
  | 'unsupported_dom_structure'
  | 'storage_error';
```

### 5.2 ID 与去重策略

| 对象 | ID 生成建议 |
| --- | --- |
| Conversation | 优先使用 DeepWiki `queryId` 生成稳定 key；无 queryId 时使用 `sourceHost + normalizedPath`。 |
| Message | API 来源优先使用 `conversationId + externalId + role`；DOM 兜底使用 `conversationId + order + contentHash`。 |
| contentHash | 对 `role + normalizedContent` 使用 SHA-256 或轻量稳定 hash。 |

MVP 建议：

1. 优先使用 `sourceSessionId` 查找已有会话。
2. 若 `sourceSessionId` 缺失，则使用 `sourceUrl` 查找已有会话。
3. API 来源消息去重使用 `conversationId + externalId + role`。
4. DOM 兜底消息去重使用 `conversationId + contentHash + role`。
5. 若同一消息内容重复出现但顺序不同，应保留顺序信息，避免错误覆盖。

## 6. IndexedDB 存储设计

### 6.1 数据库定义

| 项 | 实际值 |
| --- | --- |
| 数据库名 | `wikeep` |
| 当前 schema 版本 | `3`（参见 `src/storage/conversationRepository.ts` 中的 `SCHEMA_VERSION`） |
| 主要对象仓库 | `conversations`、`messages` |
| 可选对象仓库 | `captureEvents`、`searchIndex`（暂未启用） |

> 当 `lookupConversationBySourceSessionId` 命中的记录 `schemaVersion` 低于当前版本时会返回 `{ exists: false }`，触发重新抓取以完成隐式迁移。

### 6.2 conversations 对象仓库

主键：`id`

索引：

| 索引 | 字段 | 是否唯一 | 用途 |
| --- | --- | --- | --- |
| `by_updatedAt` | `updatedAt` | 否 | 历史列表倒序。 |
| `by_sourceUrl` | `sourceUrl` | 是 | 按页面 URL 查找会话。 |
| `by_sourceHost` | `sourceHost` | 否 | 后续支持多来源。 |
| `by_isFavorite` | `isFavorite` | 否 | 后续收藏筛选。 |

### 6.3 messages 对象仓库

主键：`id`

索引：

| 索引 | 字段 | 是否唯一 | 用途 |
| --- | --- | --- | --- |
| `by_conversationId` | `conversationId` | 否 | 查询会话消息。 |
| `by_contentHash` | `contentHash` | 否 | 去重辅助。 |
| `by_conversation_hash` | `[conversationId, contentHash]` | 否 | 会话内去重。 |
| `by_conversation_order` | `[conversationId, order]` | 否 | 按顺序加载消息。 |

### 6.4 settings 存储

设置使用 `chrome.storage.local`，推荐 key：

```ts
const SETTINGS_KEY = 'wikeep.settings';
```

默认值：

```ts
const defaultSettings: Settings = {
  autoCaptureEnabled: true,
  preferredPanel: 'sidePanel',
  hasSeenPrivacyNotice: false,
  schemaVersion: 1
};
```

### 6.5 数据迁移策略

IndexedDB 升级时使用版本迁移：

```ts
openDB('wikeep', 1, {
  upgrade(db, oldVersion, newVersion) {
    if (oldVersion < 1) {
      createConversationStore(db);
      createMessageStore(db);
    }
  }
});
```

迁移原则：

- 每次 schema 变化递增数据库版本。
- 迁移逻辑只做结构升级，不静默删除用户数据。
- 迁移失败时应向 UI 返回明确错误状态。
- 对话和消息对象保留 `schemaVersion` 字段，便于后续对象级迁移。

## 7. 会话捕获设计

### 7.1 捕获流程

首版捕获策略为 **API 优先、DOM 兜底**，并在 Content Script 不可达时由 Background 兜底完成抓取。

```text
用户打开 https://deepwiki.com/search/{queryId}
        │
        ▼
Content Script 在 document_end 注入
        │
        ▼
立即上报 bootstrap 状态：active=true, pending=true, reason='idle'
        │
        ▼
读取 Settings，若 autoCaptureEnabled=false 则上报 reason='auto_capture_disabled' 并退出
        │
        ▼
LOOKUP_CAPTURE_BY_QUERY_ID：本地命中且 schemaVersion 满足 → 上报 already_saved，结束
        │
        ▼
captureViaDom() → captureViaApi()
        │
        ├─ API 成功且非 pending → 写入 IndexedDB，上报已保存
        ├─ API 成功但 pending  → 每 PENDING_POLL_MS=3000ms 轮询，最多 MAX_POLL_ATTEMPTS=60 次
        └─ API 失败            → 上报 reason='api_fetch_failed'

并行：MutationObserver 监听 DOM 变化（CAPTURE_DEBOUNCE_MS=500ms）触发重抓
```

Background 兜底通道：

```text
活动 Tab 切换 / 更新 / 窗口聚焦
        │
        ▼
Background 判断 URL 是否匹配 /search/{queryId}
        │
        ├─ 是 → GET_PAGE_STATUS 查询 Content Script
        │       └─ 若 Content Script 不可达 → runBackgroundFallbackCapture()
        │             └─ 在 Background 内直接调用 API、写库、轮询 pending
        └─ 否 → 清理 Tab 状态缓存

每次 Tab 上下文变化 → ACTIVE_TAB_CONTEXT_CHANGED 广播给 Side Panel
```

### 7.2 DeepWiki URL 与接口调研结论

已确认信息：

| 项 | 结论 |
| --- | --- |
| 生产域名 | `https://deepwiki.com` |
| Session URL 形态 | `https://deepwiki.com/search/{queryId}` |
| 示例 queryId | `ragflowadmin_f49fa6f1-7111-4b98-826a-03c5c21742ce` |
| Session 读取接口 | `GET https://api.devin.ai/ada/query/{queryId}` |
| 实时流接口 | `wss://api.devin.ai/ada/ws/query/{queryId}`，页面在最后一条 query 为 `pending` 时使用 |
| Follow-up 提交接口 | `POST https://api.devin.ai/ada/query`，Wikeep 只做读取和保存，不应调用该接口创建新查询 |
| 页面框架 | Next.js App Router，初始 HTML 先返回 skeleton，完整内容由客户端查询接口后渲染 |

接口返回示例结构：

```ts
export interface DeepWikiQuerySession {
  title: string;
  org_id?: string;
  queries: DeepWikiQuery[];
}

export interface DeepWikiQuery {
  message_id: string;
  user_query: string;
  engine_id: 'omni' | 'agent' | 'multihop_faster' | 'codemap' | string;
  model?: string;
  repo_names?: string[];
  repo_context_ids?: string[];
  repos?: Array<{ name: string; branch: string | null }>;
  state: 'pending' | 'done' | 'error' | string;
  error: unknown;
  redis_stream?: string | null;
  response: DeepWikiResponseEvent[];
}

export type DeepWikiResponseEvent =
  | { type: 'chunk'; data: string }
  | { type: 'reference'; data: DeepWikiReference }
  | { type: 'file_contents'; data: [repoName: string, filePath: string, contents: string] }
  | { type: 'loading_indexes'; data: { all_done: boolean } }
  | { type: 'thoughts_start' | 'thoughts_end' | 'done' }
  | { type: 'tool_call_start' | 'tool_call_complete' | 'tool_call_scanned_file'; [key: string]: unknown }
  | { type: string; data?: unknown; [key: string]: unknown };

export interface DeepWikiReference {
  file_path: string;
  range_start: number;
  range_end: number;
}
```

API 到 Wikeep 消息的映射建议：

| DeepWiki 字段 | Wikeep 字段 | 说明 |
| --- | --- | --- |
| URL 中的 `{queryId}` | `Conversation.externalId` 或 `sourceSessionId` | 用作 DeepWiki session 稳定标识。 |
| `title` | `Conversation.title` | 需要移除 `<relevant_context>...</relevant_context>`。 |
| `queries[].user_query` | `Message(role='user')` | 每个 query 生成一条用户消息。 |
| `queries[].response[type='chunk']` | `Message(role='assistant')` | 同一 query 的 chunk 拼接为一条 AI 回复。 |
| `queries[].message_id` | `Message.externalId` | 作为用户问题与 AI 回复的关联来源。 |
| `queries[].repo_names` | `Conversation.metadata.repoNames` | 后续搜索/筛选可用。 |
| `reference` / `file_contents` | `Message.metadata.citations` | 首版可保存为 metadata，详情页后续增强展示。 |

### 7.3 页面识别

页面识别分两层：

1. Manifest 层：通过 `host_permissions` 和 `content_scripts.matches` 限制注入范围。
2. Runtime 层：Content Script 注入后判断 URL 是否符合 `/search/{queryId}`，再判断 DOM 是否包含 DeepWiki 会话结构。

建议接口：

```ts
export interface PageDetector {
  isSupportedUrl(url: string): boolean;
  extractQueryId(url: string): string | null;
  detectConversationRoot(document: Document): Element | null;
}
```

如果 URL 匹配但 DOM 不匹配，应设置状态：

```ts
{
  supported: false,
  active: false,
  reason: 'unsupported_dom_structure'
}
```

### 7.4 API 读取设计

建议由 Background Service Worker 调用 DeepWiki API，Content Script 只负责从当前页面 URL 中提取 queryId 和上报页面状态。

```ts
export interface DeepWikiApiClient {
  getQuerySession(queryId: string): Promise<DeepWikiQuerySession>;
}
```

API 读取规则：

- URL 形态为 `/search/{queryId}` 时才调用接口。
- `queryId` 从 pathname 中提取，不从页面文本猜测。
- 对 `queries[].state === 'pending'` 的 session，可先保存当前已返回内容，再由 MutationObserver 或轮询触发下一次读取。
- MVP 不需要主动连接 WebSocket；若后续希望实时保存流式内容，可接入 `wss://api.devin.ai/ada/ws/query/{queryId}`。
- API 返回 404、空 `queries` 或结构异常时，降级为 DOM 扫描。
- Wikeep 不调用 `POST /ada/query`，避免改变 DeepWiki 会话状态。

### 7.5 DOM 结构与选择器调研结论

根据 session 页面 HTML 与前端 chunk 调研，DeepWiki 页面为客户端渲染，初始 HTML 中主要是 skeleton。完整问答渲染后可参考以下 DOM 线索：

| 选择器/属性 | 用途 | 稳定性判断 |
| --- | --- | --- |
| `div[data-query-display]` | 每轮 query 的外层容器，React 组件输出 | 较稳定，可作为 DOM 兜底的会话轮次边界。 |
| `data-query-index` | 页面脚本运行后写入 query 序号，用于右侧导航定位 | 中等稳定，适合作为辅助顺序，不应作为唯一依据。 |
| 元素 `id="1"`, `id="2"`... | 每轮 query 的锚点 ID | 中等稳定，可辅助滚动定位。 |
| `[data-deepwiki-input="followup"]` | follow-up 输入框 | 稳定性较好，但不用于历史捕获。 |
| `[data-location-id]` | Codemap/引用定位相关元素 | 仅适合引用或代码位置增强，不适合提取主问答。 |
| `localStorage.user_query_history` | 页面用于判断当前 query 是否在用户历史中 | 不包含完整可靠会话正文，不建议作为 Wikeep 数据源。 |

用户消息与 AI 消息没有发现足够稳定、语义化的独立 DOM selector。页面前端实际是从 `GET /ada/query/{queryId}` 的 `queries[]` 数据中渲染：

- `queries[].user_query` 渲染为用户问题。
- `queries[].response` 中的 `chunk` 拼接为 AI 回复。
- `reference` 和 `file_contents` 渲染为引用和右侧来源内容。

因此技术方案应优先使用 API 读取，并将 DOM 解析作为兜底能力，而不是首选能力。

### 7.6 DOM 扫描

DOM 扫描应独立封装，避免业务逻辑散落在 Content Script 中。

```ts
export interface DomScanner {
  scan(root: Element): ParsedConversationSnapshot;
}
```

扫描职责：

- 查找会话根节点。
- 提取可能的标题。
- 以 `div[data-query-display]` 作为 query 轮次边界。
- 尝试提取该轮次中的用户问题和 AI 回复正文。
- 保持消息顺序。
- 忽略按钮、导航、广告、引用浮层等非正文内容。
- 当无法可靠区分用户消息与 AI 回复时，应返回 `PARSE_FAILED`，而不是保存错误内容。

### 7.7 MutationObserver 增量监听

监听策略：

- 监听会话根节点的 `childList` 和 `subtree` 变化。
- 对变化进行 debounce，避免流式输出导致高频写入。
- 每次变化后优先触发 API 重新读取；API 不可用时再重新扫描当前可见消息快照。
- 由存储层通过 hash 去重，保证重复扫描不会产生重复数据。

建议 debounce 时间：

- 流式回答中：800ms 到 1500ms。
- 页面稳定后：可在 `requestIdleCallback` 中执行扫描。

### 7.8 内容标准化

标准化规则：

- 去除首尾空白。
- 合并连续空行。
- 保留代码块、列表、链接文本和换行。
- 忽略纯 UI 文案，例如“复制”“重新生成”“赞”“踩”。
- 对不可识别角色标记为 `unknown`，不直接丢弃。

### 7.9 去重设计

去重分两层：

1. API 层：使用 `queryId + message_id + role` 作为优先去重依据。
2. Parser 层：同一次 DOM 兜底扫描中去除完全重复 DOM 节点。
3. Storage 层：通过 `conversationId + role + contentHash` 避免重复写入。

如果 AI 流式回答逐步增长，可能出现多次不同 hash。MVP 可采用以下策略：

- 若同一 `message_id`、同一 role 的消息内容变长，则更新原消息。
- 若同一 order、同一 role 的消息内容变长，则更新原消息。
- 若同一 order 的内容完全不同，则保留最新内容，并更新 `updatedAt`。
- 若无法确定 order，则追加保存，但通过 hash 避免完全重复。

## 8. 模块通信设计

### 8.1 消息命令定义

实际实现的 `RuntimeCommand`（参见 `src/shared/messages.ts`）：

```ts
export type RuntimeCommand =
  | 'CAPTURE_DEEPWIKI_SESSION'
  | 'CAPTURE_DOM_SNAPSHOT'
  | 'LIST_CONVERSATIONS'
  | 'GET_CONVERSATION_DETAIL'
  | 'DELETE_CONVERSATION'
  | 'CLEAR_ALL_DATA'
  | 'GET_SETTINGS'
  | 'UPDATE_SETTINGS'
  | 'GET_ACTIVE_TAB_CONTEXT'
  | 'OPEN_SIDE_PANEL'
  | 'LOOKUP_CAPTURE_BY_QUERY_ID'
  | 'REPORT_PAGE_STATUS'
  | 'ACTIVE_TAB_CONTEXT_CHANGED'
  | 'GET_PAGE_STATUS'
  | 'TRIGGER_RECAPTURE';
```

主要语义：

| 命令 | 方向 | 说明 |
| --- | --- | --- |
| `CAPTURE_DEEPWIKI_SESSION` | Content/Side Panel → Background | 通过 `queryId` 触发 API 抓取并写库 |
| `CAPTURE_DOM_SNAPSHOT` | Content → Background | DOM 兜底快照写入 |
| `LOOKUP_CAPTURE_BY_QUERY_ID` | Content/Side Panel → Background | 查重 + schema 版本校验 |
| `REPORT_PAGE_STATUS` | Content → Background | 上报 `CaptureStatus`，Background 据此更新 Tab 状态缓存 |
| `ACTIVE_TAB_CONTEXT_CHANGED` | Background → Side Panel | 主动通知活动 Tab 上下文变化，驱动 Side Panel 立即刷新 |
| `GET_ACTIVE_TAB_CONTEXT` | Side Panel → Background | 主动拉取当前活动 Tab 状态（含 Content Script 状态或 Background 缓存） |
| `GET_PAGE_STATUS` | Background → Content | 通过 `chrome.tabs.sendMessage` 询问目标 Tab 当前状态 |
| `TRIGGER_RECAPTURE` | Side Panel → Content/Background | 用户手动重抓 |
| `OPEN_SIDE_PANEL` | Side Panel/其它 → Background | 主动打开 Side Panel |

### 8.2 消息结构

实际实现采用更简洁的结构，不再使用 `requestId`（依赖 `chrome.runtime.sendMessage` 的回调一一对应）：

```ts
export interface RuntimeRequest<TPayload = unknown> {
  command: RuntimeCommand;
  payload?: TPayload;
}

export interface RuntimeResponse<TData = unknown> {
  ok: boolean;
  data?: TData;
  error?: RuntimeErrorPayload;
}

export interface RuntimeErrorPayload {
  code: string;
  message: string;
}
```

### 8.3 CAPTURE_SNAPSHOT

Content Script 发送：

```ts
export interface CaptureSnapshotPayload {
  snapshot: ParsedConversationSnapshot;
}
```

Background 或 Storage Layer 返回：

```ts
export interface CaptureSnapshotResult {
  conversationId: string;
  insertedMessages: number;
  updatedMessages: number;
  skippedMessages: number;
}
```

### 8.4 LIST_CONVERSATIONS

UI 发送：

```ts
export interface ListConversationsPayload {
  limit: number;
  cursor?: number;
}
```

返回：

```ts
export interface ListConversationsResult {
  items: Conversation[];
  nextCursor?: number;
}
```

### 8.5 SEARCH_CONVERSATIONS

UI 发送：

```ts
export interface SearchConversationsPayload {
  keyword: string;
  limit: number;
}
```

返回：

```ts
export interface SearchConversationsResult {
  items: ConversationSearchResult[];
}

export interface ConversationSearchResult {
  conversation: Conversation;
  matchedSnippet: string;
  matchedMessageIds: string[];
}
```

## 9. Storage Layer 设计

### 9.1 Repository 接口

```ts
export interface ConversationRepository {
  upsertFromSnapshot(snapshot: ParsedConversationSnapshot): Promise<CaptureSnapshotResult>;
  list(params: ListConversationsPayload): Promise<ListConversationsResult>;
  getById(id: string): Promise<Conversation | null>;
  getBySourceUrl(sourceUrl: string): Promise<Conversation | null>;
  deleteById(id: string): Promise<void>;
  clearAll(): Promise<void>;
}

export interface MessageRepository {
  listByConversationId(conversationId: string): Promise<Message[]>;
  upsertMany(conversationId: string, messages: ParsedMessage[]): Promise<CaptureSnapshotResult>;
  deleteByConversationId(conversationId: string): Promise<void>;
  clearAll(): Promise<void>;
}

export interface SettingsRepository {
  get(): Promise<Settings>;
  update(patch: Partial<Settings>): Promise<Settings>;
}
```

### 9.2 写入事务

保存快照时应使用事务保证会话和消息一致：

```text
readwrite transaction
  ├── conversations
  └── messages
```

处理步骤：

1. 根据 `sourceUrl` 查找已有会话。
2. 不存在则创建 Conversation。
3. 存在则更新 `updatedAt`、`title`、`summary`、`messageCount`。
4. 根据 `conversationId + order` 和 hash 处理消息插入或更新。
5. 返回插入、更新、跳过数量。

### 9.3 删除事务

删除单条会话时：

1. 删除 `conversations` 中对应会话。
2. 删除 `messages` 中该会话的所有消息。
3. 后续如果存在 `searchIndex`，同步删除索引数据。

清空所有数据时：

1. 清空 `messages`。
2. 清空 `conversations`。
3. 清空后续扩展对象仓库。
4. 保留用户设置，除非用户选择“恢复默认设置”。

## 10. Search Layer 设计

### 10.1 MVP 搜索策略

MVP 使用简单本地搜索，不引入复杂全文检索库。

搜索范围：

- Conversation.title
- Conversation.summary
- Conversation.sourceUrl
- Message.content

处理流程：

```text
输入 keyword
    │
    ▼
trim + lowerCase
    │
    ▼
查询 conversations
    │
    ▼
查询 messages
    │
    ▼
包含匹配
    │
    ▼
按 updatedAt 倒序聚合结果
    │
    ▼
生成 snippet
```

### 10.2 性能边界

MVP 可接受数据量：

- 会话数：数千级。
- 消息数：数万级。
- 单次搜索：本地异步完成，不阻塞 UI。

如果后续数据量增长，应升级为：

- 维护 `searchIndex` 对象仓库。
- 写入时生成 normalizedText。
- 搜索时只查索引，不全量扫描消息。
- 可选引入轻量全文检索库，但需评估插件包体和隐私影响。

### 10.3 Snippet 生成

Snippet 规则：

- 命中位置前后各截取约 40 到 80 个字符。
- 保留中文可读性，不强制按单词切分。
- UI 层可对关键词做高亮。

## 11. UI 技术设计

### 11.1 UI 入口

实际实现仅保留 Side Panel 作为唯一 UI 入口：

- 主组件位于 `src/ui/sidepanel/SidePanelApp.tsx`，所有视图（列表、详情摘要、设置、状态条、Toast）均在此组件内通过 React 状态切换。
- Background 在启动时调用 `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`，因此用户点击工具栏图标会直接打开 Side Panel，不再经过 Popup。
- Popup 入口已移除，原 `src/ui/popup/` 目录与 `popup.html` 不再保留。

### 11.2 视图划分

| 视图 | 形态 | 功能 |
| --- | --- | --- |
| 状态条 | 顶部固定区 | 展示当前 Tab 抓取状态（识别中 / 保存中 / 已保存 / 不支持等），订阅 `ACTIVE_TAB_CONTEXT_CHANGED` 即时刷新 |
| 列表区 | 主体 | 历史会话列表，支持搜索、悬停操作（复制 URL、删除） |
| 详情视图 | 列表展开 | 选中会话后展示完整消息、来源、时间 |
| 设置面板 | 工具栏更多菜单进入 | 自动保存开关、清空数据、隐私说明 |
| Toast | 浮层 | 自动 2.8s 消失，反馈复制 / 保存 / 删除等操作 |

### 11.3 组件设计

| 组件 | 职责 |
| --- | --- |
| `App` | 初始化设置、路由和全局错误边界。 |
| `SidePanelApp` | 主组件，管理视图切换（历史、设置、备份）。 |
| `ConversationList` | 列表渲染和分页加载，含快捷操作（打开、复制、删除）。 |
| `SearchBox` | 搜索输入、清空和 debounce。 |
| `EmptyState` | 无数据、无搜索结果、错误状态。 |

### 11.4 状态管理

MVP 建议使用 React 内置状态：

- `useState`
- `useEffect`
- `useReducer`
- 自定义 hooks

可设计以下 hooks：

```ts
useSettings()
useConversationList()
useConversationDetail(conversationId)
useConversationSearch(keyword)
useCaptureStatus()
```

不建议首版引入 Redux、MobX 等全局状态库，避免复杂度过高。

### 11.5 长会话渲染

长会话可能包含大量消息和代码块，建议：

- 详情页按 conversationId 查询消息。
- 默认一次加载完整消息，若性能不足再增加分页或虚拟列表。
- 消息内容使用纯文本安全渲染。
- 后续如支持 Markdown 渲染，需要对 HTML 做严格 sanitize。

## 12. Background Service Worker 设计

### 12.1 职责

Background Service Worker 实际承担以下职责：

- 插件安装、更新事件。
- 启动时设置 `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`，让 action 点击直接打开 Side Panel。
- 统一处理 UI 与 Content Script 的 runtime message。
- 根据 `queryId` 调用 DeepWiki API、转换 snapshot 并写入 Storage。
- 维护 `tabStatusCache`，在 `tabs.onActivated` / `tabs.onUpdated` / `windows.onFocusChanged` 时广播 `ACTIVE_TAB_CONTEXT_CHANGED`。
- 当 Tab 是 DeepWiki 会话页但 Content Script 不可达时，运行 `runBackgroundFallbackCapture` 兜底抓取，并以 `PENDING_POLL_MS=3000ms`（最多 `MAX_POLL_ATTEMPTS=60` 次）轮询 pending 状态。
- 在 Tab 切换时清理残留 action badge（不再维护 badge 颜色或文案）。

### 12.2 消息路由

```ts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  handleRuntimeRequest(request, sender)
    .then(sendResponse)
    .catch((error) => sendResponse(toErrorResponse(request, error)));

  return true;
});
```

处理原则：

- 每个 command 对应明确 handler。
- handler 不直接操作 DOM。
- 所有错误转换为统一 `RuntimeResponse`。
- 不吞掉异常，不返回伪成功。

### 12.3 Side Panel 行为

实际实现仅保留 Side Panel，不再配置 Popup：

```ts
// src/background/index.ts
chrome.runtime.onInstalled.addListener(async () => {
  await chrome.sidePanel.setPanelBehavior({
    openPanelOnActionClick: true
  });
});
```

由于 `openPanelOnActionClick=true`，无需手动监听 `chrome.action.onClicked`；浏览器会在用户点击 action 图标时直接打开 Side Panel。同时不再配置 `default_popup`，与方案 A 一致。

## 13. Content Script 设计

### 13.1 初始化流程

实际实现位于 `src/content/index.ts`，关键改动：

- `run_at` 为 `document_end`，比原方案的 `document_idle` 更早。
- 注入后**立即**上报 bootstrap 状态 `{ active: true, pending: true, reason: 'idle' }`，让 Side Panel 在页面加载早期就能看到“识别中”反馈。
- 通过 `LOOKUP_CAPTURE_BY_QUERY_ID` 做去重短路，命中已保存记录时不再发起 API/DOM 抓取。
- pending 阶段使用 `PENDING_POLL_MS=3000ms` 节奏轮询，每次轮询都通过 `REPORT_PAGE_STATUS` 同步状态。

```ts
async function initContentScript() {
  reportStatus({ active: true, pending: true, reason: 'idle' });

  const queryId = extractQueryIdFromUrl(location.href);
  if (!queryId) {
    reportStatus({ supported: false, active: false, reason: 'not_deepwiki_page' });
    return;
  }

  const settings = await getSettingsFromRuntime();
  if (!settings.autoCaptureEnabled) {
    reportStatus({ active: false, reason: 'auto_capture_disabled' });
    return;
  }

  const existing = await lookupExistingCapture(queryId);
  if (existing.exists) {
    reportStatus({ active: true, pending: false, reason: 'already_saved', existingConversationId: existing.conversationId });
    return;
  }

  setupObserver(queryId);
  await runCapture(queryId);   // captureViaDom() → captureViaApi() → 必要时轮询
}
```

### 13.2 与页面隔离

Chrome Content Script 默认运行在 isolated world：

- 不应修改 DeepWiki 页面业务状态。
- 不应注入影响页面交互的大型脚本。
- 不应向页面暴露用户历史数据。
- 只读取必要 DOM 文本内容。

### 13.3 捕获状态上报

Content Script 每次内部 `setStatus()` 都会通过 `REPORT_PAGE_STATUS` 上报最新 `CaptureStatus`，Background 据此更新 `tabStatusCache`，并在状态对应活动 Tab 时通过 `ACTIVE_TAB_CONTEXT_CHANGED` 主动推送给 Side Panel。

```ts
export interface CaptureStatus {
  supported: boolean;
  active: boolean;
  queryId?: string;
  sourceUrl?: string;
  method?: 'api' | 'dom';
  lastCapturedAt?: number;
  pending?: boolean;
  reason?: CaptureStatusReason;
  errorMessage?: string;
  performance?: CapturePerformance;
  existingConversationId?: string;
  repoNames?: string[];
}
```

UI 据此呈现：

- 等待识别 / 准备中（`reason='idle'` 且 `pending=true`）。
- 自动保存中（`active=true` 且 `pending=true`，非 idle）。
- 已保存（`reason='already_saved'` 或抓取成功）。
- 不支持当前页面（`reason='not_deepwiki_page'`）。
- 自动保存已关闭（`reason='auto_capture_disabled'`）。
- 抓取失败（`reason='api_fetch_failed' | 'dom_not_ready' | 'unsupported_dom_structure' | 'storage_error'`）。

## 14. Parser Layer 设计

### 14.1 Parser 目标

Parser Layer 的目标是隔离 DeepWiki 页面结构变化带来的影响，使后续适配集中在少数文件中。

### 14.2 Parser 接口

```ts
export interface DeepWikiParser {
  canParse(document: Document): boolean;
  parse(document: Document): ParsedConversationSnapshot;
}
```

### 14.3 角色识别策略

角色识别可按优先级处理：

1. 使用 DOM 中可识别的 role、aria-label、data attribute。
2. 使用 className 或结构位置辅助判断。
3. 使用消息容器相对位置判断。
4. 无法判断则标记为 `unknown`。

不建议通过内容语义猜测角色，因为容易误判。

### 14.4 标题生成策略

标题来源优先级：

1. DeepWiki 页面已有会话标题。
2. 页面 `<title>`。
3. 第一条用户消息前 30 个字符。
4. 默认标题：`未命名会话`。

## 15. 错误处理设计

### 15.1 错误类型

实际实现以 `CaptureStatusReason` 表示用户可感知的状态/错误（参见 `src/shared/types.ts`）：

```ts
export type CaptureStatusReason =
  | 'idle'                        // 注入后/识别中（短暂的 pending）
  | 'not_deepwiki_page'           // URL 不是 deepwiki.com/search/{queryId}
  | 'auto_capture_disabled'       // 自动保存被关闭
  | 'already_saved'               // queryId 已在本地保存（命中去重）
  | 'api_fetch_failed'            // 调用 DeepWiki/Devin API 失败
  | 'dom_not_ready'               // DOM 结构尚未就绪
  | 'unsupported_dom_structure'   // 页面结构无法识别
  | 'storage_error';              // IndexedDB / chrome.storage 写入失败
```

Background 在 `RuntimeResponse` 中以 `RuntimeErrorPayload`（`{ code, message }`）返回错误，UI 据此渲染状态条文案与 toast。

### 15.2 用户可见提示

| 错误 | 用户提示 |
| --- | --- |
| `UNSUPPORTED_PAGE` | 当前页面暂不支持自动保存。 |
| `AUTO_CAPTURE_DISABLED` | 自动保存已关闭，可在设置中开启。 |
| `PARSE_FAILED` | 未能识别 DeepWiki 会话内容，请等待适配更新。 |
| `STORAGE_WRITE_FAILED` | 保存失败，请检查浏览器存储空间或扩展权限。 |
| `STORAGE_READ_FAILED` | 读取历史失败，请稍后重试。 |
| `MIGRATION_FAILED` | 数据升级失败，请备份后重试。 |
| `PERMISSION_DENIED` | 插件缺少必要权限。 |

### 15.3 错误处理原则

- 不静默失败。
- 不返回成功形态的空数据掩盖错误。
- 不上传错误日志中的会话内容。
- 开发环境可打印调试日志，生产环境默认关闭详细日志。

## 16. 隐私与安全设计

### 16.1 本地优先

首版所有会话数据只保存在用户浏览器本地：

- 不建设后端。
- 不上传会话内容。
- 不使用第三方分析 SDK。
- 不使用远程日志收集。

### 16.2 数据采集边界

只采集：

- DeepWiki 页面中的会话文本。
- 会话来源 URL。
- 创建和更新时间。
- 插件设置状态。

不采集：

- 非 DeepWiki 页面正文。
- 浏览器历史。
- Cookie。
- 用户账号凭据。
- 页面中的隐藏敏感字段。

### 16.3 UI 渲染安全

会话内容默认作为文本渲染，避免 XSS：

- React 默认会转义文本插值。
- 不使用 `dangerouslySetInnerHTML` 渲染捕获内容。
- 后续如支持 Markdown 渲染，必须引入 sanitize 流程。

### 16.4 删除语义

删除单条会话：

- 删除 conversation。
- 删除关联 messages。
- 删除后续 searchIndex/export cache。

清空数据：

- 清空所有会话和消息。
- 保留设置。
- UI 刷新为空状态。

## 17. 性能设计

### 17.1 捕获性能

风险：

- DeepWiki AI 回复可能流式生成，DOM 频繁变化。
- 长会话 DOM 节点较多，重复全量扫描可能成本较高。

策略：

- MutationObserver 事件 debounce。
- 使用内容 hash 避免重复写入。
- 扫描时只关注会话根节点。
- 大量变化时延迟到浏览器空闲期处理。

### 17.2 存储性能

策略：

- 使用 IndexedDB 异步写入。
- 批量 upsert messages。
- 对列表查询建立 `updatedAt` 索引。
- 对详情查询建立 `conversationId + order` 索引。

### 17.3 UI 性能

策略：

- 历史列表分页或 limit 查询。
- 搜索输入 debounce。
- 长会话渲染必要时引入虚拟列表。
- 避免在 React render 中执行大量文本搜索。

## 18. 测试策略

### 18.1 单元测试

重点覆盖：

- `normalizer`
- `hash`
- `deepwikiParser`
- `conversationRepository`
- `settingsRepository`
- `searchService`

### 18.2 集成测试

重点覆盖：

- Content Script 解析模拟 DOM 后生成 snapshot。
- snapshot 写入 IndexedDB。
- 重复 snapshot 不产生重复消息。
- 搜索能返回命中结果。
- 删除会话时同步删除消息。

### 18.3 手动验收

MVP 手动验收清单：

1. 安装本地插件。
2. 打开 DeepWiki 页面。
3. 完成一轮问答。
4. 打开 Wikeep Side Panel。
5. 确认历史列表出现对应会话。
6. 刷新 DeepWiki 页面，确认不会大量重复保存。
7. 输入关键词，确认可以找到会话。
8. 打开详情，确认消息顺序正确。
9. 删除单条会话，确认列表和搜索结果同步变化。
10. 清空全部数据，确认历史为空。
11. 关闭自动保存，确认新会话不再自动保存。

### 18.4 兼容性测试

需要验证：

- Chrome 当前稳定版本。
- Side Panel 支持情况。
- 插件安装、更新和重载后的数据保留。
- 长会话阅读性能。
- DeepWiki 页面结构变化时的提示。

## 19. 后续扩展设计

### 19.1 Markdown 导出

建议模块：

```ts
export interface MarkdownExporter {
  exportConversation(conversation: Conversation, messages: Message[]): string;
}
```

输出结构：

```md
# 会话标题

- 来源：URL
- 导出时间：YYYY-MM-DD HH:mm:ss

## 用户

问题内容

## AI

回答内容
```

### 19.2 长图生成

建议在 UI 中将会话内容渲染到独立导出容器，再使用截图方案生成图片。需要关注：

- 长内容分页或分段渲染。
- 字体和主题样式。
- 图片尺寸限制。
- 生成失败提示。

### 19.3 标签与收藏

当前 Conversation 已预留：

- `tags`
- `isFavorite`

后续可增加：

- 标签管理对象仓库。
- 按标签筛选。
- 收藏列表。

### 19.4 数据备份

后续可提供：

- 导出 JSON。
- 导入 JSON。
- 导入前 schema 校验。
- 冲突处理：覆盖、跳过、合并。

## 20. 实施阶段建议

### 20.1 阶段一：工程初始化

- 初始化 Vite + React + TypeScript 工程。
- 配置 Manifest V3 多入口构建（Side Panel HTML + Background + 单独 IIFE 打包的 Content Script）。
- 配置基础图标和插件元信息。
- 不再保留 Popup 入口；在 Background 中启用 `openPanelOnActionClick`。

### 20.2 阶段二：基础存储

- 实现 IndexedDB 初始化。
- 实现 conversations/messages 仓库。
- 实现 settings 仓库。
- 实现基础迁移机制。

### 20.3 阶段三：会话捕获

- 实现 DeepWiki 页面检测。
- 实现 `GET https://api.devin.ai/ada/query/{queryId}` 读取和数据转换。
- 实现 DOM Scanner。
- 实现 Parser 和 Normalizer。
- 实现 MutationObserver。
- 实现 snapshot 写入流程。

### 20.4 阶段四：UI 闭环

- 实现历史列表。
- 实现关键词搜索。
- 实现会话详情。
- 实现设置页。
- 实现删除和清空数据。

### 20.5 阶段五：稳定性与验收

- 完成核心单元测试。
- 完成模拟 DOM 集成测试。
- 完成手动验收清单。
- 修复捕获、去重、存储和 UI 体验问题。

### 20.6 阶段六：扩展能力

- Markdown 导出。
- 长图生成。
- 标签收藏。
- 本地备份导入导出。

## 21. 风险与应对

| 风险 | 影响 | 应对 |
| --- | --- | --- |
| DeepWiki API 结构变化 | API 优先捕获失效 | API Client 独立封装，结构校验失败后降级 DOM 解析。 |
| DeepWiki DOM 结构变化 | DOM 兜底捕获失效 | Parser 独立封装，UI 提示不支持，后续快速适配。 |
| AI 回复流式输出 | 重复写入或保存半截内容 | debounce + order 更新 + hash 去重，pending 阶段轮询。 |
| 本地数据过多 | 搜索和渲染变慢 | IndexedDB 索引、分页、后续 searchIndex。 |
| Content Script 不可达 | Side Panel 无法看到状态 | Background 兜底 API 抓取 + pending 轮询，并通过 `ACTIVE_TAB_CONTEXT_CHANGED` 推送。 |
| 用户误删数据 | 数据不可恢复 | 删除和清空前二次确认，后续支持备份。 |
| 权限申请过多 | 上架审核和用户信任风险 | 严格最小权限，Content Script 仅匹配 `/search/*`。 |
| 会话内容敏感 | 隐私风险 | 本地保存、不上传、不接入第三方分析。 |

## 22. 调研结论与剩余事项

已确认：

1. DeepWiki 真实域名为 `https://deepwiki.com`。
2. Session URL 结构为 `https://deepwiki.com/search/{queryId}`。
3. 可复用读取接口为 `GET https://api.devin.ai/ada/query/{queryId}`，能返回完整 thread 数据。
4. 页面存在 `div[data-query-display]`、`data-query-index`、`[data-deepwiki-input="followup"]`、`[data-location-id]` 等选择器。
5. 用户消息与 AI 消息没有发现足够稳定的独立语义化 DOM selector，应以 API 数据作为首选数据源。
6. Vite 构建方案按 Side Panel 优先、Popup 可降级设计。

暂不处理：

1. Chrome Side Panel 对目标用户浏览器版本的兼容性。

后续正式编码前仍建议补充：

1. 使用真实浏览器再次验证 API 请求是否长期不需要鉴权。
2. 验证 Chrome 扩展环境下访问 `https://api.devin.ai/ada/query/{queryId}` 的 CORS 与 host permission 行为。
3. 准备至少 3 个 DeepWiki session 样本，覆盖单轮、多轮、pending、error、codemap 等不同响应类型。

## 23. 总结

Wikeep 首版技术方案围绕 Chrome Manifest V3、React + TypeScript + Vite、DeepWiki API 优先捕获、Content Script DOM 兜底、Background 兜底抓取、IndexedDB（schema v3）本地持久化与 Side Panel 唯一 UI 入口展开。

核心实现路径：在 DeepWiki `/search/{queryId}` 页面中提取 `queryId`，由 Content Script 在 `document_end` 调用 `GET https://api.devin.ai/ada/query/{queryId}` 获取结构化 session 数据，转换为 Wikeep Conversation/Message 后写入 IndexedDB；当 API 不可用时通过 DOM 选择器兜底；当 Content Script 本身不可达时由 Background 直接调用 API 兜底，并通过 `ACTIVE_TAB_CONTEXT_CHANGED` 主动通知 Side Panel 刷新状态。React Side Panel 提供历史列表、搜索、详情和设置能力，点击 action 图标即可打开。整套方案坚持本地优先、最小权限和隐私保护原则，不引入后端、账号系统或云同步。

该架构既能满足 MVP 的保存和找回目标，也为后续 Markdown 导出、长图生成、标签收藏和本地备份提供了清晰扩展边界。
