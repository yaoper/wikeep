# Wikeep

[English](README.md) | [简体中文](README_zh.md)

[![Version](https://img.shields.io/badge/version-0.1.0-blue)](https://github.com/yaoper/wikeep/releases/latest)
[![License](https://img.shields.io/badge/License-MIT-green)](./LICENSE)
[![Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-yellow?logo=googlechrome)](https://developer.chrome.com/docs/extensions/mv3/)

**Auto-save, search, and manage your DeepWiki session history — all data stays local, no login required.**

---

## 🔎 Overview

[DeepWiki](https://deepwiki.com) is a powerful AI-powered code knowledge tool, but it lacks persistent session history. Wikeep enhances it by **automatically saving your valuable DeepWiki sessions to local storage** with no cloud dependency or login required, while providing fast search and management directly in the browser's Side Panel.

### Why Wikeep?

| Pain point | Wikeep solution |
| --- | --- |
| **Sessions disappear on reload** | Automatically captures and persists every session locally |
| **No search across past sessions** | Full-text search by repo name or question content |
| **Hard to revisit old answers** | Side Panel timeline with one-click navigation |
| **Fear of data loss after reinstall** | Export/import backup as a single JSON file |
| **No control over capture** | Auto-save toggle to enable/disable at any time |

---

## ✨ Features

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

---

## 🛠️ Tech Stack

| Layer | Technology |
| --- | --- |
| Extension standard | Chrome Manifest V3 |
| UI framework | React 19 + TypeScript |
| Build tool | Vite |
| Local storage | IndexedDB (`idb`) + `chrome.storage.local` |
| Test framework | Vitest + jsdom |

---

## 🏗️ Project Structure

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

---

## 🚀 Getting Started

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

---

## 🔐 Permissions

| Permission | Purpose |
| --- | --- |
| `storage` | Stores extension settings (auto-save toggle, etc.) |
| `sidePanel` | Renders session history in the browser side panel |
| `activeTab` | Checks whether the current tab is a DeepWiki page |
| `https://deepwiki.com/*` | Injects the content script to capture DeepWiki session pages |
| `https://api.devin.ai/ada/query/*` | Calls the DeepWiki public API for structured session data |

> All data is **stored locally in the user's browser only** and is never sent to any server.

---

## 🛡️ Privacy

- No user identity data is collected
- No backend service is involved
- No account registration or login is required
- All data can be cleared or exported by the user at any time

---

## 🤝 Contributing

Contributions are welcome! Feel free to open an issue or submit a pull request.

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/your-feature`)
3. Commit your changes
4. Open a Pull Request

---

## License

[MIT](./LICENSE)
